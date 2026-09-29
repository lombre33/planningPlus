/**
 * Version anglaise (Réglages › Langue) : le module de langue, puis deux
 * filets qui gardent le widget entièrement bilingue, comme le veut le guide
 * Grist Factory (« toute chaîne d'UI ajoutée ou modifiée a sa traduction
 * anglaise dans le même lot ») :
 * - dans le code, chaque texte passé à `t`/`tn` a sa traduction, et chaque
 *   traduction déclarée sert ;
 * - à l'écran, en langue témoin (anglais entre ⟦ ⟧), chaque vue ne montre
 *   rien hors crochets que des données du document, des dates et des
 *   chiffres : un texte resté en dur se voit tout de suite.
 */
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {demarrerApp} from './app.js';
import {jeuMinimal} from './dev/jeu-minimal.js';
import {normaliser} from './donnees/normaliser.js';
import {
  choisirLangue, conflitsDeTraduction, langue, LANGUE_TEMOIN, langueMemorisee, surChangementLangue, t, tn,
  traductions, traductionsDeclarees,
} from './i18n.js';
import {Magasin} from './store.js';
// Pour que leurs traductions soient déclarées : ni l'un ni l'autre ne
// démarre quoi que ce soit sans élément #app.
import './main.js';
import './dev-bench.js';

const SRC = path.dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  vi.restoreAllMocks();
  choisirLangue('fr');
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('module de langue', () => {
  beforeEach(() => {
    traductions({
      'Désistement de {nom}': 'Withdrawal of {nom}',
      '{n} place': '{n} spot',
      '{n} places': '{n} spots',
    });
  });

  it('parle français par défaut, et remplit les variables', () => {
    expect(langue()).toBe('fr');
    expect(t('Désistement de {nom}', {nom: 'Léa'})).toBe('Désistement de Léa');
    expect(t('Texte sans variable')).toBe('Texte sans variable');
  });

  it('en anglais, traduit ; sans traduction, garde le français et le signale une fois', () => {
    const avertir = vi.spyOn(console, 'warn').mockImplementation(() => {});
    choisirLangue('en');
    expect(t('Désistement de {nom}', {nom: 'Léa'})).toBe('Withdrawal of Léa');
    expect(t('Texte jamais traduit')).toBe('Texte jamais traduit');
    expect(t('Texte jamais traduit')).toBe('Texte jamais traduit');
    expect(avertir).toHaveBeenCalledTimes(1);
  });

  it('accorde en nombre selon la langue : « 0 place » en français, « 0 spots » en anglais', () => {
    expect([0, 1, 2].map((n) => tn(n, '{n} place', '{n} places'))).toEqual(['0 place', '1 place', '2 places']);
    choisirLangue('en');
    expect([0, 1, 2].map((n) => tn(n, '{n} place', '{n} places'))).toEqual(['0 spots', '1 spot', '2 spots']);
  });

  it('mémorise le choix, le pose sur <html> et prévient les abonnés', () => {
    const vus = [];
    const desabonner = surChangementLangue((l) => vus.push(l));
    choisirLangue('en');
    expect(langueMemorisee()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    desabonner();
    choisirLangue('fr');
    expect(vus).toEqual(['en']);
    expect(document.documentElement.lang).toBe('fr');
  });

  it('sans stockage (navigation privée) : le français, et un choix valable pour la session, sans erreur', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqué'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqué'); });
    expect(langueMemorisee()).toBe('fr');
    expect(() => choisirLangue('en')).not.toThrow();
    expect(langue()).toBe('en');
  });

  it('la langue témoin met chaque texte traduit entre crochets, sans se mémoriser', () => {
    choisirLangue('en');
    choisirLangue(LANGUE_TEMOIN);
    expect(t('Désistement de {nom}', {nom: 'Léa'})).toBe('⟦Withdrawal of Léa⟧');
    expect(langueMemorisee()).toBe('en');
  });
});

// --- Dans le code -----------------------------------------------------------

function fichiersSource(dossier = SRC) {
  return readdirSync(dossier, {withFileTypes: true}).flatMap((e) => {
    const chemin = path.join(dossier, e.name);
    if (e.isDirectory()) { return fichiersSource(chemin); }
    // i18n.js définit `t` et `tn` ; les jeux d'essai des tests (`*-fixtures.js`)
    // ont leur propre `t` (une heure du jour) et ne s'affichent jamais.
    const ecarte = e.name.endsWith('.test.js') || e.name.endsWith('fixtures.js') || chemin === path.join(SRC, 'i18n.js');
    return e.name.endsWith('.js') && !ecarte ? [chemin] : [];
  });
}

