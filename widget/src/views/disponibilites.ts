/**
 * Vue Disponibilités : une grille bénévoles × quart d'heure, un jour à la
 * fois (cahier des charges §8.10). Trois usages désormais superposés sur la
 * même grille de lecture, sans rien lui retirer :
 *  - consultation (comportement d'origine, inchangé) ;
 *  - réglages d'import (§6.4, demande d'Antoine du 2026-09-23) : associer
 *    les colonnes que lui-même a ajoutées à sa table Bénévoles (souhaits
 *    d'artistes, réponse par macro-créneau) à PlanningPlus, puis importer —
 *    en lecture seule sur ses colonnes, jamais une modification ;
 *  - édition manuelle quart d'heure par quart d'heure (mode édition,
 *    désactivé par défaut), pour le cas qu'un import ne sait pas classer
 *    automatiquement ("disponible mais…") : clic simple pour basculer
 *    disponible/indisponible, ou sous-mode "choisir un artiste" (point A
 *    de la demande initiale) qui cycle parmi les artistes jouant à ce
 *    quart d'heure précis.
 *
 * Densité assumée (jusqu'à 70 lignes × quelques dizaines de colonnes) :
 * en-tête et colonne des noms fixes au défilement, une teinte par état
 * (disponible / indisponible / veut voir un artiste), infobulle pour le
 * détail exact (heure, artiste souhaité).
 */

import type {Epoch, Id, MacroCreneau} from '../domain/types';
import {benevolesDisponiblesCeJour, indexer, quartsDuJour} from '../logic/derive';
import {regrouperParJour} from '../logic/derive';
import {
  blocsDuJour, contraintesBenevole, estHeurePleine, graviteContraintes, indexerDisponibilitesParBenevole,
  libelleContraintes, quartsEntre, statutCellule,
} from '../logic/dispos-terrain';
import {disponibilitesApresBasculement, disponibilitesApresChoixArtiste} from '../logic/edition-disponibilites';
import {
  disponibilitesDepuisReponseMacroCreneau, disponibilitesDepuisSouhaitsArtistes, fusionnerDisponibilites,
  LIBELLES_REPONSE_PAR_DEFAUT, nomsArtistesNonReconnus, nomsSouhaitesDepuisValeurBrute, resoudreBinomeSouhaite,
} from '../logic/import-disponibilites';
import {
  CLE_COLONNE_BINOME_SOUHAITE, CLE_COLONNE_CONTACT_BENEVOLES, CLE_COLONNE_NOM_BENEVOLES, CLE_COLONNE_SOUHAITS_ARTISTES,
  CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT, CLE_LIBELLE_TOUT_LE_CRENEAU,
  CLE_TABLE_BENEVOLES, cleColonneReponseMacroCreneau, type ColonneTable, colonnesEligibles,
  colonnesEligiblesTableExterne,
} from '../logic/parametres-benevoles';
import type {Magasin} from '../store';
import {libelleHeure} from '../temps';
import {h, vider} from '../ui/dom';

const LIBELLE_STATUT: Record<'Disponible' | 'Indisponible' | 'Artiste', string> = {
  Disponible: 'disponible',
  Indisponible: 'indisponible',
  Artiste: 'veut voir un artiste',
};

function champ(libelle: string, entree: Node): Node {
  return h('div', {style: {marginBottom: '10px'}},
    h('label', {style: {display: 'block', fontWeight: '600', marginBottom: '4px'}}, libelle),
    entree,
  );
}

