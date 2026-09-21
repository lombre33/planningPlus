import {describe, expect, it} from 'vitest';
import {resoudreIdsTables} from './tables';

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