/** Lit un littéral chaîne ('…' ou "…") à partir de `i` : sa valeur et la fin. */
function lireLitteral(code, i) {
  const guillemet = code[i];
  if (guillemet !== '\'' && guillemet !== '"') { return null; }
  let j = i + 1;
  while (j < code.length && code[j] !== guillemet) { j += code[j] === '\\' ? 2 : 1; }
  // eslint-disable-next-line no-new-func -- notre propre code source, pour décoder les échappements
  return {valeur: new Function(`return ${code.slice(i, j + 1)}`)(), fin: j + 1};
}

/** Saute un argument quelconque jusqu'à la virgule de même niveau. */
function sauterArgument(code, i) {
  let profondeur = 0;
  for (let j = i; j < code.length; j++) {
    const c = code[j];
    if (c === '\'' || c === '"' || c === '`') {
      const fermeture = code.indexOf(c, j + 1);
      j = fermeture;
    } else if ('([{'.includes(c)) {
      profondeur += 1;
    } else if (')]}'.includes(c)) {
      if (profondeur === 0) { return j; }
      profondeur -= 1;
    } else if (c === ',' && profondeur === 0) {
      return j;
    }
  }
  return code.length;
}

const espaces = (code, i) => { while (/\s/.test(code[i])) { i += 1; } return i; };

/** Les textes passés à `t(…)` et `tn(n, …, …)` dans un fichier, et les appels
 *  dont le texte n'est pas un littéral (le test les refuse). */
