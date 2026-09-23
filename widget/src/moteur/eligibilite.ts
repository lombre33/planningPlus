/**
 * Éligibilité (contraintes dures, §7.1) et score (objectifs pondérés, §7.2)
 * d'un couple (bénévole, groupe). Utilisé à la fois par le solveur
 * (`affectation.ts`) et par `candidatsEligibles`, pour que la correction
 * manuelle voie exactement le même classement que l'algorithme (§7.5.3).
 *
 * Une contrainte dure exclut (`eligible: false`) ; un objectif ne fait que
 * monter ou baisser le score d'un candidat par ailleurs éligible. Seule
 * exception documentée au §7.2 : le conflit avec un souhait « voir un
 * artiste » est une préférence forte, pas une contrainte dure — modélisée
 * ici comme `conflitArtiste: true` sur un candidat qui reste éligible,
 * charge à l'appelant (le solveur) de décider s'il l'utilise (voir
 * `affectation.ts`, pool de secours).
 */

import type {Contexte} from './contexte';
import {clePaireBenevoles} from './contexte';
import type {CandidatEligible, ExplicationScore, Id, ParametresAlgorithme, RaisonInEligibilite} from './types';

export interface EtatOccupation {
  /** Groupes actuellement tenus par un bénévole (au moins une place). */
  groupesParBenevole: Map<Id, Set<Id>>;
  /** Quarts d'heure occupés par un bénévole, dérivés de ses groupes actuels. */
  quartsParBenevole: Map<Id, Set<number>>;
  /**
   * Macro-créneau (jour) → groupe occupant, pour chaque jour où le bénévole
   * tient déjà un groupe. Un bénévole ne tient jamais deux groupes différents
   * sur le même jour (§7.1, demande d'Antoine du 2026-09-23), même quand
   * leurs quarts ne se chevauchent pas littéralement.
   */
  joursParBenevole: Map<Id, Map<Id, Id>>;
}

function recalculerQuarts(etat: EtatOccupation, ctx: Contexte, benevoleId: Id): void {
  const groupes = etat.groupesParBenevole.get(benevoleId);
  const quarts = new Set<number>();
  const jours = new Map<Id, Id>();
  if (groupes) {
    for (const groupeId of groupes) {
      for (const quart of ctx.quartsParGroupe.get(groupeId) ?? []) { quarts.add(quart); }
      for (const macroCreneauId of ctx.macroCreneauxParGroupe.get(groupeId) ?? []) {
        jours.set(macroCreneauId, groupeId);
      }
    }
  }
  etat.quartsParBenevole.set(benevoleId, quarts);
  etat.joursParBenevole.set(benevoleId, jours);
}

/** État d'occupation initial, reflétant les places déjà pourvues dans `ctx.donnees`. */
export function construireEtatOccupation(ctx: Contexte): EtatOccupation {
  const etat: EtatOccupation = {groupesParBenevole: new Map(), quartsParBenevole: new Map(), joursParBenevole: new Map()};
  for (const place of ctx.donnees.places) {
    if (place.benevoleId != null) {
      occuper(etat, ctx, place.groupeId, place.benevoleId);
    }
  }
  return etat;
}

export function occuper(etat: EtatOccupation, ctx: Contexte, groupeId: Id, benevoleId: Id): void {
  let groupes = etat.groupesParBenevole.get(benevoleId);
  if (!groupes) {
    groupes = new Set();
    etat.groupesParBenevole.set(benevoleId, groupes);
  }
  groupes.add(groupeId);
  recalculerQuarts(etat, ctx, benevoleId);
}

export function liberer(etat: EtatOccupation, ctx: Contexte, groupeId: Id, benevoleId: Id): void {
  const groupes = etat.groupesParBenevole.get(benevoleId);
  if (!groupes) { return; }
  groupes.delete(groupeId);
  recalculerQuarts(etat, ctx, benevoleId);
}

