import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {appliquerTheme, choisirTheme, marqueEtReglages, ouvrirReglages, themeMemorise} from './reglages.js';

const racineHtml = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  racineHtml().removeAttribute('data-theme');
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
  racineHtml().removeAttribute('data-theme');
});

describe('thème', () => {
  it('« Système » par défaut : aucun attribut, la préférence du système décide', () => {
    expect(themeMemorise()).toBe('system');
    appliquerTheme(themeMemorise());
    expect(racineHtml().hasAttribute('data-theme')).toBe(false);
  });

  it('un choix se mémorise et se pose sur <html> ; « Système » retire l’attribut', () => {
    choisirTheme('dark');
    expect(racineHtml().getAttribute('data-theme')).toBe('dark');
    expect(themeMemorise()).toBe('dark');
    choisirTheme('light');
    expect(racineHtml().getAttribute('data-theme')).toBe('light');
    choisirTheme('system');
    expect(racineHtml().hasAttribute('data-theme')).toBe(false);
    expect(themeMemorise()).toBe('system');
  });

  it('une valeur mémorisée inconnue vaut « Système »', () => {
    localStorage.setItem('planningplus_theme', 'violet');
    expect(themeMemorise()).toBe('system');
    appliquerTheme('violet');
    expect(racineHtml().hasAttribute('data-theme')).toBe(false);
  });

  it('sans stockage (navigation privée, données bloquées) : le choix vaut pour la session, sans erreur', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqué'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqué'); });
    expect(themeMemorise()).toBe('system');
    expect(() => choisirTheme('dark')).not.toThrow();
    expect(racineHtml().getAttribute('data-theme')).toBe('dark');
  });
});

describe('Réglages', () => {
  const onglet = (libelle) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent === libelle);
  const panneauVisible = () => [...document.querySelectorAll('[role="tabpanel"]')].filter((p) => !p.hidden);

  it('s’ouvre sur l’onglet Thème, qui coche le thème mémorisé et l’applique au changement', () => {
    choisirTheme('light');
    ouvrirReglages();
    expect(document.querySelector('.modal h3').textContent).toBe('Réglages');
    expect([...document.querySelectorAll('[role="tab"]')].map((b) => b.textContent)).toEqual(['Thème', 'Crédits']);
    expect(onglet('Thème').getAttribute('aria-selected')).toBe('true');
    expect(panneauVisible()).toHaveLength(1);
    const radios = [...document.querySelectorAll('input[name="reglages-theme"]')];
    expect(radios.map((r) => [r.value, r.checked])).toEqual([['system', false], ['light', true], ['dark', false]]);

    const sombre = radios.find((r) => r.value === 'dark');
    sombre.checked = true;
    sombre.dispatchEvent(new Event('change', {bubbles: true}));
    expect(racineHtml().getAttribute('data-theme')).toBe('dark');
    expect(themeMemorise()).toBe('dark');
  });

  it('l’onglet Crédits nomme Grist Factory, son site et la licence, jamais le compte de développement', () => {
    ouvrirReglages();
    onglet('Crédits').click();
    expect(onglet('Crédits').getAttribute('aria-selected')).toBe('true');
    expect(onglet('Thème').getAttribute('aria-selected')).toBe('false');
    const [panneau] = panneauVisible();
    expect([...panneau.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Auteur', 'Site', 'Licence']);
    expect(panneau.textContent).toContain('Grist Factory');
    const liens = [...panneau.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('rel')]);
    expect(liens).toEqual([
      ['grist-factory.fr', 'https://grist-factory.fr', 'noopener noreferrer'],
      ['GNU GPL v3.0', 'https://www.gnu.org/licenses/gpl-3.0.html', 'noopener noreferrer'],
    ]);
    expect(document.body.innerHTML).not.toMatch(/lombre33/i);
  });

  it('les flèches passent d’un onglet à l’autre ; Fermer referme', () => {
    ouvrirReglages();
    onglet('Thème').dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    expect(onglet('Crédits').getAttribute('aria-selected')).toBe('true');
    onglet('Crédits').dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    expect(onglet('Thème').getAttribute('aria-selected')).toBe('true');
    [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Fermer').click();
    expect(document.querySelector('.modal')).toBeNull();
  });

  it('la roue crantée ouvre les Réglages ; le logo Grist Factory est juste à sa droite', () => {
    const [roue, logo] = marqueEtReglages();
    expect(roue.getAttribute('aria-label')).toBe('Réglages');
    expect(roue.querySelector('svg')).not.toBeNull();
    expect(logo.tagName).toBe('IMG');
    expect(logo.getAttribute('alt')).toBe('Grist Factory');
    expect(logo.getAttribute('src')).toBe('./img/grist-factory-logo.jpg');
    roue.click();
    expect(document.querySelector('.modal h3')?.textContent).toBe('Réglages');
  });
});
