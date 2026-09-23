/**
 * Le solveur (§7.5) et les opérations de correction manuelle qui partagent
 * son contexte.
 *
 * Idée clé pour la résolution partielle et les permutations (§7.3, §7.5.5) :
 * `calculerAffectation` commence par LIBÉRER toutes les places non
 * verrouillées du périmètre demandé, qu'elles soient vides ou déjà pourvues,
 * puis les repourvoit toutes ensemble. Un bénévole déjà affecté dans le
 * périmètre redevient ainsi un candidat ordinaire pour n'importe quelle
 * place du même périmètre : les permutations ne sont pas un mécanisme à
 * part, elles émergent du même remplissage glouton. Le périmètre est la
 * seule frontière : rien en dehors n'est jamais touché ou libéré.
 *
 * Le résultat n'est qu'un aperçu (`Proposition[]`) : rien n'est écrit tant
 * que l'appelant n'a pas appliqué le résultat via `appliquerPropositions`,
 * ce qui laisse la porte ouverte à la validation humaine demandée au §7.3.
 *
 * Stratégie de remplissage : un ordonnancement glouton à la
 * « variable la plus contrainte d'abord » (MRV, standard en satisfaction de
 * contraintes) — à chaque étape, le groupe le moins pourvu en candidats est
 * traité en premier, ce qui règle les cas difficiles avant qu'ils ne
 * deviennent impossibles. Ce n'est pas un solveur optimal (le problème est
 * un appariement pondéré multi-contraintes, pas trivialement soluble de
 * façon exacte à cette échelle et dans le temps imparti par NF2), mais un
 * choix délibéré : déterministe, explicable et auditable (§5.2), plutôt
 * qu'un solveur boîte noire.
 */

import type {Contexte} from './contexte';
import {construireContexte} from './contexte';
import {
  calculerScore,
  construireEtatOccupation,
  evaluerEligibilite,
  liberer,
  occuper,
  type EtatOccupation,
} from './eligibilite';
import {detecterAnomalies} from './anomalies';
import type {
  Anomalie,
  CandidatClasse,
  CandidatEligible,
  CauseNonPourvue,
  DonneesPlanning,
  Id,
  ParametresAlgorithme,
  Perimetre,
  PrevisualisationDeplacement,
  PrioriteMission,
  Proposition,
  ResultatAffectation,
} from './types';
import {PARAMETRES_PAR_DEFAUT} from './types';

/** Résout un périmètre en un ensemble de places non verrouillées concrètes. */
function resoudrePerimetre(ctx: Contexte, perimetre: Perimetre | undefined): Set<Id> {
  const rienDeSpecifie = !perimetre
    || (!perimetre.placeIds?.length && !perimetre.groupeIds?.length && !perimetre.besoinIds?.length
      && !perimetre.missionIds?.length && !perimetre.macroCreneauIds?.length);
  if (rienDeSpecifie) {
    return new Set(ctx.donnees.places.filter((p) => !p.verrouillee).map((p) => p.id));
  }

  const groupeIdsCibles = new Set<Id>(perimetre.groupeIds ?? []);

  if (perimetre.besoinIds?.length) {
    const besoinIdsCibles = new Set(perimetre.besoinIds);
    for (const position of ctx.donnees.positionsGroupe) {
      if (besoinIdsCibles.has(position.besoinId)) { groupeIdsCibles.add(position.groupeId); }
    }
  }
  if (perimetre.missionIds?.length) {
    const missionIdsCibles = new Set(perimetre.missionIds);
    for (const position of ctx.donnees.positionsGroupe) {
      const besoin = ctx.besoinParId.get(position.besoinId);
      if (besoin && missionIdsCibles.has(besoin.missionId)) { groupeIdsCibles.add(position.groupeId); }
    }
  }
  if (perimetre.macroCreneauIds?.length) {
    const macroIdsCibles = new Set(perimetre.macroCreneauIds);
    for (const position of ctx.donnees.positionsGroupe) {
      const besoin = ctx.besoinParId.get(position.besoinId);
      const sousCreneau = besoin ? ctx.sousCreneauParId.get(besoin.sousCreneauId) : undefined;
      if (sousCreneau && macroIdsCibles.has(sousCreneau.macroCreneauId)) { groupeIdsCibles.add(position.groupeId); }
    }
  }

  const placeIds = new Set<Id>();
  for (const groupeId of groupeIdsCibles) {
    for (const place of ctx.placesParGroupe.get(groupeId) ?? []) {
      if (!place.verrouillee) { placeIds.add(place.id); }
    }
  }
  for (const placeId of perimetre.placeIds ?? []) {
    const place = ctx.placeParId.get(placeId);
    if (place && !place.verrouillee) { placeIds.add(placeId); }
  }
  return placeIds;
}