export function heuresActuelles(etat: EtatOccupation, ctx: Contexte, benevoleId: Id): number {
  const groupes = etat.groupesParBenevole.get(benevoleId);
  if (!groupes) { return 0; }
  let total = 0;
  for (const groupeId of groupes) { total += ctx.heuresParGroupe.get(groupeId) ?? 0; }
  return total;
}

export type StatutEligibilite =
  | {eligible: true; conflitArtiste: boolean}
  | {eligible: false; raison: RaisonInEligibilite};

/**
 * Contraintes dures (§7.1). L'effectif maximum n'en fait volontairement pas
 * partie depuis la révision du 2026-09-21 : le dépasser est possible (§6.3,
 * §7.1) et remonte en anomalie « sur-effectif », pas ici.
 */
export function evaluerEligibilite(ctx: Contexte, etat: EtatOccupation, groupeId: Id, benevoleId: Id): StatutEligibilite {
  const benevole = ctx.benevoleParId.get(benevoleId);
  if (!benevole || benevole.statut === 'Absent') {
    return {eligible: false, raison: 'statut_absent'};
  }

  const competencesRequises = ctx.competencesRequisesParGroupe.get(groupeId) ?? new Set<string>();
  for (const competence of competencesRequises) {
    if (!benevole.competences.includes(competence)) {
      return {eligible: false, raison: 'competence_manquante'};
    }
  }

  const missions = ctx.missionsParGroupe.get(groupeId) ?? [];
  for (const mission of missions) {
    const souhait = ctx.souhaitParBenevoleEtMission.get(`${benevoleId}:${mission.id}`);
    if (souhait?.preference === 'Refuse') {
      return {eligible: false, raison: 'refus_mission'};
    }
  }

  const quarts = ctx.quartsParGroupe.get(groupeId) ?? new Set<number>();
  const quartsOccupes = etat.quartsParBenevole.get(benevoleId);
  if (quartsOccupes) {
    for (const quart of quarts) {
      if (quartsOccupes.has(quart)) {
        return {eligible: false, raison: 'deja_occupe'};
      }
    }
  }

  const macroCreneaux = ctx.macroCreneauxParGroupe.get(groupeId) ?? new Set<Id>();
  const joursOccupes = etat.joursParBenevole.get(benevoleId);
  if (joursOccupes) {
    for (const macroCreneauId of macroCreneaux) {
      const groupeOccupant = joursOccupes.get(macroCreneauId);
      if (groupeOccupant != null && groupeOccupant !== groupeId) {
        return {eligible: false, raison: 'autre_indicatif_meme_jour'};
      }
    }
  }

  let conflitArtiste = false;
  const disponibilitesDuBenevole = ctx.disponibiliteParBenevoleEtQuart.get(benevoleId);
  for (const quart of quarts) {
    const statut = disponibilitesDuBenevole?.get(quart)?.statut ?? 'Indisponible';
    if (statut === 'Indisponible') {
      return {eligible: false, raison: 'indisponible'};
    }
    if (statut === 'Artiste') {
      conflitArtiste = true;
    }
  }

  return {eligible: true, conflitArtiste};
}

/**
 * Bénévoles occupant actuellement une autre place du même groupe, d'après
 * `decisionsParPlace` (les choix déjà faits pendant la résolution en cours,
 * y compris ceux qui ne sont pas encore dans `donnees.places`) avec repli
 * sur l'état d'origine pour une place non encore reconsidérée.
 */
function rangmatesActuels(
  ctx: Contexte,
  decisionsParPlace: Map<Id, Id | null>,
  groupeId: Id,
  placeIdCible: Id | null,
): Id[] {
  const places = ctx.placesParGroupe.get(groupeId) ?? [];
  const rangmates: Id[] = [];
  for (const place of places) {
    if (place.id === placeIdCible) { continue; }
    const benevoleId = decisionsParPlace.has(place.id) ? decisionsParPlace.get(place.id) ?? null : place.benevoleId;
    if (benevoleId != null) { rangmates.push(benevoleId); }
  }
  return rangmates;
}

function clamp01(valeur: number): number {
  return Math.max(0, Math.min(1, valeur));
}

