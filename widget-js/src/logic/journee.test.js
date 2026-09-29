import {describe, expect, it} from 'vitest';
import {Magasin} from '../store.js';
import {regrouperParJour} from './derive.js';
import {
  appliquerMouvements, binomesDuBenevole, construireJournee, evaluerMouvements, jourAffiche, mesurer, souhaitsDuBenevole,
} from './journee.js';
import {HUGO, jeuJournee, LEA, NINA, PAUL, REMI, TOM, ZOE} from './journee-fixtures.js';

function journeeDe(options) {
  const m = new Magasin(jeuJournee(options));
  return construireJournee(m, jourAffiche(regrouperParJour(m.macroCreneaux), null));
}

describe('construireJournee', () => {
  it('range les indicatifs du jour par code et retient qui est absent à l’appel', () => {
    const j = journeeDe();
    expect(j.groupes.map((g) => g.groupe.Code)).toEqual(['A1', 'A2', 'B1', 'R1']);
    expect(j.groupes.find((g) => g.groupe.Code === 'B1').critique).toBe(true);
    expect(j.groupes.find((g) => g.groupe.Code === 'R1').restauration).toBe(true);
    expect([...j.absents]).toEqual([REMI]);
  });

  it('ne compte pas un binôme dont un membre est absent à l’appel', () => {
    const j = journeeDe();
    expect(j.paires).toEqual([[LEA, HUGO], [TOM, PAUL]]);
  });
});

describe('mesurer', () => {
  it('compte comme à couvrir une place vide et une place tenue par un absent', () => {
    const mesures = mesurer(journeeDe());
    expect(mesures.totalPlaces).toBe(8);
    expect(mesures.aCouvrir).toEqual([4, 5, 8]);
    expect(mesures.couvertes).toBe(5);
  });

  it('compte les binômes réunis, les artistes vus et la restauration tenue', () => {
    const mesures = mesurer(journeeDe());
    expect(mesures).toMatchObject({binomes: 1, binomesTotal: 2, artistes: 1, artistesTotal: 1});
    expect([...mesures.restauTenue]).toEqual([NINA]);
  });

  it('ne juge un souhait d’artiste que sur les quarts du jour affiché', () => {
    const jeu = jeuJournee();
    // Le même souhait, déclaré un autre jour : ne compte pas ici.
    for (const d of jeu.disponibilites) { if (d.Statut === 'Artiste') { d.Quart_heure += 86400; } }
    const m = new Magasin(jeu);
    const j = construireJournee(m, regrouperParJour(m.macroCreneaux)[0]);
    expect(mesurer(j).artistesTotal).toBe(0);
  });
});

describe('evaluerMouvements', () => {
  it('dit ce qu’un déplacement gagne et sacrifie', () => {
    const j = journeeDe();
    // Léa quitte A1 pour A2 (18h-22h) : elle perd Hugo et rate la Fanfare de 19h.
    const e = evaluerMouvements(j, j.occupantParPlace, [{benevoleId: LEA, de: 1, vers: 4}, {benevoleId: ZOE, de: null, vers: 1}]);
    expect(e.binomesPerdus).toEqual([[LEA, HUGO]]);
    expect(e.artistesPerdus).toEqual([[LEA, 1]]);
    expect(e.dACouvrir).toBe(-1);
  });

  it('voit un binôme gagné', () => {
    const j = journeeDe();
    const e = evaluerMouvements(j, j.occupantParPlace, [{benevoleId: PAUL, de: null, vers: 4}]);
    expect(e.binomesGagnes).toEqual([[TOM, PAUL]]);
  });

  it('applique les départs avant les arrivées, pour qu’un échange ne s’annule pas', () => {
    const occupant = new Map([[1, LEA], [2, HUGO]]);
    const apres = appliquerMouvements(occupant, [{benevoleId: LEA, de: 1, vers: 2}, {benevoleId: HUGO, de: 2, vers: 1}]);
    expect([...apres]).toEqual([[1, HUGO], [2, LEA]]);
  });
});

describe('état d’une personne', () => {
  it('dit si elle voit chaque artiste souhaité, selon l’occupation donnée', () => {
    const j = journeeDe();
    expect(souhaitsDuBenevole(j, j.occupantParPlace, LEA).map(({artiste, vu}) => [artiste.Nom, vu])).toEqual([['Fanfare', true]]);
    // Léa sur A2 (18h-22h) ne verrait plus la Fanfare (19h-19h45).
    const deplacee = appliquerMouvements(j.occupantParPlace, [{benevoleId: LEA, de: 1, vers: 4}]);
    expect(souhaitsDuBenevole(j, deplacee, LEA)[0].vu).toBe(false);
  });

  it('dit si chaque binôme souhaité est réuni, et où est le partenaire sinon', () => {
    const j = journeeDe();
    expect(binomesDuBenevole(j, j.occupantParPlace, LEA)).toEqual([{partenaireId: HUGO, reunis: true, codes: ['A1']}]);
    expect(binomesDuBenevole(j, j.occupantParPlace, TOM)).toEqual([{partenaireId: PAUL, reunis: false, codes: []}]);
  });
});
