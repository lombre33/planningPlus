import {beforeEach, describe, expect, it} from 'vitest';
import {
  appliquerPropositions,
  calculerAffectation,
  classerCandidats,
  corrigerPlace,
  deverrouillerPlace,
  perimetreAbsence,
  previsualiserDeplacement,
  repositionnerGroupe,
} from './affectation';
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

describe('calculerAffectation — couverture de base', () => {
  it('pourvoit une place avec un candidat disponible et sans conflit', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const place = creerPlace(groupe.id, 1);
    const benevole = creerBenevole();

    const resultat = calculerAffectation(donnees({
      benevoles: [benevole], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: disponibilitesIntervalle(benevole.id, h(0, 10), h(0, 11)),
    }));

    expect(resultat.propositions).toHaveLength(1);
    expect(resultat.propositions[0]).toMatchObject({
      placeId: place.id, benevoleIdAvant: null, benevoleIdApres: benevole.id,
      origineApres: 'Algorithme', verrouilleeApres: false,
    });
    expect(resultat.propositions[0]!.score).not.toBeNull();
    expect(resultat.anomalies.some((a) => a.code === 'sous_effectif')).toBe(false);
  });

  it('laisse la place vide plutôt que de forcer un bénévole contre un refus explicite (§7.2 objectif 1)', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const place = creerPlace(groupe.id, 1);
    const benevole = creerBenevole();

    const resultat = calculerAffectation(donnees({
      benevoles: [benevole], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: disponibilitesIntervalle(benevole.id, h(0, 10), h(0, 11)),
      souhaitsMissions: [creerSouhait(benevole.id, mission.id, 'Refuse')],
    }));

    expect(resultat.propositions).toHaveLength(0); // rien n'a changé : reste vide comme avant
    expect(resultat.anomalies.some((a) => a.code === 'sous_effectif' && a.besoinId === besoin.id)).toBe(true);
  });
});

describe('calculerAffectation — conflit artiste (§7.2 objectif 2)', () => {
  function scenarioConflitArtiste(dejaCouvert: boolean) {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: dejaCouvert ? 2 : 1, tailleGroupe: 1});
    const groupeCible = creerGroupe();
    const positionCible = creerPositionGroupe(groupeCible.id, besoin.id);
    const placeCible = creerPlace(groupeCible.id, 1);
    const enConflit = creerBenevole();

    const groupes = [groupeCible];
    const positions = [positionCible];
    const places = [placeCible];
    const benevoles = [enConflit];
    let disponibilites = disponibilitesIntervalle(enConflit.id, h(0, 10), h(0, 11), 'Artiste', 900, 99);

    if (dejaCouvert) {
      // Un second groupe, déjà pourvu et verrouillé, couvre déjà le minimum de ce besoin
      // (verrouillé : sinon la résolution en périmètre complet le libérerait lui aussi).
      const groupeDejaLa = creerGroupe();
      const positionDejaLa = creerPositionGroupe(groupeDejaLa.id, besoin.id);
      const dejaLa = creerBenevole();
      const placeDejaLa = creerPlace(groupeDejaLa.id, 1, {benevoleId: dejaLa.id, verrouillee: true});
      groupes.push(groupeDejaLa);
      positions.push(positionDejaLa);
      places.push(placeDejaLa);
      benevoles.push(dejaLa);
      disponibilites = [...disponibilites, ...disponibilitesIntervalle(dejaLa.id, h(0, 10), h(0, 11))];
    }

    return donnees({
      benevoles, missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes, positionsGroupe: positions, places, disponibilites,
    });
  }

  it("utilise un candidat en conflit artiste en dernier recours quand c'est nécessaire pour l'effectif minimum", () => {
    const resultat = calculerAffectation(scenarioConflitArtiste(false));
    const propositionCible = resultat.propositions.find((p) => p.benevoleIdApres != null);
    expect(propositionCible).toBeDefined();
    expect(resultat.anomalies.some((a) => a.code === 'conflit_artiste')).toBe(true);
    expect(resultat.anomalies.some((a) => a.code === 'sous_effectif')).toBe(false);
  });

  it("n'utilise PAS un candidat en conflit artiste quand l'effectif minimum est déjà atteint autrement", () => {
    const resultat = calculerAffectation(scenarioConflitArtiste(true));
    // La place ciblée (celle du bénévole en conflit) doit rester vide.
    expect(resultat.propositions.some((p) => p.benevoleIdApres != null)).toBe(false);
    expect(resultat.anomalies.some((a) => a.code === 'conflit_artiste')).toBe(false);
  });
});