function textesDuFichier(fichier) {
  const code = readFileSync(fichier, 'utf8');
  const textes = [];
  const nonLitteraux = [];
  for (const appel of code.matchAll(/(?<![\w$.])(tn?)\(/g)) {
    const ligne = code.slice(0, appel.index).split('\n').length;
    const lieu = `${path.relative(SRC, fichier)}:${ligne}`;
    let i = espaces(code, appel.index + appel[0].length);
    if (appel[1] === 'tn') {
      i = sauterArgument(code, i);
      if (code[i] !== ',') { nonLitteraux.push(lieu); continue; }
      i = espaces(code, i + 1);
    }
    const premier = lireLitteral(code, i);
    if (!premier) { nonLitteraux.push(lieu); continue; }
    textes.push({texte: premier.valeur, lieu});
    if (appel[1] === 'tn') {
      i = espaces(code, premier.fin);
      const second = code[i] === ',' ? lireLitteral(code, espaces(code, i + 1)) : null;
      if (!second) { nonLitteraux.push(lieu); continue; }
      textes.push({texte: second.valeur, lieu});
    }
  }
  return {textes, nonLitteraux};
}

describe('dans le code', () => {
  const fichiers = fichiersSource();
  const parFichier = fichiers.map(textesDuFichier);
  const textes = parFichier.flatMap((f) => f.textes);

  it('le texte de chaque `t`/`tn` est un littéral', () => {
    expect(parFichier.flatMap((f) => f.nonLitteraux)).toEqual([]);
  });

  it('chaque texte a sa traduction anglaise', () => {
    const declarees = traductionsDeclarees();
    const manquantes = textes.filter(({texte}) => !declarees.has(texte)).map(({texte, lieu}) => `${lieu} « ${texte} »`);
    expect([...new Set(manquantes)]).toEqual([]);
  });

  it('chaque traduction déclarée sert, et un même texte se traduit partout de la même façon', () => {
    const utilises = new Set(textes.map(({texte}) => texte));
    const inutiles = [...traductionsDeclarees().keys()].filter((fr) => !utilises.has(fr));
    // Celles des tests de ce fichier mises à part.
    expect(inutiles.filter((fr) => !['Désistement de {nom}', '{n} place', '{n} places'].includes(fr))).toEqual([]);
    expect(conflitsDeTraduction()).toEqual([]);
  });

  it('les variables d’une traduction sont celles du texte français', () => {
    const variables = (texte) => [...texte.matchAll(/\{(\w+)\}/g)].map((v) => v[1]).sort();
    const ecarts = [...traductionsDeclarees()]
      .filter(([fr, en]) => variables(fr).join() !== variables(en).join())
      .map(([fr, en]) => `« ${fr} » → « ${en} »`);
    expect(ecarts).toEqual([]);
  });
});

// --- À l'écran ----------------------------------------------------------------

/** Tout ce qu'une vue peut montrer sans le traduire : les données du
 *  document, les noms de jours et de mois (traduits par `Intl`), la marque. */
function motsPermis(m) {
  const valeurs = new Set(['Planning+', 'Grist Factory', 'grist-factory.fr', 'GNU GPL v3.0', 'Français', 'English']);
  for (const lignes of Object.values(m.data)) {
    for (const ligne of lignes) {
      for (const v of Object.values(ligne)) {
        for (const x of Array.isArray(v) ? v : [v]) {
          if (typeof x === 'string' && x.trim().length > 1) { valeurs.add(x.trim()); }
        }
      }
    }
  }
  for (let jour = 0; jour < 7; jour++) {
    const date = new Date(Date.UTC(2026, 6, 13 + jour, 12));
    for (const weekday of ['long', 'short']) { valeurs.add(new Intl.DateTimeFormat('en-GB', {weekday}).format(date)); }
  }
  for (let mois = 0; mois < 12; mois++) {
    const date = new Date(Date.UTC(2026, mois, 15, 12));
    for (const month of ['long', 'short']) { valeurs.add(new Intl.DateTimeFormat('en-GB', {month}).format(date)); }
  }
  return [...valeurs].sort((a, b) => b.length - a.length);
}

/** Ce qui reste d'un texte affiché une fois ôtés les passages traduits et
 *  les mots permis ; `null` s'il n'y reste aucune lettre. */
function resteNonTraduit(texte, permis) {
  let reste = texte;
  let avant;
  do { avant = reste; reste = reste.replace(/⟦[^⟦⟧]*⟧/g, ' '); } while (reste !== avant);
  for (const mot of permis) { reste = reste.split(mot).join(' '); }
  return /\p{L}/u.test(reste) ? reste.replace(/\s+/g, ' ').trim() : null;
}

function textesNonTraduits(racine, permis, contexte) {
  const trouves = [];
  const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
  for (let noeud = marcheur.nextNode(); noeud; noeud = marcheur.nextNode()) {
    if (noeud.parentElement?.closest('script, style')) { continue; }
    const reste = resteNonTraduit(noeud.textContent, permis);
    if (reste) { trouves.push(`${contexte} : « ${reste} » dans « ${noeud.textContent.trim().slice(0, 80)} »`); }
  }
  for (const el of racine.querySelectorAll('[title], [aria-label], [placeholder], [alt]')) {
    for (const attribut of ['title', 'aria-label', 'placeholder', 'alt']) {
      const valeur = el.getAttribute(attribut);
      const reste = valeur ? resteNonTraduit(valeur, permis) : null;
      if (reste) { trouves.push(`${contexte} [${attribut}] : « ${reste} » dans « ${valeur.slice(0, 80)} »`); }
    }
  }
  return trouves;
}

describe.each([
  ['jeu minimal', jeuMinimal],
  ['jeu réaliste', normaliser],
])('à l’écran, en langue témoin — %s', (_nom, jeu) => {
  it('chaque vue, chaque choix et les panneaux usuels ne montrent que des textes traduits', async () => {
    const avertir = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = new Magasin(jeu());
    const permis = motsPermis(m);
    choisirLangue(LANGUE_TEMOIN);
    document.body.innerHTML = '<div id="app"></div>';
    demarrerApp(document.getElementById('app'), m, () => t('Document Grist connecté'));

    const trouves = [];
    const titre = () => document.querySelector('h1')?.textContent ?? '?';
    const relever = (quoi) => trouves.push(...textesNonTraduits(document.body, permis, `${titre()}${quoi ? ` › ${quoi}` : ''}`));
    const groupes = () => [...document.querySelectorAll('.app-sous-vues .segmente')];
    function parcourir(niveau) {
      if (niveau >= groupes().length) { relever(); return; }
      const nombre = groupes()[niveau].querySelectorAll('.segmente__option').length;
      for (let i = 0; i < nombre; i++) {
        groupes()[niveau].querySelectorAll('.segmente__option')[i].click();
        parcourir(niveau + 1);
      }
    }
    const entrees = document.querySelectorAll('.rail__item').length;
    for (let i = 0; i < entrees; i++) {
      document.querySelectorAll('.rail__item')[i].click();
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      parcourir(0);
      // Les panneaux et fenêtres qu'un premier clic ouvre dans la vue.
      for (const selecteur of ['.besoin__effectif', '.groupe-chip', '.tj-nom[role="button"]', '.tj-section__bascule', '.benevole-row button']) {
        const cible = document.querySelector(`.view ${selecteur}`);
        if (!cible) { continue; }
        cible.click();
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        relever(selecteur);
        document.querySelector('.modal-backdrop')?.remove();
      }
    }
    document.querySelector('.topbar .btn--icone').click();
    for (const onglet of document.querySelectorAll('[role="tab"]')) { onglet.click(); relever('Réglages'); }

    expect([...new Set(trouves)]).toEqual([]);
    expect(avertir.mock.calls.map((c) => c.join(' ')).filter((msg) => msg.includes('[i18n]'))).toEqual([]);
  });
});
