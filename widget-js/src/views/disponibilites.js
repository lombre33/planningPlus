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

import {t, tn, traductions} from '../i18n.js';
import {benevolesDisponiblesCeJour, indexer, quartsDuJour} from '../logic/derive.js';
import {regrouperParJour} from '../logic/derive.js';
import {
  blocsDuJour, contraintesBenevole, estHeurePleine, graviteContraintes, indexerDisponibilitesParBenevole,
  libelleContraintes, quartsEntre, statutCellule,
} from '../logic/dispos-terrain.js';
import {disponibilitesApresBasculement, disponibilitesApresChoixArtiste} from '../logic/edition-disponibilites.js';
import {
  disponibilitesDepuisReponseMacroCreneau, disponibilitesDepuisSouhaitsArtistes, fusionnerDisponibilites,
  LIBELLES_REPONSE_PAR_DEFAUT, nomsArtistesNonReconnus, nomsSouhaitesDepuisValeurBrute, resoudreBinomeSouhaite,
} from '../logic/import-disponibilites.js';
import {
  CLE_COLONNE_BINOME_SOUHAITE, CLE_COLONNE_CONTACT_BENEVOLES, CLE_COLONNE_NOM_BENEVOLES, CLE_COLONNE_SOUHAITS_ARTISTES,
  CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT, CLE_LIBELLE_TOUT_LE_CRENEAU,
  CLE_TABLE_BENEVOLES, cleColonneReponseMacroCreneau, colonnesEligibles,
  colonnesEligiblesTableExterne,
} from '../logic/parametres-benevoles.js';
import {libelleHeure} from '../temps.js';
import {h, vider} from '../ui/dom.js';

