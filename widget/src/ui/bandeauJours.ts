/**
 * Bandeau de sélection du macro-créneau, par jour de festival — extrait de
 * `views/grille.ts` le 2026-09-23 pour devenir le filtre global de
 * l'application (demande d'Antoine : « un filtre macro qui va servir pour
 * tout, les bénévoles, les artistes, les missions etc »). Monté par
 * `app.ts`, au-dessus de la vue active, pour les onglets qui s'y accrochent
 * (Missions et Artistes pour l'instant, §8.8/§8.2) ; la sélection vit dans
 * `Magasin.macroCreneauSelectionne`, pas dans la vue, pour survivre à un
 * changement d'onglet.
 *
 * Un bouton par jour (regroupement d'affichage), mais la sélection porte
 * l'id d'un macro-créneau — le premier du jour cliqué — jamais une clé de
 * jour : dans l'usage d'Antoine un macro-créneau vaut un jour, mais rien
 * ici ne doit supposer que ça reste vrai.
 */
import type {Id} from '../domain/types';
import type {Jour} from '../logic/derive';
import {h} from './dom';

export function construireBandeauJours(
  jours: readonly Jour[], macroCreneauSelectionneId: Id | null, onSelectionner: (id: Id) => void,
): Node {
  return h('div', {class: 'agenda__toolbar'},
    ...jours.map((j) => h('button', {
      class: `btn btn--sm${j.macros.some((ma) => ma.id === macroCreneauSelectionneId) ? ' btn--primary' : ''}`,
      type: 'button',
      onclick: () => onSelectionner(j.macros[0]!.id),
    }, j.libelle.split(' ').slice(0, 1).join(' '))),
  );
}
