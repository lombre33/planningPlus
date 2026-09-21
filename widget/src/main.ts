/**
 * Point d'entrée du widget.
 *
 * `public/vendor/grist-plugin-api.js` définit `window.grist` de façon
 * inconditionnelle, même hors d'un document Grist : on ne peut donc pas
 * distinguer une vraie connexion d'une absence de connexion sans tenter un
 * appel et le borner dans le temps (sans host Grist en face, un appel
 * resterait sinon en attente indéfinie, aucune réponse n'arrivant jamais au
 * `postMessage`). Selon le résultat :
 *
 * - connecté : lit le document via `lireDocument` (`./grist`) et monte la
 *   même maquette interactive sur le `Modele` qui en sort ;
 * - non connecté, en échec, ou trop lent (aperçu, démonstration, tests) :
 *   monte la maquette sur le jeu de données figé (`donnees/festival.json`).
 *
 * Les deux modes convergent sur un seul point de bascule, `demarrerApp` :
 * `lireDocument` rend un `Modele` de la même forme que `normaliser()`, donc
 * rien dans la coquille ni dans les vues ne distingue une donnée réelle
 * d'une donnée de démonstration. C'est aussi ce qui garde la démo, seule
 * chose qu'Antoine a en main tant qu'aucun document Grist n'est branché,
 * strictement inchangée : le moindre pépin côté Grist (délai dépassé,
 * table manquante, erreur réseau) retombe sur `demarrerDemo` plutôt que de
 * laisser la page en échec.
 */

import './style.css';
import {demarrerApp} from './app';
import {normaliser} from './donnees/normaliser';
import {lireDocument} from './grist';
import {Magasin} from './store';

const DELAI_CONNEXION_MS = 1500;

function demarrerDemo(racine: HTMLElement): void {
  const magasin = new Magasin(normaliser());
  demarrerApp(racine, magasin, 'Démonstration — jeu de données figé');
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
    const magasin = new Magasin(resultat.modele);
    demarrerApp(racine, magasin, 'Document Grist connecté');
  } catch {
    demarrerDemo(racine);
  }
}

void demarrer();
