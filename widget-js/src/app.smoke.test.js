import {afterEach, describe, expect, it} from 'vitest';
import {demarrerApp} from './app.js';
import {jeuMinimal} from './dev/jeu-minimal.js';
import {normaliser} from './donnees/normaliser.js';
import {choisirLangue} from './i18n.js';
import {Magasin} from './store.js';

const texte = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** Test de fumée : monte chaque vue de l'application sur un jeu de données
 *  (le plus pauvre, puis le plus riche) et vérifie qu'elle se construit sans
 *  exception et produit du contenu. Filet de sécurité pour les vues qui n'ont
 *  pas de test dédié (Terrain, Bénévole, Désistements). */
describe.each([
  ['jeu minimal', () => new Magasin(jeuMinimal())],
  ['jeu réaliste', () => new Magasin(normaliser())],
])('démarrage de toutes les vues — %s', (_nom, creerMagasin) => {
  afterEach(() => {
    choisirLangue('fr');
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function verifierVue(racine, contexte) {
    expect(racine.querySelector('h1')?.textContent, contexte).toBeTruthy();
    expect(racine.querySelector('.view')?.children.length, contexte).toBeGreaterThan(0);
    // Roue crantée des Réglages puis logo, en dernier dans le coin haut-droit.
    const coin = [...racine.querySelector('.topbar__actions').children].slice(-2);
    expect(coin.map((e) => e.getAttribute('aria-label') ?? e.getAttribute('alt')), contexte).toEqual(['Réglages', 'Grist Factory']);
  }

  it('le menu a sept entrées, rangées en parcours, jour J et diffusion', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const racine = document.getElementById('app');
    demarrerApp(racine, creerMagasin(), 'test');
    const rail = [...racine.querySelector('.rail').children].slice(1).map((el) => (
      el.classList.contains('rail__section') ? `[${texte(el)}]` : texte(el)
    ));
    expect(rail).toEqual([
      '[Parcours]', '1Agenda', '2Missions', '3Indicatifs', '4Bénévoles', '5Affectation',
      '[Le jour J]', 'Terrain',
      '[Diffuser]', 'Impressions',
    ]);
  });

  it('chaque vue de chaque entrée se monte sans erreur et affiche un titre et du contenu', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const racine = document.getElementById('app');
    demarrerApp(racine, creerMagasin(), 'test');
    const titres = new Set();
    // Une entrée qui regroupe plusieurs vues : toutes les combinaisons de ses
    // choix (Impressions : qui × durée). Les choix se redessinent à chaque
    // clic, d'où la relecture du groupe avant chaque option.
    const groupes = () => [...racine.querySelectorAll('.app-sous-vues .segmente')];
    function parcourir(niveau, contexte) {
      if (niveau >= groupes().length) {
        verifierVue(racine, contexte);
        titres.add(texte(racine.querySelector('h1')));
        return;
      }
      for (const libelle of [...groupes()[niveau].querySelectorAll('.segmente__option')].map(texte)) {
        [...groupes()[niveau].querySelectorAll('.segmente__option')].find((b) => texte(b) === libelle).click();
        parcourir(niveau + 1, `${contexte} › ${libelle}`);
      }
    }
    for (const entree of [...racine.querySelectorAll('.rail__item')]) {
      entree.click();
      verifierVue(racine, texte(entree));
      titres.add(texte(racine.querySelector('h1')));
      parcourir(0, texte(entree));
    }
    // Toutes les vues gardées sont atteignables : cinq étapes, Terrain,
    // Désistements en plus, et les quatre impressions.
    expect([...titres].sort()).toEqual([
      'Affectation · table du jour', 'Agenda du festival', 'Artistes', 'Disponibilités des bénévoles', 'Désistements',
      'Feuille de route bénévole', 'Indicatifs et équipes', 'Missions du jour', 'Planning d’équipe sur tout le festival',
      'Plannings équipes imprimables', 'Roster bénévoles imprimable', 'Terrain',
    ].sort());
  });

  it('en bas des étapes 1 à 4, un bouton ouvre l’étape suivante ; rien après l’Affectation', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const racine = document.getElementById('app');
    demarrerApp(racine, creerMagasin(), 'test');
    const suite = () => racine.querySelector('.app-suite button');
    const parcours = [];
    for (let i = 0; i < 4; i++) {
      parcours.push(texte(suite()));
      suite().click();
    }
    expect(parcours).toEqual(['Étape 2 Missions →', 'Étape 3 Indicatifs →', 'Étape 4 Bénévoles →', 'Étape 5 Affectation →']);
    expect(texte(racine.querySelector('h1'))).toBe('Affectation · table du jour');
    expect(racine.querySelector('.rail__item[aria-current="true"]').textContent).toContain('Affectation');
    expect(suite()).toBeNull();
    [...racine.querySelectorAll('.rail__item')].find((b) => texte(b) === 'Terrain').click();
    expect(suite()).toBeNull();
  });

  it('changer de langue redessine le menu et la vue active, sans rien recharger', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const racine = document.getElementById('app');
    demarrerApp(racine, creerMagasin(), 'test');
    [...racine.querySelectorAll('.rail__item')].find((b) => texte(b) === '5Affectation').click();
    const rail = () => [...racine.querySelector('.rail').children].slice(1).map((el) => (
      el.classList.contains('rail__section') ? `[${texte(el)}]` : texte(el)
    ));

    choisirLangue('en');
    expect(rail()).toEqual([
      '[Steps]', '1Agenda', '2Tasks', '3Call signs', '4Volunteers', '5Assignment',
      '[On the day]', 'On site',
      '[Share]', 'Printouts',
    ]);
    expect(texte(racine.querySelector('h1'))).toBe('Assignment · day table');
    expect(racine.querySelector('.rail__item[aria-current="true"]').textContent).toContain('Assignment');
    expect(racine.querySelector('.rail').getAttribute('aria-label')).toBe('Schedule views');

    choisirLangue('fr');
    expect(texte(racine.querySelector('h1'))).toBe('Affectation · table du jour');
    expect(rail()[1]).toBe('1Agenda');
    expect(rail()[2]).toBe('2Missions');
  });

  it('Impressions : « par bénévole ou par équipe », « un jour ou tout le festival » ; le bandeau des jours seulement pour un jour', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const racine = document.getElementById('app');
    demarrerApp(racine, creerMagasin(), 'test');
    [...racine.querySelectorAll('.rail__item')].find((b) => texte(b) === 'Impressions').click();
    const choisir = (libelle) => [...racine.querySelectorAll('.segmente__option')].find((b) => texte(b) === libelle).click();
    const titre = () => texte(racine.querySelector('h1'));
    const bandeau = () => racine.querySelector('.app-bandeau-jours').children.length > 0;

    expect(titre()).toBe('Roster bénévoles imprimable');
    expect(bandeau()).toBe(true);
    choisir('Tout le festival');
    expect(titre()).toBe('Feuille de route bénévole');
    expect(bandeau()).toBe(false);
    choisir('Par équipe');
    expect(titre()).toBe('Planning d’équipe sur tout le festival');
    choisir('Un jour');
    expect(titre()).toBe('Plannings équipes imprimables');
    expect(bandeau()).toBe(true);
    expect([...racine.querySelectorAll('.segmente__option[aria-pressed="true"]')].map(texte)).toEqual(['Par équipe', 'Un jour']);

    // Le choix est gardé d'un passage à l'autre.
    [...racine.querySelectorAll('.rail__item')].find((b) => texte(b) === 'Terrain').click();
    [...racine.querySelectorAll('.rail__item')].find((b) => texte(b) === 'Impressions').click();
    expect(titre()).toBe('Plannings équipes imprimables');
  });
});
