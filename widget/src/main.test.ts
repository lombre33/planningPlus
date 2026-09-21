import {describe, expect, it} from 'vitest';
import {construireResume} from './main';

describe('construireResume', () => {
  it('trie les tables par identifiant', () => {
    const resume = construireResume({SousCreneaux: 24, Benevoles: 70, Artistes: 20});
    expect(resume).toEqual([
      {tableId: 'Artistes', lignes: 20},
      {tableId: 'Benevoles', lignes: 70},
      {tableId: 'SousCreneaux', lignes: 24},
    ]);
  });

  it("rend un tableau vide pour un document sans table", () => {
    expect(construireResume({})).toEqual([]);
  });
});