traductions({
  disponible: 'available',
  indisponible: 'unavailable',
  'veut voir un artiste': 'wants to see an artist',
  "Échec de l'enregistrement de ce réglage dans le document Grist connecté. Réessaie.":
    'Could not save this setting in the connected Grist document. Try again.',
  "Impossible de lire la liste des tables de ton document pour l'instant.":
    'Unable to read the list of tables in your document right now.',
  'Lecture des tables de ton document…': 'Reading your document’s tables…',
  'Table où sont tes bénévoles': 'Table holding your volunteers',
  '— choisir —': '— choose —',
  '— aucune —': '— none —',
  'identifiant de colonne (ex. Dispo_Vendredi)': 'column ID (e.g. Avail_Friday)',
  'Lecture de tes colonnes…': 'Reading your columns…',
  'Lecture des colonnes de ton document…': 'Reading your document’s columns…',
  "Échec de l'écriture dans le document Grist connecté. Réessaie.": 'Could not write to the connected Grist document. Try again.',
  "Aucun artiste ne joue à ce quart d'heure.": 'No artist is playing during this quarter hour.',
  'Choisis la table et la colonne du nom ci-dessus avant de peupler tes bénévoles.':
    'Choose the table and the name column above before populating your volunteers.',
  "Crée d'abord une équipe (vue Équipe) : chaque bénévole importé lui sera provisoirement rattaché, à corriger ensuite si besoin.":
    'Create a team first (Team view): each imported volunteer will be provisionally linked to it, to correct later if needed.',
  'Rien à peupler : aucune ligne avec un nom dans la colonne choisie.': 'Nothing to populate: no row has a name in the chosen column.',
  '{n} bénévole créé, {actualises}.': '{n} volunteer created, {actualises}.',
  '{n} bénévoles créés, {actualises}.': '{n} volunteers created, {actualises}.',
  '{n} actualisé': '{n} updated',
  '{n} actualisés': '{n} updated',
  'Échec du peuplement. Vérifie les colonnes associées puis réessaie.': 'Populating failed. Check the linked columns, then try again.',
  "Choisis la table où sont tes bénévoles ci-dessus avant d'importer.": 'Choose the table holding your volunteers above before importing.',
  "Associe au moins une colonne ci-dessus avant d'importer.": 'Link at least one column above before importing.',
  'Import terminé.': 'Import complete.',
  '{n} réponse non reconnue — à saisir à la main (mode édition, ci-dessus).':
    '{n} unrecognized answer — to enter by hand (edit mode, above).',
  '{n} réponses non reconnues — à saisir à la main (mode édition, ci-dessus).':
    '{n} unrecognized answers — to enter by hand (edit mode, above).',
  "{n} nom d'artiste dans la colonne souhaits ne correspond à aucun artiste connu : {noms}.":
    '{n} artist name in the wishes column matches no known artist: {noms}.',
  "{n} noms d'artiste dans la colonne souhaits ne correspondent à aucun artiste connu : {noms}.":
    '{n} artist names in the wishes column match no known artist: {noms}.',
  '{n} binôme souhaité enregistré.': '{n} wished-for buddy saved.',
  '{n} binômes souhaités enregistrés.': '{n} wished-for buddies saved.',
  '{n} nom dans la colonne binôme ne correspond à aucun bénévole connu : {noms}.':
    '{n} name in the buddy column matches no known volunteer: {noms}.',
  '{n} noms dans la colonne binôme ne correspondent à aucun bénévole connu : {noms}.':
    '{n} names in the buddy column match no known volunteer: {noms}.',
  "Échec de l'import. Vérifie les colonnes associées puis réessaie.": 'Import failed. Check the linked columns, then try again.',
  "Réglages d'import": 'Import settings',
  'Associe les colonnes que tu as toi-même ajoutées à ta table Bénévoles. Elles ne sont jamais modifiées, seulement lues.':
    'Link the columns you added to your Volunteers table yourself. They are never modified, only read.',
  'Lecture des colonnes de ta table Bénévoles…': 'Reading the columns of your Volunteers table…',
  "Impossible de lire la liste de tes colonnes pour l'instant — tape l'identifiant à la main ci-dessous.":
    'Unable to read your list of columns right now — type the ID by hand below.',
  "Aucune colonne de ta table Bénévoles ne peut être associée ici : ajoute-lui d'abord, dans Grist, une colonne de texte ou de choix (par exemple les souhaits d'artistes, ou une réponse de disponibilité).":
    'No column of your Volunteers table can be linked here: first add a text or choice column to it in Grist (for example artist wishes, or an availability answer).',
  'Peuple ta table Bénévoles du widget depuis cette table-là : crée les bénévoles qui manquent, sans jamais en supprimer ni y toucher deux fois.':
    'Populate the widget’s Volunteers table from that table: missing volunteers are created, none are ever deleted or touched twice.',
  'Colonne du nom prénom': 'Full name column',
  'Colonne du téléphone (optionnelle)': 'Phone column (optional)',
  'Colonne du téléphone': 'Phone column',
  'Peuplement en cours…': 'Populating…',
  'Peupler mes bénévoles': 'Populate my volunteers',
  "Colonne des souhaits d'artistes (choix multiple)": 'Artist wishes column (multiple choice)',
  "Colonne des souhaits d'artistes": 'Artist wishes column',
  'Colonne du binôme souhaité (le nom exact du bénévole)': 'Wished-for buddy column (the volunteer’s exact name)',
  'Colonne du binôme souhaité': 'Wished-for buddy column',
  "Crée d'abord tes macro-créneaux (vue Agenda) pour associer une colonne de réponse par créneau.":
    'Create your time blocks first (Agenda view) to link one answer column per time block.',
  'Colonne de réponse pour {macro}': 'Answer column for {macro}',
  'Libellé "disponible sur tout le créneau"': 'Label for “available for the whole time block”',
  'Libellé "pas disponible du tout"': 'Label for “not available at all”',
  'Import en cours…': 'Importing…',
  'Importer les disponibilités': 'Import availability',
  'Filtrer par équipe': 'Filter by team',
  'Toutes les équipes': 'All teams',
  'Rechercher un bénévole…': 'Search volunteers…',
  'Fermer les réglages': 'Close settings',
  'Mode édition': 'Edit mode',
  'Choisir un artiste au clic': 'Pick an artist on click',
  Disponible: 'Available',
  'Veut voir un artiste': 'Wants to see an artist',
  Indisponible: 'Unavailable',
  'Contrainte déclarée (survoler le nom)': 'Declared constraint (hover over the name)',
  'Aucun macro-créneau : rien à afficher.': 'No time blocks: nothing to show.',
  'Ce jour ne couvre aucun quart d’heure.': 'This day covers no quarter hours.',
  'Aucun bénévole ne correspond à ce filtre.': 'No volunteer matches this filter.',
  Bénévole: 'Volunteer',
  'veut voir {artiste}': 'wants to see {artiste}',
  'cliquer pour choisir un artiste': 'click to pick an artist',
  'cliquer pour basculer': 'click to toggle',
  '{n} bénévole.': '{n} volunteer.',
  '{n} bénévoles.': '{n} volunteers.',
  'Une case vide vaut indisponible : on n’affecte que sur une disponibilité déclarée.':
    'An empty cell counts as unavailable: assignments only go where availability was declared.',
});