/** Bénévoles éligibles à un groupe, hors scoring (rapide — sert au choix du prochain groupe à traiter). */
function compterEligibles(ctx: Contexte, etat: EtatOccupation, groupeId: Id): {propre: Id[]; secours: Id[]} {
  const propre: Id[] = [];
  const secours: Id[] = [];
  for (const benevole of ctx.donnees.benevoles) {
    const statut = evaluerEligibilite(ctx, etat, groupeId, benevole.id);
    if (!statut.eligible) { continue; }
    (statut.conflitArtiste ? secours : propre).push(benevole.id);
  }
  return {propre, secours};
}

/** Couverture actuelle d'un besoin (nombre de places pourvues parmi tous les groupes qui y sont positionnés). */
function couvertureBesoin(ctx: Contexte, besoinId: Id, decisionsParPlace: Map<Id, Id | null>): number {
  let total = 0;
  for (const position of ctx.donnees.positionsGroupe) {
    if (position.besoinId !== besoinId) { continue; }
    for (const place of ctx.placesParGroupe.get(position.groupeId) ?? []) {
      const benevoleId = decisionsParPlace.has(place.id) ? decisionsParPlace.get(place.id) ?? null : place.benevoleId;
      if (benevoleId != null) { total++; }
    }
  }
  return total;
}

/**
 * Un candidat en conflit artiste n'est utile que s'il manque effectivement
 * pour atteindre l'effectif minimum d'au moins un des besoins servis par ce
 * groupe (§7.2 : violable seulement si nécessaire pour couvrir un besoin).
 */
function estNecessairePourMinimum(ctx: Contexte, groupeId: Id, decisionsParPlace: Map<Id, Id | null>): boolean {
  for (const position of ctx.positionsParGroupe.get(groupeId) ?? []) {
    const besoin = ctx.besoinParId.get(position.besoinId);
    if (besoin && couvertureBesoin(ctx, besoin.id, decisionsParPlace) < besoin.effectifMin) {
      return true;
    }
  }
  return false;
}

const RANG_PRIORITE: Record<PrioriteMission, number> = {Critique: 0, Normale: 1, Confort: 2};

function prioriteGroupe(ctx: Contexte, groupeId: Id): number {
  const missions = ctx.missionsParGroupe.get(groupeId) ?? [];
  return missions.length ? Math.min(...missions.map((m) => RANG_PRIORITE[m.priorite])) : RANG_PRIORITE.Normale;
}

