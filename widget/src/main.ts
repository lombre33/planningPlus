/**
 * Point d'entrée du widget — ne vise que l'intérieur d'un document Grist
 * (décision d'Antoine du 2026-09-23 : plus de mode démonstration, plus de
 * jeu de données figé, et aucun écran dédié hors d'un hôte Grist — un tel
 * usage n'a pas lieu d'être, autant ne pas alourdir ce fichier pour lui).
 *
 * Deux issues, une fois connecté :
 *
 * - toutes les tables attendues (`TABLES_REQUISES`) existent dans le
 *   document, vides ou non : lit le document via `lireDocument` (`./grist`)
 *   et monte la maquette sur le `Modele` qui en sort. Un document flambant
 *   neuf, sans aucune ligne, est le premier jour d'un vrai utilisateur, pas
 *   une panne — chaque vue sait déjà se montrer vide et inviter à l'étape 1
 *   (§1.1) ;
 * - il manque au moins une des tables attendues, ou une erreur survient
 *   (création de tables, pose de l'affichage, lecture) : un message nomme
 *   ce qui manque ou ce qui a échoué plutôt que de le masquer.
 */

import './style.css';
import {demarrerApp} from './app';
import type {Id} from './domain/types';
import type {DocApiEcriture, LigneParametre, NouvelleDisponibilite, TableBrute} from './grist';
import {
  actionsCreerArtiste, actionsCreerBesoin, actionsCreerEquipe, actionsCreerGroupe, actionsCreerMacroCreneau,
  actionsCreerMission, actionsCreerSousCreneaux, actionsCreerTablesManquantes, actionsDefinirAbsence,
  actionsDefinirParametre, actionsDefinirPlaces, actionsDeplacerMacroCreneau, actionsDeplacerPositionGroupe,
  actionsEcrireDisponibilites, actionsModifierArtiste, actionsModifierPlaces, actionsModifierSousCreneaux,
  actionsPositionnerGroupe, actionsReglerAffichage, actionsRenommerMacroCreneau, actionsRepointerBesoins,
  actionsRetirerPositionGroupe, actionsRetirerPositionsGroupe, actionsSupprimerBesoins, actionsSupprimerDisponibilites,
  actionsSupprimerMacroCreneau, actionsSupprimerSousCreneaux,
  appliquerActions,
  colonnesDeTable,
  decoderNombre,
  LIBELLE_PAR_TABLE, lireDocument, zipperTable,
} from './grist';
import {type EcritureGrist, Magasin, SuppressionApresCreationEchouee} from './store';

/** Les 14 tables que lit `construireModele` (`./grist/modele.ts`), plus
 *  `Parametres` : elle ne nourrit pas `Modele` (voir `demarrer`, qui la lit
 *  à part), mais plusieurs écritures en dépendent désormais (mappage de
 *  colonnes, libellés d'import — §6.4) et échouent sans bruit sur un
 *  document où elle n'existe pas encore (constaté par Connexion Grist le
 *  2026-09-23 sur un document neuf). `Versions` et `Journal` restent hors
 *  de cette liste : `LIBELLE_PAR_TABLE` les connaît, mais rien ne lit ni
 *  n'écrit encore dedans, inutile de bloquer le widget dessus. */
const TABLES_REQUISES = [
  'Equipes', 'Lieux', 'Benevoles', 'Missions', 'Artistes', 'Macro_creneaux',
  'Sous_creneaux', 'Besoins', 'Groupes', 'Positions_groupe', 'Places',
  'Disponibilites', 'Souhaits_missions', 'Affinites', 'Parametres',
] as const;

/**
 * Le pont Grist réel (voir `EcritureGrist` dans `./store`), branché
 * uniquement en mode connecté — jamais en démo, qui n'appelle jamais ce
 * pont et garde son id local, comportement inchangé. `resolution` (rendu
 * par `lireDocument`) traduit les noms canoniques de table en identifiants
 * réels du document (`grist/tables.ts`) ; `appliquerActions` s'en sert pour
 * chaque action envoyée.
 *
 * `docApi` porte ici aussi `fetchTable` (au-delà du strict `DocApiEcriture`,
 * même élargissement que `reglerAffichageTablesCreees`) : `valeursColonneBrute`
 * lit une colonne brute directement, sans passer par une action.
 *
 * `parametresInitiales` (les lignes de `Parametres` telles que lues par
 * `lireDocument` au démarrage) est recopié dans une variable locale mutable :
 * `definirParametre` doit savoir, à chaque appel, si une clé a déjà une
 * ligne (`UpdateRecord`) ou non (`AddRecord`, dont l'id créé est alors
 * retenu ici pour le prochain appel sur la même clé) — voir `upsertParametres`
 * (`grist/ecriture.ts`).
 */
