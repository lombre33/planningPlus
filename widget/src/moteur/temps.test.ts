import {describe, expect, it} from 'vitest';
import {heuresDIntervalle, quartsDIntervalle, seChevauchent} from './temps';
import {h} from './test-fixtures';

describe('quartsDIntervalle', () => {
  it("découpe un intervalle d'une heure en quatre quarts d'heure", () => {
    const quarts = quartsDIntervalle(h(0, 10), h(0, 11), 900);
    expect(quarts).toEqual([h(0, 10), h(0, 10, 15), h(0, 10, 30), h(0, 10, 45)]);
  });

  it('rend un tableau vide pour un intervalle nul ou inversé', () => {
    expect(quartsDIntervalle(h(0, 10), h(0, 10), 900)).toEqual([]);
    expect(quartsDIntervalle(h(0, 11), h(0, 10), 900)).toEqual([]);
  });

  it('accepte un pas différent du quart d\'heure', () => {
    expect(quartsDIntervalle(0, 1800, 600)).toEqual([0, 600, 1200]);
  });

  it('refuse un pas nul ou négatif', () => {
    expect(() => quartsDIntervalle(0, 900, 0)).toThrow(RangeError);
    expect(() => quartsDIntervalle(0, 900, -600)).toThrow(RangeError);
  });

  it('franchit minuit comme un intervalle continu, sans découpage par jour calendaire', () => {
    // Soirée 22h → 2h le lendemain (§6.2, décision sur le franchissement de minuit).
    const quarts = quartsDIntervalle(h(0, 22), h(1, 2), 900);
    expect(quarts).toHaveLength(16); // 4 heures à 4 quarts
    expect(quarts[0]).toBe(h(0, 22));
    expect(quarts[quarts.length - 1]).toBe(h(1, 1, 45));
  });
});

describe('heuresDIntervalle', () => {
  it('calcule la durée en heures', () => {
    expect(heuresDIntervalle(h(0, 10), h(0, 12, 30))).toBeCloseTo(2.5);
  });

  it('ne rend jamais une durée négative', () => {
    expect(heuresDIntervalle(h(0, 12), h(0, 10))).toBe(0);
  });

  it('mesure correctement une durée qui franchit minuit', () => {
    expect(heuresDIntervalle(h(0, 22), h(1, 2))).toBeCloseTo(4);
  });
});

describe('seChevauchent', () => {
  it('détecte un recouvrement strict', () => {
    expect(seChevauchent(h(0, 10), h(0, 12), h(0, 11), h(0, 13))).toBe(true);
  });

  it('ne considère pas deux intervalles jointifs comme chevauchants', () => {
    expect(seChevauchent(h(0, 10), h(0, 11), h(0, 11), h(0, 12))).toBe(false);
  });

  it('ne considère pas deux intervalles disjoints comme chevauchants', () => {
    expect(seChevauchent(h(0, 10), h(0, 11), h(0, 13), h(0, 14))).toBe(false);
  });

  it('détecte un recouvrement qui franchit minuit', () => {
    // Une soirée 22h→2h et une autre plage qui commence à 1h la nuit suivante.
    expect(seChevauchent(h(0, 22), h(1, 2), h(1, 1), h(1, 3))).toBe(true);
  });
});
