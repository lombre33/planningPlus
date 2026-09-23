import {describe, expect, it} from 'vitest';
import {
  heuresDIntervalle, minutesLibresConsecutives, peutVoirArtiste, quartsDIntervalle,
  SEUIL_MINUTES_VOIR_ARTISTE, seChevauchent,
} from './temps';
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

describe('minutesLibresConsecutives', () => {
  it('rend la durée totale quand rien n’est occupé', () => {
    const libre = minutesLibresConsecutives(h(0, 20), h(0, 21), new Set(), 900);
    expect(libre).toBe(60);
  });

  it('rend 0 quand tout est occupé', () => {
    const quarts = new Set([h(0, 20), h(0, 20, 15), h(0, 20, 30), h(0, 20, 45)]);
    expect(minutesLibresConsecutives(h(0, 20), h(0, 21), quarts, 900)).toBe(0);
  });

  it('garde le plus long segment, pas le total, quand le libre est scindé en deux', () => {
    // 20h-21h, occupé seulement à 20h30 : deux segments de 30 min de part et d'autre.
    const quarts = new Set([h(0, 20, 30)]);
    expect(minutesLibresConsecutives(h(0, 20), h(0, 21), quarts, 900)).toBe(30);
  });

  it('ne compte pas un segment scindé en plusieurs petits morceaux comme un seul grand', () => {
    // 20h-21h, occupé à 20h15 et 20h45 : trois segments de 15 min, jamais 30 d'affilée.
    const quarts = new Set([h(0, 20, 15), h(0, 20, 45)]);
    expect(minutesLibresConsecutives(h(0, 20), h(0, 21), quarts, 900)).toBe(15);
  });
});

describe('peutVoirArtiste', () => {
  it(`accepte un passage d'une heure avec ${SEUIL_MINUTES_VOIR_ARTISTE} minutes libres d'affilée`, () => {
    // 20h-21h, occupé seulement la première demi-heure : 30 min libres d'affilée à la fin.
    const quarts = new Set([h(0, 20), h(0, 20, 15)]);
    expect(peutVoirArtiste(h(0, 20), h(0, 21), quarts, 900)).toBe(true);
  });

  it('refuse un passage avec moins de 30 minutes libres, même scindées en plusieurs segments', () => {
    // Libre seulement à 20h00 et 20h45 (2×15 min), jamais 30 d'affilée.
    const quarts = new Set([h(0, 20, 15), h(0, 20, 30)]);
    expect(peutVoirArtiste(h(0, 20), h(0, 21), quarts, 900)).toBe(false);
  });

  it("accepte un passage plus court que le seuil dès qu'il est entièrement libre", () => {
    // Passage de 20 minutes seulement, entièrement libre.
    expect(peutVoirArtiste(h(0, 20), h(0, 20, 20), new Set(), 900)).toBe(true);
  });

  it("refuse un passage plus court que le seuil s'il n'est pas entièrement libre", () => {
    // Passage de 20 minutes, occupé sur un seul quart d'heure.
    const quarts = new Set([h(0, 20)]);
    expect(peutVoirArtiste(h(0, 20), h(0, 20, 20), quarts, 900)).toBe(false);
  });
});