function construireEcritureGrist(
  docApi: DocApiEcriture & {fetchTable(tableId: string): Promise<TableBrute>},
  resolution: Record<string, string>,
  parametresInitiales: readonly (LigneParametre & {id: Id})[],
): EcritureGrist {
  const lignesParametres: (LigneParametre & {id: Id})[] = [...parametresInitiales];
  return {
    async creerEquipe(equipe) {
      const [id] = await appliquerActions(docApi, actionsCreerEquipe({
        nom: equipe.Nom, couleur: equipe.Couleur, notes: equipe.Notes,
      }), resolution);
      return id as Id;
    },
    async creerMission(mission) {
      const [id] = await appliquerActions(docApi, actionsCreerMission({
        nom: mission.Nom,
        description: mission.Description,
        lieuId: mission.Lieu || null,
        equipeId: mission.Equipe || null,
        priorite: mission.Priorite,
        competencesRequises: mission.Competences_requises,
      }), resolution);
      return id as Id;
    },
    async creerMacroCreneau(macro) {
      const [id] = await appliquerActions(docApi, actionsCreerMacroCreneau(macro), resolution);
      return id as Id;
    },
    async modifierMacroCreneau(id, macro) {
      // Nom et horaires n'ont pas besoin d'être dans le même `UserAction`,
      // mais un seul aller-retour suffit puisque aucun id n'est à recoller
      // entre les deux (contrairement à `remplacerSousCreneaux`).
      await appliquerActions(
        docApi,
        [...actionsRenommerMacroCreneau(id, macro.nom), ...actionsDeplacerMacroCreneau(id, macro.debut, macro.fin)],
        resolution,
      );
    },
    async supprimerMacroCreneau(macroCreneauId, sousCreneauIds, besoinIds, positionIds) {
      // Un seul aller-retour : contrairement à `remplacerSousCreneaux`, rien
      // ici ne crée d'id qu'une autre action du même appel devrait
      // référencer — les quatre suppressions (positions, besoins,
      // sous-créneaux, macro) sont indépendantes entre elles.
      await appliquerActions(
        docApi,
        [
          ...actionsRetirerPositionsGroupe(positionIds),
          ...actionsSupprimerBesoins(besoinIds),
          ...actionsSupprimerMacroCreneau(macroCreneauId),
          ...actionsSupprimerSousCreneaux(sousCreneauIds),
        ],
        resolution,
      );
    },
    async creerArtiste(artiste) {
      const [id] = await appliquerActions(docApi, actionsCreerArtiste(artiste), resolution);
      return id as Id;
    },
    async modifierArtiste(id, artiste) {
      await appliquerActions(docApi, actionsModifierArtiste(id, artiste), resolution);
    },
    async remplacerSousCreneaux(idsASupprimer, nouveaux) {
      // Deux allers-retours liés : un id créé par `actionsCreerSousCreneaux`
      // ne peut pas être référencé dans le même `applyUserActions` que celui
      // qui le crée, donc création et suppression ne peuvent pas être
      // batchées (vérifié en vrai, voir `Magasin.redecouperSousCreneaux`).
      // Création d'abord, suppression ensuite : si le second aller-retour
      // échoue, le document garde les deux jeux (doublon visible et
      // récupérable) plutôt que de se retrouver vidé sans que rien ne
      // le signale — voir `SuppressionApresCreationEchouee`.
      const [ids] = await appliquerActions(docApi, actionsCreerSousCreneaux(nouveaux), resolution);
      const idsReels = (ids ?? []) as Id[];
      try {
        await appliquerActions(docApi, actionsSupprimerSousCreneaux(idsASupprimer), resolution);
      } catch {
        throw new SuppressionApresCreationEchouee(idsReels);
      }
      return idsReels;
    },
    async modifierSousCreneaux(patches) {
      await appliquerActions(docApi, actionsModifierSousCreneaux(patches), resolution);
    },
    async repointerBesoins(patches) {
      await appliquerActions(docApi, actionsRepointerBesoins(patches), resolution);
    },
    async creerBesoin(besoin) {
      const [id] = await appliquerActions(docApi, actionsCreerBesoin(besoin), resolution);
      return id as Id;
    },
    async creerGroupe(groupe) {
      const [id] = await appliquerActions(
        docApi, actionsCreerGroupe({...groupe, equipeId: groupe.equipeId || null}), resolution,
      );
      return id as Id;
    },
    async positionnerGroupe(groupeId, besoinId) {
      await appliquerActions(docApi, actionsPositionnerGroupe(groupeId, [besoinId]), resolution);
    },
    async definirPlaces(groupeId, taille) {
      const places = Array.from({length: taille}, (_, i) => ({
        rang: i + 1, benevoleId: null, origine: 'Manuel' as const, verrouillee: false, score: null,
      }));
      await appliquerActions(docApi, actionsDefinirPlaces(groupeId, places), resolution);
    },
    async deplacerPosition(positionId, nouveauBesoinId) {
      await appliquerActions(docApi, actionsDeplacerPositionGroupe(positionId, nouveauBesoinId), resolution);
    },
    async ajouterPosition(groupeId, besoinId) {
      // `actionsPositionnerGroupe` est un `BulkAddRecord` : son retValue est
      // le tableau des ids créés, à déplier (voir `appliquerActions`, et le
      // constat vérifié en vrai par le fil Environnement Grist de test).
      const [ids] = await appliquerActions(docApi, actionsPositionnerGroupe(groupeId, [besoinId]), resolution);
      return (ids as Id[])[0] as Id;
    },
    async modifierPlaces(patches) {
      await appliquerActions(docApi, actionsModifierPlaces(patches), resolution);
    },
    async supprimerPosition(positionId) {
      await appliquerActions(docApi, actionsRetirerPositionGroupe(positionId), resolution);
    },
    async definirAbsence(benevoleId, absent, placeIdsLiberees) {
      await appliquerActions(docApi, actionsDefinirAbsence(benevoleId, absent, placeIdsLiberees), resolution);
    },
    async valeursColonneBrute(tableId, colId) {
      // Lecture directe (pas d'`appliquerActions` : rien à écrire), et pas de
      // résolution canonique — `tableId`/`colId` sont déjà les identifiants
      // réels du document (voir l'en-tête d'`EcritureGrist.valeursColonneBrute`,
      // `store.ts`) : ce ne sont jamais nos propres tables.
      const table = await docApi.fetchTable(tableId);
      const ids = table.id ?? [];
      const colonne = table[colId] ?? [];
      return new Map(ids.map((id, i) => [id as Id, colonne[i]]));
    },
    async colonnesTable(tableId) {
      // Lecture directe des tables système (mêmes deux tables et même id
      // réel que `reglerAffichageTablesCreees` juste au-dessus, pour un
      // usage différent) : pas de résolution canonique ici non plus,
      // `tableId` est déjà l'identifiant réel du document.
      const [lignesTables, lignesColonnes] = await Promise.all([
        docApi.fetchTable('_grist_Tables').then(zipperTable),
        docApi.fetchTable('_grist_Tables_column').then(zipperTable),
      ]);
      return colonnesDeTable(lignesTables, lignesColonnes, tableId);
    },
    async definirParametre(cle, valeur) {
      const [retVal] = await appliquerActions(docApi, actionsDefinirParametre(cle, valeur, lignesParametres), resolution);
      const existante = lignesParametres.find((l) => l.cle === cle);
      if (existante) {
        existante.valeur = valeur;
      } else {
        lignesParametres.push({id: retVal as Id, cle, valeur});
      }
    },
    async remplacerDisponibilites(benevoleId, debut, fin, nouvelles) {
      // Un seul aller-retour (contrairement à `remplacerSousCreneaux`) :
      // aucune table ne référence une ligne de `Disponibilites` par son
      // identifiant, rien à repointer après coup — vérifié avant d'écrire
      // cette méthode (voir `Magasin.remplacerDisponibilites`, `store.ts`).
      const table = await docApi.fetchTable(resolution.Disponibilites ?? 'Disponibilites');
      const idsARetirer = zipperTable(table)
        .filter((l) => decoderNombre(l.Benevole) === benevoleId)
        .filter((l) => { const q = decoderNombre(l.Quart_heure); return q >= debut && q < fin; })
        .map((l) => l.id as Id);
      const nouvellesGrist: NouvelleDisponibilite[] = nouvelles.map((d) => ({
        benevoleId: d.Benevole, quartHeure: d.Quart_heure, statut: d.Statut, artisteId: d.Artiste,
      }));
      await appliquerActions(
        docApi,
        [...actionsSupprimerDisponibilites(idsARetirer), ...actionsEcrireDisponibilites(nouvellesGrist)],
        resolution,
      );
    },
  };
}

