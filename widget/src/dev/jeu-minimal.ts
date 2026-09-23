/**
 * Jeu de données minimal pour le banc de développement (`dev-bench.ts`) :
 * l'état le plus pauvre plausible, celui d'Antoine au tout début d'un
 * document — pas un jeu riche, qui ne révèle aucun défaut d'écran vide
 * (retour du 2026-09-23, voir la mémoire du projet). Deux macro-créneaux
 * aux bornes volontairement désalignées (pas un pas de quart d'heure rond
 * de bout en bout, pas un écart de 24h propre entre les deux) : c'est ce
 * genre de saisie imprécise, pas un jeu généré à la main, qui révèle un
 * axe mal calé.
 */
import type {Modele} from '../domain/types';
import {epochDepuisHeureLocale} from '../temps';

export function jeuMinimal(): Modele {
  return {
    equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#6366f1', Referent: null, Notes: ''}],
    lieux: [],
    benevoles: [],
    missions: [
      {id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
      {id: 2, Nom: 'Bar', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
    ],
    artistes: [],
    macroCreneaux: [
      {
        id: 1, Nom: 'Samedi',
        Debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 14, minutes: 0}),
        Fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 19, heures: 2, minutes: 0}),
      },
      {
        id: 2, Nom: 'Dimanche',
        Debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 19, heures: 15, minutes: 37}),
        Fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 20, heures: 1, minutes: 12}),
      },
    ],
    sousCreneaux: [],
    besoins: [],
    groupes: [],
    positionsGroupe: [],
    places: [],
    disponibilites: [],
    souhaitsMissions: [],
    affinites: [],
  };
}