export function montrerDisponibilites(container: HTMLElement, m: Magasin): () => void {
  let equipeFiltre: Id | 'toutes' = 'toutes';
  let recherche = '';
  let modeEdition = false;
  let modeArtiste = false;
  let panneauOuvert = false;
  let importEnCours = false;
  let peuplementEnCours = false;
  let dernierMessage: {texte: string; ton: 'ok' | 'danger'} | null = null;
  /** Colonnes de la table de bénévoles choisie (`CLE_TABLE_BENEVOLES`),
   *  rechargées si la table choisie change (`tableChargee` garde la trace
   *  de la table pour laquelle `colonnesBenevoles` est valide). */
  let tableChargee: string | null = null;
  let colonnesBenevoles: ColonneTable[] | 'chargement' | 'erreur' | null = null;
  /** Tables du document, pour le sélecteur — jamais de nom en dur ici
   *  (2026-09-23, après coup : `TABLE_BENEVOLES` visait notre propre table
   *  sans jamais vérifier que ses vrais bénévoles y étaient, signalé par
   *  Antoine). */
  let tablesDisponibles: {tableId: string}[] | 'chargement' | 'erreur' | null = null;
  /** Repli tant qu'aucune table n'est choisie : les colonnes éligibles de
   *  TOUTES les tables du document plutôt qu'une liste vide (demande
   *  explicite d'Antoine : « il faut que toutes les colonnes du document
   *  s'affichent »). Choisir une de ces colonnes désigne du même coup sa
   *  table dans `CLE_TABLE_BENEVOLES` — les deux choix ne peuvent pas
   *  diverger. */
  let colonnesTousDocuments: {tableId: string; colonne: ColonneTable}[] | 'chargement' | 'erreur' | null = null;

  /** Enregistre un réglage `Parametres`, jamais en tir-et-oublie : un échec
   *  (table `Parametres` absente sur ce document, document déconnecté…)
   *  doit se voir à l'écran plutôt que disparaître, sans quoi Antoine
   *  choisit une colonne, rien ne se passe, et l'import lui répond ensuite
   *  qu'aucune colonne n'est associée — signalé par Connexion Grist,
   *  2026-09-23 17h39. Sur succès, `m.definirParametre` notifie déjà et
   *  redessine tout seul ; ce n'est que l'échec qu'il fallait rattraper ici. */
  async function definirParametreSurveille(cle: string, valeur: string): Promise<void> {
    try {
      await m.definirParametre(cle, valeur);
    } catch {
      dernierMessage = {texte: "Échec de l'enregistrement de ce réglage dans le document Grist connecté. Réessaie.", ton: 'danger'};
      rafraichir();
    }
  }

  function chargerTablesSiBesoin(): void {
    if (tablesDisponibles != null) { return; }
    tablesDisponibles = 'chargement';
    m.tablesDocument()
      .then((tables) => { tablesDisponibles = tables; rafraichir(); })
      .catch(() => { tablesDisponibles = 'erreur'; rafraichir(); });
  }

  /** Menu déroulant pour désigner la table où sont les bénévoles d'Antoine
   *  (2026-09-23, demande directe : « un premier choix pour définir la
   *  table dans laquelle sont les bénévoles »). Une fois choisie, les
   *  colonnes proposées ci-dessous se restreignent à cette seule table. */
  function champTableBenevoles(): Node {
    chargerTablesSiBesoin();
    const valeurActuelle = m.parametre(CLE_TABLE_BENEVOLES) ?? '';
    if (!Array.isArray(tablesDisponibles)) {
      return h('p', {class: tablesDisponibles === 'erreur' ? 'pill pill--warn' : 'empty'},
        tablesDisponibles === 'erreur'
          ? "Impossible de lire la liste des tables de ton document pour l'instant."
          : 'Lecture des tables de ton document…',
      );
    }
    return h('select', {
      class: 'select', 'aria-label': 'Table où sont tes bénévoles',
      onchange: (e: Event) => { void definirParametreSurveille(CLE_TABLE_BENEVOLES, (e.target as HTMLSelectElement).value); },
    },
      h('option', {value: '', selected: valeurActuelle === ''}, '— choisir —'),
      ...tablesDisponibles.map((t) => h('option', {value: t.tableId, selected: t.tableId === valeurActuelle}, t.tableId)),
    );
  }

  function chargerColonnesSiBesoin(tableId: string): void {
    if (tableChargee === tableId && colonnesBenevoles != null) { return; }
    tableChargee = tableId;
    colonnesBenevoles = 'chargement';
    m.colonnesTable(tableId)
      .then((colonnes) => { colonnesBenevoles = colonnes; rafraichir(); })
      .catch(() => { colonnesBenevoles = 'erreur'; rafraichir(); });
  }

  /** Repli tant qu'aucune table n'est choisie (voir `colonnesTousDocuments`
   *  ci-dessus) : jamais une liste vide, toujours quelque chose à
   *  regarder — au prix d'une lecture de chaque table du document. */
  function chargerColonnesTousDocumentsSiBesoin(): void {
    if (colonnesTousDocuments != null || !Array.isArray(tablesDisponibles)) { return; }
    colonnesTousDocuments = 'chargement';
    Promise.all(tablesDisponibles.map(async (t) => {
      const colonnes = await m.colonnesTable(t.tableId);
      return colonnesEligibles(colonnes).map((colonne) => ({tableId: t.tableId, colonne}));
    }))
      .then((parTable) => { colonnesTousDocuments = parTable.flat(); rafraichir(); })
      .catch(() => { colonnesTousDocuments = 'erreur'; rafraichir(); });
  }

  /** Encode la table et la colonne dans une seule valeur d'option, pour le
   *  repli "toutes les tables" : choisir une colonne y désigne aussi sa
   *  table du même geste (`CLE_TABLE_BENEVOLES` et `cle` s'enregistrent
   *  ensemble), jamais une colonne sans savoir de quelle table elle vient. */
  const SEPARATEUR_OPTION_TOUS_DOCUMENTS = '\u0000';

  /** Menu déroulant sur les colonnes réelles de la table choisie ; tant
   *  qu'aucune table n'est choisie, propose les colonnes de tout le
   *  document (`colonnesTousDocuments`) plutôt qu'une liste vide ; repli en
   *  champ texte seulement si la lecture échoue, jamais un écran bloqué.
   *  `filtre` : quelles colonnes de la table choisie proposer — par défaut
   *  `colonnesEligibles` (exclut les noms déjà connus chez nous), mais le
   *  nom/téléphone d'un bénévole se choisit justement sur une colonne qui
   *  peut s'appeler « Nom » chez Antoine : `construirePanneauReglages` passe
   *  alors `colonnesEligiblesTableExterne`, qui ne l'exclut pas — cette
   *  variante n'est jamais utilisée dans le repli "toutes les tables", qui
   *  n'a de sens qu'avant d'avoir choisi une table, donc jamais pour le
   *  nom/téléphone. */
  function champColonne(cle: string, aria: string, filtre: (c: readonly ColonneTable[]) => ColonneTable[] = colonnesEligibles): Node {
    const valeurActuelle = m.parametre(cle);
    const tableChoisie = m.parametre(CLE_TABLE_BENEVOLES);

    if (tableChoisie) {
      chargerColonnesSiBesoin(tableChoisie);
      if (Array.isArray(colonnesBenevoles) && tableChargee === tableChoisie) {
        const options = [h('option', {value: '', selected: !valeurActuelle}, '— aucune —')];
        for (const c of filtre(colonnesBenevoles)) {
          options.push(h('option', {value: c.colId, selected: c.colId === valeurActuelle}, `${c.label} (${c.colId})`));
        }
        return h('select', {
          class: 'select', 'aria-label': aria,
          onchange: (e: Event) => { void definirParametreSurveille(cle, (e.target as HTMLSelectElement).value); },
        }, ...options);
      }
      if (colonnesBenevoles === 'erreur') {
        return h('input', {
          class: 'input', type: 'text', placeholder: 'identifiant de colonne (ex. Dispo_Vendredi)', 'aria-label': aria,
          value: valeurActuelle ?? '',
          onchange: (e: Event) => { void definirParametreSurveille(cle, (e.target as HTMLInputElement).value.trim()); },
        });
      }
      return h('p', {class: 'empty'}, 'Lecture de tes colonnes…');
    }

    chargerColonnesTousDocumentsSiBesoin();
    if (Array.isArray(colonnesTousDocuments)) {
      const valeurEncodee = valeurActuelle ? colonnesTousDocuments.find((c) => c.colonne.colId === valeurActuelle) : undefined;
      const options = [h('option', {value: '', selected: !valeurActuelle}, '— aucune —')];
      for (const {tableId, colonne} of colonnesTousDocuments) {
        const value = `${tableId}${SEPARATEUR_OPTION_TOUS_DOCUMENTS}${colonne.colId}`;
        options.push(h('option', {
          value, selected: valeurEncodee?.tableId === tableId && valeurEncodee.colonne.colId === colonne.colId,
        }, `${tableId} · ${colonne.label} (${colonne.colId})`));
      }
      return h('select', {
        class: 'select', 'aria-label': aria,
        onchange: (e: Event) => {
          const [tableId, colId] = (e.target as HTMLSelectElement).value.split(SEPARATEUR_OPTION_TOUS_DOCUMENTS);
          if (!tableId || !colId) { return; }
          void definirParametreSurveille(CLE_TABLE_BENEVOLES, tableId).then(() => definirParametreSurveille(cle, colId));
        },
      }, ...options);
    }
    if (colonnesTousDocuments === 'erreur') {
      return h('input', {
        class: 'input', type: 'text', placeholder: 'identifiant de colonne (ex. Dispo_Vendredi)', 'aria-label': aria,
        value: valeurActuelle ?? '',
        onchange: (e: Event) => { void definirParametreSurveille(cle, (e.target as HTMLInputElement).value.trim()); },
      });
    }
    return h('p', {class: 'empty'}, 'Lecture des colonnes de ton document…');
  }

  async function basculerCellule(benevoleId: Id, macro: MacroCreneau, quart: Epoch): Promise<void> {
    const quarts = quartsEntre(macro.Debut, macro.Fin);
    const indexActuel = indexerDisponibilitesParBenevole(m.disponibilites).get(benevoleId) ?? new Map();
    const nouvelles = disponibilitesApresBasculement(benevoleId, quarts, indexActuel, quart);
    try {
      await m.remplacerDisponibilites(benevoleId, macro.Debut, macro.Fin, nouvelles);
    } catch {
      dernierMessage = {texte: "Échec de l'écriture dans le document Grist connecté. Réessaie.", ton: 'danger'};
      rafraichir();
    }
  }

  /** Les artistes dont le passage couvre exactement ce quart d'heure, triés
   *  par nom — jamais tous les artistes du festival, seuls ceux plausibles
   *  à ce moment précis. */
  function artistesDuQuart(quart: Epoch) {
    return m.artistes.filter((a) => quart >= a.Debut && quart < a.Fin).sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'));
  }

  /** Choix d'un artiste précis pour une case (§8 point 10, point A de la
   *  demande initiale) : un clic cycle parmi les artistes qui jouent à ce
   *  quart d'heure précis, puis referme sur "indisponible" — même principe
   *  de cycle au clic que `basculerCellule`, jamais un menu par case (trop
   *  dense sur cette grille). */
  async function choisirArtisteCellule(benevoleId: Id, macro: MacroCreneau, quart: Epoch): Promise<void> {
    const candidats = artistesDuQuart(quart);
    if (candidats.length === 0) {
      dernierMessage = {texte: "Aucun artiste ne joue à ce quart d'heure.", ton: 'danger'};
      rafraichir();
      return;
    }
    const quarts = quartsEntre(macro.Debut, macro.Fin);
    const indexActuel = indexerDisponibilitesParBenevole(m.disponibilites).get(benevoleId) ?? new Map();
    const actuel = indexActuel.get(quart);
    const idActuel = actuel?.Statut === 'Artiste' ? actuel.Artiste : null;
    const indexCandidatActuel = idActuel != null ? candidats.findIndex((a) => a.id === idActuel) : -1;
    const prochainArtisteId = indexCandidatActuel + 1 < candidats.length ? candidats[indexCandidatActuel + 1]!.id : null;
    const nouvelles = disponibilitesApresChoixArtiste(benevoleId, quarts, indexActuel, quart, prochainArtisteId);
    try {
      await m.remplacerDisponibilites(benevoleId, macro.Debut, macro.Fin, nouvelles);
    } catch {
      dernierMessage = {texte: "Échec de l'écriture dans le document Grist connecté. Réessaie.", ton: 'danger'};
      rafraichir();
    }
  }

  /** Peuple notre table Bénévoles depuis la table qu'Antoine a désignée
   *  (§6.4, demande du 2026-09-23 : « nous avons deux tables qui stockent
   *  les bénévoles », jamais la sienne à écrire). Jamais de suppression :
   *  un bénévole absent de sa table aujourd'hui reste chez nous. Un second
   *  clic n'en recrée aucun (upsert par `Id_source`), seuls Nom/Téléphone
   *  sont actualisés sur ceux déjà liés. */
  async function peuplerBenevolesDepuisSource(): Promise<void> {
    const tableBenevoles = m.parametre(CLE_TABLE_BENEVOLES);
    const colNom = m.parametre(CLE_COLONNE_NOM_BENEVOLES);
    const colContact = m.parametre(CLE_COLONNE_CONTACT_BENEVOLES) ?? null;
    if (!tableBenevoles || !colNom) {
      dernierMessage = {texte: 'Choisis la table et la colonne du nom ci-dessus avant de peupler tes bénévoles.', ton: 'danger'};
      rafraichir();
      return;
    }
    if (m.equipes.length === 0) {
      dernierMessage = {
        texte: "Crée d'abord une équipe (vue Équipe) : chaque bénévole importé lui sera provisoirement rattaché, à corriger ensuite si besoin.",
        ton: 'danger',
      };
      rafraichir();
      return;
    }

    peuplementEnCours = true;
    dernierMessage = null;
    rafraichir();
    try {
      const {crees, actualises} = await m.peuplerBenevoles(tableBenevoles, colNom, colContact);
      dernierMessage = {
        texte: crees === 0 && actualises === 0
          ? 'Rien à peupler : aucune ligne avec un nom dans la colonne choisie.'
          : `${crees} bénévole${crees > 1 ? 's' : ''} créé${crees > 1 ? 's' : ''}, ${actualises} actualisé${actualises > 1 ? 's' : ''}.`,
        ton: 'ok',
      };
    } catch {
      dernierMessage = {texte: 'Échec du peuplement. Vérifie les colonnes associées puis réessaie.', ton: 'danger'};
    } finally {
      peuplementEnCours = false;
      rafraichir();
    }
  }

  /** Import (§6.4, points A et B) : pour chaque bénévole, lit sa réponse de
   *  chaque macro-créneau associé et ses souhaits d'artiste, puis remplace
   *  ses disponibilités macro-créneau par macro-créneau (jamais en un seul
   *  remplacement global : ça préserverait de la place aux quarts d'heure
   *  hors de tout macro-créneau mappé, jamais touchés ici). Une réponse non
   *  reconnue ("disponible mais…") n'écrit rien : elle reste à saisir à la
   *  main, en mode édition. */
  async function importerDisponibilites(): Promise<void> {
    const tableBenevoles = m.parametre(CLE_TABLE_BENEVOLES);
    const colSouhaits = m.parametre(CLE_COLONNE_SOUHAITS_ARTISTES);
    const colBinome = m.parametre(CLE_COLONNE_BINOME_SOUHAITE);
    const libelles = {
      toutLeCreneau: [m.parametre(CLE_LIBELLE_TOUT_LE_CRENEAU) ?? LIBELLES_REPONSE_PAR_DEFAUT.toutLeCreneau[0]!],
      pasDisponibleDuTout: [
        m.parametre(CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT) ?? LIBELLES_REPONSE_PAR_DEFAUT.pasDisponibleDuTout[0]!,
      ],
    };
    const macrosMappes = m.macroCreneaux
      .map((macro) => ({macro, colId: m.parametre(cleColonneReponseMacroCreneau(macro.id))}))
      .filter((x): x is {macro: MacroCreneau; colId: string} => Boolean(x.colId));

    if (!tableBenevoles) {
      dernierMessage = {texte: 'Choisis la table où sont tes bénévoles ci-dessus avant d\'importer.', ton: 'danger'};
      rafraichir();
      return;
    }
    if (macrosMappes.length === 0 && !colSouhaits && !colBinome) {
      dernierMessage = {texte: "Associe au moins une colonne ci-dessus avant d'importer.", ton: 'danger'};
      rafraichir();
      return;
    }

    importEnCours = true;
    dernierMessage = null;
    rafraichir();
    try {
      const valeursSouhaits = colSouhaits
        ? await m.valeursColonneBrute(tableBenevoles, colSouhaits)
        : new Map<Id, unknown>();
      const valeursBinome = colBinome
        ? await m.valeursColonneBrute(tableBenevoles, colBinome)
        : new Map<Id, unknown>();
      const valeursParMacro = new Map<Id, Map<Id, unknown>>();
      for (const {macro, colId} of macrosMappes) {
        valeursParMacro.set(macro.id, await m.valeursColonneBrute(tableBenevoles, colId));
      }

      // Paires déjà connues (n'importe quel sens) : un ré-import n'en
      // recrée jamais, `Magasin.creerAffinites` ne filtre rien lui-même.
      const pairesConnues = new Set(
        m.affinites.filter((a) => a.Type === 'Ensemble').map((a) => [a.Benevole_A, a.Benevole_B].sort().join('-')),
      );
      const aCreerAffinites: {benevoleAId: Id; benevoleBId: Id}[] = [];
      const nomsBinomeNonReconnus = new Set<string>();

      let nbManuels = 0;
      const nomsNonReconnus = new Set<string>();
      for (const benevole of m.benevoles) {
        // La réponse brute se lit dans SA table à lui, indexée par l'id de la
        // ligne d'origine (`Id_source`, posé par le peuplement ci-dessus) —
        // jamais par `benevole.id`, qui est l'id de NOTRE ligne et n'a aucun
        // rapport avec les identifiants de sa table (§6.4, 2026-09-23). Un
        // bénévole sans `Id_source` (saisi nativement, ou créé avant ce
        // mécanisme) ne trouve simplement aucune réponse, comme avant.
        const idSource = benevole.Id_source;
        const nomsSouhaites = nomsSouhaitesDepuisValeurBrute(idSource != null ? valeursSouhaits.get(idSource) : undefined);
        for (const nom of nomsArtistesNonReconnus(nomsSouhaites, m.artistes)) { nomsNonReconnus.add(nom); }
        const surcharges = disponibilitesDepuisSouhaitsArtistes(benevole.id, nomsSouhaites, m.artistes);

        if (colBinome) {
          const {benevoleBId, nomNonReconnu} = resoudreBinomeSouhaite(
            idSource != null ? valeursBinome.get(idSource) : undefined, m.benevoles,
          );
          if (nomNonReconnu) { nomsBinomeNonReconnus.add(nomNonReconnu); }
          if (benevoleBId != null && benevoleBId !== benevole.id) {
            const cle = [benevole.id, benevoleBId].sort().join('-');
            if (!pairesConnues.has(cle)) {
              pairesConnues.add(cle);
              aCreerAffinites.push({benevoleAId: benevole.id, benevoleBId});
            }
          }
        }
        for (const {macro} of macrosMappes) {
          const brut = idSource != null ? valeursParMacro.get(macro.id)!.get(idSource) : undefined;
          const reponse = typeof brut === 'string' ? brut : null;
          const resultat = disponibilitesDepuisReponseMacroCreneau(benevole.id, macro, reponse, libelles);
          if (resultat.statut === 'Manuelle') { nbManuels++; continue; }
          const surchargesDeCeMacro = surcharges.filter((d) => d.Quart_heure >= macro.Debut && d.Quart_heure < macro.Fin);
          await m.remplacerDisponibilites(
            benevole.id, macro.Debut, macro.Fin, fusionnerDisponibilites(resultat.disponibilites, surchargesDeCeMacro),
          );
        }
      }
      if (aCreerAffinites.length > 0) { await m.creerAffinites(aCreerAffinites); }

      const morceaux: string[] = ['Import terminé.'];
      if (nbManuels > 0) {
        morceaux.push(
          `${nbManuels} réponse${nbManuels > 1 ? 's' : ''} non reconnue${nbManuels > 1 ? 's' : ''} — à saisir à la main (mode édition, ci-dessus).`,
        );
      }
      if (nomsNonReconnus.size > 0) {
        morceaux.push(
          `${nomsNonReconnus.size} nom${nomsNonReconnus.size > 1 ? 's' : ''} d'artiste dans la colonne souhaits `
          + `ne correspond${nomsNonReconnus.size > 1 ? 'ent' : ''} à aucun artiste connu : ${[...nomsNonReconnus].join(', ')}.`,
        );
      }
      if (aCreerAffinites.length > 0) {
        morceaux.push(`${aCreerAffinites.length} binôme${aCreerAffinites.length > 1 ? 's' : ''} souhaité${aCreerAffinites.length > 1 ? 's' : ''} enregistré${aCreerAffinites.length > 1 ? 's' : ''}.`);
      }
      if (nomsBinomeNonReconnus.size > 0) {
        morceaux.push(
          `${nomsBinomeNonReconnus.size} nom${nomsBinomeNonReconnus.size > 1 ? 's' : ''} dans la colonne binôme `
          + `ne correspond${nomsBinomeNonReconnus.size > 1 ? 'ent' : ''} à aucun bénévole connu : ${[...nomsBinomeNonReconnus].join(', ')}.`,
        );
      }
      dernierMessage = {
        texte: morceaux.join(' '),
        ton: nbManuels > 0 || nomsNonReconnus.size > 0 || nomsBinomeNonReconnus.size > 0 ? 'danger' : 'ok',
      };
    } catch {
      dernierMessage = {texte: "Échec de l'import. Vérifie les colonnes associées puis réessaie.", ton: 'danger'};
    } finally {
      importEnCours = false;
      rafraichir();
    }
  }

  function construirePanneauReglages(): Node {
    const tableChoisie = m.parametre(CLE_TABLE_BENEVOLES);
    const macrosTries = [...m.macroCreneaux].sort((a, b) => a.Debut - b.Debut);

    return h('div', {class: 'card', style: {marginBottom: '12px'}},
      h('h3', {style: {marginTop: '0'}}, "Réglages d'import"),
      h('p', {class: 'view__intro'},
        "Associe les colonnes que tu as toi-même ajoutées à ta table Bénévoles. Elles ne sont jamais modifiées, "
        + 'seulement lues.',
      ),
      champ('Table où sont tes bénévoles', champTableBenevoles()),
      tableChoisie && colonnesBenevoles === 'chargement'
        ? h('p', {class: 'empty'}, 'Lecture des colonnes de ta table Bénévoles…') : null,
      tableChoisie && colonnesBenevoles === 'erreur'
        ? h('p', {class: 'pill pill--warn'}, "Impossible de lire la liste de tes colonnes pour l'instant — tape l'identifiant à la main ci-dessous.")
        : null,
      tableChoisie && tableChargee === tableChoisie && Array.isArray(colonnesBenevoles) && colonnesEligibles(colonnesBenevoles).length === 0
        ? h('p', {class: 'empty'},
            "Aucune colonne de ta table Bénévoles ne peut être associée ici : ajoute-lui d'abord, dans Grist, une "
            + 'colonne de texte ou de choix (par exemple les souhaits d\'artistes, ou une réponse de disponibilité).',
          )
        : null,
      tableChoisie
        ? h('div', {style: {marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid var(--border, #ddd)'}},
            h('p', {class: 'view__intro'},
              'Peuple ta table Bénévoles du widget depuis cette table-là : crée les bénévoles qui manquent, sans jamais '
              + 'en supprimer ni y toucher deux fois.',
            ),
            champ('Colonne du nom prénom', champColonne(CLE_COLONNE_NOM_BENEVOLES, 'Colonne du nom prénom', colonnesEligiblesTableExterne)),
            champ('Colonne du téléphone (optionnelle)', champColonne(CLE_COLONNE_CONTACT_BENEVOLES, 'Colonne du téléphone', colonnesEligiblesTableExterne)),
            h('button', {
              class: 'btn btn--sm', type: 'button', disabled: peuplementEnCours,
              onclick: () => { void peuplerBenevolesDepuisSource(); },
            }, peuplementEnCours ? 'Peuplement en cours…' : 'Peupler mes bénévoles'),
          )
        : null,
      champ("Colonne des souhaits d'artistes (choix multiple)", champColonne(CLE_COLONNE_SOUHAITS_ARTISTES, "Colonne des souhaits d'artistes")),
      champ(
        'Colonne du binôme souhaité (le nom exact du bénévole)',
        champColonne(CLE_COLONNE_BINOME_SOUHAITE, 'Colonne du binôme souhaité'),
      ),
      macrosTries.length === 0
        ? h('p', {class: 'empty'}, "Crée d'abord tes macro-créneaux (vue Agenda) pour associer une colonne de réponse par créneau.")
        : h('div', null, ...macrosTries.map((macro) => champ(
            `${macro.Nom} (${libelleHeure(macro.Debut)})`,
            champColonne(cleColonneReponseMacroCreneau(macro.id), `Colonne de réponse pour ${macro.Nom}`),
          ))),
      champ('Libellé "disponible sur tout le créneau"', h('input', {
        class: 'input', type: 'text',
        value: m.parametre(CLE_LIBELLE_TOUT_LE_CRENEAU) ?? LIBELLES_REPONSE_PAR_DEFAUT.toutLeCreneau[0],
        onchange: (e: Event) => { void definirParametreSurveille(CLE_LIBELLE_TOUT_LE_CRENEAU, (e.target as HTMLInputElement).value); },
      })),
      champ('Libellé "pas disponible du tout"', h('input', {
        class: 'input', type: 'text',
        value: m.parametre(CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT) ?? LIBELLES_REPONSE_PAR_DEFAUT.pasDisponibleDuTout[0],
        onchange: (e: Event) => { void definirParametreSurveille(CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT, (e.target as HTMLInputElement).value); },
      })),
      h('button', {
        class: 'btn btn--primary btn--sm', type: 'button', disabled: importEnCours,
        onclick: () => { void importerDisponibilites(); },
      }, importEnCours ? 'Import en cours…' : 'Importer les disponibilités'),
    );
  }

  function rafraichir(): void {
    const ix = indexer(m);
    // Le jour affiché vient du filtre global par macro-créneau
    // (`Magasin.macroCreneauSelectionne`, monté par `app.ts` au-dessus de
    // cette vue) — plus d'onglets de jour propres à cet écran depuis le
    // 2026-09-23 (même bascule que `views/grille.ts` : « un filtre macro qui
    // va servir pour tout »). Retombe sur le premier jour si rien n'est
    // encore sélectionné ou si la sélection ne correspond plus à aucun
    // macro-créneau existant (cas transitoire : `app.ts` corrige la
    // sélection au prochain rendu).
    const jours = regrouperParJour(m.macroCreneaux);
    const jour = jours.find((j) => j.macros.some((ma) => ma.id === m.macroCreneauSelectionne)) ?? jours[0];
    // Chaque clic en mode édition réécrit une disponibilité, ce qui repasse
    // par `m.subscribe(rafraichir)` : toute la grille (`.dispos-scroll`) est
    // reconstruite, donc un nouveau `<div>` qui démarre scrollé en haut à
    // gauche — sans ça, éditer une case hors du coin remontait le défilement
    // à chaque clic (Antoine, 2026-09-23 19h47). On retient la position
    // avant de vider le conteneur, on la réapplique sur le nouveau `<div>`.
    const ancienDefilement = container.querySelector<HTMLElement>('.dispos-scroll');
    const defilementConserve = ancienDefilement
      ? {haut: ancienDefilement.scrollTop, gauche: ancienDefilement.scrollLeft}
      : null;
    vider(container);

    if (panneauOuvert) { container.append(construirePanneauReglages()); }

    const barre = h('div', {class: 'dispos-barre'},
      h('div', {class: 'dispos-barre__filtres'},
        h('select', {
          class: 'select', 'aria-label': 'Filtrer par équipe',
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            equipeFiltre = v === 'toutes' ? 'toutes' : Number(v);
            rafraichir();
          },
        },
          h('option', {value: 'toutes', selected: equipeFiltre === 'toutes'}, 'Toutes les équipes'),
          ...m.equipes.map((eq) => h('option', {value: String(eq.id), selected: equipeFiltre === eq.id}, eq.Nom)),
        ),
        h('input', {
          class: 'input', type: 'search', placeholder: 'Rechercher un bénévole…', value: recherche,
          oninput: (e: Event) => { recherche = (e.target as HTMLInputElement).value; rafraichir(); },
        }),
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => { panneauOuvert = !panneauOuvert; rafraichir(); },
        }, panneauOuvert ? "Fermer les réglages" : "Réglages d'import"),
        h('label', {style: {display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px'}},
          h('input', {
            type: 'checkbox', checked: modeEdition,
            onchange: (e: Event) => {
              modeEdition = (e.target as HTMLInputElement).checked;
              if (!modeEdition) { modeArtiste = false; }
              rafraichir();
            },
          }),
          'Mode édition',
        ),
        h('label', {
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px',
            opacity: modeEdition ? '1' : '0.5',
          },
        },
          h('input', {
            type: 'checkbox', checked: modeArtiste, disabled: !modeEdition,
            onchange: (e: Event) => { modeArtiste = (e.target as HTMLInputElement).checked; rafraichir(); },
          }),
          'Choisir un artiste au clic',
        ),
      ),
      h('div', {class: 'dispos-legende'},
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--disponible'}), 'Disponible'),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--artiste'}), 'Veut voir un artiste'),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--indisponible'}), 'Indisponible'),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'contrainte-badge contrainte-badge--danger'}, '!'), 'Contrainte déclarée (survoler le nom)'),
      ),
    );
    container.append(barre);

    if (dernierMessage) {
      container.append(h('p', {class: `pill pill--${dernierMessage.ton}`, style: {marginTop: '8px'}}, dernierMessage.texte));
    }

    if (!jour) {
      container.append(h('p', {class: 'empty'}, 'Aucun macro-créneau : rien à afficher.'));
      return;
    }
    const blocs = blocsDuJour(jour).filter((b) => b.quarts.length > 0);
    // Bénévoles ayant une vraie disponibilité ce jour-là (§ prédicat commun,
    // `logic/derive.ts` — un souhait « voir un artiste » n'en est pas une),
    // même filtre que le roster Affectation et la feuille imprimable
    // (Antoine, 2026-09-24 : la grille montrait tout le monde malgré le
    // filtre par jour). Jamais en mode édition : sans ça, un bénévole tout
    // juste importé ou dont la réponse du jour n'a pas été reconnue
    // ("Manuelle", à saisir à la main) disparaîtrait de l'écran qui sert
    // justement à le saisir.
    const disposCeJour = benevolesDisponiblesCeJour(m, quartsDuJour(jour));

    const benevoles = m.benevoles
      .filter((b) => equipeFiltre === 'toutes' || b.Equipe === equipeFiltre)
      .filter((b) => recherche.trim() === '' || b.Nom.toLowerCase().includes(recherche.trim().toLowerCase()))
      .filter((b) => modeEdition || disposCeJour.has(b.id))
      .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'));

    if (blocs.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Ce jour ne couvre aucun quart d’heure.'));
      return;
    }
    if (benevoles.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Aucun bénévole ne correspond à ce filtre.'));
      return;
    }

    const indexDispos = indexerDisponibilitesParBenevole(m.disponibilites);

    const theadCellules: Node[] = [h('th', {class: 'dispos-table__coin', scope: 'col'}, 'Bénévole')];
    blocs.forEach((bloc, iBloc) => {
      bloc.quarts.forEach((q, iQuart) => {
        const limiteMacro = iQuart === 0 && iBloc > 0;
        theadCellules.push(h('th', {
          class: `dispos-table__heure${limiteMacro ? ' dispos-table__heure--limite-macro' : ''}`,
          scope: 'col',
          title: iQuart === 0 ? bloc.macro.Nom : undefined,
        }, estHeurePleine(q) ? libelleHeure(q) : ''));
      });
    });

    const lignes = benevoles.map((b) => {
      // Même défaut que `rosterCard` dans `views/affectation.ts`, corrigé le
      // 2026-09-23/24 (équipe orpheline) : `equipe` peut être absente si le
      // bénévole pointe vers une équipe qu'Antoine a depuis supprimée.
      const equipe = ix.equipe.get(b.Equipe);
      const contraintes = contraintesBenevole(m, ix, b.id);
      const gravite = graviteContraintes(contraintes);
      const cellules = blocs.flatMap((bloc, iBloc) => bloc.quarts.map((q, iQuart) => {
        const {statut, artisteId} = statutCellule(indexDispos, b.id, q);
        const artisteNom = artisteId != null ? ix.artiste.get(artisteId)?.Nom : undefined;
        const classe = statut === 'Disponible' ? 'disponible' : statut === 'Artiste' ? 'artiste' : 'indisponible';
        const limiteMacro = iQuart === 0 && iBloc > 0;
        const detail = artisteNom ? `veut voir ${artisteNom}` : LIBELLE_STATUT[statut];
        const indiceClic = modeEdition ? (modeArtiste ? ' · cliquer pour choisir un artiste' : ' · cliquer pour basculer') : '';
        return h('td', {
          class: `dispos-cellule dispos-cellule--${classe}${limiteMacro ? ' dispos-cellule--limite-macro' : ''}`,
          title: `${b.Nom} · ${libelleHeure(q)} · ${detail}${indiceClic}`,
          style: modeEdition ? {cursor: 'pointer'} : undefined,
          onclick: modeEdition
            ? () => { void (modeArtiste ? choisirArtisteCellule(b.id, bloc.macro, q) : basculerCellule(b.id, bloc.macro, q)); }
            : undefined,
        });
      }));
      return h('tr', null,
        h('th', {class: 'dispos-table__benevole', scope: 'row'},
          h('span', {class: 'dot', style: {background: equipe?.Couleur ?? 'var(--text-faint)'}}),
          b.Nom,
          gravite ? h('span', {
            class: `contrainte-badge contrainte-badge--${gravite}`,
            title: libelleContraintes(contraintes) ?? undefined,
          }, '!') : null,
        ),
        ...cellules,
      );
    });

    const nouveauDefilement = h('div', {class: 'dispos-scroll'},
      h('table', {class: 'dispos-table'},
        h('thead', null, h('tr', null, ...theadCellules)),
        h('tbody', null, ...lignes),
      ),
    ) as HTMLElement;

    container.append(
      nouveauDefilement,
      h('p', {class: 'view__intro', style: {marginTop: '10px', marginBottom: '0'}},
        `${benevoles.length} bénévole${benevoles.length > 1 ? 's' : ''} affiché${benevoles.length > 1 ? 's' : ''}. Une case sans donnée vaut indisponible (§6.4 du cahier des charges) : seule une disponibilité déclarée ouvre la possibilité d'une affectation.`,
      ),
    );
    // Ne s'applique qu'une fois le `<div>` attaché au document : posé sur un
    // nœud détaché, `scrollTop`/`scrollLeft` seraient ignorés (rien à
    // défiler avant la mise en page).
    if (defilementConserve) {
      nouveauDefilement.scrollTop = defilementConserve.haut;
      nouveauDefilement.scrollLeft = defilementConserve.gauche;
    }
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
