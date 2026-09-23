import {describe, expect, it} from 'vitest';
import type {LigneBrute} from './brut';
import {colonnesDeTable, tablesDuDocument} from './colonnes';

const lignesTables: LigneBrute[] = [
  {id: 3, tableId: 'Benevoles'},
  {id: 7, tableId: 'Artistes'},
];

const lignesColonnes: LigneBrute[] = [
  {id: 30, parentId: 3, colId: 'Nom', label: 'Nom', type: 'Text'},
  {id: 31, parentId: 3, colId: 'Souhaits_artistes', label: 'Souhaits artistes', type: 'ChoiceList'},
  {id: 32, parentId: 3, colId: 'Dispo_vendredi', label: 'Dispo vendredi', type: 'Text'},
  {id: 70, parentId: 7, colId: 'Nom', label: 'Nom', type: 'Text'}, // même colId, autre table : ne doit pas se mélanger
];

describe('colonnesDeTable', () => {
  it("ne retourne que les colonnes dont parentId correspond à l'id de la table visée", () => {
    const resultat = colonnesDeTable(lignesTables, lignesColonnes, 'Benevoles');
    expect(resultat).toEqual([
      {colId: 'Nom', label: 'Nom', type: 'Text'},
      {colId: 'Souhaits_artistes', label: 'Souhaits artistes', type: 'ChoiceList'},
      {colId: 'Dispo_vendredi', label: 'Dispo vendredi', type: 'Text'},
    ]);
  });

  it('ne mélange pas les colonnes de deux tables qui partagent un colId', () => {
    const resultat = colonnesDeTable(lignesTables, lignesColonnes, 'Artistes');
    expect(resultat).toEqual([{colId: 'Nom', label: 'Nom', type: 'Text'}]);
  });

  it('tableau vide si tableIdReel ne correspond à aucune table connue', () => {
    expect(colonnesDeTable(lignesTables, lignesColonnes, 'Table_inconnue')).toEqual([]);
  });

  it("retombe sur colId comme libellé si label est absent", () => {
    const resultat = colonnesDeTable(
      lignesTables, [{id: 33, parentId: 3, colId: 'Sans_label', type: 'Text'}], 'Benevoles',
    );
    expect(resultat).toEqual([{colId: 'Sans_label', label: 'Sans_label', type: 'Text'}]);
  });
});

describe('tablesDuDocument', () => {
  it('liste les tables de données du document, triées, sans les tables système Grist', () => {
    const resultat = tablesDuDocument([
      {id: 3, tableId: 'Benevoles'},
      {id: 7, tableId: 'Artistes'},
      {id: 9, tableId: '_grist_Views'},
    ]);
    expect(resultat).toEqual([{tableId: 'Artistes'}, {tableId: 'Benevoles'}]);
  });

  it("inclut une table qui n'est pas la nôtre (celle où vivent réellement les bénévoles d'Antoine, par exemple)", () => {
    const resultat = tablesDuDocument([{id: 1, tableId: 'Benevoles_festival_2026'}]);
    expect(resultat).toEqual([{tableId: 'Benevoles_festival_2026'}]);
  });

  it('tableau vide sur un document sans aucune table de données', () => {
    expect(tablesDuDocument([])).toEqual([]);
  });
});
