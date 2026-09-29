import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {choisirLangue, langue, langueMemorisee} from '../i18n.js';
import {appliquerTheme, choisirTheme, marqueEtReglages, ouvrirReglages, themeMemorise} from './reglages.js';

const racineHtml = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  racineHtml().removeAttribute('data-theme');
});
afterEach(() => {
  vi.restoreAllMocks();
  choisirLangue('fr');
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

  it('s’ouvre sur l’onglet Langue, puis Thème et Crédits, comme Publipostage+', () => {
    ouvrirReglages();
    expect(document.querySelector('.modal h3').textContent).toBe('Réglages');
    expect([...document.querySelectorAll('[role="tab"]')].map((b) => b.textContent)).toEqual(['Langue', 'Thème', 'Crédits']);
    expect(onglet('Langue').getAttribute('aria-selected')).toBe('true');
    expect(panneauVisible()).toHaveLength(1);
    const radios = [...document.querySelectorAll('input[name="reglages-langue"]')];
    expect(radios.map((r) => [r.value, r.checked, r.closest('label').textContent])).toEqual([['fr', true, 'Français'], ['en', false, 'English']]);
  });

  it('l’onglet Thème coche le thème mémorisé et l’applique au changement', () => {
    choisirTheme('light');
    ouvrirReglages();
    onglet('Thème').click();
    expect(onglet('Thème').getAttribute('aria-selected')).toBe('true');
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
    expect(onglet('Langue').getAttribute('aria-selected')).toBe('false');
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
    onglet('Langue').dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    expect(onglet('Thème').getAttribute('aria-selected')).toBe('true');
    onglet('Thème').dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    expect(onglet('Crédits').getAttribute('aria-selected')).toBe('true');
    onglet('Crédits').dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    expect(onglet('Langue').getAttribute('aria-selected')).toBe('true');
    [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Fermer').click();
    expect(document.querySelector('.modal')).toBeNull();
  });

  it('passer en anglais : les Réglages se rouvrent en anglais sur Langue, le choix est mémorisé et posé sur <html>', async () => {
    ouvrirReglages();
    const anglais = document.querySelector('input[name="reglages-langue"][value="en"]');
    anglais.checked = true;
    anglais.dispatchEvent(new Event('change', {bubbles: true}));

    expect(langue()).toBe('en');
    expect(langueMemorisee()).toBe('en');
    expect(racineHtml().lang).toBe('en');
    expect(document.querySelectorAll('.modal')).toHaveLength(1);
    expect(document.querySelector('.modal h3').textContent).toBe('Settings');
    expect([...document.querySelectorAll('[role="tab"]')].map((b) => [b.textContent, b.getAttribute('aria-selected')]))
      .toEqual([['Language', 'true'], ['Theme', 'false'], ['Credits', 'false']]);
    expect(document.querySelector('input[name="reglages-langue"][value="en"]').checked).toBe(true);
    await new Promise((resolve) => { queueMicrotask(resolve); });
    expect(document.activeElement.textContent).toBe('Language');

    const francais = document.querySelector('input[name="reglages-langue"][value="fr"]');
    francais.checked = true;
    francais.dispatchEvent(new Event('change', {bubbles: true}));
    expect(document.querySelector('.modal h3').textContent).toBe('Réglages');
    expect(racineHtml().lang).toBe('fr');
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
