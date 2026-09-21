import {beforeEach, describe, expect, it} from 'vitest';
import {detecterAnomalies} from './anomalies';
import type {DonneesPlanning} from './types';
import {
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

function donnees(partiel: Partial<DonneesPlanning>): DonneesPlanning {
  return {
    benevoles: [], missions: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [],
    ...partiel,
  };
}

beforeEach(() => resetIds());

describe('detecterAnomalies — catalogue exact du §7.4', () => {
  it('ne signale rien sur un planning cohérent', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const benevole = creerBenevole({quotaHeuresMax: 40});
    const place = creerPlace(groupe.id, 1, {benevoleId: benevole.id});

    const anomalies = detecterAnomalies(donnees({
      benevoles: [benevole], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: disponibilitesIntervalle(benevole.id, h(0, 10), h(0, 11)),
    }));

    expect(anomalies).toEqual([]);
  });

  it('détecte un sous-effectif (à corriger)', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 2, effectifMax: 2});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const place = creerPlace(groupe.id, 1); // vide

    const anomalies = detecterAnomalies(donnees({
      missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
    }));

    expect(anomalies).toEqual([expect.objectContaining({code: 'sous_effectif', gravite: 'a_corriger', besoinId: besoin.id})]);
  });

  it("ne signale aucun sous-effectif sur un besoin sans aucun indicatif positionné (zone pas encore construite, pas une anomalie)", () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 2, effectifMax: 2});

    const anomalies = detecterAnomalies(donnees({
      missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      // Aucun groupe, aucune position : le besoin existe mais personne ne l'a encore staffé.
    }));

    expect(anomalies).toEqual([]);
  });

  it('détecte un sur-effectif (à surveiller)', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupeA = creerGroupe();
    const groupeB = creerGroupe();
    const positionA = creerPositionGroupe(groupeA.id, besoin.id);
    const positionB = creerPositionGroupe(groupeB.id, besoin.id);
    const benevoleA = creerBenevole();
    const benevoleB = creerBenevole();
    const placeA = creerPlace(groupeA.id, 1, {benevoleId: benevoleA.id});
    const placeB = creerPlace(groupeB.id, 1, {benevoleId: benevoleB.id});

    const anomalies = detecterAnomalies(donnees({
      benevoles: [benevoleA, benevoleB], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupeA, groupeB], positionsGroupe: [positionA, positionB], places: [placeA, placeB],
      disponibilites: [
        ...disponibilitesIntervalle(benevoleA.id, h(0, 10), h(0, 11)),
        ...disponibilitesIntervalle(benevoleB.id, h(0, 10), h(0, 11)),
      ],
    }));

    expect(anomalies).toEqual([expect.objectContaining({code: 'sur_effectif', gravite: 'a_surveiller', besoinId: besoin.id})]);
  });

  it('détecte un souhait refusé (à corriger) — ne peut venir que d\'une correction manuelle', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const benevole = creerBenevole();
    const place = creerPlace(groupe.id, 1, {benevoleId: benevole.id, origine: 'Manuel', verrouillee: true});

    const anomalies = detecterAnomalies(donnees({
      benevoles: [benevole], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: disponibilitesIntervalle(benevole.id, h(0, 10), h(0, 11)),
      souhaitsMissions: [creerSouhait(benevole.id, mission.id, 'Refuse')],
    }));

    expect(anomalies).toEqual([expect.objectContaining({
      code: 'souhait_refuse', gravite: 'a_corriger', placeId: place.id, benevoleId: benevole.id,
    })]);
  });

  it('détecte une indisponibilité (à corriger)', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const benevole = creerBenevole();
    const place = creerPlace(groupe.id, 1, {benevoleId: benevole.id, origine: 'Manuel', verrouillee: true});

    // Aucune ligne de disponibilité déclarée : indisponible par défaut.
    const anomalies = detecterAnomalies(donnees({
      benevoles: [benevole], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
    }));

    expect(anomalies).toEqual([expect.objectContaining({
      code: 'indisponibilite', gravite: 'a_corriger', placeId: place.id, sousCreneauId: sousCreneau.id,
    })]);
  });

  it('détecte un conflit artiste (à surveiller)', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const benevole = creerBenevole();
    const place = creerPlace(groupe.id, 1, {benevoleId: benevole.id, origine: 'Manuel', verrouillee: true});

    const anomalies = detecterAnomalies(donnees({
      benevoles: [benevole], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: disponibilitesIntervalle(benevole.id, h(0, 10), h(0, 11), 'Artiste', 900, 7),
    }));

    expect(anomalies).toEqual([expect.objectContaining({
      code: 'conflit_artiste', gravite: 'a_surveiller', placeId: place.id, sousCreneauId: sousCreneau.id,
    })]);
  });

  it('détecte un chevauchement de créneaux (à surveiller)', () => {
    const a = creerSousCreneau(h(0, 10), h(0, 12), {macroCreneauId: 1});
    const b = creerSousCreneau(h(0, 11), h(0, 13), {macroCreneauId: 1}); // chevauche a
    const c = creerSousCreneau(h(0, 14), h(0, 15), {macroCreneauId: 1}); // disjoint

    const anomalies = detecterAnomalies(donnees({sousCreneaux: [a, b, c]}));

    expect(anomalies).toEqual([expect.objectContaining({code: 'chevauchement_creneaux', gravite: 'a_surveiller'})]);
  });

  it('ne signale pas de chevauchement entre deux macro-créneaux distincts', () => {
    const a = creerSousCreneau(h(0, 10), h(0, 12), {macroCreneauId: 1});
    const b = creerSousCreneau(h(0, 11), h(0, 13), {macroCreneauId: 2}); // chevauche a dans le temps, mais autre macro

    const anomalies = detecterAnomalies(donnees({sousCreneaux: [a, b]}));

    expect(anomalies).toEqual([]);
  });

  it('détecte un dépassement de quota (à surveiller)', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 12)); // 2h
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const benevole = creerBenevole({quotaHeuresMax: 1});
    const place = creerPlace(groupe.id, 1, {benevoleId: benevole.id, origine: 'Manuel', verrouillee: true});

    const anomalies = detecterAnomalies(donnees({
      benevoles: [benevole], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: disponibilitesIntervalle(benevole.id, h(0, 10), h(0, 12)),
    }));

    expect(anomalies).toEqual([expect.objectContaining({code: 'hors_quota', gravite: 'a_surveiller', benevoleId: benevole.id})]);
  });

  it('franchit minuit sans anomalie fausse sur un chevauchement (deux soirées consécutives, jointives pas chevauchantes)', () => {
    const a = creerSousCreneau(h(0, 22), h(1, 2), {macroCreneauId: 1});
    const b = creerSousCreneau(h(1, 2), h(1, 6), {macroCreneauId: 1}); // jointif, pas de recouvrement

    const anomalies = detecterAnomalies(donnees({sousCreneaux: [a, b]}));

    expect(anomalies).toEqual([]);
  });
});
