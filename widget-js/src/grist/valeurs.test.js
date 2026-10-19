import {describe, expect, it} from 'vitest';
import {
  decoderBool,
  decoderCouleur,
  decoderListe,
  decoderNombre,
  decoderNumeriqueOptionnel,
  decoderRef,
  decoderTexte,
  encoderListe,
  encoderRef,
} from './valeurs.js';

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

describe('Couleur', () => {
  it('garde une couleur hexadécimale, nommée ou fonctionnelle', () => {
    for (const couleur of ['#6366f1', '#fff', '#6366f180', 'red', 'rebeccapurple', 'transparent', 'rgb(10, 20, 30)',
      'rgba(10 20 30 / 50%)', 'hsl(200deg 50% 50%)', 'oklch(60% 0.2 250)']) {
      expect(decoderCouleur(couleur)).toBe(couleur);
    }
  });

  it('retire les blancs autour de la couleur', () => {
    expect(decoderCouleur('  #6366f1 ')).toBe('#6366f1');
  });

  it('décode une valeur absente ou qui n\'est pas du texte en chaîne vide', () => {
    for (const valeur of [null, undefined, 42, '', '   ']) { expect(decoderCouleur(valeur)).toBe(''); }
  });

  // La colonne est du texte libre, remplissable par tout éditeur du document, et les vues
  // la posent dans `style.background`, qui accepte `url(…)` : le navigateur de chaque personne
  // qui ouvre le planning irait chercher l'adresse.
  it('écarte toute valeur qui ferait charger une adresse ou lire une autre propriété', () => {
    for (const piege of [
      'url(https://exfil.example/c.png)',
      'url("https://exfil.example/c.png") no-repeat',
      'image-set("https://exfil.example/c.png" 1x)',
      'var(--x, url(https://exfil.example/c.png))',
      'rgb(var(--x, url(https://exfil.example/c.png)))',
      'red; background-image: url(https://exfil.example/c.png)',
      '#fff url(https://exfil.example/c.png)',
      'linear-gradient(red, blue)',
      '<img src=x onerror=alert(1)>',
    ]) {
      expect(decoderCouleur(piege), piege).toBe('');
    }
  });
});