describe('calculerAffectation — jamais de double réservation', () => {
  it("n'affecte jamais le même bénévole à deux groupes dont les créneaux se chevauchent", () => {
    const missionA = creerMission();
    const missionB = creerMission();
    const sousCreneauA = creerSousCreneau(h(0, 10), h(0, 11));
    const sousCreneauB = creerSousCreneau(h(0, 10, 30), h(0, 11, 30)); // chevauche A
    const besoinA = creerBesoin(missionA.id, sousCreneauA.id, {effectifMin: 1, effectifMax: 1});
    const besoinB = creerBesoin(missionB.id, sousCreneauB.id, {effectifMin: 1, effectifMax: 1});
    const groupeA = creerGroupe();
    const groupeB = creerGroupe();
    const positionA = creerPositionGroupe(groupeA.id, besoinA.id);
    const positionB = creerPositionGroupe(groupeB.id, besoinB.id);
    const placeA = creerPlace(groupeA.id, 1);
    const placeB = creerPlace(groupeB.id, 1);
    const seulBenevole = creerBenevole();

    const resultat = calculerAffectation(donnees({
      benevoles: [seulBenevole], missions: [missionA, missionB], sousCreneaux: [sousCreneauA, sousCreneauB],
      besoins: [besoinA, besoinB], groupes: [groupeA, groupeB], positionsGroupe: [positionA, positionB],
      places: [placeA, placeB],
      disponibilites: disponibilitesIntervalle(seulBenevole.id, h(0, 10), h(0, 11, 30)),
    }));

    const affectes = resultat.propositions.filter((p) => p.benevoleIdApres != null);
    expect(affectes.length).toBeLessThanOrEqual(1); // jamais les deux à la fois
    expect(resultat.anomalies.some((a) => a.code === 'sous_effectif')).toBe(true); // l'autre place reste ouverte
  });
});

