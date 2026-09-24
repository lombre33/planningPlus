/**
 * `ajusterTexteBlocAvecTroncature` (ui/impression.ts) — ajouté après le
 * retour d'Antoine du 2026-09-24 : un bloc trop court pour le nom complet,
 * même au plancher de police, doit montrer un début tronqué (« … ») plutôt
 * que rester coloré sans aucune information (illisible une fois imprimé,
 * l'infobulle du survol n'existant plus sur papier).
 */
import {describe, expect, it} from 'vitest';
import {ajusterTexteBlocAvecTroncature} from './impression';

describe('ajusterTexteBlocAvecTroncature', () => {
  it('rend le texte complet quand la place suffit', () => {
    const resultat = ajusterTexteBlocAvecTroncature('Bar', 400);
    expect(resultat?.texte).toBe('Bar');
  });

  it('tronque avec une ellipse quand même le plancher ne suffit pas pour le texte complet', () => {
    const resultat = ajusterTexteBlocAvecTroncature('Comptage entrée Village partenaire', 16);
    expect(resultat).not.toBeNull();
    expect(resultat?.texte.endsWith('…')).toBe(true);
    expect(resultat?.texte).not.toBe('Comptage entrée Village partenaire');
    expect(resultat?.texte.length).toBeGreaterThan(1); // au moins un caractère utile avant l'ellipse
  });

  it('retourne null seulement quand la place ne permet même pas un caractère avec l’ellipse', () => {
    expect(ajusterTexteBlocAvecTroncature('Comptage entrée Plage', 0)).toBeNull();
  });
});
