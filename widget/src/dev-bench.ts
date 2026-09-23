/**
 * Entrée de développement, jamais incluse dans le livré : `vite build` ne
 * bundle que `index.html` (pas de `build.rollupOptions.input`), donc
 * `dev-bench.html` — qui charge ce fichier — n'apparaît jamais dans
 * `dist/` (vérifié après build, pas seulement sur le principe).
 *
 * Monte le widget sur un jeu de données de fichier (`dev/jeu-minimal.ts`)
 * plutôt que sur un document Grist réel, pour que n'importe quel fil
 * puisse voir une vue tourner dans un vrai navigateur sans document de
 * test — décidé le 2026-09-23 après une journée perdue en grande partie
 * faute de ça (voir la mémoire du projet). Ne touche jamais `main.ts` ni
 * `window.grist` : `demarrerApp` (`app.ts`) est Grist-agnostic, elle ne
 * prend qu'une `Magasin` déjà construite.
 *
 * Sans `brancherEcriture` appelé, le `Magasin` reste entièrement local :
 * toute création/modification depuis l'écran fonctionne (id locaux),
 * sans jamais tenter d'écrire dans un document Grist.
 *
 * Lancer : `npm run dev:bench` (ouvre `/dev-bench.html`, ou démarre le
 * serveur seul si l'environnement n'a pas d'écran — la page reste servie
 * à cette URL). Pour qu'un fil la regarde lui-même (sans écran), driver
 * Chromium en tâche de fond : `playwright-core` installé à part (pas une
 * dépendance du widget, un outil du fil), `chromium.launch({executablePath:
 * '/opt/pw-browsers/chromium'})`, puis `page.goto('http://localhost:<port
 * de vite>/dev-bench.html')` et `page.screenshot(...)`.
 */
import './style.css';
import {demarrerApp} from './app';
import {jeuMinimal} from './dev/jeu-minimal';
import {Magasin} from './store';

const racine = document.getElementById('app');
if (racine) {
  demarrerApp(racine, new Magasin(jeuMinimal()), 'Banc de développement — jeu minimal');
}
