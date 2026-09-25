import {beforeEach, describe, expect, it} from 'vitest';
import {construireContexte} from './contexte';
import {
  calculerScore,
  construireEtatOccupation,
  evaluerEligibilite,
  liberer,
  occuper,
} from './eligibilite';
import {PARAMETRES_PAR_DEFAUT} from './types';
import type {DonneesPlanning} from './types';
import {
  creerAffinite,
  creerArtiste,
  creerBenevole,
  creerBesoin,
  creerGroupe,
  creerMission,
  creerPlace,
  creerPositionGroupe,
  creerSouhait,
  creerSousCreneau,
  disponibilitesIntervalle,
  h,
  resetIds,
} from './test-fixtures';

/** Un groupe de taille 1 positionné sur un unique besoin d'une heure (4 quarts), sans compétence requise. */
function scenarioSimple(overrides: {
  competencesRequises?: string[];
  debut?: number;
  fin?: number;
} = {}) {
  const mission = creerMission({competencesRequises: overrides.competencesRequises ?? []});
  const sousCreneau = creerSousCreneau(overrides.debut ?? h(0, 10), overrides.fin ?? h(0, 11));
  const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 2});
  const groupe = creerGroupe({taille: 1});
  const position = creerPositionGroupe(groupe.id, besoin.id);
  const place = creerPlace(groupe.id, 1);
  return {mission, sousCreneau, besoin, groupe, position, place};
}

function donnees(partiel: Partial<DonneesPlanning>): DonneesPlanning {
  return {
    benevoles: [], missions: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [], artistes: [],
    ...partiel,
  };
}

beforeEach(() => resetIds());