describe('calculerAffectation — périmètre et verrouillage', () => {
  function scenarioDeuxGroupes() {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin1 = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const besoin2 = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe1 = creerGroupe();
    const groupe2 = creerGroupe();
    const position1 = creerPositionGroupe(groupe1.id, besoin1.id);
    const position2 = creerPositionGroupe(groupe2.id, besoin2.id);
    const place1 = creerPlace(groupe1.id, 1);
    const place2 = creerPlace(groupe2.id, 1);
    const benevole1 = creerBenevole();
    const benevole2 = creerBenevole();
    const d = donnees({
      benevoles: [benevole1, benevole2], missions: [mission], sousCreneaux: [sousCreneau],
      besoins: [besoin1, besoin2], groupes: [groupe1, groupe2], positionsGroupe: [position1, position2],
      places: [place1, place2],
      disponibilites: [
        ...disponibilitesIntervalle(benevole1.id, h(0, 10), h(0, 11)),
        ...disponibilitesIntervalle(benevole2.id, h(0, 10), h(0, 11)),
      ],
    });
    return {d, groupe1, groupe2, place1, place2, besoin1, besoin2};
  }

  it('un périmètre par besoin résout uniquement les groupes positionnés sur ce besoin', () => {
    const {d, besoin1, place1, place2} = scenarioDeuxGroupes();
    const resultat = calculerAffectation(d, {perimetre: {besoinIds: [besoin1.id]}});
    expect(resultat.propositions.map((p) => p.placeId)).toEqual([place1.id]);
    expect(resultat.propositions.some((p) => p.placeId === place2.id)).toBe(false);
  });

  it('ne touche que les places du périmètre demandé', () => {
    const {d, groupe1, place1, place2} = scenarioDeuxGroupes();
    const resultat = calculerAffectation(d, {perimetre: {groupeIds: [groupe1.id]}});
    expect(resultat.propositions.map((p) => p.placeId)).toEqual([place1.id]);
    expect(resultat.propositions.some((p) => p.placeId === place2.id)).toBe(false);
  });

  it('ne touche jamais une place verrouillée, même en périmètre complet', () => {
    const {d, place1} = scenarioDeuxGroupes();
    const dVerrouillee: DonneesPlanning = {
      ...d,
      places: d.places.map((p) => (p.id === place1.id ? {...p, verrouillee: true} : p)),
    };
    const resultat = calculerAffectation(dVerrouillee);
    expect(resultat.propositions.some((p) => p.placeId === place1.id)).toBe(false);
  });

  it('un périmètre par mission résout les groupes de cette mission uniquement', () => {
    const {d, groupe1, mission} = (() => {
      const s = scenarioDeuxGroupes();
      return {...s, mission: s.d.missions[0]!};
    })();
    void mission;
    const resultat = calculerAffectation(d, {perimetre: {missionIds: [d.missions[0]!.id]}});
    // Les deux groupes servent la même mission ici : les deux doivent être résolus.
    expect(resultat.propositions.filter((p) => p.benevoleIdApres != null)).toHaveLength(2);
    void groupe1;
  });
});

describe('calculerAffectation — déterminisme', () => {
  it('produit exactement le même résultat à données et paramètres identiques', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const place = creerPlace(groupe.id, 1);
    const b1 = creerBenevole();
    const b2 = creerBenevole();
    const d = donnees({
      benevoles: [b1, b2], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: [
        ...disponibilitesIntervalle(b1.id, h(0, 10), h(0, 11)),
        ...disponibilitesIntervalle(b2.id, h(0, 10), h(0, 11)),
      ],
    });
    const r1 = calculerAffectation(d);
    const r2 = calculerAffectation(d);
    expect(r1.propositions).toEqual(r2.propositions);
    expect(r1.anomalies).toEqual(r2.anomalies);
  });
});