/** Remplit toutes les places vides du périmètre, un groupe à la fois (voir le commentaire d'en-tête). */
function remplir(
  ctx: Contexte,
  etat: EtatOccupation,
  parametres: ParametresAlgorithme,
  perimetrePlaceIds: Set<Id>,
  decisionsParPlace: Map<Id, Id | null>,
  scoreParPlace: Map<Id, number>,
  causeNonPourvueParPlace: Map<Id, CauseNonPourvue>,
  avecSecours: boolean,
): void {
  for (;;) {
    const groupesAVides = new Set<Id>();
    for (const placeId of perimetrePlaceIds) {
      if (decisionsParPlace.get(placeId) == null) {
        const place = ctx.placeParId.get(placeId);
        if (place) { groupesAVides.add(place.groupeId); }
      }
    }
    if (groupesAVides.size === 0) { return; }

    let meilleurGroupeId: Id | null = null;
    let meilleurPool: 'propre' | 'secours' | null = null;
    let meilleureTaille = Infinity;
    let meilleurePriorite = Infinity;

    for (const groupeId of groupesAVides) {
      const {propre, secours} = compterEligibles(ctx, etat, groupeId);
      let taille = propre.length;
      let pool: 'propre' | 'secours' = 'propre';
      if (taille === 0) {
        if (avecSecours && secours.length > 0 && estNecessairePourMinimum(ctx, groupeId, decisionsParPlace)) {
          taille = secours.length;
          pool = 'secours';
        } else {
          continue; // ce groupe ne peut rien donner à ce passage
        }
      }
      // La priorité de mission (§7.2 objectif 1, demande explicite d'Antoine
      // le 2026-09-23 : « on remplit les missions prio d'abord, puis les
      // autres ») domine : un groupe Critique passe toujours avant un groupe
      // Normale ou Confort, même si ce dernier a moins de candidats. La
      // taille du bassin de candidats (MRV) ne départage qu'à l'intérieur
      // d'un même rang de priorité — c'est là qu'elle sert son objectif
      // d'origine (traiter d'abord les cas les plus difficiles à couvrir).
      const priorite = prioriteGroupe(ctx, groupeId);
      const meilleure = meilleurGroupeId != null
        && (priorite > meilleurePriorite
          || (priorite === meilleurePriorite && taille > meilleureTaille));
      if (!meilleure) {
        meilleurGroupeId = groupeId;
        meilleurPool = pool;
        meilleureTaille = taille;
        meilleurePriorite = priorite;
      }
    }

    if (meilleurGroupeId == null) {
      // aucun groupe restant n'est faisable à ce passage : note la cause pour chacune de ses places vides
      for (const placeId of perimetrePlaceIds) {
        if (decisionsParPlace.get(placeId) != null || causeNonPourvueParPlace.has(placeId)) { continue; }
        const place = ctx.placeParId.get(placeId);
        if (!place || !groupesAVides.has(place.groupeId)) { continue; }
        const {secours} = compterEligibles(ctx, etat, place.groupeId);
        causeNonPourvueParPlace.set(placeId, secours.length > 0 ? 'conflit_artiste_non_necessaire' : 'aucun_candidat');
      }
      return;
    }

    // Remplit chaque place vide de ce groupe, une par une (le domaine se réduit après chaque choix).
    const rangsVides = (ctx.placesParGroupe.get(meilleurGroupeId) ?? [])
      .filter((place) => perimetrePlaceIds.has(place.id) && decisionsParPlace.get(place.id) == null)
      .sort((a, b) => a.rang - b.rang);

    for (const place of rangsVides) {
      const candidats: CandidatEligible[] = [];
      for (const benevole of ctx.donnees.benevoles) {
        const statut = evaluerEligibilite(ctx, etat, meilleurGroupeId, benevole.id);
        if (!statut.eligible) { continue; }
        if (statut.conflitArtiste && meilleurPool !== 'secours') { continue; }
        candidats.push(calculerScore(
          ctx, etat, parametres, meilleurGroupeId, benevole.id, statut.conflitArtiste, decisionsParPlace, place.id,
        ));
      }
      const gagnant = [...candidats].sort((a, b) => b.score - a.score || a.benevoleId - b.benevoleId)[0];
      if (!gagnant) {
        causeNonPourvueParPlace.set(place.id, 'aucun_candidat');
        continue;
      }
      decisionsParPlace.set(place.id, gagnant.benevoleId);
      scoreParPlace.set(place.id, gagnant.score);
      causeNonPourvueParPlace.delete(place.id);
      occuper(etat, ctx, meilleurGroupeId, gagnant.benevoleId);
    }
  }
}