describe('evaluerEligibilite', () => {
  it('accepte un bénévole disponible sur tout le créneau, sans conflit', () => {
    const s = scenarioSimple();
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole], missions: [s.mission], sousCreneaux: [s.sousCreneau], besoins: [s.besoin],
      groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: disponibilitesIntervalle(benevole.id, s.sousCreneau.debut, s.sousCreneau.fin),
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, benevole.id)).toEqual({eligible: true, conflitArtiste: false});
  });

  it('exclut un bénévole au statut Absent', () => {
    const s = scenarioSimple();
    const benevole = creerBenevole({statut: 'Absent'});
    const d = donnees({
      benevoles: [benevole], missions: [s.mission], sousCreneaux: [s.sousCreneau], besoins: [s.besoin],
      groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: disponibilitesIntervalle(benevole.id, s.sousCreneau.debut, s.sousCreneau.fin),
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, benevole.id)).toEqual({eligible: false, raison: 'statut_absent'});
  });

  it("exclut un bénévole sans une compétence requise par la mission, l'accepte s'il l'a", () => {
    const s = scenarioSimple({competencesRequises: ['SST']});
    const sansCompetence = creerBenevole({competences: []});
    const avecCompetence = creerBenevole({competences: ['SST']});
    const d = donnees({
      benevoles: [sansCompetence, avecCompetence], missions: [s.mission], sousCreneaux: [s.sousCreneau],
      besoins: [s.besoin], groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: [
        ...disponibilitesIntervalle(sansCompetence.id, s.sousCreneau.debut, s.sousCreneau.fin),
        ...disponibilitesIntervalle(avecCompetence.id, s.sousCreneau.debut, s.sousCreneau.fin),
      ],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, sansCompetence.id))
      .toEqual({eligible: false, raison: 'competence_manquante'});
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, avecCompetence.id))
      .toEqual({eligible: true, conflitArtiste: false});
  });

  it('exige les compétences des DEUX missions quand un groupe tourne entre deux besoins (§6.3)', () => {
    const missionA = creerMission({competencesRequises: ['SST']});
    const missionB = creerMission({competencesRequises: ['Caisse']});
    const sousCreneauA = creerSousCreneau(h(0, 10), h(0, 11));
    const sousCreneauB = creerSousCreneau(h(0, 11), h(0, 12));
    const besoinA = creerBesoin(missionA.id, sousCreneauA.id);
    const besoinB = creerBesoin(missionB.id, sousCreneauB.id);
    const groupe = creerGroupe();
    const positionA = creerPositionGroupe(groupe.id, besoinA.id);
    const positionB = creerPositionGroupe(groupe.id, besoinB.id);
    const place = creerPlace(groupe.id, 1);
    const benevoleUneSeule = creerBenevole({competences: ['SST']});
    const benevoleLesDeux = creerBenevole({competences: ['SST', 'Caisse']});
    const d = donnees({
      benevoles: [benevoleUneSeule, benevoleLesDeux], missions: [missionA, missionB],
      sousCreneaux: [sousCreneauA, sousCreneauB], besoins: [besoinA, besoinB], groupes: [groupe],
      positionsGroupe: [positionA, positionB], places: [place],
      disponibilites: [
        ...disponibilitesIntervalle(benevoleUneSeule.id, h(0, 10), h(0, 12)),
        ...disponibilitesIntervalle(benevoleLesDeux.id, h(0, 10), h(0, 12)),
      ],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, groupe.id, benevoleUneSeule.id))
      .toEqual({eligible: false, raison: 'competence_manquante'});
    expect(evaluerEligibilite(ctx, etat, groupe.id, benevoleLesDeux.id))
      .toEqual({eligible: true, conflitArtiste: false});
  });

  it('exclut un bénévole ayant explicitement refusé la mission (§7.2 objectif 1)', () => {
    const s = scenarioSimple();
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole], missions: [s.mission], sousCreneaux: [s.sousCreneau], besoins: [s.besoin],
      groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: disponibilitesIntervalle(benevole.id, s.sousCreneau.debut, s.sousCreneau.fin),
      souhaitsMissions: [creerSouhait(benevole.id, s.mission.id, 'Refuse')],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, benevole.id)).toEqual({eligible: false, raison: 'refus_mission'});
  });

  it("exclut un bénévole indisponible ne serait-ce que sur un seul quart d'heure du créneau", () => {
    const s = scenarioSimple();
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole], missions: [s.mission], sousCreneaux: [s.sousCreneau], besoins: [s.besoin],
      groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      // Disponible seulement sur les 3 premiers quarts sur 4.
      disponibilites: disponibilitesIntervalle(benevole.id, s.sousCreneau.debut, s.sousCreneau.fin - 900),
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, benevole.id)).toEqual({eligible: false, raison: 'indisponible'});
  });

  it("traite l'absence totale de ligne de disponibilité comme indisponible", () => {
    const s = scenarioSimple();
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole], missions: [s.mission], sousCreneaux: [s.sousCreneau], besoins: [s.besoin],
      groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place], disponibilites: [],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, benevole.id)).toEqual({eligible: false, raison: 'indisponible'});
  });

  it("reste éligible, avec conflitArtiste, quand le bénévole veut voir un artiste pendant le créneau", () => {
    const s = scenarioSimple();
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole], missions: [s.mission], sousCreneaux: [s.sousCreneau], besoins: [s.besoin],
      groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: disponibilitesIntervalle(benevole.id, s.sousCreneau.debut, s.sousCreneau.fin, 'Artiste', 900, 42),
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, benevole.id)).toEqual({eligible: true, conflitArtiste: true});
  });

  it("n'a plus de conflit artiste s'il reste au moins 30 minutes libres d'affilée sur le passage complet de l'artiste (règle du 2026-09-23, pas seulement le créneau du groupe)", () => {
    const s = scenarioSimple({debut: h(0, 20), fin: h(0, 20, 30)}); // n'occupe qu'une partie du passage
    const artiste = creerArtiste(h(0, 20), h(0, 21, 30)); // passage de 90 minutes
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole], missions: [s.mission], sousCreneaux: [s.sousCreneau], besoins: [s.besoin],
      groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place], artistes: [artiste],
      disponibilites: disponibilitesIntervalle(benevole.id, s.sousCreneau.debut, s.sousCreneau.fin, 'Artiste', 900, artiste.id),
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, benevole.id)).toEqual({eligible: true, conflitArtiste: false});
  });

  it("garde le conflit artiste s'il resterait moins de 30 minutes libres d'affilée sur le passage", () => {
    const s = scenarioSimple({debut: h(0, 20), fin: h(0, 21, 15)}); // n'en laisse que 15 min libres
    const artiste = creerArtiste(h(0, 20), h(0, 21, 30)); // passage de 90 minutes
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole], missions: [s.mission], sousCreneaux: [s.sousCreneau], besoins: [s.besoin],
      groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place], artistes: [artiste],
      disponibilites: disponibilitesIntervalle(benevole.id, s.sousCreneau.debut, s.sousCreneau.fin, 'Artiste', 900, artiste.id),
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, benevole.id)).toEqual({eligible: true, conflitArtiste: true});
  });

  it('exclut un bénévole déjà occupé sur un quart qui recouvre un autre groupe', () => {
    const s1 = scenarioSimple({debut: h(0, 10), fin: h(0, 11)});
    const s2 = scenarioSimple({debut: h(0, 10, 30), fin: h(0, 11, 30)}); // chevauche s1
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole],
      missions: [s1.mission, s2.mission],
      sousCreneaux: [s1.sousCreneau, s2.sousCreneau],
      besoins: [s1.besoin, s2.besoin],
      groupes: [s1.groupe, s2.groupe],
      positionsGroupe: [s1.position, s2.position],
      places: [s1.place, s2.place],
      disponibilites: [
        ...disponibilitesIntervalle(benevole.id, h(0, 10), h(0, 11, 30)),
      ],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    occuper(etat, ctx, s1.groupe.id, benevole.id);
    expect(evaluerEligibilite(ctx, etat, s2.groupe.id, benevole.id)).toEqual({eligible: false, raison: 'deja_occupe'});
    liberer(etat, ctx, s1.groupe.id, benevole.id);
    expect(evaluerEligibilite(ctx, etat, s2.groupe.id, benevole.id)).toEqual({eligible: true, conflitArtiste: false});
  });

  it("exclut un bénévole déjà sur un autre indicatif le même jour, même sans chevauchement horaire (demande d'Antoine, 2026-09-23)", () => {
    // Même macro-créneau (jour) par défaut (creerSousCreneau), matin puis après-midi : aucun chevauchement de quarts.
    const s1 = scenarioSimple({debut: h(0, 10), fin: h(0, 11)});
    const s2 = scenarioSimple({debut: h(0, 14), fin: h(0, 15)});
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole],
      missions: [s1.mission, s2.mission],
      sousCreneaux: [s1.sousCreneau, s2.sousCreneau],
      besoins: [s1.besoin, s2.besoin],
      groupes: [s1.groupe, s2.groupe],
      positionsGroupe: [s1.position, s2.position],
      places: [s1.place, s2.place],
      disponibilites: [
        ...disponibilitesIntervalle(benevole.id, h(0, 10), h(0, 11)),
        ...disponibilitesIntervalle(benevole.id, h(0, 14), h(0, 15)),
      ],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    occuper(etat, ctx, s1.groupe.id, benevole.id);
    expect(evaluerEligibilite(ctx, etat, s2.groupe.id, benevole.id)).toEqual({eligible: false, raison: 'autre_indicatif_meme_jour'});
    liberer(etat, ctx, s1.groupe.id, benevole.id);
    expect(evaluerEligibilite(ctx, etat, s2.groupe.id, benevole.id)).toEqual({eligible: true, conflitArtiste: false});
  });

  it('gère correctement un créneau qui franchit minuit (indisponibilité au milieu de la nuit)', () => {
    const s = scenarioSimple({debut: h(0, 22), fin: h(1, 2)}); // 22h → 2h le lendemain
    const disponibleEnPartie = creerBenevole();
    const disponibleToute = creerBenevole();
    const d = donnees({
      benevoles: [disponibleEnPartie, disponibleToute], missions: [s.mission], sousCreneaux: [s.sousCreneau],
      besoins: [s.besoin], groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: [
        ...disponibilitesIntervalle(disponibleEnPartie.id, h(0, 22), h(1, 1)), // s'arrête à 1h, avant la fin à 2h
        ...disponibilitesIntervalle(disponibleToute.id, h(0, 22), h(1, 2)),
      ],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, disponibleEnPartie.id))
      .toEqual({eligible: false, raison: 'indisponible'});
    expect(evaluerEligibilite(ctx, etat, s.groupe.id, disponibleToute.id))
      .toEqual({eligible: true, conflitArtiste: false});
  });
});