describe('calculerAffectation — permutation au sein du périmètre (§7.3)', () => {
  it("libère un bénévole d'une place pour en pourvoir une autre du même périmètre quand c'est la seule façon de tout couvrir", () => {
    const missionBar = creerMission({competencesRequises: []});
    const missionSecu = creerMission({competencesRequises: ['SST']});
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoinBar = creerBesoin(missionBar.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const besoinSecu = creerBesoin(missionSecu.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupeBar = creerGroupe();
    const groupeSecu = creerGroupe();
    const positionBar = creerPositionGroupe(groupeBar.id, besoinBar.id);
    const positionSecu = creerPositionGroupe(groupeSecu.id, besoinSecu.id);

    const b = creerBenevole({competences: ['SST']}); // peut faire les deux missions
    const c = creerBenevole({competences: []}); // ne peut faire que le bar

    const placeBar = creerPlace(groupeBar.id, 1, {benevoleId: b.id}); // B tient le bar au départ
    const placeSecu = creerPlace(groupeSecu.id, 1); // sécu encore vide

    const resultat = calculerAffectation(donnees({
      benevoles: [b, c], missions: [missionBar, missionSecu], sousCreneaux: [sousCreneau],
      besoins: [besoinBar, besoinSecu], groupes: [groupeBar, groupeSecu],
      positionsGroupe: [positionBar, positionSecu], places: [placeBar, placeSecu],
      disponibilites: [
        ...disponibilitesIntervalle(b.id, h(0, 10), h(0, 11)),
        ...disponibilitesIntervalle(c.id, h(0, 10), h(0, 11)),
      ],
    }), {perimetre: {groupeIds: [groupeBar.id, groupeSecu.id]}});

    const propBar = resultat.propositions.find((p) => p.placeId === placeBar.id);
    const propSecu = resultat.propositions.find((p) => p.placeId === placeSecu.id);
    expect(propBar).toMatchObject({benevoleIdAvant: b.id, benevoleIdApres: c.id});
    expect(propSecu).toMatchObject({benevoleIdAvant: null, benevoleIdApres: b.id});
    expect(resultat.anomalies.some((a) => a.code === 'sous_effectif')).toBe(false);
  });
});

describe('calculerAffectation — priorité de mission en cas de pénurie (§7.2 objectif 1)', () => {
  it('sert le groupe de priorité Critique avant celui de priorité Confort quand un seul candidat existe pour les deux', () => {
    const missionCritique = creerMission({priorite: 'Critique'});
    const missionConfort = creerMission({priorite: 'Confort'});
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoinCritique = creerBesoin(missionCritique.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const besoinConfort = creerBesoin(missionConfort.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupeCritique = creerGroupe();
    const groupeConfort = creerGroupe();
    const positionCritique = creerPositionGroupe(groupeCritique.id, besoinCritique.id);
    const positionConfort = creerPositionGroupe(groupeConfort.id, besoinConfort.id);
    const placeCritique = creerPlace(groupeCritique.id, 1);
    const placeConfort = creerPlace(groupeConfort.id, 1);
    const seulCandidat = creerBenevole();

    const resultat = calculerAffectation(donnees({
      benevoles: [seulCandidat], missions: [missionCritique, missionConfort], sousCreneaux: [sousCreneau],
      besoins: [besoinCritique, besoinConfort], groupes: [groupeCritique, groupeConfort],
      positionsGroupe: [positionCritique, positionConfort], places: [placeCritique, placeConfort],
      disponibilites: disponibilitesIntervalle(seulCandidat.id, h(0, 10), h(0, 11)),
    }));

    expect(resultat.propositions).toHaveLength(1);
    expect(resultat.propositions[0]).toMatchObject({placeId: placeCritique.id, benevoleIdApres: seulCandidat.id});
    expect(resultat.anomalies.some((a) => a.code === 'sous_effectif' && a.besoinId === besoinConfort.id)).toBe(true);
  });
});

describe('appliquerPropositions', () => {
  it("ne mute pas l'objet donnees d'origine et applique benevoleId/origine/verrouillee/score", () => {
    const groupe = creerGroupe();
    const place = creerPlace(groupe.id, 1);
    const d = donnees({groupes: [groupe], places: [place]});
    const propositions = [{
      placeId: place.id, groupeId: groupe.id, rang: 1, benevoleIdAvant: null,
      benevoleIdApres: 42, origineApres: 'Algorithme' as const, verrouilleeApres: false, score: 0.7,
    }];
    const apres = appliquerPropositions(d, propositions);
    expect(d.places[0]!.benevoleId).toBeNull(); // original intact
    expect(apres.places[0]).toMatchObject({benevoleId: 42, origine: 'Algorithme', verrouillee: false, score: 0.7});
  });
});

describe('corrigerPlace / deverrouillerPlace', () => {
  it('verrouille toujours la place corrigée, y compris en la vidant, et un recalcul global ne la touche plus', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const place = creerPlace(groupe.id, 1);
    const benevole = creerBenevole();
    const d = donnees({
      benevoles: [benevole], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: disponibilitesIntervalle(benevole.id, h(0, 10), h(0, 11)),
    });

    const apresAffectation = corrigerPlace(d, place.id, benevole.id);
    expect(apresAffectation.places[0]).toMatchObject({benevoleId: benevole.id, origine: 'Manuel', verrouillee: true});

    const resultatSansToucher = calculerAffectation(apresAffectation);
    expect(resultatSansToucher.propositions.some((p) => p.placeId === place.id)).toBe(false);

    const apresVidage = corrigerPlace(apresAffectation, place.id, null);
    expect(apresVidage.places[0]).toMatchObject({benevoleId: null, origine: 'Manuel', verrouillee: true});
    const resultatEncoreSansToucher = calculerAffectation(apresVidage);
    expect(resultatEncoreSansToucher.propositions.some((p) => p.placeId === place.id)).toBe(false);

    const apresDeverrouillage = deverrouillerPlace(apresVidage, place.id);
    const resultatApresDeverrouillage = calculerAffectation(apresDeverrouillage);
    expect(resultatApresDeverrouillage.propositions.some((p) => p.placeId === place.id && p.benevoleIdApres === benevole.id)).toBe(true);
  });
});

describe('repositionnerGroupe', () => {
  it('ne change que la ligne Positions_groupe visée, jamais les Places', () => {
    const groupe = creerGroupe();
    const besoinA = creerBesoin(1, 1);
    const besoinB = creerBesoin(2, 2);
    const position = creerPositionGroupe(groupe.id, besoinA.id);
    const place = creerPlace(groupe.id, 1, {benevoleId: 7});
    const d = donnees({groupes: [groupe], besoins: [besoinA, besoinB], positionsGroupe: [position], places: [place]});

    const apres = repositionnerGroupe(d, position.id, besoinB.id);
    expect(apres.positionsGroupe[0]).toMatchObject({groupeId: groupe.id, besoinId: besoinB.id});
    expect(apres.places).toEqual(d.places);
  });
});

describe('perimetreAbsence', () => {
  it('ne retient que les places non verrouillées actuellement tenues par ce bénévole', () => {
    const groupe1 = creerGroupe();
    const groupe2 = creerGroupe();
    const groupe3 = creerGroupe();
    const benevoleId = 99;
    const placeLibre = creerPlace(groupe1.id, 1, {benevoleId});
    const placeVerrouillee = creerPlace(groupe2.id, 1, {benevoleId, verrouillee: true});
    const placeAutrePersonne = creerPlace(groupe3.id, 1, {benevoleId: 1});
    const d = donnees({places: [placeLibre, placeVerrouillee, placeAutrePersonne]});

    expect(perimetreAbsence(d, benevoleId)).toEqual({placeIds: [placeLibre.id]});
  });
});

describe('classerCandidats', () => {
  it('classe les éligibles par score décroissant puis liste les inéligibles avec leur raison', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id);
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const place = creerPlace(groupe.id, 1);
    const excellent = creerBenevole();
    const moyen = creerBenevole();
    const inelegible = creerBenevole({statut: 'Absent'});

    const d = donnees({
      benevoles: [excellent, moyen, inelegible], missions: [mission], sousCreneaux: [sousCreneau],
      besoins: [besoin], groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: [
        ...disponibilitesIntervalle(excellent.id, h(0, 10), h(0, 11)),
        ...disponibilitesIntervalle(moyen.id, h(0, 10), h(0, 11)),
      ],
      souhaitsMissions: [creerSouhait(excellent.id, mission.id, 'Souhaite fortement')],
    });

    const candidats = classerCandidats(d, groupe.id, place.id);
    // Tous les bénévoles apparaissent désormais, y compris les inéligibles
    // (§7.5.3 : Antoine veut pouvoir forcer un cas impossible en connaissance
    // de cause plutôt que ne rien voir).
    expect(candidats).toHaveLength(3);
    expect(candidats.map((c) => c.benevoleId)).toEqual([excellent.id, moyen.id, inelegible.id]);

    expect(candidats[0]).toMatchObject({eligible: true, raison: null});
    expect(candidats[1]).toMatchObject({eligible: true, raison: null});
    expect(candidats[0]!.score!).toBeGreaterThan(candidats[1]!.score!);

    expect(candidats[2]).toMatchObject({eligible: false, score: null, explication: null, raison: 'statut_absent'});
  });

  it('libère la place cible avant de classer, pour réévaluer son occupant actuel comme un candidat ordinaire', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id);
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const benevole = creerBenevole();
    const place = creerPlace(groupe.id, 1, {benevoleId: benevole.id});

    const d = donnees({
      benevoles: [benevole], missions: [mission], sousCreneaux: [sousCreneau],
      besoins: [besoin], groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: disponibilitesIntervalle(benevole.id, h(0, 10), h(0, 11)),
    });

    const candidats = classerCandidats(d, groupe.id, place.id);
    expect(candidats).toEqual([expect.objectContaining({benevoleId: benevole.id, eligible: true})]);
  });
});

