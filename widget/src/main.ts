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
 * - pas d'hôte Grist, délai dépassé, ou vrai échec (réseau, accès refusé) :
 *   monte la maquette sur le jeu de données figé (`donnees/festival.json`)
 *   — l'aperçu autonome qu'Antoine a en main tant qu'aucun document Grist
 *   n'est branché, strictement inchangé ;
 * - connecté, et toutes les tables attendues (`TABLES_REQUISES`) existent
 *   dans le document, vides ou non : lit le document via `lireDocument`
 *   (`./grist`) et monte la même maquette sur le `Modele` qui en sort. Un
 *   document flambant neuf, sans aucune ligne, est le premier jour d'un
 *   vrai utilisateur, pas une panne — chaque vue sait déjà se montrer vide
 *   et inviter à l'étape 1 (§1.1), pas question d'y substituer la démo, qui
 *   ferait passer de fausses données pour les siennes ;
 * - connecté, mais il manque au moins une des tables attendues : ce n'est
 *   pas un document de planning (ou un schéma incomplet). Ni la démo
 *   (mêmes fausses données trompeuses), ni un silence qui laisserait des
 *   vues vides sans explication — un message nomme ce qui manque.
 *
 * Les deux premiers modes convergent sur un seul point de bascule,
 * `demarrerApp` : `lireDocument` rend un `Modele` de la même forme que
 * `normaliser()`, donc rien dans la coquille ni dans les vues ne distingue
 * une donnée réelle d'une donnée de démonstration.
 */

import './style.css';
import {demarrerApp} from './app';
import {normaliser} from './donnees/normaliser';
import {LIBELLE_PAR_TABLE, lireDocument} from './grist';
import {Magasin} from './store';

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

function demarrerDemo(racine: HTMLElement): void {
  const magasin = new Magasin(normaliser());
  demarrerApp(racine, magasin, 'Démonstration — jeu de données figé');
}

/** Un document connecté, mais dont le schéma ne correspond pas (ou plus) à
 *  celui attendu — jamais la démo (fausses données dans le contexte d'un
 *  vrai document) ni des vues silencieusement vides. */
function afficherDocumentNonReconnu(racine: HTMLElement, tablesManquantes: readonly string[]): void {
  racine.textContent = '';

  const titre = document.createElement('h1');
  titre.textContent = 'Document Grist non reconnu';
  racine.append(titre);

  const libelles = tablesManquantes.map((id) => LIBELLE_PAR_TABLE[id] ?? id);
  const message = document.createElement('p');
  message.textContent = tablesManquantes.length === 1
    ? `Ce document ne contient pas la table « ${libelles[0]} », attendue par PlanningPlus.`
    : `Ce document ne contient pas les tables suivantes, attendues par PlanningPlus : ${libelles.join(', ')}.`;
  racine.append(message);

  const note = document.createElement('p');
  note.textContent = 'Créez-les (voir dev/seed/ pour le schéma de référence) avant de continuer, ou ouvrez ce widget hors de Grist pour la démonstration interactive.';
  racine.append(note);
}

async function demarrer(): Promise<void> {
  const racine = document.getElementById('app');
  if (!racine) { return; }

  if (typeof window.grist === 'undefined') {
    demarrerDemo(racine);
    return;
  }

  window.grist.ready({requiredAccess: 'full'});
  try {
    const resultat = await Promise.race([
      lireDocument(window.grist.docApi),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DELAI_CONNEXION_MS)),
    ]);
    if (resultat == null) {
      demarrerDemo(racine);
      return;
    }
    const tablesManquantes = TABLES_REQUISES.filter((t) => !(t in resultat.resolution));
    if (tablesManquantes.length > 0) {
      afficherDocumentNonReconnu(racine, tablesManquantes);
      return;
    }
    const magasin = new Magasin(resultat.modele);
    demarrerApp(racine, magasin, 'Document Grist connecté');
  } catch {
    demarrerDemo(racine);
  }
}

void demarrer();
