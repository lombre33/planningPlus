/**
 * `ajusterTexteBlocAvecTroncature` (ui/impression.ts) — ajouté après le
 * retour d'Antoine du 2026-09-24 : un bloc trop court pour le nom complet,
 * même au plancher de police, doit montrer un début tronqué (« … ») plutôt
 * que rester coloré sans aucune information (illisible une fois imprimé,
 * l'infobulle du survol n'existant plus sur papier).
 */
import {describe, expect, it} from 'vitest';
import {ajusterTexteBlocAvecEnveloppe, ajusterTexteBlocAvecTroncature} from './impression';

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

/**
 * `ajusterTexteBlocAvecEnveloppe` — ajouté après le retour d'Antoine du
 * 2026-09-24 14h11-14h14 : sur les plannings équipes, un nom de bénévole ne
 * doit plus jamais céder la place au code de l'indicatif faute de place ;
 * quand même le candidat le plus court ne tient pas sur une ligne, le texte
 * s'enveloppe sur plusieurs lignes (jamais de troncature, jamais `null`).
 */
describe('ajusterTexteBlocAvecEnveloppe', () => {
  it('rend le candidat le plus complet sur une ligne quand la place suffit, comme ajusterTexteBloc', () => {
    const resultat = ajusterTexteBlocAvecEnveloppe(['Marie (A1)', 'Marie'], 400);
    expect(resultat).toEqual({texte: 'Marie (A1)', taillePolicePx: 11});
    expect(resultat.enveloppe).toBeUndefined();
  });

  it('ne renvoie jamais null : enveloppe le candidat le plus COURT au plancher quand rien ne tient sur une ligne (limite la hauteur)', () => {
    const resultat = ajusterTexteBlocAvecEnveloppe(['Maximilienne-Christodoulopoulos (A1)', 'Maximilienne-Christodoulopoulos'], 16);
    expect(resultat.texte).toBe('Maximilienne-Christodoulopoulos');
    expect(resultat.enveloppe).toBe(true);
    expect(resultat.taillePolicePx).toBe(6); // plancher par défaut (TAILLES_POLICE_BLOC_PX)
  });

  it('respecte un plancher personnalisé (ex. plancher écran, jamais 6px)', () => {
    const resultat = ajusterTexteBlocAvecEnveloppe(['Maximilienne-Christodoulopoulos (A1)'], 16, [11, 10, 9, 8]);
    expect(resultat.enveloppe).toBe(true);
    expect(resultat.taillePolicePx).toBe(8);
  });
});
