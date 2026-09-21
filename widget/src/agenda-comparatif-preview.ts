/**
 * Point d'entrée de prévisualisation du comparatif agenda vertical/horizontal
 * (`views/agenda-comparatif.ts`), sur le jeu de données figé de démonstration.
 *
 * Volontairement à part de `main.ts`/`app.ts` : cette vue est une aide à la
 * décision pour Antoine, pas encore intégrée à la navigation du widget (§8,
 * vue 1 — l'intégration définitive revient à la vue Agenda une fois la
 * disposition tranchée). N'apparaît donc que via `agenda-comparatif.html`,
 * hors du build de production (`vite build` ne construit que `index.html`).
 */

import './style.css';
import {normaliser} from './donnees/normaliser';
import {Magasin} from './store';
import {montrerComparatifAgenda} from './views/agenda-comparatif';

const racine = document.getElementById('app');
if (racine) {
  const magasin = new Magasin(normaliser());
  montrerComparatifAgenda(racine, magasin);
}
