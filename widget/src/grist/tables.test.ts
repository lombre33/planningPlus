import {describe, expect, it} from 'vitest';
import {idsReelsDeTest, LIBELLE_PAR_TABLE, resoudreIdsTables} from './tables';

describe('resoudreIdsTables', () => {
  it('résout un identifiant réel identique à l\'identifiant de schéma', () => {
    expect(resoudreIdsTables(['Groupes', 'Places'])).toMatchObject({Groupes: 'Groupes', Places: 'Places'});
  });

  it('résout un identifiant réel dérivé du titre, différent du schéma (Positions_groupe -> Positions_de_groupe)', () => {
    expect(resoudreIdsTables(['Positions_de_groupe'])).toEqual({Positions_groupe: 'Positions_de_groupe'});
  });

  it('résout Souhaits_missions -> Souhaits_de_mission, vu empiriquement sur le document de test', () => {
    expect(resoudreIdsTables(['Souhaits_de_mission'])).toEqual({Souhaits_missions: 'Souhaits_de_mission'});
  });

  it('tolère les accents de l\'identifiant réel (Équipes vs Equipes)', () => {
    expect(resoudreIdsTables(['Equipes'])).toEqual({Equipes: 'Equipes'});
  });

  it('omet une table canonique absente du document plutôt que de lever', () => {
    expect(resoudreIdsTables(['Groupes'])).toEqual({Groupes: 'Groupes'});
  });

  it('ignore une table réelle qui ne correspond à aucune table canonique', () => {
    expect(resoudreIdsTables(['Table1', 'Groupes'])).toEqual({Groupes: 'Groupes'});
  });
});

describe('idsReelsDeTest', () => {
  it('résout, une fois passé à resoudreIdsTables, toutes les tables canoniques (document complet)', () => {
    expect(resoudreIdsTables(idsReelsDeTest())).toEqual(
      Object.fromEntries(Object.keys(LIBELLE_PAR_TABLE).map((c) => [c, expect.any(String)])),
    );
  });

  it('résout précisément les tables dont le libellé a fait dériver un identifiant différent du schéma', () => {
    const resolues = resoudreIdsTables(idsReelsDeTest());
    expect(resolues.Positions_groupe).toBe(LIBELLE_PAR_TABLE.Positions_groupe);
    expect(resolues.Souhaits_missions).toBe(LIBELLE_PAR_TABLE.Souhaits_missions);
  });

  it('omet une table canonique du résultat, pour simuler un document à qui elle manque', () => {
    const idsReels = idsReelsDeTest(['Macro_creneaux']);
    expect(idsReels).not.toContain(LIBELLE_PAR_TABLE.Macro_creneaux);
    expect(resoudreIdsTables(idsReels)).not.toHaveProperty('Macro_creneaux');
    expect(resoudreIdsTables(idsReels)).toHaveProperty('Equipes');
  });
});
