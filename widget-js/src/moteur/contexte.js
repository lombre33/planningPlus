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

import {heuresDIntervalle, quartsDIntervalle} from './temps.js';

/** Clé stable pour une paire de bénévoles, indépendante de l'ordre des deux. */
export function clePaireBenevoles(a, b) {
  return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

function indexerParId(lignes) {
  return new Map(lignes.map((ligne) => [ligne.id, ligne]));
}

function grouperPar(lignes, cle) {
  const carte = new Map();
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
  donnees,
  parametres,
) {
  const benevoleParId = indexerParId(donnees.benevoles);
  const missionParId = indexerParId(donnees.missions);
  const sousCreneauParId = indexerParId(donnees.sousCreneaux);
  const besoinParId = indexerParId(donnees.besoins);
  const groupeParId = indexerParId(donnees.groupes);
  const placeParId = indexerParId(donnees.places);
  const artisteParId = indexerParId(donnees.artistes);

  const placesParGroupe = grouperPar(donnees.places, (p) => p.groupeId);
  const positionsParGroupe = grouperPar(donnees.positionsGroupe, (p) => p.groupeId);

  const disponibiliteParBenevoleEtQuart = new Map();
  for (const dispo of donnees.disponibilites) {
    let parQuart = disponibiliteParBenevoleEtQuart.get(dispo.benevoleId);
    if (!parQuart) {
      parQuart = new Map();
      disponibiliteParBenevoleEtQuart.set(dispo.benevoleId, parQuart);
    }
    parQuart.set(dispo.quartHeure, dispo);
  }

  const souhaitParBenevoleEtMission = new Map();
  for (const souhait of donnees.souhaitsMissions) {
    souhaitParBenevoleEtMission.set(`${souhait.benevoleId}:${souhait.missionId}`, souhait);
  }

  const affiniteParPaire = new Map();
  for (const affinite of donnees.affinites) {
    affiniteParPaire.set(clePaireBenevoles(affinite.benevoleAId, affinite.benevoleBId), affinite.type);
  }

  // Absences pointées à l'appel, par macro-créneau (`absencesAppel`, voir
  // `adaptateur-magasin.js`) : facultatif, un jeu de test peut l'omettre.
  const absencesAppelParBenevole = new Map();
  for (const absence of donnees.absencesAppel ?? []) {
    let macroCreneaux = absencesAppelParBenevole.get(absence.benevoleId);
    if (!macroCreneaux) {
      macroCreneaux = new Set();
      absencesAppelParBenevole.set(absence.benevoleId, macroCreneaux);
    }
    macroCreneaux.add(absence.macroCreneauId);
  }

  const sousCreneauxParGroupe = new Map();
  const missionsParGroupe = new Map();
  const quartsParGroupe = new Map();
  const macroCreneauxParGroupe = new Map();
  const competencesRequisesParGroupe = new Map();
  const heuresParGroupe = new Map();

  for (const groupe of donnees.groupes) {
    const positions = positionsParGroupe.get(groupe.id) ?? [];
    const sousCreneaux = [];
    const missionsParId = new Map();
    const quarts = new Set();
    const macroCreneaux = new Set();
    const competences = new Set();
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
    absencesAppelParBenevole,
    sousCreneauxParGroupe,
    missionsParGroupe,
    quartsParGroupe,
    macroCreneauxParGroupe,
    competencesRequisesParGroupe,
    heuresParGroupe,
  };
}
