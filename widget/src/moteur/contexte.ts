/**
 * Index précalculé sur `DonneesPlanning`, construit une fois par appel de
 * haut niveau (`calculerAffectation`, `candidatsEligibles`,
 * `detecterAnomalies`) et partagé par les fonctions internes. Évite de
 * reparcourir les tableaux à chaque bénévole ou groupe considéré — utile à
 * l'échelle visée (NF1 : une centaine de bénévoles, plusieurs jours).
 *
 * Un `Groupe` sans aucune `Positions_groupe` a un contexte vide (aucun quart
 * occupé, aucune mission servie) : il reste éligible à quiconque, ce qui est
 * correct — rien ne le sert encore.
 */

import type {
  Artiste,
  Besoin,
  Benevole,
  DonneesPlanning,
  Disponibilite,
  Groupe,
  Id,
  Mission,
  ParametresAlgorithme,
  Place,
  PositionGroupe,
  SousCreneau,
  SouhaitMission,
  TypeAffinite,
} from './types';
import {heuresDIntervalle, quartsDIntervalle} from './temps';

/** Clé stable pour une paire de bénévoles, indépendante de l'ordre des deux. */
export function clePaireBenevoles(a: Id, b: Id): string {
  return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

export interface Contexte {
  donnees: DonneesPlanning;
  parametres: ParametresAlgorithme;

  benevoleParId: Map<Id, Benevole>;
  missionParId: Map<Id, Mission>;
  sousCreneauParId: Map<Id, SousCreneau>;
  besoinParId: Map<Id, Besoin>;
  groupeParId: Map<Id, Groupe>;
  placeParId: Map<Id, Place>;
  artisteParId: Map<Id, Artiste>;

  placesParGroupe: Map<Id, Place[]>;
  positionsParGroupe: Map<Id, PositionGroupe[]>;

  /** Disponibilité déclarée d'un bénévole à un quart d'heure donné (absence = indisponible). */
  disponibiliteParBenevoleEtQuart: Map<Id, Map<number, Disponibilite>>;
  souhaitParBenevoleEtMission: Map<string, SouhaitMission>;
  affiniteParPaire: Map<string, TypeAffinite>;

  /** Sous-créneaux occupés par un groupe, un par position (doublons possibles si un besoin est cité deux fois). */
  sousCreneauxParGroupe: Map<Id, SousCreneau[]>;
  /** Missions distinctes servies par un groupe à travers ses positions. */
  missionsParGroupe: Map<Id, Mission[]>;
  /** Quarts d'heure occupés par un groupe, dérivés de ses sous-créneaux. */
  quartsParGroupe: Map<Id, Set<number>>;
  /** Macro-créneaux (jours) touchés par un groupe, dérivés de ses sous-créneaux. */
  macroCreneauxParGroupe: Map<Id, Set<Id>>;
  /** Union des compétences requises par toutes les missions servies par le groupe. */
  competencesRequisesParGroupe: Map<Id, Set<string>>;
  /** Somme des durées (heures) de toutes les positions d'un groupe. */
  heuresParGroupe: Map<Id, number>;
}

function indexerParId<T extends {id: Id}>(lignes: T[]): Map<Id, T> {
  return new Map(lignes.map((ligne) => [ligne.id, ligne]));
}

function grouperPar<T, K>(lignes: T[], cle: (ligne: T) => K): Map<K, T[]> {
  const carte = new Map<K, T[]>();
  for (const ligne of lignes) {
    const k = cle(ligne);
    const groupe = carte.get(k);
    if (groupe) {
      groupe.push(ligne);
    } else {
      carte.set(k, [ligne]);
    }
  }
  return carte;
}

export function construireContexte(
  donnees: DonneesPlanning,
  parametres: ParametresAlgorithme,
): Contexte {
  const benevoleParId = indexerParId(donnees.benevoles);
  const missionParId = indexerParId(donnees.missions);
  const sousCreneauParId = indexerParId(donnees.sousCreneaux);
  const besoinParId = indexerParId(donnees.besoins);
  const groupeParId = indexerParId(donnees.groupes);
  const placeParId = indexerParId(donnees.places);
  const artisteParId = indexerParId(donnees.artistes);

  const placesParGroupe = grouperPar(donnees.places, (p) => p.groupeId);
  const positionsParGroupe = grouperPar(donnees.positionsGroupe, (p) => p.groupeId);

  const disponibiliteParBenevoleEtQuart = new Map<Id, Map<number, Disponibilite>>();
  for (const dispo of donnees.disponibilites) {
    let parQuart = disponibiliteParBenevoleEtQuart.get(dispo.benevoleId);
    if (!parQuart) {
      parQuart = new Map();
      disponibiliteParBenevoleEtQuart.set(dispo.benevoleId, parQuart);
    }
    parQuart.set(dispo.quartHeure, dispo);
  }

  const souhaitParBenevoleEtMission = new Map<string, SouhaitMission>();
  for (const souhait of donnees.souhaitsMissions) {
    souhaitParBenevoleEtMission.set(`${souhait.benevoleId}:${souhait.missionId}`, souhait);
  }

  const affiniteParPaire = new Map<string, TypeAffinite>();
  for (const affinite of donnees.affinites) {
    affiniteParPaire.set(clePaireBenevoles(affinite.benevoleAId, affinite.benevoleBId), affinite.type);
  }

  const sousCreneauxParGroupe = new Map<Id, SousCreneau[]>();
  const missionsParGroupe = new Map<Id, Mission[]>();
  const quartsParGroupe = new Map<Id, Set<number>>();
  const macroCreneauxParGroupe = new Map<Id, Set<Id>>();
  const competencesRequisesParGroupe = new Map<Id, Set<string>>();
  const heuresParGroupe = new Map<Id, number>();

  for (const groupe of donnees.groupes) {
    const positions = positionsParGroupe.get(groupe.id) ?? [];
    const sousCreneaux: SousCreneau[] = [];
    const missionsParId = new Map<Id, Mission>();
    const quarts = new Set<number>();
    const macroCreneaux = new Set<Id>();
    const competences = new Set<string>();
    let heures = 0;

    for (const position of positions) {
      const besoin = besoinParId.get(position.besoinId);
      if (!besoin) { continue; }
      const sousCreneau = sousCreneauParId.get(besoin.sousCreneauId);
      const mission = missionParId.get(besoin.missionId);
      if (sousCreneau) {
        sousCreneaux.push(sousCreneau);
        heures += heuresDIntervalle(sousCreneau.debut, sousCreneau.fin);
        for (const quart of quartsDIntervalle(sousCreneau.debut, sousCreneau.fin, parametres.pasSecondes)) {
          quarts.add(quart);
        }
        macroCreneaux.add(sousCreneau.macroCreneauId);
      }
      if (mission) {
        missionsParId.set(mission.id, mission);
        for (const competence of mission.competencesRequises) {
          competences.add(competence);
        }
      }
    }

    sousCreneauxParGroupe.set(groupe.id, sousCreneaux);
    missionsParGroupe.set(groupe.id, [...missionsParId.values()]);
    quartsParGroupe.set(groupe.id, quarts);
    macroCreneauxParGroupe.set(groupe.id, macroCreneaux);
    competencesRequisesParGroupe.set(groupe.id, competences);
    heuresParGroupe.set(groupe.id, heures);
  }

  return {
    donnees,
    parametres,
    benevoleParId,
    missionParId,
    sousCreneauParId,
    besoinParId,
    groupeParId,
    placeParId,
    artisteParId,
    placesParGroupe,
    positionsParGroupe,
    disponibiliteParBenevoleEtQuart,
    souhaitParBenevoleEtMission,
    affiniteParPaire,
    sousCreneauxParGroupe,
    missionsParGroupe,
    quartsParGroupe,
    macroCreneauxParGroupe,
    competencesRequisesParGroupe,
    heuresParGroupe,
  };
}
