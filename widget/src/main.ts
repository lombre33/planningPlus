/**
 * Point d'entrée du widget.
 *
 * `public/vendor/grist-plugin-api.js` définit `window.grist` de façon
 * inconditionnelle, même hors d'un document Grist : on ne peut donc pas
 * distinguer une vraie connexion d'une absence de connexion sans tenter un
 * appel et le borner dans le temps (sans host Grist en face, un appel
 * resterait sinon en attente indéfinie, aucune réponse n'arrivant jamais au
 * `postMessage`). Trois situations bien distinctes, pas deux :
 *
 * - pas d'hôte Grist, ou délai dépassé sans la moindre réponse : monte la
 *   maquette sur le jeu de données figé (`donnees/festival.json`) — l'aperçu
 *   autonome qu'Antoine a en main tant qu'aucun document Grist n'est
 *   branché, strictement inchangé. C'est le seul cas où la démo apparaît :
 *   avant toute preuve qu'un document réel répond ;
 * - connecté, et toutes les tables attendues (`TABLES_REQUISES`) existent
 *   dans le document, vides ou non : lit le document via `lireDocument`
 *   (`./grist`) et monte la même maquette sur le `Modele` qui en sort. Un
 *   document flambant neuf, sans aucune ligne, est le premier jour d'un
 *   vrai utilisateur, pas une panne — chaque vue sait déjà se montrer vide
 *   et inviter à l'étape 1 (§1.1), pas question d'y substituer la démo, qui
 *   ferait passer de fausses données pour les siennes ;
 * - connecté, mais il manque au moins une des tables attendues, ou une
 *   erreur survient après cette connexion confirmée (création de tables,
 *   pose de l'affichage, lecture) : jamais la démo, qui ferait passer une
 *   panne pour un premier jour normal — un message nomme ce qui manque ou
 *   ce qui a échoué (régression du 2026-09-22, corrigée le jour même : le
 *   repli sur la démo touchait alors aussi ce troisième cas).
 *
 * Les deux premiers modes convergent sur un seul point de bascule,
 * `demarrerApp` : `lireDocument` rend un `Modele` de la même forme que
 * `normaliser()`, donc rien dans la coquille ni dans les vues ne distingue
 * une donnée réelle d'une donnée de démonstration.
 */

import './style.css';
import {demarrerApp} from './app';
import type {Id} from './domain/types';
import {normaliser} from './donnees/normaliser';
import type {DocApiEcriture} from './grist';
import {
  actionsCreerArtiste, actionsCreerBesoin, actionsCreerEquipe, actionsCreerGroupe, actionsCreerMacroCreneau,
  actionsCreerMission, actionsCreerSousCreneaux, actionsCreerTablesManquantes, actionsDefinirPlaces,
  actionsDeplacerMacroCreneau, actionsDeplacerPositionGroupe, actionsModifierArtiste, actionsPositionnerGroupe,
  actionsReglerAffichage, actionsRenommerMacroCreneau, actionsSupprimerSousCreneaux, appliquerActions,
  LIBELLE_PAR_TABLE, lireDocument, zipperTable,
} from './grist';
import {type EcritureGrist, Magasin, SuppressionApresCreationEchouee} from './store';

const DELAI_CONNEXION_MS = 1500;

/** Les 14 tables que lit `construireModele` (`./grist/modele.ts`) — tout ce
 *  dont le `Modele` de l'UI a besoin. `Versions`, `Parametres` et `Journal`
 *  existent dans `LIBELLE_PAR_TABLE` mais ne nourrissent pas `Modele` : les
 *  omettre ici évite de bloquer le widget sur une table que rien n'affiche
 *  encore ne lit. */
const TABLES_REQUISES = [
  'Equipes', 'Lieux', 'Benevoles', 'Missions', 'Artistes', 'Macro_creneaux',
  'Sous_creneaux', 'Besoins', 'Groupes', 'Positions_groupe', 'Places',
  'Disponibilites', 'Souhaits_missions', 'Affinites',
] as const;

/**
 * Le pont Grist réel (voir `EcritureGrist` dans `./store`), branché
 * uniquement en mode connecté — jamais en démo, qui n'appelle jamais ce
 * pont et garde son id local, comportement inchangé. `resolution` (rendu
 * par `lireDocument`) traduit les noms canoniques de table en identifiants
 * réels du document (`grist/tables.ts`) ; `appliquerActions` s'en sert pour
 * chaque action envoyée.
 */
function construireEcritureGrist(docApi: DocApiEcriture, resolution: Record<string, string>): EcritureGrist {
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
  };
}

function demarrerDemo(racine: HTMLElement): void {
  const magasin = new Magasin(normaliser());
  demarrerApp(racine, magasin, 'Démonstration — jeu de données figé');
}

/** Un document connecté dont la création automatique des tables manquantes
 *  a échoué (droits insuffisants, écriture refusée) — jamais la démo
 *  (fausses données dans le contexte d'un vrai document) ni des vues
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
  note.textContent = "Vérifiez que ce widget dispose de l'accès complet au document, puis rechargez la page — ou ouvrez ce widget hors de Grist pour la démonstration interactive.";
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

  if (typeof window.grist === 'undefined') {
    demarrerDemo(racine);
    return;
  }

  window.grist.ready({requiredAccess: 'full'});

  // Avant toute réponse d'un document réel, rien ne distingue une absence
  // d'hôte Grist d'une lenteur passagère : la démo reste le repli légitime
  // ici, comportement inchangé. Un échec de `lireDocument` dans cette
  // fenêtre (accès refusé, etc.) tombe dans le même cas, faute de preuve
  // qu'un document réel est en face.
  let resultat: Awaited<ReturnType<typeof lireDocument>> | null;
  try {
    resultat = await Promise.race([
      lireDocument(window.grist.docApi),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DELAI_CONNEXION_MS)),
    ]);
  } catch {
    demarrerDemo(racine);
    return;
  }
  if (resultat == null) {
    demarrerDemo(racine);
    return;
  }

  // À partir d'ici, un document Grist réel a répondu : plus jamais la démo,
  // qui ferait passer une panne pour un premier jour normal (régression du
  // 2026-09-22, voir le doc-comment en tête de fichier) — un échec s'affiche
  // pour ce qu'il est.
  try {
    let resultatFinal = resultat;
    const tablesManquantes = TABLES_REQUISES.filter((t) => !(t in resultat.resolution));
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
    const magasin = new Magasin(resultatFinal.modele);
    magasin.brancherEcriture(construireEcritureGrist(window.grist.docApi, resultatFinal.resolution));
    demarrerApp(racine, magasin, 'Document Grist connecté');
  } catch (erreur) {
    afficherErreurConnexion(racine, erreur);
  }
}

void demarrer();
