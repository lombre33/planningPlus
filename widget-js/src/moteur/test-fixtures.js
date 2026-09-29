/**
 * Constructeurs de données minimales pour les tests du moteur. Pas un
 * fichier de tests lui-même (pas de suffixe `.test.js`) : vitest ne
 * l'exécute pas.
 *
 * `idSuivant`/`resetIds` donnent des identifiants prévisibles (1, 2, 3…)
 * dans chaque test qui appelle `resetIds()` en préambule — plus lisible
 * dans les assertions qu'un identifiant arbitraire.
 */

import {quartsDIntervalle} from './temps.js';

let compteur = 1;
export function idSuivant() { return compteur++; }
export function resetIds() { compteur = 1; }

export function creerDonneesVides() {
  return {
    benevoles: [], missions: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [], artistes: [],
  };
}

export function creerBenevole(partiel = {}) {
  return {
    id: idSuivant(), nom: `Bénévole ${compteur}`, equipeId: null, competences: [],
    quotaHeuresMin: null, quotaHeuresMax: null, statut: 'Actif', ...partiel,
  };
}

export function creerMission(partiel = {}) {
  return {
    id: idSuivant(), nom: `Mission ${compteur}`, equipeId: null,
    priorite: 'Normale', competencesRequises: [], ...partiel,
  };
}

export function creerSousCreneau(debut, fin, partiel = {}) {
  return {id: idSuivant(), macroCreneauId: 1, missionId: null, debut, fin, ...partiel};
}

export function creerBesoin(missionId, sousCreneauId, partiel = {}) {
  return {
    id: idSuivant(), missionId, sousCreneauId,
    effectifMin: 1, effectifMax: 2, tailleGroupe: 1, ...partiel,
  };
}

export function creerGroupe(partiel = {}) {
  return {id: idSuivant(), code: `G${compteur}`, taille: 1, equipeId: null, ...partiel};
}

export function creerPositionGroupe(groupeId, besoinId) {
  return {id: idSuivant(), groupeId, besoinId};
}

export function creerPlace(groupeId, rang, partiel = {}) {
  return {
    id: idSuivant(), groupeId, rang, benevoleId: null,
    origine: 'Algorithme', verrouillee: false, score: null, ...partiel,
  };
}

export function creerSouhait(benevoleId, missionId, preference) {
  return {benevoleId, missionId, preference};
}

export function creerAffinite(benevoleAId, benevoleBId, type) {
  return {benevoleAId, benevoleBId, type};
}

export function creerArtiste(debut, fin, partiel = {}) {
  return {id: idSuivant(), debut, fin, ...partiel};
}

/** Une ligne de disponibilité par quart d'heure sur [debut, fin). */
export function disponibilitesIntervalle(
  benevoleId,
  debut,
  fin,
  statut = 'Disponible',
  pas = 900,
  artisteId = null,
) {
  return quartsDIntervalle(debut, fin, pas).map((quartHeure) => ({benevoleId, quartHeure, statut, artisteId}));
}

/** Un jour de festival en secondes Unix, pour des horodatages lisibles dans les tests sans dépendre du fuseau. */
export function h(jour, heure, minute = 0) {
  return jour * 86400 + heure * 3600 + minute * 60;
}
