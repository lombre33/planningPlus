import {describe, expect, it} from 'vitest';
import {Magasin} from '../store.js';
import {
  ajouterScenario, annulerDernier, appliquerBrouillon, creerBrouillon, deverrouillerDansBrouillon, estVide,
  placesChangees, planningDuBrouillon, relancerAlgorithme, retirerDeLaPlace, toutAnnuler, verrouillerDansBrouillon,
} from './brouillon.js';
import {jeuJournee, NINA, PAUL, REMI, TOM, ZOE} from './journee-fixtures.js';

const placeReelle = (m, id) => m.places.find((p) => p.id === id);

describe('brouillon', () => {
  it('garde un scénario hors du planning réel, verrouillé comme une correction à la main', () => {
    const m = new Magasin(jeuJournee());
    const b = creerBrouillon();
    ajouterScenario(m, b, [{benevoleId: PAUL, de: null, vers: 4}]);
    expect(placesChangees(m, b)).toEqual([4]);
    expect(planningDuBrouillon(m, b).places.find((p) => p.id === 4)).toMatchObject({Benevole: PAUL, Origine: 'Manuel', Verrouillee: true});
    expect(placeReelle(m, 4).Benevole).toBeNull();
  });

  it('annule le dernier ajout, puis tout', () => {
    const m = new Magasin(jeuJournee());
    const b = creerBrouillon();
    ajouterScenario(m, b, [{benevoleId: PAUL, de: null, vers: 4}]);
    ajouterScenario(m, b, [{benevoleId: TOM, de: 3, vers: 7}, {benevoleId: NINA, de: 7, vers: 3}]);
    expect(placesChangees(m, b)).toEqual([4, 7, 3]);
    annulerDernier(b);
    expect(placesChangees(m, b)).toEqual([4]);
    toutAnnuler(b);
    expect(estVide(m, b)).toBe(true);
  });

  it('retire quelqu’un d’une place : vide et libre, puis verrouillable dans le brouillon pour la garder vide', () => {
    const m = new Magasin(jeuJournee());
    const b = creerBrouillon();
    retirerDeLaPlace(m, b, 3);
    expect(planningDuBrouillon(m, b).places.find((p) => p.id === 3)).toMatchObject({Benevole: null, Verrouillee: false});
    expect(verrouillerDansBrouillon(m, b, 3)).toBe(true);
    expect(planningDuBrouillon(m, b).places.find((p) => p.id === 3).Verrouillee).toBe(true);
    expect(deverrouillerDansBrouillon(m, b, 3)).toBe(true);
    expect(planningDuBrouillon(m, b).places.find((p) => p.id === 3).Verrouillee).toBe(false);
    expect(verrouillerDansBrouillon(m, b, 1)).toBe(false); // pas dans le brouillon : au réel de le faire
  });

  it('libère, sans la verrouiller, une place que quelqu’un quitte sans remplaçant', () => {
    const m = new Magasin(jeuJournee());
    const b = creerBrouillon();
    ajouterScenario(m, b, [{benevoleId: TOM, de: 3, vers: 4}]);
    const places = planningDuBrouillon(m, b).places;
    expect(places.find((p) => p.id === 3)).toMatchObject({Benevole: null, Verrouillee: false});
    expect(places.find((p) => p.id === 4)).toMatchObject({Benevole: TOM, Verrouillee: true});
  });

  it('relance l’algorithme dans le brouillon, sans rien écrire ni verrouiller, et sans replacer un absent', async () => {
    const m = new Magasin(jeuJournee());
    const b = creerBrouillon();
    const n = relancerAlgorithme(m, b, [1]);
    expect(n).toBeGreaterThan(0);
    expect(n).toBe(placesChangees(m, b).length);
    const places = planningDuBrouillon(m, b).places;
    expect(places.some((p) => p.Benevole === REMI)).toBe(false);
    for (const id of placesChangees(m, b)) {
      expect(places.find((p) => p.id === id)).toMatchObject({Origine: 'Algorithme', Verrouillee: false});
    }
    expect(placeReelle(m, 5).Benevole).toBe(REMI); // l'appel ne libère rien dans le réel
  });

  it('écrit tout d’un coup, puis se vide', async () => {
    const m = new Magasin(jeuJournee());
    const b = creerBrouillon();
    ajouterScenario(m, b, [{benevoleId: PAUL, de: null, vers: 4}]);
    ajouterScenario(m, b, [{benevoleId: ZOE, de: null, vers: 5}]);
    const resultat = await appliquerBrouillon(m, b);
    expect(resultat).toEqual({ok: true, ecrites: 2, refusees: []});
    expect(placeReelle(m, 4)).toMatchObject({Benevole: PAUL, Origine: 'Manuel', Verrouillee: true});
    expect(placeReelle(m, 5).Benevole).toBe(ZOE);
    expect(estVide(m, b)).toBe(true);
  });

  it('refuse une place que le planning réel a changée depuis', async () => {
    const m = new Magasin(jeuJournee());
    const b = creerBrouillon();
    ajouterScenario(m, b, [{benevoleId: ZOE, de: null, vers: 4}]);
    ajouterScenario(m, b, [{benevoleId: ZOE, de: null, vers: 8}]);
    await m.assignerPlace(4, PAUL); // corrigée ailleurs entre-temps
    const resultat = await appliquerBrouillon(m, b);
    expect(resultat).toEqual({ok: true, ecrites: 1, refusees: [4]});
    expect(placeReelle(m, 4).Benevole).toBe(PAUL);
    expect(placeReelle(m, 8).Benevole).toBe(ZOE);
  });
});
