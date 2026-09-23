import {describe, expect, it} from 'vitest';
import type {Artiste} from '../domain/types';
import {
  classerReponseMacroCreneau, disponibilitesBenevolePourFestival, disponibilitesDepuisReponseMacroCreneau,
  disponibilitesDepuisSouhaitsArtistes, fusionnerDisponibilites, LIBELLES_REPONSE_PAR_DEFAUT,
} from './import-disponibilites';

describe('classerReponseMacroCreneau', () => {
  it('reconnaît les libellés par défaut', () => {
    expect(classerReponseMacroCreneau('Tout le créneau')).toBe('Disponible');
    expect(classerReponseMacroCreneau('Pas disponible du tout')).toBe('Indisponible');
  });

  it('tolère la casse, les espaces et les accents', () => {
    expect(classerReponseMacroCreneau('  tout LE creneau ')).toBe('Disponible');
    expect(classerReponseMacroCreneau('PAS DISPONIBLE DU TOUT')).toBe('Indisponible');
  });

  it('retombe sur "Manuelle" pour toute autre valeur, y compris vide ou absente', () => {
    expect(classerReponseMacroCreneau('disponible mais pas avant 18h')).toBe('Manuelle');
    expect(classerReponseMacroCreneau('')).toBe('Manuelle');
    expect(classerReponseMacroCreneau(null)).toBe('Manuelle');
    expect(classerReponseMacroCreneau(undefined)).toBe('Manuelle');
  });

  it('accepte des libellés personnalisés', () => {
    const libelles = {toutLeCreneau: ['Oui, tout le temps'], pasDisponibleDuTout: ['Non, jamais']};
    expect(classerReponseMacroCreneau('Oui, tout le temps', libelles)).toBe('Disponible');
    expect(classerReponseMacroCreneau('Tout le créneau', libelles)).toBe('Manuelle');
  });
});

describe('disponibilitesDepuisReponseMacroCreneau', () => {
  const macro = {Debut: 0, Fin: 1800}; // deux quarts d'heure

  it('étale "tout le créneau" sur tous les quarts d\'heure', () => {
    const resultat = disponibilitesDepuisReponseMacroCreneau(1, macro, 'Tout le créneau');
    expect(resultat.statut).toBe('Disponible');
    expect(resultat.disponibilites).toEqual([
      {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 900, Statut: 'Disponible', Artiste: null},
    ]);
  });

  it('étale "pas disponible du tout" sur tous les quarts d\'heure', () => {
    const resultat = disponibilitesDepuisReponseMacroCreneau(1, macro, 'Pas disponible du tout');
    expect(resultat.statut).toBe('Indisponible');
    expect(resultat.disponibilites).toHaveLength(2);
    expect(resultat.disponibilites.every((d) => d.Statut === 'Indisponible')).toBe(true);
  });

  it('ne génère rien pour une réponse "manuelle" : la saisie se fait à la main ailleurs', () => {
    const resultat = disponibilitesDepuisReponseMacroCreneau(1, macro, 'disponible après 20h seulement');
    expect(resultat.statut).toBe('Manuelle');
    expect(resultat.disponibilites).toEqual([]);
  });
});

describe('disponibilitesDepuisSouhaitsArtistes', () => {
  const artistes: Artiste[] = [
    {id: 1, Nom: 'Marée Haute', Lieu: 1, Debut: 0, Fin: 900},
    {id: 2, Nom: 'Les Ondes Vertes', Lieu: 1, Debut: 900, Fin: 1800},
  ];

  it('relie un nom souhaité (insensible à la casse/accents) aux quarts d\'heure du passage', () => {
    const resultat = disponibilitesDepuisSouhaitsArtistes(1, ['maree haute'], artistes);
    expect(resultat).toEqual([{Benevole: 1, Quart_heure: 0, Statut: 'Artiste', Artiste: 1}]);
  });

  it('ignore un nom qui ne correspond à aucun artiste connu, sans erreur', () => {
    const resultat = disponibilitesDepuisSouhaitsArtistes(1, ['Artiste inconnu'], artistes);
    expect(resultat).toEqual([]);
  });

  it('gère plusieurs artistes souhaités', () => {
    const resultat = disponibilitesDepuisSouhaitsArtistes(1, ['Marée Haute', 'Les Ondes Vertes'], artistes);
    expect(resultat.map((d) => d.Artiste)).toEqual([1, 2]);
  });
});

describe('fusionnerDisponibilites', () => {
  it("la surcharge (souhait d'artiste) l'emporte sur la base (réponse macro-créneau) au même quart d'heure", () => {
    const base = disponibilitesDepuisReponseMacroCreneau(1, {Debut: 0, Fin: 1800}, 'Tout le créneau').disponibilites;
    const surcharge = disponibilitesDepuisSouhaitsArtistes(1, ['A'], [{id: 9, Nom: 'A', Lieu: 1, Debut: 900, Fin: 1800}]);
    const fusion = fusionnerDisponibilites(base, surcharge);
    expect(fusion).toEqual([
      {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 900, Statut: 'Artiste', Artiste: 9},
    ]);
  });

  it('ignore les libellés par défaut exportés pour vérifier la valeur exacte attendue', () => {
    expect(LIBELLES_REPONSE_PAR_DEFAUT.toutLeCreneau).toContain('Tout le créneau');
    expect(LIBELLES_REPONSE_PAR_DEFAUT.pasDisponibleDuTout).toContain('Pas disponible du tout');
  });
});

describe('disponibilitesBenevolePourFestival', () => {
  const artistes: Artiste[] = [{id: 9, Nom: 'Marée Haute', Lieu: 1, Debut: 1800, Fin: 2700}];

  it('combine plusieurs macro-créneaux et les souhaits d\'artiste, et signale les réponses manuelles', () => {
    const reponses = new Map([
      [1, {macro: {Debut: 0, Fin: 1800}, reponse: 'Tout le créneau'}],
      [2, {macro: {Debut: 1800, Fin: 3600}, reponse: 'Pas disponible du tout'}],
      [3, {macro: {Debut: 3600, Fin: 5400}, reponse: 'dispo après 18h'}],
    ]);
    const resultat = disponibilitesBenevolePourFestival(1, reponses, ['Marée Haute'], artistes);

    expect(resultat.macroCreneauxAManuel).toEqual([3]);
    // Macro 1 : 2 quarts "Disponible". Macro 2 : 2 quarts "Indisponible", mais le
    // souhait d'artiste (1800-2700) écrase le premier de ces deux quarts en "Artiste".
    expect(resultat.disponibilites).toEqual([
      {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 900, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 1800, Statut: 'Artiste', Artiste: 9},
      {Benevole: 1, Quart_heure: 2700, Statut: 'Indisponible', Artiste: null},
    ]);
  });

  it('sans aucune réponse ni souhait, ne produit rien', () => {
    const resultat = disponibilitesBenevolePourFestival(1, new Map(), [], []);
    expect(resultat).toEqual({disponibilites: [], macroCreneauxAManuel: []});
  });
});