/** Un document connecté dont la création automatique des tables manquantes
 *  a échoué (droits insuffisants, écriture refusée) — jamais des vues
 *  silencieusement vides. */
function afficherDocumentNonReconnu(racine: HTMLElement, tablesManquantes: readonly string[]): void {
  racine.textContent = '';

  const titre = document.createElement('h1');
  titre.textContent = 'Document Grist non reconnu';
  racine.append(titre);

  const libelles = tablesManquantes.map((id) => LIBELLE_PAR_TABLE[id] ?? id);
  const message = document.createElement('p');
  message.textContent = tablesManquantes.length === 1
    ? `La table « ${libelles[0]} », attendue par PlanningPlus, n'a pas pu être créée automatiquement.`
    : `Les tables suivantes, attendues par PlanningPlus, n'ont pas pu être créées automatiquement : ${libelles.join(', ')}.`;
  racine.append(message);

  const note = document.createElement('p');
  note.textContent = "Vérifiez que ce widget dispose de l'accès complet au document, puis rechargez la page.";
  racine.append(note);
}

/** Une erreur survenue après la confirmation qu'un document Grist réel
 *  répond (création de tables, pose de l'affichage, lecture) : jamais la
 *  démo à ce stade, qui ferait passer une panne pour un premier jour normal
 *  — voir le doc-comment en tête de fichier. Le message ne prétend jamais
 *  plus que ce qui s'est passé (même règle que `remplacerSousCreneaux`) :
 *  le texte de l'erreur elle-même, pas une explication devinée. */
