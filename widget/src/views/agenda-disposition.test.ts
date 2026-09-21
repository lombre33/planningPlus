import {describe, expect, it} from 'vitest';
import {
  construirePlageJournaliere, graduationsHoraires, graduationsMinuit, longueurAxePx, positionCreneau,
} from './agenda-disposition';
import {regrouperParJour} from '../logic/derive';
import {epochDepuisHeureLocale} from '../temps';
import type {MacroCreneau} from '../domain/types';

function macro(id: number, jour: {annee: number; mois: number; jour: number}, heureDebut: number, heureFin: number): MacroCreneau {
  return {
    id,
    Nom: `Macro ${id}`,
    Debut: epochDepuisHeureLocale({...jour, heures: heureDebut}),
    Fin: epochDepuisHeureLocale({...jour, heures: heureFin}),
  };
}

const VENDREDI = {annee: 2026, mois: 7, jour: 18};
const DIMANCHE = {annee: 2026, mois: 7, jour: 20}; // deux jours plus tard : samedi n'existe pas dans le comparatif
const MINUTES_PAR_JOUR = 24 * 60;

describe('intégration avec regrouperParJour (logic/derive.ts) — jour de festival', () => {
  // Vérifie concrètement ce que le comparatif affiche : un sous-créneau de
  // 1h du matin, à l'intérieur d'une soirée qui a commencé la veille, doit
  // rester rattaché au jour de festival de la veille (§6.2), pas glisser
  // dans le jour civil suivant. `regrouperParJour` groupe par
  // macro-créneau, donc c'est le macro-créneau englobant (la soirée
  // 18h–2h) qu'il faut vérifier, avec son sous-créneau de 1h du matin.
  it("rattache un sous-créneau d'1h du matin au jour de festival commencé la veille, pas au jour civil suivant", () => {
    const soiree = macro(1, VENDREDI, 18, 26); // 18h -> 2h le samedi matin
    const jours = regrouperParJour([macro(2, VENDREDI, 10, 18), soiree]);

    expect(jours).toHaveLength(1); // un seul jour de festival, pas deux
    expect(jours[0]?.libelle).toContain('juillet'); // le vendredi, pas le samedi
    expect(jours[0]?.macros.map((m) => m.id)).toEqual([2, 1]);

    // Le sous-créneau d'1h du matin est un simple découpage de `soiree` :
    // en faire partie suffit à hériter du même jour de festival.
    const uneHeureDuMatin = epochDepuisHeureLocale({...VENDREDI, jour: VENDREDI.jour + 1, heures: 1});
    expect(uneHeureDuMatin).toBeGreaterThan(soiree.Debut);
    expect(uneHeureDuMatin).toBeLessThan(soiree.Fin);
  });

  it("un macro-créneau qui commence après la coupure (7h) ouvre bien un nouveau jour de festival", () => {
    const jours = regrouperParJour([
      macro(1, VENDREDI, 10, 18),
      macro(2, {...VENDREDI, jour: VENDREDI.jour + 1}, 7, 9),
    ]);
    expect(jours).toHaveLength(2);
  });
});

describe('construirePlageJournaliere', () => {
  it("couvre de la première heure de début à la dernière heure de fin, en minutes depuis minuit local", () => {
    const plage = construirePlageJournaliere([
      [macro(1, VENDREDI, 10, 18)],
    ]);
    expect(plage).toEqual({minMinute: 10 * 60, maxMinute: 18 * 60});
  });

  it("prend l'union de jours non consécutifs, sans que l'écart de dates n'entre en compte", () => {
    const plage = construirePlageJournaliere([
      [macro(1, VENDREDI, 10, 18)],
      [macro(2, DIMANCHE, 12, 20)],
    ]);
    // Seules les heures du jour comptent (10h-20h) : le fait que dimanche
    // soit deux jours après vendredi (samedi absent) n'élargit pas la plage.
    expect(plage).toEqual({minMinute: 10 * 60, maxMinute: 20 * 60});
  });

  it('ignore un jour sans macro-créneau', () => {
    const plage = construirePlageJournaliere([[], [macro(1, VENDREDI, 10, 18)]]);
    expect(plage).toEqual({minMinute: 10 * 60, maxMinute: 18 * 60});
  });

  it("retombe sur une plage par défaut (9h-18h) quand aucun macro-créneau n'existe, pour rester affichable sur un document neuf", () => {
    expect(construirePlageJournaliere([])).toEqual({minMinute: 9 * 60, maxMinute: 18 * 60});
    expect(construirePlageJournaliere([[], []])).toEqual({minMinute: 9 * 60, maxMinute: 18 * 60});
  });
});

