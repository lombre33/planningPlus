import {describe, expect, it} from 'vitest';
import {
  clesEtValeursParametresAlgorithme,
  heureCoupureDepuisLignes,
  HEURE_COUPURE_PAR_DEFAUT,
  parametresAlgorithmeDepuisLignes,
} from './parametres';
import {PARAMETRES_PAR_DEFAUT} from '../moteur/types';

describe('heureCoupureDepuisLignes', () => {
  it('lit l\'heure de coupure quand la clé est présente', () => {
    expect(heureCoupureDepuisLignes([{cle: 'heure_coupure_jour', valeur: '7'}])).toBe(7);
  });

  it('retombe sur le défaut (6h) quand la clé est absente', () => {
    expect(heureCoupureDepuisLignes([])).toBe(HEURE_COUPURE_PAR_DEFAUT);
  });

  it('retombe sur le défaut si la valeur n\'est pas un nombre', () => {
    expect(heureCoupureDepuisLignes([{cle: 'heure_coupure_jour', valeur: 'six'}])).toBe(HEURE_COUPURE_PAR_DEFAUT);
  });
});

describe('ParametresAlgorithme <-> Parametres', () => {
  it('fait l\'aller-retour pour les paramètres par défaut', () => {
    const lignes = clesEtValeursParametresAlgorithme(PARAMETRES_PAR_DEFAUT)
      .map(([cle, valeur]) => ({cle, valeur}));
    expect(parametresAlgorithmeDepuisLignes(lignes)).toEqual(PARAMETRES_PAR_DEFAUT);
  });

  it('retombe sur les valeurs par défaut quand la table est vide (document jamais configuré)', () => {
    expect(parametresAlgorithmeDepuisLignes([])).toEqual(PARAMETRES_PAR_DEFAUT);
  });

  it('ignore une clé au format invalide plutôt que de lever', () => {
    const lignes = [{cle: 'poids.equite', valeur: 'pas-un-nombre'}];
    expect(parametresAlgorithmeDepuisLignes(lignes).poids.equite).toBe(PARAMETRES_PAR_DEFAUT.poids.equite);
  });

  it('reflète une valeur modifiée', () => {
    const lignes = clesEtValeursParametresAlgorithme(PARAMETRES_PAR_DEFAUT)
      .map(([cle, valeur]) => ({cle, valeur: cle === 'poids.equite' ? '0.5' : valeur}));
    expect(parametresAlgorithmeDepuisLignes(lignes).poids.equite).toBe(0.5);
  });
});