describe('previsualiserDeplacement', () => {
  it('échange deux bénévoles sans modifier les données et rapporte les anomalies apparues/résolues', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id);
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const benevoleA = creerBenevole();
    const benevoleB = creerBenevole();
    const placeSource = creerPlace(groupe.id, 1, {benevoleId: benevoleA.id});
    const placeCible = creerPlace(groupe.id, 2, {benevoleId: benevoleB.id});

    const d = donnees({
      benevoles: [benevoleA, benevoleB], missions: [mission], sousCreneaux: [sousCreneau],
      besoins: [besoin], groupes: [groupe], positionsGroupe: [position], places: [placeSource, placeCible],
      disponibilites: [
        ...disponibilitesIntervalle(benevoleA.id, h(0, 10), h(0, 11)),
        ...disponibilitesIntervalle(benevoleB.id, h(0, 10), h(0, 11)),
      ],
    });

    const resultat = previsualiserDeplacement(d, placeSource.id, placeCible.id);
    expect(resultat.possible).toBe(true);
    expect(resultat.donneesApres.places.find((p) => p.id === placeSource.id)?.benevoleId).toBe(benevoleB.id);
    expect(resultat.donneesApres.places.find((p) => p.id === placeCible.id)?.benevoleId).toBe(benevoleA.id);
    // Le jeu de données d'origine reste intact (fonction pure).
    expect(placeSource.benevoleId).toBe(benevoleA.id);

    expect(resultat.anomaliesCreees).toEqual([]);
    expect(resultat.anomaliesResolues).toEqual([]);
  });

  it('refuse un déplacement touchant une place verrouillée', () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id);
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const benevoleA = creerBenevole();
    const placeSource = creerPlace(groupe.id, 1, {benevoleId: benevoleA.id, verrouillee: true});
    const placeCible = creerPlace(groupe.id, 2);

    const d = donnees({
      benevoles: [benevoleA], missions: [mission], sousCreneaux: [sousCreneau],
      besoins: [besoin], groupes: [groupe], positionsGroupe: [position], places: [placeSource, placeCible],
      disponibilites: disponibilitesIntervalle(benevoleA.id, h(0, 10), h(0, 11)),
    });

    const resultat = previsualiserDeplacement(d, placeSource.id, placeCible.id);
    expect(resultat).toMatchObject({possible: false, raisonImpossible: 'place_verrouillee'});
  });

  it("refuse un déplacement vers une place introuvable", () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 10), h(0, 11));
    const besoin = creerBesoin(mission.id, sousCreneau.id);
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const benevoleA = creerBenevole();
    const placeSource = creerPlace(groupe.id, 1, {benevoleId: benevoleA.id});

    const d = donnees({
      benevoles: [benevoleA], missions: [mission], sousCreneaux: [sousCreneau],
      besoins: [besoin], groupes: [groupe], positionsGroupe: [position], places: [placeSource],
      disponibilites: disponibilitesIntervalle(benevoleA.id, h(0, 10), h(0, 11)),
    });

    const resultat = previsualiserDeplacement(d, placeSource.id, 999999);
    expect(resultat).toMatchObject({possible: false, raisonImpossible: 'place_introuvable'});
  });
});

