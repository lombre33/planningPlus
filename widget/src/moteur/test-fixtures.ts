/**
 * Constructeurs de données minimales pour les tests du moteur. Pas un
 * fichier de tests lui-même (pas de suffixe `.test.ts`) : vitest ne
 * l'exécute pas.
 *
 * `idSuivant`/`resetIds` donnent des identifiants prévisibles (1, 2, 3…)
 * dans chaque test qui appelle `resetIds()` en préambule — plus lisible
 * dans les assertions qu'un identifiant arbitraire.
 */

import {quartsDIntervalle} from './temps';
import type {
  Affinite,
  Benevole,
  Besoin,
  Disponibilite,
  DonneesPlanning,
  Groupe,
  Id,
  Mission,
  Place,
  PositionGroupe,
  SousCreneau,
  SouhaitMission,
  StatutDisponibilite,
} from './types';

let compteur = 1;
export function idSuivant(): Id { return compteur++; }
export function resetIds(): void { compteur = 1; }

export function creerDonneesVides(): DonneesPlanning {
  return {
    benevoles: [], missions: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [],
  };
}

export function creerBenevole(partiel: Partial<Benevole> = {}): Benevole {
  return {
    id: idSuivant(), nom: `Bénévole ${compteur}`, equipeId: null, competences: [],
    quotaHeuresMin: null, quotaHeuresMax: null, statut: 'Actif', ...partiel,
  };
}

export function creerMission(partiel: Partial<Mission> = {}): Mission {
  return {
    id: idSuivant(), nom: `Mission ${compteur}`, equipeId: null,
    priorite: 'Normale', competencesRequises: [], ...partiel,
  };
}

export function creerSousCreneau(debut: number, fin: number, partiel: Partial<SousCreneau> = {}): SousCreneau {
  return {id: idSuivant(), macroCreneauId: 1, missionId: null, debut, fin, ...partiel};
}

export function creerBesoin(missionId: Id, sousCreneauId: Id, partiel: Partial<Besoin> = {}): Besoin {
  return {
    id: idSuivant(), missionId, sousCreneauId,
    effectifMin: 1, effectifMax: 2, tailleGroupe: 1, ...partiel,
  };
}

export function creerGroupe(partiel: Partial<Groupe> = {}): Groupe {
  return {id: idSuivant(), code: `G${compteur}`, taille: 1, equipeId: null, ...partiel};
}

export function creerPositionGroupe(groupeId: Id, besoinId: Id): PositionGroupe {
  return {id: idSuivant(), groupeId, besoinId};
}

export function creerPlace(groupeId: Id, rang: number, partiel: Partial<Place> = {}): Place {
  return {
    id: idSuivant(), groupeId, rang, benevoleId: null,
    origine: 'Algorithme', verrouillee: false, score: null, ...partiel,
  };
}

export function creerSouhait(benevoleId: Id, missionId: Id, preference: SouhaitMission['preference']): SouhaitMission {
  return {benevoleId, missionId, preference};
}

export function creerAffinite(benevoleAId: Id, benevoleBId: Id, type: Affinite['type']): Affinite {
  return {benevoleAId, benevoleBId, type};
}

/** Une ligne de disponibilité par quart d'heure sur [debut, fin). */
export function disponibilitesIntervalle(
  benevoleId: Id,
  debut: number,
  fin: number,
  statut: StatutDisponibilite = 'Disponible',
  pas = 900,
  artisteId: Id | null = null,
): Disponibilite[] {
  return quartsDIntervalle(debut, fin, pas).map((quartHeure) => ({benevoleId, quartHeure, statut, artisteId}));
}

/** Un jour de festival en secondes Unix, pour des horodatages lisibles dans les tests sans dépendre du fuseau. */
export function h(jour: number, heure: number, minute = 0): number {
  return jour * 86400 + heure * 3600 + minute * 60;
}
