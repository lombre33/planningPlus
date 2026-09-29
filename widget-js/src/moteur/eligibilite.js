/**
 * Éligibilité (contraintes dures, §7.1) et score (objectifs pondérés, §7.2)
 * d'un couple (bénévole, groupe). Utilisé à la fois par le solveur
 * (`affectation.js`) et par `candidatsEligibles`, pour que la correction
 * manuelle voie exactement le même classement que l'algorithme (§7.5.3).
 *
 * Une contrainte dure exclut (`eligible: false`) ; un objectif ne fait que
 * monter ou baisser le score d'un candidat par ailleurs éligible. Seule
 * exception documentée au §7.2 : le conflit avec un souhait « voir un
 * artiste » est une préférence forte, pas une contrainte dure — modélisée
 * ici comme `conflitArtiste: true` sur un candidat qui reste éligible,
 * charge à l'appelant (le solveur) de décider s'il l'utilise (voir
 * `affectation.js`, pool de secours).
 */

import {peutVoirArtiste} from './temps.js';

function recalculerQuarts(etat, ctx, benevoleId) {
  const groupes = etat.groupesParBenevole.get(benevoleId);
  const quarts = new Set();
  const jours = new Map();
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
export function construireEtatOccupation(ctx) {
  const etat = {groupesParBenevole: new Map(), quartsParBenevole: new Map(), joursParBenevole: new Map()};
  for (const place of ctx.donnees.places) {
    if (place.benevoleId != null) {
      occuper(etat, ctx, place.groupeId, place.benevoleId);
    }
  }
  return etat;
}

export function occuper(etat, ctx, groupeId, benevoleId) {
  let groupes = etat.groupesParBenevole.get(benevoleId);
  if (!groupes) {
    groupes = new Set();
    etat.groupesParBenevole.set(benevoleId, groupes);
  }
  groupes.add(groupeId);
  recalculerQuarts(etat, ctx, benevoleId);
}

export function liberer(etat, ctx, groupeId, benevoleId) {
  const groupes = etat.groupesParBenevole.get(benevoleId);
  if (!groupes) { return; }
  groupes.delete(groupeId);
  recalculerQuarts(etat, ctx, benevoleId);
}

export function heuresActuelles(etat, ctx, benevoleId) {
  const groupes = etat.groupesParBenevole.get(benevoleId);
  if (!groupes) { return 0; }
  let total = 0;
  for (const groupeId of groupes) { total += ctx.heuresParGroupe.get(groupeId) ?? 0; }
  return total;
}

/**
 * Contraintes dures (§7.1). L'effectif maximum n'en fait volontairement pas
 * partie depuis la révision du 2026-09-21 : le dépasser est possible (§6.3,
 * §7.1) et remonte en anomalie « sur-effectif », pas ici.
 */
export function evaluerEligibilite(ctx, etat, groupeId, benevoleId) {
  const benevole = ctx.benevoleParId.get(benevoleId);
  if (!benevole || benevole.statut === 'Absent') {
    return {eligible: false, raison: 'statut_absent'};
  }

  // Pointé absent à l'appel un jour où ce groupe a une position (Presences,
  // audit UX du 2026-09-29) : exclu comme un statut Absent, mais pour ces
  // macro-créneaux-là seulement.
  const absencesAppel = ctx.absencesAppelParBenevole.get(benevoleId);
  if (absencesAppel) {
    for (const macroCreneauId of ctx.macroCreneauxParGroupe.get(groupeId) ?? []) {
      if (absencesAppel.has(macroCreneauId)) {
        return {eligible: false, raison: 'absent_appel'};
      }
    }
  }

  const competencesRequises = ctx.competencesRequisesParGroupe.get(groupeId) ?? new Set();
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

  const quarts = ctx.quartsParGroupe.get(groupeId) ?? new Set();
  const quartsOccupes = etat.quartsParBenevole.get(benevoleId);
  if (quartsOccupes) {
    for (const quart of quarts) {
      if (quartsOccupes.has(quart)) {
        return {eligible: false, raison: 'deja_occupe'};
      }
    }
  }

  const macroCreneaux = ctx.macroCreneauxParGroupe.get(groupeId) ?? new Set();
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
  const artistesSouhaites = new Set();
  for (const quart of quarts) {
    const dispo = disponibilitesDuBenevole?.get(quart);
    const statut = dispo?.statut ?? 'Indisponible';
    if (statut === 'Indisponible') {
      return {eligible: false, raison: 'indisponible'};
    }
    if (statut === 'Artiste') {
      // Un souhait sans artiste identifié ne peut pas être jugé sur la règle
      // des 30 minutes ci-dessous (§7.2, 2026-09-23) : conflit par défaut,
      // comme avant cette règle.
      if (dispo?.artisteId != null) { artistesSouhaites.add(dispo.artisteId); } else { conflitArtiste = true; }
    }
  }
  if (artistesSouhaites.size > 0) {
    const quartsOccupesApres = new Set(etat.quartsParBenevole.get(benevoleId) ?? []);
    for (const quart of quarts) { quartsOccupesApres.add(quart); }
    for (const artisteId of artistesSouhaites) {
      const artiste = ctx.artisteParId.get(artisteId);
      // Référence orpheline (artiste supprimé depuis) : conflit par défaut,
      // même raisonnement que ci-dessus — impossible à juger sans le passage.
      if (!artiste || !peutVoirArtiste(artiste.debut, artiste.fin, quartsOccupesApres, ctx.parametres.pasSecondes)) {
        conflitArtiste = true;
      }
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
  ctx,
  decisionsParPlace,
  groupeId,
  placeIdCible,
) {
  const places = ctx.placesParGroupe.get(groupeId) ?? [];
  const rangmates = [];
  for (const place of places) {
    if (place.id === placeIdCible) { continue; }
    const benevoleId = decisionsParPlace.has(place.id) ? decisionsParPlace.get(place.id) ?? null : place.benevoleId;
    if (benevoleId != null) { rangmates.push(benevoleId); }
  }
  return rangmates;
}

function clamp01(valeur) {
  return Math.max(0, Math.min(1, valeur));
}

/**
 * Mission de restauration au sens de la demande d'Antoine du 2026-09-25
 * (« on oublie le choix de la mission SAUF pour restauration ») : aucune
 * mission de ce nom n'existe dans le dépôt (schéma, seed, tests) au moment
 * d'écrire ceci, faute de définition donnée par lui — défaut le plus
 * simple retenu en attendant, à ajuster ici seulement s'il distingue
 * autrement (par équipe, par priorité de mission…) : le nom de la mission
 * contient « restauration », insensible à la casse.
 */
function estMissionRestauration(mission) {
  return /restauration/i.test(mission.nom);
}

/**
 * Partenaires « Ensemble »/« Éviter » déclarés d'un bénévole, avec leur
 * type — lecture directe de `donnees.affinites` (peu d'entrées attendues,
 * pas besoin d'un index dédié dans `Contexte`, à la différence de
 * `affiniteParPaire` qui ne sait interroger qu'une paire précise).
 */
function partenairesDeclares(ctx, benevoleId) {
  const partenaires = [];
  for (const affinite of ctx.donnees.affinites) {
    if (affinite.benevoleAId === benevoleId) { partenaires.push({id: affinite.benevoleBId, type: affinite.type}); }
    else if (affinite.benevoleBId === benevoleId) { partenaires.push({id: affinite.benevoleAId, type: affinite.type}); }
  }
  return partenaires;
}

/**
 * Score et explication d'un candidat déjà jugé éligible (§7.2 — la
 * couverture, premier objectif, se joue au niveau du choix du groupe à
 * traiter, pas ici ; voir `types.js` `ParametresAlgorithme` pour l'ordre
 * complet en vigueur depuis le 2026-09-25).
 *
 * Le terme d'affinité ci-dessous n'est PAS un des six objectifs du §7.2 —
 * voir la note sur `affiniteEnsemble`/`affiniteEviter` dans `types.js`
 * (confirmé par Antoine le 2026-09-23 : c'est sa priorité « binôme
 * souhaité »).
 */
export function calculerScore(
  ctx,
  etat,
  parametres,
  groupeId,
  benevoleId,
  conflitArtiste,
  decisionsParPlace,
  placeIdCible,
) {
  const benevole = ctx.benevoleParId.get(benevoleId);
  const missions = ctx.missionsParGroupe.get(groupeId) ?? [];
  const poids = parametres.poids;

  const souhaitsMission = missions.map((mission) => ({
    missionId: mission.id,
    preference: ctx.souhaitParBenevoleEtMission.get(`${benevoleId}:${mission.id}`)?.preference ?? null,
  }));
  // Demande d'Antoine du 2026-09-25 : « on oublie le choix de la mission
  // SAUF pour restauration » — le souhait de mission ne pèse plus sur le
  // score, sauf pour les missions de restauration (voir
  // `estMissionRestauration` ci-dessus). `souhaitsMission` ci-dessus reste
  // calculé sans condition : c'est de l'explication (§7.5.3), montrée même
  // quand elle n'a pas influencé le classement.
  const missionSouhaitActif = missions.some(estMissionRestauration);
  const scoreSouhait = !missionSouhaitActif || souhaitsMission.length === 0
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

  // Affinité (binôme souhaité/à éviter) : priorité maximale depuis le
  // 2026-09-25 (demande d'Antoine, en réponse aux binômes non respectés
  // remontés par la checklist de la vue Anomalies, PR #18/#19). Compte un
  // partenaire déjà assis sur une autre place du groupe (`rangmates`, comme
  // avant), MAIS AUSSI un partenaire pas encore décidé s'il pourrait encore
  // rejoindre ce même groupe : sans ce deuxième cas, l'affinité ne pouvait
  // JAMAIS influencer qui remporte la toute première place d'un groupe,
  // puisqu'aucun coéquipier n'y est encore décidé à ce moment — elle ne
  // pouvait alors QUE renforcer un appariement déjà amorcé par hasard sur
  // les places suivantes, jamais le provoquer. C'était la cause structurelle
  // trouvée à la lecture du code, indépendante de tout réglage de poids.
  const rangmates = new Set(rangmatesActuels(ctx, decisionsParPlace, groupeId, placeIdCible));
  let scoreAffinite = 0;
  for (const {id: partenaireId, type} of partenairesDeclares(ctx, benevoleId)) {
    const poidsType = type === 'Ensemble' ? poids.affiniteEnsemble : poids.affiniteEviter;
    if (rangmates.has(partenaireId)) {
      scoreAffinite += poidsType;
      continue;
    }
    const groupeAEncorePlaceOuverte = (ctx.placesParGroupe.get(groupeId) ?? []).some((place) => (
      place.id !== placeIdCible && decisionsParPlace.has(place.id) && decisionsParPlace.get(place.id) == null
    ));
    if (groupeAEncorePlaceOuverte && evaluerEligibilite(ctx, etat, groupeId, partenaireId).eligible) {
      scoreAffinite += poidsType;
    }
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
  // Sans l'affinité (son propre palier dominant, `scoreAffiniteSeule`
  // ci-dessous, depuis le 2026-09-25) ni le conflit artiste.
  const scoreSansConflitArtiste = clamp01(0.5 + scoreSouhait + scoreEquite + scoreEquipe);
  const scoreAffiniteSeule = clamp01(0.5 + scoreAffinite);

  const explication = {
    competencesOk: true, // seuls les candidats déjà éligibles atteignent le scoring
    equipeCorrespond,
    conflitArtiste,
    souhaitsMission,
    heuresActuelles: heures,
    quotaHeuresMax: quotaMax,
    depasseraitQuota,
    affinite: scoreAffinite > 0 ? 'positive' : scoreAffinite < 0 ? 'negative' : 'neutre',
  };

  return {benevoleId, score, scoreSansConflitArtiste, scoreAffiniteSeule, explication};
}