describe('calculerScore', () => {
  it('pour une mission de restauration (seule exception depuis le 2026-09-25), score plus haut un souhait « Souhaite fortement » qu’un souhait « Neutre », lui-même plus haut qu’un souhait « Réticent »', () => {
    const s = scenarioSimple();
    const missionRestauration = {...s.mission, nom: 'Restauration'};
    const fort = creerBenevole();
    const neutre = creerBenevole();
    const reticent = creerBenevole();
    const d = donnees({
      benevoles: [fort, neutre, reticent], missions: [missionRestauration], sousCreneaux: [s.sousCreneau],
      besoins: [s.besoin], groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: [fort, neutre, reticent].flatMap((b) => disponibilitesIntervalle(b.id, s.sousCreneau.debut, s.sousCreneau.fin)),
      souhaitsMissions: [
        creerSouhait(fort.id, s.mission.id, 'Souhaite fortement'),
        creerSouhait(reticent.id, s.mission.id, 'Réticent'),
      ],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    const decisions = new Map();
    const scoreDe = (id: number) => calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, s.groupe.id, id, false, decisions, s.place.id).score;
    expect(scoreDe(fort.id)).toBeGreaterThan(scoreDe(neutre.id));
    expect(scoreDe(neutre.id)).toBeGreaterThan(scoreDe(reticent.id));
  });

  it("pour une mission ordinaire (pas de restauration), le souhait de mission n'a plus aucun effet sur le score depuis le 2026-09-25 (« on oublie le choix de la mission SAUF pour restauration »)", () => {
    const s = scenarioSimple(); // nom par défaut, donc PAS « Restauration »
    const fort = creerBenevole();
    const reticent = creerBenevole();
    const d = donnees({
      benevoles: [fort, reticent], missions: [s.mission], sousCreneaux: [s.sousCreneau],
      besoins: [s.besoin], groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: [fort, reticent].flatMap((b) => disponibilitesIntervalle(b.id, s.sousCreneau.debut, s.sousCreneau.fin)),
      souhaitsMissions: [
        creerSouhait(fort.id, s.mission.id, 'Souhaite fortement'),
        creerSouhait(reticent.id, s.mission.id, 'Réticent'),
      ],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    const decisions = new Map();
    const scoreDe = (id: number) => calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, s.groupe.id, id, false, decisions, s.place.id).score;
    expect(scoreDe(fort.id)).toBe(scoreDe(reticent.id));
  });

  it('pénalise un candidat en conflit avec un souhait artiste par rapport à un candidat sans conflit', () => {
    const s = scenarioSimple();
    const sansConflit = creerBenevole();
    const d = donnees({
      benevoles: [sansConflit], missions: [s.mission], sousCreneaux: [s.sousCreneau],
      besoins: [s.besoin], groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: disponibilitesIntervalle(sansConflit.id, s.sousCreneau.debut, s.sousCreneau.fin),
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    const decisions = new Map();
    const scoreSansConflit = calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, s.groupe.id, sansConflit.id, false, decisions, s.place.id).score;
    const scoreAvecConflit = calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, s.groupe.id, sansConflit.id, true, decisions, s.place.id).score;
    expect(scoreAvecConflit).toBeLessThan(scoreSansConflit);
  });

  it('favorise un bénévole en-dessous de son quota minimum (équité)', () => {
    const s = scenarioSimple();
    const sousQuota = creerBenevole({quotaHeuresMin: 20});
    const autre = creerBenevole({quotaHeuresMin: null});
    // Un autre groupe, ailleurs dans le temps, déjà occupé par `sousQuota`... non : on simule
    // plutôt via une place déjà affectée à `autre` pour lui donner des heures déjà comptées.
    const sAutre = scenarioSimple({debut: h(0, 14), fin: h(0, 20)}); // 6h déjà faites par `autre`
    const placeAutreDejaAffectee = {...sAutre.place, benevoleId: autre.id};
    const d = donnees({
      benevoles: [sousQuota, autre],
      missions: [s.mission, sAutre.mission],
      sousCreneaux: [s.sousCreneau, sAutre.sousCreneau],
      besoins: [s.besoin, sAutre.besoin],
      groupes: [s.groupe, sAutre.groupe],
      positionsGroupe: [s.position, sAutre.position],
      places: [s.place, placeAutreDejaAffectee],
      disponibilites: [
        ...disponibilitesIntervalle(sousQuota.id, s.sousCreneau.debut, s.sousCreneau.fin),
        ...disponibilitesIntervalle(autre.id, s.sousCreneau.debut, s.sousCreneau.fin),
      ],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx); // reprend l'affectation existante de `autre` (6h déjà faites)
    const decisions = new Map();
    const scoreSousQuota = calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, s.groupe.id, sousQuota.id, false, decisions, s.place.id).score;
    const scoreAutre = calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, s.groupe.id, autre.id, false, decisions, s.place.id).score;
    expect(scoreSousQuota).toBeGreaterThan(scoreAutre);
  });

  it('signale depasseraitQuota quand affecter le candidat dépasserait son quota maximum', () => {
    const s = scenarioSimple(); // 1h
    const benevole = creerBenevole({quotaHeuresMax: 0.5});
    const d = donnees({
      benevoles: [benevole], missions: [s.mission], sousCreneaux: [s.sousCreneau],
      besoins: [s.besoin], groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: disponibilitesIntervalle(benevole.id, s.sousCreneau.debut, s.sousCreneau.fin),
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    const decisions = new Map();
    const resultat = calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, s.groupe.id, benevole.id, false, decisions, s.place.id);
    expect(resultat.explication.depasseraitQuota).toBe(true);
  });

  it('score plus haut un candidat en affinité « Ensemble » avec son binôme, plus bas en « Éviter »', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {tailleGroupe: 2});
    const groupe = creerGroupe({taille: 2});
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const placeRang1 = creerPlace(groupe.id, 1);
    const placeRang2 = creerPlace(groupe.id, 2);
    const dejaLa = creerBenevole();
    const enEnsemble = creerBenevole();
    const enEviter = creerBenevole();
    const neutre = creerBenevole();
    const d = donnees({
      benevoles: [dejaLa, enEnsemble, enEviter, neutre], missions: [mission], sousCreneaux: [sousCreneau],
      besoins: [besoin], groupes: [groupe], positionsGroupe: [position],
      places: [{...placeRang1, benevoleId: dejaLa.id}, placeRang2],
      disponibilites: [dejaLa, enEnsemble, enEviter, neutre].flatMap((b) => disponibilitesIntervalle(b.id, h(0, 10), h(0, 11))),
      affinites: [
        creerAffinite(dejaLa.id, enEnsemble.id, 'Ensemble'),
        creerAffinite(dejaLa.id, enEviter.id, 'Éviter'),
      ],
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    const decisions = new Map(); // vide : les rangmates se lisent directement dans `donnees.places`
    const scoreDe = (id: number) => calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, groupe.id, id, false, decisions, placeRang2.id).score;
    expect(scoreDe(enEnsemble.id)).toBeGreaterThan(scoreDe(neutre.id));
    expect(scoreDe(neutre.id)).toBeGreaterThan(scoreDe(enEviter.id));
  });

  it("score plus haut un candidat de la même équipe que le groupe (§7.5.3, repère opérationnel)", () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id);
    const groupe = creerGroupe({equipeId: 5});
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const place = creerPlace(groupe.id, 1);
    const memeEquipe = creerBenevole({equipeId: 5});
    const autreEquipe = creerBenevole({equipeId: 6});
    const d = donnees({
      benevoles: [memeEquipe, autreEquipe], missions: [mission], sousCreneaux: [sousCreneau],
      besoins: [besoin], groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: [memeEquipe, autreEquipe].flatMap((b) => disponibilitesIntervalle(b.id, h(0, 10), h(0, 11))),
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    const decisions = new Map();
    const resultatMemeEquipe = calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, groupe.id, memeEquipe.id, false, decisions, place.id);
    const resultatAutreEquipe = calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, groupe.id, autreEquipe.id, false, decisions, place.id);
    expect(resultatMemeEquipe.explication.equipeCorrespond).toBe(true);
    expect(resultatAutreEquipe.explication.equipeCorrespond).toBe(false);
    expect(resultatMemeEquipe.score).toBeGreaterThan(resultatAutreEquipe.score);
  });

  it("laisse equipeCorrespond à null quand le groupe ou le bénévole n'a pas d'équipe renseignée", () => {
    const s = scenarioSimple();
    const sansEquipe = creerBenevole({equipeId: null});
    const d = donnees({
      benevoles: [sansEquipe], missions: [s.mission], sousCreneaux: [s.sousCreneau],
      besoins: [s.besoin], groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: disponibilitesIntervalle(sansEquipe.id, s.sousCreneau.debut, s.sousCreneau.fin),
    });
    const ctx = construireContexte(d, PARAMETRES_PAR_DEFAUT);
    const etat = construireEtatOccupation(ctx);
    const resultat = calculerScore(ctx, etat, PARAMETRES_PAR_DEFAUT, s.groupe.id, sansEquipe.id, false, new Map(), s.place.id);
    expect(resultat.explication.equipeCorrespond).toBeNull();
  });

  it('borne toujours le score à [0, 1] même avec des poids extrêmes', () => {
    const s = scenarioSimple();
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole], missions: [s.mission], sousCreneaux: [s.sousCreneau],
      besoins: [s.besoin], groupes: [s.groupe], positionsGroupe: [s.position], places: [s.place],
      disponibilites: disponibilitesIntervalle(benevole.id, s.sousCreneau.debut, s.sousCreneau.fin, 'Artiste', 900, 1),
    });
    const parametresExtremes = {
      ...PARAMETRES_PAR_DEFAUT,
      poids: {...PARAMETRES_PAR_DEFAUT.poids, conflitArtiste: -100},
    };
    const ctx = construireContexte(d, parametresExtremes);
    const etat = construireEtatOccupation(ctx);
    const resultat = calculerScore(ctx, etat, parametresExtremes, s.groupe.id, benevole.id, true, new Map(), s.place.id);
    expect(resultat.score).toBeGreaterThanOrEqual(0);
    expect(resultat.score).toBeLessThanOrEqual(1);
  });
});
