/**
 * Petit festival d'une journée pour les tests de la table d'affectation
 * (`journee`, `scenarios`, `brouillon`, `views/affectation`) : pas un
 * fichier de tests lui-même, vitest ne l'exécute pas.
 *
 * Vendredi 17 juillet 2026, un macro-créneau 14h-2h. Quatre indicatifs de
 * deux places : A1 (Bar 14h-18h), A2 (Bar 18h-22h), B1 (Accueil, critique,
 * 14h-18h), R1 (Restauration 18h-22h). Rémi est pointé absent à l'appel ;
 * Léa et Hugo, Rémi et Sofia, Tom et Paul souhaitent être ensemble ; Léa
 * veut voir la Fanfare (19h-19h45) ; Nina souhaite la restauration.
 */

import {regrouperParJour} from './derive.js';
import {epochDepuisHeureLocale} from '../temps.js';

export const t = (heures, minutes = 0) => epochDepuisHeureLocale({
  annee: 2026, mois: 7, jour: heures >= 24 ? 18 : 17, heures: heures % 24, minutes,
});

export const LEA = 1;
export const HUGO = 2;
export const REMI = 3;
export const SOFIA = 4;
export const TOM = 5;
export const ZOE = 6;
export const NINA = 7;
export const PAUL = 8;

function dispos(benevole, debut, fin, statut = 'Disponible', artiste = null) {
  const lignes = [];
  for (let q = t(...debut); q < t(...fin); q += 900) {
    lignes.push({Benevole: benevole, Quart_heure: q, Statut: statut, Artiste: artiste});
  }
  return lignes;
}

const benevole = (id, Nom) => ({
  id, Nom, Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
});

/** Places, dans l'ordre : A1#1, A1#2, A2#1, A2#2, B1#1, B1#2, R1#1, R1#2 (ids 1 à 8). */
export function jeuJournee({places = [LEA, HUGO, TOM, null, REMI, SOFIA, NINA, null], absents = [REMI]} = {}) {
  const macroCreneaux = [{id: 1, Nom: 'Vendredi', Debut: t(14), Fin: t(26)}];
  const cle = regrouperParJour(macroCreneaux)[0].cle;
  return {
    equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#6366f1', Referent: null, Notes: ''}],
    lieux: [],
    benevoles: [
      benevole(LEA, 'Léa Martin'), benevole(HUGO, 'Hugo Petit'), benevole(REMI, 'Rémi Blanc'),
      benevole(SOFIA, 'Sofia Roux'), benevole(TOM, 'Tom Leroy'), benevole(ZOE, 'Zoé Garnier'),
      benevole(NINA, 'Nina Faure'), benevole(PAUL, 'Paul Morel'),
    ],
    missions: [
      {id: 1, Nom: 'Bar', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
      {id: 2, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Critique', Competences_requises: []},
      {id: 3, Nom: 'Restauration', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
    ],
    artistes: [{id: 1, Nom: 'Fanfare', Lieu: 0, Debut: t(19), Fin: t(19, 45)}],
    macroCreneaux,
    sousCreneaux: [
      {id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Après-midi', Debut: t(14), Fin: t(18)},
      {id: 2, Macro_creneau: 1, Mission: null, Libelle: 'Soirée', Debut: t(18), Fin: t(22)},
    ],
    besoins: [
      {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 2, Effectif_max: 2, Taille_groupe: 2},
      {id: 2, Mission: 1, Sous_creneau: 2, Effectif_min: 2, Effectif_max: 2, Taille_groupe: 2},
      {id: 3, Mission: 2, Sous_creneau: 1, Effectif_min: 2, Effectif_max: 2, Taille_groupe: 2},
      {id: 4, Mission: 3, Sous_creneau: 2, Effectif_min: 2, Effectif_max: 2, Taille_groupe: 2},
    ],
    groupes: [
      {id: 1, Code: 'A1', Taille: 2, Equipe: 1, Notes: ''},
      {id: 2, Code: 'A2', Taille: 2, Equipe: 1, Notes: ''},
      {id: 3, Code: 'B1', Taille: 2, Equipe: 1, Notes: ''},
      {id: 4, Code: 'R1', Taille: 2, Equipe: 1, Notes: ''},
    ],
    positionsGroupe: [
      {id: 1, Groupe: 1, Besoin: 1}, {id: 2, Groupe: 2, Besoin: 2},
      {id: 3, Groupe: 3, Besoin: 3}, {id: 4, Groupe: 4, Besoin: 4},
    ],
    places: places.map((b, i) => ({
      id: i + 1, Groupe: Math.floor(i / 2) + 1, Rang: (i % 2) + 1, Benevole: b, Origine: 'Algorithme', Verrouillee: false, Score: b == null ? 0 : 1,
    })),
    disponibilites: [
      ...dispos(LEA, [14], [19]), ...dispos(LEA, [19], [19, 45], 'Artiste', 1), ...dispos(LEA, [19, 45], [22]),
      ...dispos(HUGO, [14], [22]), ...dispos(REMI, [14], [22]), ...dispos(SOFIA, [14], [18]),
      ...dispos(TOM, [18], [22]), ...dispos(ZOE, [14], [22]), ...dispos(NINA, [14], [22]), ...dispos(PAUL, [18], [22]),
    ],
    souhaitsMissions: [{id: 1, Benevole: NINA, Mission: 3, Preference: 'Souhaite fortement'}],
    affinites: [
      {id: 1, Benevole_A: LEA, Benevole_B: HUGO, Type: 'Ensemble'},
      {id: 2, Benevole_A: REMI, Benevole_B: SOFIA, Type: 'Ensemble'},
      {id: 3, Benevole_A: TOM, Benevole_B: PAUL, Type: 'Ensemble'},
    ],
    presences: absents.map((b, i) => ({id: i + 1, Benevole: b, Jour: cle, Present: false})),
  };
}