/**
 * Score et explication d'un candidat déjà jugé éligible (§7.2, dans l'ordre :
 * artiste > souhait de mission > équipe > équité — la couverture, premier
 * objectif, se joue au niveau du choix du groupe à traiter, pas ici).
 *
 * Le terme d'affinité ci-dessous n'est PAS un des six objectifs du §7.2 —
 * voir la note sur `affiniteEnsemble`/`affiniteEviter` dans `types.ts`
 * (confirmé par Antoine le 2026-09-23 : c'est sa priorité « binôme
 * souhaité »).
 */
export function calculerScore(
  ctx: Contexte,
  etat: EtatOccupation,
  parametres: ParametresAlgorithme,
  groupeId: Id,
  benevoleId: Id,
  conflitArtiste: boolean,
  decisionsParPlace: Map<Id, Id | null>,
  placeIdCible: Id | null,
): CandidatEligible {
  const benevole = ctx.benevoleParId.get(benevoleId);
  const missions = ctx.missionsParGroupe.get(groupeId) ?? [];
  const poids = parametres.poids;

  const souhaitsMission = missions.map((mission) => ({
    missionId: mission.id,
    preference: ctx.souhaitParBenevoleEtMission.get(`${benevoleId}:${mission.id}`)?.preference ?? null,
  }));
  const scoreSouhait = souhaitsMission.length === 0
    ? 0
    : souhaitsMission.reduce((somme, s) => (
      // « Refuse » ne devrait jamais apparaître ici : evaluerEligibilite exclut
      // déjà tout candidat refusant une des missions du groupe (voir plus haut).
      somme + (s.preference && s.preference !== 'Refuse' ? poids.souhaitMission[s.preference] : 0)
    ), 0) / souhaitsMission.length;

  const heures = heuresActuelles(etat, ctx, benevoleId);
  const quotaMin = benevole?.quotaHeuresMin ?? null;
  const quotaMax = benevole?.quotaHeuresMax ?? null;
  const heuresGroupe = ctx.heuresParGroupe.get(groupeId) ?? 0;
  const depasseraitQuota = quotaMax != null && heures + heuresGroupe > quotaMax;
  const facteurSousQuota = quotaMin != null && quotaMin > 0
    ? clamp01((quotaMin - heures) / quotaMin)
    : 0;
  const scoreEquite = poids.equite * facteurSousQuota - (depasseraitQuota ? poids.equite * 0.5 : 0);

  const rangmates = rangmatesActuels(ctx, decisionsParPlace, groupeId, placeIdCible);
  let scoreAffinite = 0;
  for (const rangmateId of rangmates) {
    const type = ctx.affiniteParPaire.get(clePaireBenevoles(benevoleId, rangmateId));
    if (type === 'Ensemble') { scoreAffinite += poids.affiniteEnsemble; }
    else if (type === 'Éviter') { scoreAffinite += poids.affiniteEviter; }
  }

  const groupe = ctx.groupeParId.get(groupeId);
  const equipeCorrespond = benevole?.equipeId != null && groupe?.equipeId != null
    ? benevole.equipeId === groupe.equipeId
    : null;
  const scoreEquipe = equipeCorrespond ? poids.equipeCorrespond : 0;

  const score = clamp01(
    0.5
    + (conflitArtiste ? poids.conflitArtiste : 0)
    + scoreSouhait
    + scoreEquite
    + scoreAffinite
    + scoreEquipe,
  );
  const scoreSansConflitArtiste = clamp01(0.5 + scoreSouhait + scoreEquite + scoreAffinite + scoreEquipe);

  const explication: ExplicationScore = {
    competencesOk: true, // seuls les candidats déjà éligibles atteignent le scoring
    equipeCorrespond,
    conflitArtiste,
    souhaitsMission,
    heuresActuelles: heures,
    quotaHeuresMax: quotaMax,
    depasseraitQuota,
    affinite: scoreAffinite > 0 ? 'positive' : scoreAffinite < 0 ? 'negative' : 'neutre',
  };

  return {benevoleId, score, scoreSansConflitArtiste, explication};
}