/** Libellé d'un statut de disponibilité (valeur stockée) dans l'infobulle
 *  d'une case, évalué au rendu pour suivre la langue. */
const LIBELLE_STATUT = {
  Disponible: () => t('disponible'),
  Indisponible: () => t('indisponible'),
  Artiste: () => t('veut voir un artiste'),
};

function champ(libelle, entree) {
  return h('div', {style: {marginBottom: '10px'}},
    h('label', {style: {display: 'block', fontWeight: '600', marginBottom: '4px'}}, libelle),
    entree,
  );
}

export function montrerDisponibilites(container, m) {
  let equipeFiltre = 'toutes';
  let recherche = '';
  let modeEdition = false;
  let modeArtiste = false;
  let panneauOuvert = false;
  let importEnCours = false;
  let peuplementEnCours = false;
  let dernierMessage = null;
  /** Colonnes de la table de bénévoles choisie (`CLE_TABLE_BENEVOLES`),
   *  rechargées si la table choisie change (`tableChargee` garde la trace
   *  de la table pour laquelle `colonnesBenevoles` est valide). */
  let tableChargee = null;
  let colonnesBenevoles = null;
  /** Tables du document, pour le sélecteur — jamais de nom en dur ici
   *  (2026-09-23, après coup : `TABLE_BENEVOLES` visait notre propre table
   *  sans jamais vérifier que ses vrais bénévoles y étaient, signalé par
   *  Antoine). */
  let tablesDisponibles = null;
  /** Repli tant qu'aucune table n'est choisie : les colonnes éligibles de
   *  TOUTES les tables du document plutôt qu'une liste vide (demande
   *  explicite d'Antoine : « il faut que toutes les colonnes du document
   *  s'affichent »). Choisir une de ces colonnes désigne du même coup sa
   *  table dans `CLE_TABLE_BENEVOLES` — les deux choix ne peuvent pas
   *  diverger. */
  let colonnesTousDocuments = null;

  /** Enregistre un réglage `Parametres`, jamais en tir-et-oublie : un échec
   *  (table `Parametres` absente sur ce document, document déconnecté…)
   *  doit se voir à l'écran plutôt que disparaître, sans quoi Antoine
   *  choisit une colonne, rien ne se passe, et l'import lui répond ensuite
   *  qu'aucune colonne n'est associée — signalé par Connexion Grist,
   *  2026-09-23 17h39. Sur succès, `m.definirParametre` notifie déjà et
   *  redessine tout seul ; ce n'est que l'échec qu'il fallait rattraper ici. */
  async function definirParametreSurveille(cle, valeur) {
    try {
      await m.definirParametre(cle, valeur);
    } catch {
      dernierMessage = {texte: t("Échec de l'enregistrement de ce réglage dans le document Grist connecté. Réessaie."), ton: 'danger'};
      rafraichir();
    }
  }

  function chargerTablesSiBesoin() {
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
  function champTableBenevoles() {
    chargerTablesSiBesoin();
    const valeurActuelle = m.parametre(CLE_TABLE_BENEVOLES) ?? '';
    if (!Array.isArray(tablesDisponibles)) {
      return h('p', {class: tablesDisponibles === 'erreur' ? 'pill pill--warn' : 'empty'},
        tablesDisponibles === 'erreur'
          ? t("Impossible de lire la liste des tables de ton document pour l'instant.")
          : t('Lecture des tables de ton document…'),
      );
    }
    return h('select', {
      class: 'select', 'aria-label': t('Table où sont tes bénévoles'),
      onchange: (e) => { void definirParametreSurveille(CLE_TABLE_BENEVOLES, e.target.value); },
    },
      h('option', {value: '', selected: valeurActuelle === ''}, t('— choisir —')),
      ...tablesDisponibles.map((table) => h('option', {value: table.tableId, selected: table.tableId === valeurActuelle}, table.tableId)),
    );
  }

  function chargerColonnesSiBesoin(tableId) {
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
  function chargerColonnesTousDocumentsSiBesoin() {
    if (colonnesTousDocuments != null || !Array.isArray(tablesDisponibles)) { return; }
    colonnesTousDocuments = 'chargement';
    Promise.all(tablesDisponibles.map(async (table) => {
      const colonnes = await m.colonnesTable(table.tableId);
      return colonnesEligibles(colonnes).map((colonne) => ({tableId: table.tableId, colonne}));
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
  function champColonne(cle, aria, filtre = colonnesEligibles) {
    const valeurActuelle = m.parametre(cle);
    const tableChoisie = m.parametre(CLE_TABLE_BENEVOLES);

    if (tableChoisie) {
      chargerColonnesSiBesoin(tableChoisie);
      if (Array.isArray(colonnesBenevoles) && tableChargee === tableChoisie) {
        const options = [h('option', {value: '', selected: !valeurActuelle}, t('— aucune —'))];
        for (const c of filtre(colonnesBenevoles)) {
          options.push(h('option', {value: c.colId, selected: c.colId === valeurActuelle}, `${c.label} (${c.colId})`));
        }
        return h('select', {
          class: 'select', 'aria-label': aria,
          onchange: (e) => { void definirParametreSurveille(cle, e.target.value); },
        }, ...options);
      }
      if (colonnesBenevoles === 'erreur') {
        return h('input', {
          class: 'input', type: 'text', placeholder: t('identifiant de colonne (ex. Dispo_Vendredi)'), 'aria-label': aria,
          value: valeurActuelle ?? '',
          onchange: (e) => { void definirParametreSurveille(cle, e.target.value.trim()); },
        });
      }
      return h('p', {class: 'empty'}, t('Lecture de tes colonnes…'));
    }

    chargerColonnesTousDocumentsSiBesoin();
    if (Array.isArray(colonnesTousDocuments)) {
      const valeurEncodee = valeurActuelle ? colonnesTousDocuments.find((c) => c.colonne.colId === valeurActuelle) : undefined;
      const options = [h('option', {value: '', selected: !valeurActuelle}, t('— aucune —'))];
      for (const {tableId, colonne} of colonnesTousDocuments) {
        const value = `${tableId}${SEPARATEUR_OPTION_TOUS_DOCUMENTS}${colonne.colId}`;
        options.push(h('option', {
          value, selected: valeurEncodee?.tableId === tableId && valeurEncodee.colonne.colId === colonne.colId,
        }, `${tableId} · ${colonne.label} (${colonne.colId})`));
      }
      return h('select', {
        class: 'select', 'aria-label': aria,
        onchange: (e) => {
          const [tableId, colId] = e.target.value.split(SEPARATEUR_OPTION_TOUS_DOCUMENTS);
          if (!tableId || !colId) { return; }
          void definirParametreSurveille(CLE_TABLE_BENEVOLES, tableId).then(() => definirParametreSurveille(cle, colId));
        },
      }, ...options);
    }
    if (colonnesTousDocuments === 'erreur') {
      return h('input', {
        class: 'input', type: 'text', placeholder: t('identifiant de colonne (ex. Dispo_Vendredi)'), 'aria-label': aria,
        value: valeurActuelle ?? '',
        onchange: (e) => { void definirParametreSurveille(cle, e.target.value.trim()); },
      });
    }
    return h('p', {class: 'empty'}, t('Lecture des colonnes de ton document…'));
  }

  async function basculerCellule(benevoleId, macro, quart) {
    const quarts = quartsEntre(macro.Debut, macro.Fin);
    const indexActuel = indexerDisponibilitesParBenevole(m.disponibilites).get(benevoleId) ?? new Map();
    const nouvelles = disponibilitesApresBasculement(benevoleId, quarts, indexActuel, quart);
    try {
      await m.remplacerDisponibilites(benevoleId, macro.Debut, macro.Fin, nouvelles);
    } catch {
      dernierMessage = {texte: t("Échec de l'écriture dans le document Grist connecté. Réessaie."), ton: 'danger'};
      rafraichir();
    }
  }

  /** Les artistes dont le passage couvre exactement ce quart d'heure, triés
   *  par nom — jamais tous les artistes du festival, seuls ceux plausibles
   *  à ce moment précis. */
  function artistesDuQuart(quart) {
    return m.artistes.filter((a) => quart >= a.Debut && quart < a.Fin).sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'));
  }

  /** Choix d'un artiste précis pour une case (§8 point 10, point A de la
   *  demande initiale) : un clic cycle parmi les artistes qui jouent à ce
   *  quart d'heure précis, puis referme sur "indisponible" — même principe
   *  de cycle au clic que `basculerCellule`, jamais un menu par case (trop
   *  dense sur cette grille). */
  async function choisirArtisteCellule(benevoleId, macro, quart) {
    const candidats = artistesDuQuart(quart);
    if (candidats.length === 0) {
      dernierMessage = {texte: t("Aucun artiste ne joue à ce quart d'heure."), ton: 'danger'};
      rafraichir();
      return;
    }
    const quarts = quartsEntre(macro.Debut, macro.Fin);
    const indexActuel = indexerDisponibilitesParBenevole(m.disponibilites).get(benevoleId) ?? new Map();
    const actuel = indexActuel.get(quart);
    const idActuel = actuel?.Statut === 'Artiste' ? actuel.Artiste : null;
    const indexCandidatActuel = idActuel != null ? candidats.findIndex((a) => a.id === idActuel) : -1;
    const prochainArtisteId = indexCandidatActuel + 1 < candidats.length ? candidats[indexCandidatActuel + 1].id : null;
    const nouvelles = disponibilitesApresChoixArtiste(benevoleId, quarts, indexActuel, quart, prochainArtisteId);
    try {
      await m.remplacerDisponibilites(benevoleId, macro.Debut, macro.Fin, nouvelles);
    } catch {
      dernierMessage = {texte: t("Échec de l'écriture dans le document Grist connecté. Réessaie."), ton: 'danger'};
      rafraichir();
    }
  }

  /** Peuple notre table Bénévoles depuis la table qu'Antoine a désignée
   *  (§6.4, demande du 2026-09-23 : « nous avons deux tables qui stockent
   *  les bénévoles », jamais la sienne à écrire). Jamais de suppression :
   *  un bénévole absent de sa table aujourd'hui reste chez nous. Un second
   *  clic n'en recrée aucun (upsert par `Id_source`), seuls Nom/Téléphone
   *  sont actualisés sur ceux déjà liés. */
  async function peuplerBenevolesDepuisSource() {
    const tableBenevoles = m.parametre(CLE_TABLE_BENEVOLES);
    const colNom = m.parametre(CLE_COLONNE_NOM_BENEVOLES);
    const colContact = m.parametre(CLE_COLONNE_CONTACT_BENEVOLES) ?? null;
    if (!tableBenevoles || !colNom) {
      dernierMessage = {texte: t('Choisis la table et la colonne du nom ci-dessus avant de peupler tes bénévoles.'), ton: 'danger'};
      rafraichir();
      return;
    }
    if (m.equipes.length === 0) {
      dernierMessage = {
        texte: t("Crée d'abord une équipe (vue Équipe) : chaque bénévole importé lui sera provisoirement rattaché, à corriger ensuite si besoin."),
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
          ? t('Rien à peupler : aucune ligne avec un nom dans la colonne choisie.')
          : tn(crees, '{n} bénévole créé, {actualises}.', '{n} bénévoles créés, {actualises}.', {
            actualises: tn(actualises, '{n} actualisé', '{n} actualisés'),
          }),
        ton: 'ok',
      };
    } catch {
      dernierMessage = {texte: t('Échec du peuplement. Vérifie les colonnes associées puis réessaie.'), ton: 'danger'};
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
  async function importerDisponibilites() {
    const tableBenevoles = m.parametre(CLE_TABLE_BENEVOLES);
    const colSouhaits = m.parametre(CLE_COLONNE_SOUHAITS_ARTISTES);
    const colBinome = m.parametre(CLE_COLONNE_BINOME_SOUHAITE);
    const libelles = {
      toutLeCreneau: [m.parametre(CLE_LIBELLE_TOUT_LE_CRENEAU) ?? LIBELLES_REPONSE_PAR_DEFAUT.toutLeCreneau[0]],
      pasDisponibleDuTout: [
        m.parametre(CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT) ?? LIBELLES_REPONSE_PAR_DEFAUT.pasDisponibleDuTout[0],
      ],
    };
    const macrosMappes = m.macroCreneaux
      .map((macro) => ({macro, colId: m.parametre(cleColonneReponseMacroCreneau(macro.id))}))
      .filter((x) => Boolean(x.colId));

    if (!tableBenevoles) {
      dernierMessage = {texte: t("Choisis la table où sont tes bénévoles ci-dessus avant d'importer."), ton: 'danger'};
      rafraichir();
      return;
    }
    if (macrosMappes.length === 0 && !colSouhaits && !colBinome) {
      dernierMessage = {texte: t("Associe au moins une colonne ci-dessus avant d'importer."), ton: 'danger'};
      rafraichir();
      return;
    }

    importEnCours = true;
    dernierMessage = null;
    rafraichir();
    try {
      const valeursSouhaits = colSouhaits
        ? await m.valeursColonneBrute(tableBenevoles, colSouhaits)
        : new Map();
      const valeursBinome = colBinome
        ? await m.valeursColonneBrute(tableBenevoles, colBinome)
        : new Map();
      const valeursParMacro = new Map();
      for (const {macro, colId} of macrosMappes) {
        valeursParMacro.set(macro.id, await m.valeursColonneBrute(tableBenevoles, colId));
      }

      // Paires déjà connues (n'importe quel sens) : un ré-import n'en
      // recrée jamais, `Magasin.creerAffinites` ne filtre rien lui-même.
      const pairesConnues = new Set(
        m.affinites.filter((a) => a.Type === 'Ensemble').map((a) => [a.Benevole_A, a.Benevole_B].sort().join('-')),
      );
      const aCreerAffinites = [];
      const nomsBinomeNonReconnus = new Set();

      let nbManuels = 0;
      const nomsNonReconnus = new Set();
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
          const brut = idSource != null ? valeursParMacro.get(macro.id).get(idSource) : undefined;
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

      const morceaux = [t('Import terminé.')];
      if (nbManuels > 0) {
        morceaux.push(tn(nbManuels,
          '{n} réponse non reconnue — à saisir à la main (mode édition, ci-dessus).',
          '{n} réponses non reconnues — à saisir à la main (mode édition, ci-dessus).'));
      }
      if (nomsNonReconnus.size > 0) {
        morceaux.push(tn(nomsNonReconnus.size,
          "{n} nom d'artiste dans la colonne souhaits ne correspond à aucun artiste connu : {noms}.",
          "{n} noms d'artiste dans la colonne souhaits ne correspondent à aucun artiste connu : {noms}.",
          {noms: [...nomsNonReconnus].join(', ')}));
      }
      if (aCreerAffinites.length > 0) {
        morceaux.push(tn(aCreerAffinites.length, '{n} binôme souhaité enregistré.', '{n} binômes souhaités enregistrés.'));
      }
      if (nomsBinomeNonReconnus.size > 0) {
        morceaux.push(tn(nomsBinomeNonReconnus.size,
          '{n} nom dans la colonne binôme ne correspond à aucun bénévole connu : {noms}.',
          '{n} noms dans la colonne binôme ne correspondent à aucun bénévole connu : {noms}.',
          {noms: [...nomsBinomeNonReconnus].join(', ')}));
      }
      dernierMessage = {
        texte: morceaux.join(' '),
        ton: nbManuels > 0 || nomsNonReconnus.size > 0 || nomsBinomeNonReconnus.size > 0 ? 'danger' : 'ok',
      };
    } catch {
      dernierMessage = {texte: t("Échec de l'import. Vérifie les colonnes associées puis réessaie."), ton: 'danger'};
    } finally {
      importEnCours = false;
      rafraichir();
    }
  }

  function construirePanneauReglages() {
    const tableChoisie = m.parametre(CLE_TABLE_BENEVOLES);
    const macrosTries = [...m.macroCreneaux].sort((a, b) => a.Debut - b.Debut);

    return h('div', {class: 'card', style: {marginBottom: '12px'}},
      h('h3', {style: {marginTop: '0'}}, t("Réglages d'import")),
      h('p', {class: 'view__intro'},
        t('Associe les colonnes que tu as toi-même ajoutées à ta table Bénévoles. Elles ne sont jamais modifiées, seulement lues.'),
      ),
      champ(t('Table où sont tes bénévoles'), champTableBenevoles()),
      tableChoisie && colonnesBenevoles === 'chargement'
        ? h('p', {class: 'empty'}, t('Lecture des colonnes de ta table Bénévoles…')) : null,
      tableChoisie && colonnesBenevoles === 'erreur'
        ? h('p', {class: 'pill pill--warn'}, t("Impossible de lire la liste de tes colonnes pour l'instant — tape l'identifiant à la main ci-dessous."))
        : null,
      tableChoisie && tableChargee === tableChoisie && Array.isArray(colonnesBenevoles) && colonnesEligibles(colonnesBenevoles).length === 0
        ? h('p', {class: 'empty'},
            t("Aucune colonne de ta table Bénévoles ne peut être associée ici : ajoute-lui d'abord, dans Grist, une colonne de texte ou de choix (par exemple les souhaits d'artistes, ou une réponse de disponibilité)."),
          )
        : null,
      tableChoisie
        ? h('div', {style: {marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid var(--border, #ddd)'}},
            h('p', {class: 'view__intro'},
              t('Peuple ta table Bénévoles du widget depuis cette table-là : crée les bénévoles qui manquent, sans jamais en supprimer ni y toucher deux fois.'),
            ),
            champ(t('Colonne du nom prénom'), champColonne(CLE_COLONNE_NOM_BENEVOLES, t('Colonne du nom prénom'), colonnesEligiblesTableExterne)),
            champ(t('Colonne du téléphone (optionnelle)'), champColonne(CLE_COLONNE_CONTACT_BENEVOLES, t('Colonne du téléphone'), colonnesEligiblesTableExterne)),
            h('button', {
              class: 'btn btn--sm', type: 'button', disabled: peuplementEnCours,
              onclick: () => { void peuplerBenevolesDepuisSource(); },
            }, peuplementEnCours ? t('Peuplement en cours…') : t('Peupler mes bénévoles')),
          )
        : null,
      champ(t("Colonne des souhaits d'artistes (choix multiple)"), champColonne(CLE_COLONNE_SOUHAITS_ARTISTES, t("Colonne des souhaits d'artistes"))),
      champ(
        t('Colonne du binôme souhaité (le nom exact du bénévole)'),
        champColonne(CLE_COLONNE_BINOME_SOUHAITE, t('Colonne du binôme souhaité')),
      ),
      macrosTries.length === 0
        ? h('p', {class: 'empty'}, t("Crée d'abord tes macro-créneaux (vue Agenda) pour associer une colonne de réponse par créneau."))
        : h('div', null, ...macrosTries.map((macro) => champ(
            `${macro.Nom} (${libelleHeure(macro.Debut)})`,
            champColonne(cleColonneReponseMacroCreneau(macro.id), t('Colonne de réponse pour {macro}', {macro: macro.Nom})),
          ))),
      champ(t('Libellé "disponible sur tout le créneau"'), h('input', {
        class: 'input', type: 'text',
        value: m.parametre(CLE_LIBELLE_TOUT_LE_CRENEAU) ?? LIBELLES_REPONSE_PAR_DEFAUT.toutLeCreneau[0],
        onchange: (e) => { void definirParametreSurveille(CLE_LIBELLE_TOUT_LE_CRENEAU, e.target.value); },
      })),
      champ(t('Libellé "pas disponible du tout"'), h('input', {
        class: 'input', type: 'text',
        value: m.parametre(CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT) ?? LIBELLES_REPONSE_PAR_DEFAUT.pasDisponibleDuTout[0],
        onchange: (e) => { void definirParametreSurveille(CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT, e.target.value); },
      })),
      h('button', {
        class: 'btn btn--primary btn--sm', type: 'button', disabled: importEnCours,
        onclick: () => { void importerDisponibilites(); },
      }, importEnCours ? t('Import en cours…') : t('Importer les disponibilités')),
    );
  }

  function rafraichir() {
    const ix = indexer(m);
    // Le jour affiché vient du filtre global par macro-créneau
    // (`Magasin.macroCreneauSelectionne`, monté par `app.js` au-dessus de
    // cette vue) — plus d'onglets de jour propres à cet écran depuis le
    // 2026-09-23 (même bascule que `views/grille.js` : « un filtre macro qui
    // va servir pour tout »). Retombe sur le premier jour si rien n'est
    // encore sélectionné ou si la sélection ne correspond plus à aucun
    // macro-créneau existant (cas transitoire : `app.js` corrige la
    // sélection au prochain rendu).
    const jours = regrouperParJour(m.macroCreneaux);
    const jour = jours.find((j) => j.macros.some((ma) => ma.id === m.macroCreneauSelectionne)) ?? jours[0];
    // Chaque clic en mode édition réécrit une disponibilité, ce qui repasse
    // par `m.subscribe(rafraichir)` : toute la grille (`.dispos-scroll`) est
    // reconstruite, donc un nouveau `<div>` qui démarre scrollé en haut à
    // gauche — sans ça, éditer une case hors du coin remontait le défilement
    // à chaque clic (Antoine, 2026-09-23 19h47). On retient la position
    // avant de vider le conteneur, on la réapplique sur le nouveau `<div>`.
    const ancienDefilement = container.querySelector('.dispos-scroll');
    const defilementConserve = ancienDefilement
      ? {haut: ancienDefilement.scrollTop, gauche: ancienDefilement.scrollLeft}
      : null;
    vider(container);

    if (panneauOuvert) { container.append(construirePanneauReglages()); }

    const barre = h('div', {class: 'dispos-barre'},
      h('div', {class: 'dispos-barre__filtres'},
        h('select', {
          class: 'select', 'aria-label': t('Filtrer par équipe'),
          onchange: (e) => {
            const v = e.target.value;
            equipeFiltre = v === 'toutes' ? 'toutes' : Number(v);
            rafraichir();
          },
        },
          h('option', {value: 'toutes', selected: equipeFiltre === 'toutes'}, t('Toutes les équipes')),
          ...m.equipes.map((eq) => h('option', {value: String(eq.id), selected: equipeFiltre === eq.id}, eq.Nom)),
        ),
        h('input', {
          class: 'input', type: 'search', placeholder: t('Rechercher un bénévole…'), value: recherche,
          oninput: (e) => { recherche = e.target.value; rafraichir(); },
        }),
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => { panneauOuvert = !panneauOuvert; rafraichir(); },
        }, panneauOuvert ? t('Fermer les réglages') : t("Réglages d'import")),
        h('label', {style: {display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px'}},
          h('input', {
            type: 'checkbox', checked: modeEdition,
            onchange: (e) => {
              modeEdition = e.target.checked;
              if (!modeEdition) { modeArtiste = false; }
              rafraichir();
            },
          }),
          t('Mode édition'),
        ),
        // Ne sert qu'en mode édition : n'apparaît qu'avec lui.
        !modeEdition ? null : h('label', {
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px',
          },
        },
          h('input', {
            type: 'checkbox', checked: modeArtiste,
            onchange: (e) => { modeArtiste = e.target.checked; rafraichir(); },
          }),
          t('Choisir un artiste au clic'),
        ),
      ),
      h('div', {class: 'dispos-legende'},
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--disponible'}), t('Disponible')),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--artiste'}), t('Veut voir un artiste')),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--indisponible'}), t('Indisponible')),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'contrainte-badge contrainte-badge--danger'}, '!'), t('Contrainte déclarée (survoler le nom)')),
      ),
    );
    container.append(barre);

    if (dernierMessage) {
      container.append(h('p', {class: `pill pill--${dernierMessage.ton}`, style: {marginTop: '8px'}}, dernierMessage.texte));
    }

    if (!jour) {
      container.append(h('p', {class: 'empty'}, t('Aucun macro-créneau : rien à afficher.')));
      return;
    }
    const blocs = blocsDuJour(jour).filter((b) => b.quarts.length > 0);
    // Bénévoles ayant une vraie disponibilité ce jour-là (§ prédicat commun,
    // `logic/derive.js` — un souhait « voir un artiste » n'en est pas une),
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
      container.append(h('p', {class: 'empty'}, t('Ce jour ne couvre aucun quart d’heure.')));
      return;
    }
    if (benevoles.length === 0) {
      container.append(h('p', {class: 'empty'}, t('Aucun bénévole ne correspond à ce filtre.')));
      return;
    }

    const indexDispos = indexerDisponibilitesParBenevole(m.disponibilites);

    const theadCellules = [h('th', {class: 'dispos-table__coin', scope: 'col'}, t('Bénévole'))];
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
      // Même défaut que `rosterCard` dans `views/affectation.js`, corrigé le
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
        const detail = artisteNom ? t('veut voir {artiste}', {artiste: artisteNom}) : LIBELLE_STATUT[statut]();
        const indiceClic = modeEdition ? ` · ${modeArtiste ? t('cliquer pour choisir un artiste') : t('cliquer pour basculer')}` : '';
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
    );

    container.append(
      nouveauDefilement,
      h('p', {class: 'view__intro', style: {marginTop: '10px', marginBottom: '0'}},
        `${tn(benevoles.length, '{n} bénévole.', '{n} bénévoles.')} ${t('Une case vide vaut indisponible : on n’affecte que sur une disponibilité déclarée.')}`,
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
