import {describe, expect, it} from 'vitest';
import {
  decoderBool,
  decoderListe,
  decoderNombre,
  decoderNumeriqueOptionnel,
  decoderRef,
  decoderTexte,
  encoderListe,
  encoderRef,
} from './valeurs';

describe('Ref', () => {
  it('encode un id vers le scalaire attendu par Grist', () => {
    expect(encoderRef(42)).toBe(42);
  });

  it('encode null vers 0 (valeur par défaut Grist pour une colonne Ref vide)', () => {
    expect(encoderRef(null)).toBe(0);
  });

  it('décode un entier non nul en id', () => {
    expect(decoderRef(17)).toBe(17);
  });

  it('décode 0 en null', () => {
    expect(decoderRef(0)).toBeNull();
  });

  it('décode une valeur non numérique en null (colonne absente ou mal typée)', () => {
    expect(decoderRef(null)).toBeNull();
    expect(decoderRef(undefined)).toBeNull();
    expect(decoderRef('17')).toBeNull();
  });

  it('fait l\'aller-retour pour un id quelconque', () => {
    for (const id of [1, 2, 999]) {
      expect(decoderRef(encoderRef(id))).toBe(id);
    }
  });

  it('fait l\'aller-retour pour null', () => {
    expect(decoderRef(encoderRef(null))).toBeNull();
  });
});

describe('ChoiceList', () => {
  it('encode une liste avec le code objet L', () => {
    expect(encoderListe(['Majeur', 'SST'])).toEqual(['L', 'Majeur', 'SST']);
  });

  it('encode une liste vide en tuple L sans éléments', () => {
    expect(encoderListe([])).toEqual(['L']);
  });

  it('décode un tuple L en tableau', () => {
    expect(decoderListe(['L', 'Majeur', 'SST'])).toEqual(['Majeur', 'SST']);
  });

  it('décode un tuple L vide en tableau vide', () => {
    expect(decoderListe(['L'])).toEqual([]);
  });

  it('décode null (colonne jamais renseignée) en tableau vide', () => {
    expect(decoderListe(null)).toEqual([]);
  });

  it('décode une valeur qui ne porte pas le code L en tableau vide', () => {
    expect(decoderListe(['Majeur', 'SST'])).toEqual([]);
    expect(decoderListe('Majeur')).toEqual([]);
  });

  it('fait l\'aller-retour pour une liste quelconque', () => {
    const valeurs = ['Majeur', 'Permis B', 'Anglais'];
    expect(decoderListe(encoderListe(valeurs))).toEqual(valeurs);
  });
});

describe('scalaires', () => {
  it('decoderTexte traite une valeur non-chaîne comme chaîne vide', () => {
    expect(decoderTexte('bonjour')).toBe('bonjour');
    expect(decoderTexte(null)).toBe('');
    expect(decoderTexte(undefined)).toBe('');
    expect(decoderTexte(42)).toBe('');
  });

  it('decoderNombre traite une valeur non-numérique comme 0', () => {
    expect(decoderNombre(42)).toBe(42);
    expect(decoderNombre(null)).toBe(0);
    expect(decoderNombre('42')).toBe(0);
  });

  it('decoderNumeriqueOptionnel distingue un 0 explicite d\'une absence de valeur', () => {
    expect(decoderNumeriqueOptionnel(0)).toBe(0);
    expect(decoderNumeriqueOptionnel(null)).toBeNull();
    expect(decoderNumeriqueOptionnel(undefined)).toBeNull();
  });

  it('decoderBool ne considère que true comme vrai', () => {
    expect(decoderBool(true)).toBe(true);
    expect(decoderBool(false)).toBe(false);
    expect(decoderBool(null)).toBe(false);
    expect(decoderBool(1)).toBe(false);
  });
});