describe('positionCreneau', () => {
  it('place un créneau qui commence au début de la plage à un décalage nul', () => {
    const minuit = epochDepuisHeureLocale({...VENDREDI, heures: 0});
    const plage = {minMinute: 10 * 60, maxMinute: 18 * 60};
    const debut = epochDepuisHeureLocale({...VENDREDI, heures: 10});
    const fin = epochDepuisHeureLocale({...VENDREDI, heures: 11});
    expect(positionCreneau({Debut: debut, Fin: fin}, minuit, plage, 2)).toEqual({
      decalagePx: 0,
      longueurPx: 120, // 1h = 60 min * 2px/min
    });
  });

  it('deux jours non consécutifs positionnent leurs créneaux de manière identique à heure de jour égale', () => {
    const plage = {minMinute: 10 * 60, maxMinute: 18 * 60};
    const positionVendredi = positionCreneau(
      {Debut: epochDepuisHeureLocale({...VENDREDI, heures: 12}), Fin: epochDepuisHeureLocale({...VENDREDI, heures: 13})},
      epochDepuisHeureLocale({...VENDREDI, heures: 0}), plage, 2,
    );
    const positionDimanche = positionCreneau(
      {Debut: epochDepuisHeureLocale({...DIMANCHE, heures: 12}), Fin: epochDepuisHeureLocale({...DIMANCHE, heures: 13})},
      epochDepuisHeureLocale({...DIMANCHE, heures: 0}), plage, 2,
    );
    expect(positionVendredi).toEqual(positionDimanche);
  });
});

describe('positionCreneau — macro-créneau qui déborde sur le lendemain', () => {
  it("reste un seul bloc continu au-delà de 24h, sans repli sur le jour suivant", () => {
    const minuit = epochDepuisHeureLocale({...VENDREDI, heures: 0});
    const plage = construirePlageJournaliere([[
      macro(1, VENDREDI, 18, 26), // 18h -> 2h du matin le lendemain
    ]]);
    expect(plage).toEqual({minMinute: 18 * 60, maxMinute: 26 * 60});

    const debut = epochDepuisHeureLocale({...VENDREDI, heures: 22});
    const fin = epochDepuisHeureLocale({...VENDREDI, heures: 26}); // 2h le lendemain
    const position = positionCreneau({Debut: debut, Fin: fin}, minuit, plage, 2);
    // 22h -> (22-18)*60*2 = 480 ; durée 4h -> 4*60*2 = 480. Aucun repli à 0.
    expect(position).toEqual({decalagePx: 480, longueurPx: 480});
  });
});

describe('graduationsMinuit', () => {
  it("ne pose aucun marqueur quand la plage ne franchit pas minuit", () => {
    expect(graduationsMinuit({minMinute: 10 * 60, maxMinute: 18 * 60}, 2)).toEqual([]);
  });

  it("pose un marqueur à chaque minuit franchi par une plage qui déborde sur le lendemain", () => {
    // 18h -> 26h (2h du matin) : un seul minuit franchi, à 24h.
    const marqueurs = graduationsMinuit({minMinute: 18 * 60, maxMinute: 26 * 60}, 2);
    expect(marqueurs).toEqual([(24 * 60 - 18 * 60) * 2]);
  });

  it('pose un marqueur par minuit franchi sur une plage de plusieurs jours', () => {
    const marqueurs = graduationsMinuit({minMinute: 0, maxMinute: 3 * MINUTES_PAR_JOUR}, 1);
    expect(marqueurs).toEqual([MINUTES_PAR_JOUR, 2 * MINUTES_PAR_JOUR, 3 * MINUTES_PAR_JOUR]);
  });
});

describe('longueurAxePx', () => {
  it('multiplie la durée de la plage par le nombre de pixels par minute', () => {
    expect(longueurAxePx({minMinute: 10 * 60, maxMinute: 12 * 60}, 2)).toBe(240);
  });
});

describe('graduationsHoraires', () => {
  it('pose une graduation par heure pleine depuis le début de la plage jusqu’à sa fin incluse', () => {
    const graduations = graduationsHoraires({minMinute: 10 * 60, maxMinute: 12 * 60}, 2);
    expect(graduations).toEqual([
      {libelle: '10h', decalagePx: 0},
      {libelle: '11h', decalagePx: 120},
      {libelle: '12h', decalagePx: 240},
    ]);
  });

  it("affiche l'heure du jour même après minuit (soirée qui déborde sur le lendemain)", () => {
    const graduations = graduationsHoraires({minMinute: 23 * 60, maxMinute: 26 * 60}, 1);
    expect(graduations.map((g) => g.libelle)).toEqual(['23h', '00h', '01h', '02h']);
  });
});