function construirePropositions(
  ctx: Contexte,
  perimetrePlaceIds: Set<Id>,
  decisionsParPlace: Map<Id, Id | null>,
  scoreParPlace: Map<Id, number>,
  causeNonPourvueParPlace: Map<Id, CauseNonPourvue>,
): Proposition[] {
  const propositions: Proposition[] = [];
  for (const placeId of perimetrePlaceIds) {
    const place = ctx.placeParId.get(placeId);
    if (!place) { continue; }
    const benevoleIdApres = decisionsParPlace.get(placeId) ?? null;
    const rienNeChange = benevoleIdApres === place.benevoleId
      && place.origine === 'Algorithme'
      && place.verrouillee === false;
    if (rienNeChange) { continue; }

    const proposition: Proposition = {
      placeId,
      groupeId: place.groupeId,
      rang: place.rang,
      benevoleIdAvant: place.benevoleId,
      benevoleIdApres,
      origineApres: 'Algorithme',
      verrouilleeApres: false,
      score: benevoleIdApres != null ? scoreParPlace.get(placeId) ?? null : null,
    };
    const cause = causeNonPourvueParPlace.get(placeId);
    if (benevoleIdApres == null && cause) { proposition.causeNonPourvue = cause; }
    propositions.push(proposition);
  }
  return propositions;
}

/**
 * Lance l'algorithme (§7.5.1). Sans `options.perimetre`, résout tout le
 * planning ; avec, se restreint au périmètre donné — c'est le même
 * mécanisme qui sert un simple ajustement à chaud (§5.3, §7.5.5). Ne crée et
 * ne modifie jamais `Groupe` ni `Positions_groupe`.
 */
export function calculerAffectation(
  donnees: DonneesPlanning,
  options?: {perimetre?: Perimetre; parametres?: ParametresAlgorithme},
): ResultatAffectation {
  const parametres = options?.parametres ?? PARAMETRES_PAR_DEFAUT;
  const ctx = construireContexte(donnees, parametres);
  const perimetrePlaceIds = resoudrePerimetre(ctx, options?.perimetre);

  const etat = construireEtatOccupation(ctx);
  const decisionsParPlace = new Map<Id, Id | null>();
  const scoreParPlace = new Map<Id, number>();
  const causeNonPourvueParPlace = new Map<Id, CauseNonPourvue>();

  for (const placeId of perimetrePlaceIds) {
    const place = ctx.placeParId.get(placeId);
    if (place?.benevoleId != null) {
      liberer(etat, ctx, place.groupeId, place.benevoleId);
    }
    decisionsParPlace.set(placeId, null);
  }

  remplir(ctx, etat, parametres, perimetrePlaceIds, decisionsParPlace, scoreParPlace, causeNonPourvueParPlace, false);
  remplir(ctx, etat, parametres, perimetrePlaceIds, decisionsParPlace, scoreParPlace, causeNonPourvueParPlace, true);

  const propositions = construirePropositions(ctx, perimetrePlaceIds, decisionsParPlace, scoreParPlace, causeNonPourvueParPlace);
  const donneesApres = appliquerPropositions(donnees, propositions);
  const anomalies = detecterAnomalies(donneesApres, parametres);

  return {propositions, anomalies, parametres};
}

/** Applique un résultat validé ; ne mute pas `donnees`, retourne une copie. */
export function appliquerPropositions(donnees: DonneesPlanning, propositions: Proposition[]): DonneesPlanning {
  if (propositions.length === 0) { return donnees; }
  const propositionParPlaceId = new Map(propositions.map((p) => [p.placeId, p]));
  const places = donnees.places.map((place) => {
    const proposition = propositionParPlaceId.get(place.id);
    if (!proposition) { return place; }
    return {
      ...place,
      benevoleId: proposition.benevoleIdApres,
      origine: proposition.origineApres,
      verrouillee: proposition.verrouilleeApres,
      score: proposition.score,
    };
  });
  return {...donnees, places};
}