describe('calculerAffectation — planning partiel (parcours de construction incrémental)', () => {
  it("reste utile sur un planning à moitié construit : pourvoit ce qui peut l'être, laisse sous-staffé ce qui manque de candidats, et ne signale rien sur une zone jamais positionnée", () => {
    // Bar : positionné, un candidat disponible sur ce créneau → doit être pourvu.
    const missionBar = creerMission();
    const sousCreneauBar = creerSousCreneau(h(0, 10), h(0, 11));
    const besoinBar = creerBesoin(missionBar.id, sousCreneauBar.id, {effectifMin: 1, effectifMax: 1});
    const groupeBar = creerGroupe();
    const positionBar = creerPositionGroupe(groupeBar.id, besoinBar.id);
    const placeBar = creerPlace(groupeBar.id, 1);
    const benevoleDispo = creerBenevole();

    // Sécu : positionné, sur un créneau différent où personne n'est disponible
    // → doit rester sous-staffé, en anomalie.
    const missionSecu = creerMission();
    const sousCreneauSecu = creerSousCreneau(h(0, 14), h(0, 15));
    const besoinSecu = creerBesoin(missionSecu.id, sousCreneauSecu.id, {effectifMin: 1, effectifMax: 1});
    const groupeSecu = creerGroupe();
    const positionSecu = creerPositionGroupe(groupeSecu.id, besoinSecu.id);
    const placeSecu = creerPlace(groupeSecu.id, 1);

    // Accueil : le besoin existe (créé à l'étape 2) mais personne n'a encore positionné
    // d'indicatif dessus (étape 3 pas atteinte) — un choix de l'utilisateur, pas une anomalie.
    const missionAccueil = creerMission();
    const sousCreneauAccueil = creerSousCreneau(h(0, 18), h(0, 19));
    const besoinAccueil = creerBesoin(missionAccueil.id, sousCreneauAccueil.id, {effectifMin: 2, effectifMax: 2});

    const d = donnees({
      benevoles: [benevoleDispo],
      missions: [missionBar, missionSecu, missionAccueil],
      sousCreneaux: [sousCreneauBar, sousCreneauSecu, sousCreneauAccueil],
      besoins: [besoinBar, besoinSecu, besoinAccueil],
      groupes: [groupeBar, groupeSecu],
      positionsGroupe: [positionBar, positionSecu],
      places: [placeBar, placeSecu],
      disponibilites: disponibilitesIntervalle(benevoleDispo.id, h(0, 10), h(0, 11)),
    });

    const resultat = calculerAffectation(d);

    expect(resultat.propositions.find((p) => p.placeId === placeBar.id)?.benevoleIdApres).toBe(benevoleDispo.id);
    expect(resultat.propositions.some((p) => p.placeId === placeSecu.id && p.benevoleIdApres != null)).toBe(false);

    expect(resultat.anomalies).toEqual([
      expect.objectContaining({code: 'sous_effectif', besoinId: besoinSecu.id}),
    ]);
    // Aucune anomalie côté Accueil : le besoin n'a encore aucun indicatif positionné.
    expect(resultat.anomalies.some((a) => a.besoinId === besoinAccueil.id)).toBe(false);
  });
});

describe('calculerAffectation — franchissement de minuit', () => {
  it("couvre correctement un groupe positionné sur une soirée qui franchit minuit", () => {
    const mission = creerMission();
    const sousCreneau = creerSousCreneau(h(0, 23), h(1, 1)); // 23h → 1h du matin
    const besoin = creerBesoin(mission.id, sousCreneau.id, {effectifMin: 1, effectifMax: 1});
    const groupe = creerGroupe();
    const position = creerPositionGroupe(groupe.id, besoin.id);
    const place = creerPlace(groupe.id, 1);
    const benevole = creerBenevole();

    const resultat = calculerAffectation(donnees({
      benevoles: [benevole], missions: [mission], sousCreneaux: [sousCreneau], besoins: [besoin],
      groupes: [groupe], positionsGroupe: [position], places: [place],
      disponibilites: disponibilitesIntervalle(benevole.id, h(0, 23), h(1, 1)),
    }));

    expect(resultat.propositions).toHaveLength(1);
    expect(resultat.propositions[0]).toMatchObject({benevoleIdApres: benevole.id});
    expect(resultat.anomalies).toHaveLength(0);
  });
});
