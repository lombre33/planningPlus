import {describe, expect, it} from 'vitest';
import type {Disponibilite} from '../domain/types';
import {
  disponibilitesApresBasculement, disponibilitesApresChoixArtiste, prochainStatutCellule,
} from './edition-disponibilites';

describe('prochainStatutCellule', () => {
  it('bascule Indisponible -> Disponible -> Indisponible', () => {
    expect(prochainStatutCellule('Indisponible')).toBe('Disponible');
    expect(prochainStatutCellule('Disponible')).toBe('Indisponible');
  });

  it('efface un statut "Artiste" vers Indisponible plutôt que de sauter à Disponible', () => {
    expect(prochainStatutCellule('Artiste')).toBe('Indisponible');
  });
});

describe('disponibilitesApresBasculement', () => {
  const quarts = [0, 900, 1800];

  it("ne touche que le quart basculé, garde les autres tels quels", () => {
    const index = new Map<number, Disponibilite>([
      [0, {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null}],
      [1800, {Benevole: 1, Quart_heure: 1800, Statut: 'Artiste', Artiste: 5}],
    ]);
    const resultat = disponibilitesApresBasculement(1, quarts, index, 900);
    expect(resultat).toEqual([
      {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 900, Statut: 'Disponible', Artiste: null}, // absent -> Indisponible -> bascule -> Disponible
      {Benevole: 1, Quart_heure: 1800, Statut: 'Artiste', Artiste: 5},
    ]);
  });

  it('un quart absent (indisponible par défaut) devient explicitement Indisponible une fois matérialisé', () => {
    const resultat = disponibilitesApresBasculement(1, [0], new Map(), 900);
    expect(resultat).toEqual([{Benevole: 1, Quart_heure: 0, Statut: 'Indisponible', Artiste: null}]);
  });
});

describe('disponibilitesApresChoixArtiste', () => {
  const quarts = [0, 900];

  it('affecte le souhait d\'artiste au seul quart visé', () => {
    const resultat = disponibilitesApresChoixArtiste(1, quarts, new Map(), 900, 7);
    expect(resultat).toEqual([
      {Benevole: 1, Quart_heure: 0, Statut: 'Indisponible', Artiste: null},
      {Benevole: 1, Quart_heure: 900, Statut: 'Artiste', Artiste: 7},
    ]);
  });

  it('efface un souhait existant quand artisteId est null', () => {
    const index = new Map<number, Disponibilite>([[900, {Benevole: 1, Quart_heure: 900, Statut: 'Artiste', Artiste: 7}]]);
    const resultat = disponibilitesApresChoixArtiste(1, quarts, index, 900, null);
    expect(resultat[1]).toEqual({Benevole: 1, Quart_heure: 900, Statut: 'Indisponible', Artiste: null});
  });
});