/**
 * Tous les bénévoles classés pour une place, éligibles ou non (§7.5.3),
 * avec la même explication que l'algorithme pour les éligibles et la raison
 * du blocage pour les autres — Antoine veut voir les deux pour pouvoir
 * forcer un cas impossible en connaissance de cause (`corrigerPlace` ne
 * vérifie d'ailleurs aucune contrainte, exactement pour permettre ça).
 * `placeIdCible`, si fournie et déjà pourvue, libère son occupant actuel le
 * temps du calcul, pour qu'il apparaisse comme un candidat ordinaire plutôt
 * que d'être exclu par sa propre place. Les éligibles arrivent en tête,
 * triés par score décroissant ; les inéligibles suivent, triés par
 * identifiant pour rester déterministes.
 */
export function classerCandidats(
  donnees: DonneesPlanning,
  groupeId: Id,
  placeIdCible?: Id,
  parametres: ParametresAlgorithme = PARAMETRES_PAR_DEFAUT,
): CandidatClasse[] {
  const ctx = construireContexte(donnees, parametres);
  const etat = construireEtatOccupation(ctx);
  if (placeIdCible != null) {
    const place = ctx.placeParId.get(placeIdCible);
    if (place?.benevoleId != null) { liberer(etat, ctx, place.groupeId, place.benevoleId); }
  }
  const decisionsVides = new Map<Id, Id | null>();
  const resultats: CandidatClasse[] = [];
  for (const benevole of donnees.benevoles) {
    const statut = evaluerEligibilite(ctx, etat, groupeId, benevole.id);
    if (statut.eligible) {
      const candidat = calculerScore(
        ctx, etat, parametres, groupeId, benevole.id, statut.conflitArtiste, decisionsVides, placeIdCible ?? null,
      );
      resultats.push({
        benevoleId: benevole.id, eligible: true, score: candidat.score, explication: candidat.explication, raison: null,
      });
    } else {
      resultats.push({benevoleId: benevole.id, eligible: false, score: null, explication: null, raison: statut.raison});
    }
  }
  return resultats.sort((a, b) => {
    if (a.eligible !== b.eligible) { return a.eligible ? -1 : 1; }
    if (a.eligible) { return (b.score ?? 0) - (a.score ?? 0) || a.benevoleId - b.benevoleId; }
    return a.benevoleId - b.benevoleId;
  });
}

/**
 * Correction manuelle directe d'une place (§7.5.3) : `benevoleId` l'affecte,
 * `null` la libère. Toujours `Origine = Manuel` et `Verrouillee = vrai`,
 * même en libérant — un recalcul ne la retouche plus tant qu'elle n'est pas
 * déverrouillée explicitement, ce qui protège une correction volontairement
 * laissée vide autant qu'une affectation choisie.
 */
export function corrigerPlace(donnees: DonneesPlanning, placeId: Id, benevoleId: Id | null): DonneesPlanning {
  const places = donnees.places.map((place) => (place.id === placeId
    ? {...place, benevoleId, origine: 'Manuel' as const, verrouillee: true, score: null}
    : place));
  return {...donnees, places};
}

/** Déverrouille une place : un recalcul ultérieur peut à nouveau la reconsidérer. */
export function deverrouillerPlace(donnees: DonneesPlanning, placeId: Id): DonneesPlanning {
  const places = donnees.places.map((place) => (place.id === placeId ? {...place, verrouillee: false} : place));
  return {...donnees, places};
}

/**
 * Repositionne un indicatif d'un besoin à un autre (§7.5.4, §6.3) : une
 * seule ligne de `Positions_groupe` change, les `Places` du groupe restent
 * intactes — ce sont les missions qui tournent, pas les personnes.
 */