function afficherErreurConnexion(racine: HTMLElement, erreur: unknown): void {
  racine.textContent = '';

  const titre = document.createElement('h1');
  titre.textContent = 'Échec de connexion au document Grist';
  racine.append(titre);

  const message = document.createElement('p');
  message.textContent = erreur instanceof Error ? erreur.message : String(erreur);
  racine.append(message);

  const note = document.createElement('p');
  note.textContent = "Vérifiez que ce widget dispose de l'accès complet au document, puis rechargez la page.";
  racine.append(note);
}

/**
 * Crée dans le document les tables PlanningPlus absentes (`tablesManquantes`,
 * identifiants canoniques), à partir de `./grist/schema` — décision
 * d'Antoine du 2026-09-22 (voir `dev/README.md`, « Document modèle »).
 * Deux allers-retours distincts (`actionsCreerTablesManquantes` : `tables`
 * puis `referencesDifferees`), jamais un seul batché, pour la même raison
 * que partout ailleurs dans ce fichier — voir le commentaire de
 * `actionsCreerTablesManquantes`.
 */
async function creerTablesManquantes(docApi: DocApiEcriture, tablesManquantes: readonly string[]): Promise<void> {
  const {tables, referencesDifferees} = actionsCreerTablesManquantes(tablesManquantes);
  if (tables.length > 0) { await docApi.applyUserActions(tables); }
  if (referencesDifferees.length > 0) { await docApi.applyUserActions(referencesDifferees); }
}

/**
 * Pose, sur les tables tout juste créées (`tablesTraitees`), le titre et les
 * colonnes de référence lisibles que porte déjà `dev/seed/seed.mjs` — pour
 * qu'un document créé par le widget se lise comme un document importé
 * (demandé par le coordinateur le 2026-09-22). Lit les deux tables de
 * métadonnées dont `actionsReglerAffichage` a besoin (`./grist/creation`),
 * puis envoie ses actions en un seul aller-retour : aucune ne référence une
 * ligne créée par une autre dans ce même lot.
 */
async function reglerAffichageTablesCreees(
  docApi: {fetchTable(tableId: string): Promise<import('./grist').TableBrute>} & DocApiEcriture,
  tablesTraitees: readonly string[],
  resolution: Record<string, string>,
): Promise<void> {
  const [lignesTables, lignesColonnes] = await Promise.all([
    docApi.fetchTable('_grist_Tables').then(zipperTable),
    docApi.fetchTable('_grist_Tables_column').then(zipperTable),
  ]);
  const actions = actionsReglerAffichage(tablesTraitees, resolution, lignesTables, lignesColonnes);
  if (actions.length > 0) { await docApi.applyUserActions(actions); }
}

async function demarrer(): Promise<void> {
  const racine = document.getElementById('app');
  if (!racine) { return; }

  window.grist.ready({requiredAccess: 'full'});

  try {
    let resultatFinal = await lireDocument(window.grist.docApi);
    const tablesManquantes = TABLES_REQUISES.filter((t) => !(t in resultatFinal.resolution));
    if (tablesManquantes.length > 0) {
      await creerTablesManquantes(window.grist.docApi, tablesManquantes);
      const relu = await lireDocument(window.grist.docApi);
      const encoreManquantes = TABLES_REQUISES.filter((t) => !(t in relu.resolution));
      if (encoreManquantes.length > 0) {
        afficherDocumentNonReconnu(racine, encoreManquantes);
        return;
      }
      await reglerAffichageTablesCreees(window.grist.docApi, tablesManquantes, relu.resolution);
      resultatFinal = relu;
    }
    const magasin = new Magasin(resultatFinal.modele, resultatFinal.parametres);
    magasin.brancherEcriture(
      construireEcritureGrist(window.grist.docApi, resultatFinal.resolution, resultatFinal.parametres),
    );
    demarrerApp(racine, magasin, 'Document Grist connecté');
  } catch (erreur) {
    afficherErreurConnexion(racine, erreur);
  }
}

void demarrer();