export function repositionnerGroupe(donnees: DonneesPlanning, positionGroupeId: Id, nouveauBesoinId: Id): DonneesPlanning {
  const positionsGroupe = donnees.positionsGroupe.map((position) => (position.id === positionGroupeId
    ? {...position, besoinId: nouveauBesoinId}
    : position));
  return {...donnees, positionsGroupe};
}

/**
 * Périmètre naturel pour recalculer après une absence déclarée (§7.5.5) :
 * toutes les places non verrouillées actuellement tenues par ce bénévole.
 * L'appelant doit avoir marqué le bénévole `Absent` (ou vidé ses
 * disponibilités) dans les données passées à `calculerAffectation` — sinon
 * l'algorithme pourrait le réaffecter à lui-même.
 */
export function perimetreAbsence(donnees: DonneesPlanning, benevoleId: Id): Perimetre {
  const placeIds = donnees.places
    .filter((place) => place.benevoleId === benevoleId && !place.verrouillee)
    .map((place) => place.id);
  return {placeIds};
}

/** Clé stable d'une anomalie, pour comparer deux listes (mêmes champs ⇒ même clé). */
function cleAnomalie(a: Anomalie): string {
  return JSON.stringify(a);
}

/**
 * Aperçu, sans mutation, d'un glisser-déposer entre deux places (§7.3, §7.5).
 * Si `placeCibleId` est déjà pourvue, échange les deux occupants ; sinon
 * déplace simplement celui de `placeSourceId`. Refuse (`possible: false`) si
 * l'une des deux places est verrouillée ou introuvable — un verrouillage
 * protège contre tout mouvement, y compris manuel (§7.1). N'écrit rien :
 * pour appliquer réellement, l'appelant doit committer chaque place avec
 * `corrigerPlace` une fois l'aperçu validé.
 */
export function previsualiserDeplacement(
  donnees: DonneesPlanning,
  placeSourceId: Id,
  placeCibleId: Id,
  parametres: ParametresAlgorithme = PARAMETRES_PAR_DEFAUT,
): PrevisualisationDeplacement {
  const anomaliesAvant = detecterAnomalies(donnees, parametres);
  const source = donnees.places.find((p) => p.id === placeSourceId);
  const cible = donnees.places.find((p) => p.id === placeCibleId);

  if (!source || !cible) {
    return {
      possible: false, raisonImpossible: 'place_introuvable', donneesApres: donnees,
      anomaliesAvant, anomaliesApres: anomaliesAvant, anomaliesCreees: [], anomaliesResolues: [],
    };
  }
  if (source.verrouillee || cible.verrouillee) {
    return {
      possible: false, raisonImpossible: 'place_verrouillee', donneesApres: donnees,
      anomaliesAvant, anomaliesApres: anomaliesAvant, anomaliesCreees: [], anomaliesResolues: [],
    };
  }

  const benevoleSource = source.benevoleId;
  const benevoleCible = cible.benevoleId;
  const places = donnees.places.map((place) => {
    if (place.id === placeSourceId) { return {...place, benevoleId: benevoleCible}; }
    if (place.id === placeCibleId) { return {...place, benevoleId: benevoleSource}; }
    return place;
  });
  const donneesApres = {...donnees, places};
  const anomaliesApres = detecterAnomalies(donneesApres, parametres);

  const clesAvant = new Set(anomaliesAvant.map(cleAnomalie));
  const clesApres = new Set(anomaliesApres.map(cleAnomalie));

  return {
    possible: true,
    donneesApres,
    anomaliesAvant,
    anomaliesApres,
    anomaliesCreees: anomaliesApres.filter((a) => !clesAvant.has(cleAnomalie(a))),
    anomaliesResolues: anomaliesAvant.filter((a) => !clesApres.has(cleAnomalie(a))),
  };
}
