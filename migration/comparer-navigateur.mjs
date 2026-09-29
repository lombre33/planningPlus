/**
 * Compare, dans Chromium, le widget TypeScript (`widget/`) et le widget
 * JavaScript natif (`widget-js/`) : mêmes onglets, même DOM, même rendu.
 *
 * Trois séries d'essais, chacune sur les 13 onglets :
 *
 *   1. banc de développement, jeu minimal : Vite en développement contre les
 *      fichiers de `widget-js/` servis tels quels ;
 *   2. banc de développement, jeu réaliste (`donnees/normaliser`) ;
 *   3. démarrage complet, contre un faux `window.grist` : le paquet de
 *      production (`vite build`) contre le site que publie
 *      `outils/assembler-site.mjs`, chargé aussi dans un iframe sans origine
 *      (comme Grist embarque un widget).
 *
 * Pour chaque onglet on compare le DOM, le rendu à l'écran (capture), le rendu
 * à l'impression (capture en média `print`) et les styles calculés d'une liste
 * de propriétés. Les captures sont faites à date figée, dans la même fenêtre.
 *
 * Usage (depuis la racine du dépôt, après `npm ci` dans `widget/` et `widget-js/`) :
 *
 *   PP_PLAYWRIGHT=/chemin/vers/node_modules node migration/comparer-navigateur.mjs
 *
 * Playwright n'est pas une dépendance du dépôt : `PP_PLAYWRIGHT` désigne un
 * dossier `node_modules` qui le contient (`/opt/node22/lib/node_modules` par
 * défaut) ; `PP_CHROMIUM` désigne un Chromium à lancer (sinon celui de Playwright).
 * Code de sortie : 0 si tout est identique, 1 sinon.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const widgetTs = path.join(racine, 'widget');
const widgetJs = path.join(racine, 'widget-js');

const requirePw = createRequire(`${process.env.PP_PLAYWRIGHT || '/opt/node22/lib/node_modules'}/`);
const {chromium} = requirePw('playwright');
const {creerServeur} = await import(pathToFileURL(path.join(widgetJs, 'outils/servir.mjs')).href);
const {assemblerSite} = await import(pathToFileURL(path.join(widgetJs, 'outils/assembler-site.mjs')).href);
const vite = await import(pathToFileURL(path.join(widgetTs, 'node_modules/vite/dist/node/index.js')).href);

const sha = (contenu) => crypto.createHash('sha1').update(contenu).digest('hex').slice(0, 10);
const ecouter = (serveur) => new Promise((resolve) => serveur.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${serveur.address().port}`)));

/** Faux `window.grist` : un document reconnu (les 18 tables) mais vide. Remplace le fichier vendorisé. */
async function fauxGrist() {
  const {TABLES} = await import(pathToFileURL(path.join(racine, 'dev/seed/schema.mjs')).href);
  const noms = TABLES.map((t) => t.libelle);
  return `window.grist = {ready() {}, docApi: {listTables: async () => ${JSON.stringify(noms)}, fetchTable: async () => ({id: []}), applyUserActions: async (a) => ({retValues: a.map(() => null)})}};`;
}

/** Propriétés dont on compare la valeur calculée, sur chaque élément (avec sa géométrie). */
const PROPRIETES = [
  'display', 'position', 'overflow', 'visibility', 'opacity', 'z-index', 'float', 'box-sizing',
  'color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'text-align', 'text-decoration-line', 'white-space', 'text-overflow', 'letter-spacing',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-color', 'border-top-style',
  'border-top-left-radius', 'box-shadow', 'grid-template-columns', 'flex-direction', 'flex-grow', 'gap', 'cursor', 'transform',
];

/** Parcourt les onglets de la barre latérale et rend une empreinte par onglet. */
async function parcourirOnglets(page, {avecImpression = true} = {}) {
  await page.waitForSelector('.rail__item');
  const n = await page.locator('.rail__item').count();
  const resultats = [];
  for (let i = 0; i < n; i++) {
    const bouton = page.locator('.rail__item').nth(i);
    const nom = (await bouton.innerText()).replace(/\s+/g, ' ').trim();
    await bouton.click();
    await page.mouse.move(1399, 899); // pas de survol : une transition en cours changerait la capture d'un essai à l'autre
    await page.waitForTimeout(250);
    const dom = await page.locator('#app').evaluate((el) => el.outerHTML.replace(/\s+/g, ' '));
    const styles = await page.locator('#app').evaluate((el, proprietes) => {
      let h = 2166136261;
      const ajouter = (texte) => { for (let k = 0; k < texte.length; k++) { h ^= texte.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; } };
      for (const e of [el, ...el.querySelectorAll('*')]) {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        ajouter(`${e.tagName}|${Math.round(r.x * 100)}|${Math.round(r.y * 100)}|${Math.round(r.width * 100)}|${Math.round(r.height * 100)}|`);
        for (const p of proprietes) ajouter(cs.getPropertyValue(p) + ';');
      }
      return h.toString(16);
    }, PROPRIETES);
    const ecran = sha(await page.screenshot({fullPage: true, animations: 'disabled'}));
    let impression = '-';
    if (avecImpression) {
      await page.emulateMedia({media: 'print'});
      await page.waitForTimeout(100);
      impression = sha(await page.screenshot({fullPage: true, animations: 'disabled'}));
      await page.emulateMedia({media: 'screen'});
      await page.waitForTimeout(100);
    }
    resultats.push({onglet: nom, dom: `${dom.length}/${sha(dom)}`, styles, ecran, impression});
  }
  return resultats;
}

async function nouvellePage(navigateur, options = {}) {
  const contexte = await navigateur.newContext({viewport: {width: 1400, height: 900}, locale: 'fr-FR', timezoneId: 'Europe/Paris'});
  const page = await contexte.newPage();
  const problemes = [];
  page.on('pageerror', (e) => problemes.push(`erreur de page : ${String(e).slice(0, 160)}`));
  page.on('console', (m) => { if (m.type() === 'error') problemes.push(`console : ${m.text().slice(0, 160)}`); });
  page.on('requestfailed', (r) => problemes.push(`requête échouée : ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.status() >= 400) problemes.push(`${r.status()} ${r.url()}`); });
  await page.clock.setFixedTime(new Date('2026-06-19T10:00:00+02:00'));
  if (options.jeuRealiste) {
    // Le banc monte `jeuMinimal()` : on le remplace, à la volée, par le jeu réaliste.
    await page.route('**/src/dev/jeu-minimal.*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `import {normaliser} from '../donnees/normaliser.${options.extension}'; export function jeuMinimal() { return normaliser(); }`,
    }));
  }
  if (options.grist) {
    await page.route('**/vendor/grist-plugin-api.js', (route) => route.fulfill({contentType: 'text/javascript', body: options.grist}));
  }
  return {page, contexte, problemes};
}

async function essai(navigateur, url, options) {
  const {page, contexte, problemes} = await nouvellePage(navigateur, options);
  await page.goto(url);
  const onglets = await parcourirOnglets(page, options);
  await contexte.close();
  return {onglets, problemes};
}

/** Même page, mais dans un iframe sans origine (`sandbox` sans `allow-same-origin`), comme un widget dans Grist. */
async function essaiIframeSansOrigine(navigateur, url, grist) {
  const {page, contexte, problemes} = await nouvellePage(navigateur, {grist});
  await page.setContent(`<iframe id="w" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" src="${url}" width="1300" height="900"></iframe>`);
  const cadre = page.frameLocator('#w');
  let onglets = -1;
  try {
    await cadre.locator('.rail__item').first().waitFor({timeout: 8000});
    onglets = await cadre.locator('.rail__item').count();
  } catch { /* onglets reste à -1 */ }
  await contexte.close();
  return {onglets, problemes};
}

// --- Exécution ----------------------------------------------------------------

const temporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-comparaison-'));
const arreter = [];
let echec = false;

try {
  process.chdir(widgetTs);
  const serveurVite = await vite.createServer({root: widgetTs, logLevel: 'error', clearScreen: false, server: {host: '127.0.0.1', port: 5199, strictPort: false}});
  await serveurVite.listen();
  arreter.push(() => serveurVite.close());
  const urlTsDev = serveurVite.resolvedUrls.local[0].replace(/\/$/, '');

  const serveurJs = creerServeur(widgetJs);
  const urlJsDev = await ecouter(serveurJs);
  arreter.push(() => new Promise((r) => serveurJs.close(r)));

  await vite.build({root: widgetTs, logLevel: 'error', build: {outDir: path.join(temporaire, 'ts'), emptyOutDir: true}});
  const fichiersJs = await assemblerSite({sortie: path.join(temporaire, 'js')});
  const serveurTsProd = creerServeur(path.join(temporaire, 'ts'));
  const urlTsProd = await ecouter(serveurTsProd);
  arreter.push(() => new Promise((r) => serveurTsProd.close(r)));
  const serveurJsProd = creerServeur(path.join(temporaire, 'js'));
  const urlJsProd = await ecouter(serveurJsProd);
  arreter.push(() => new Promise((r) => serveurJsProd.close(r)));

  const navigateur = await chromium.launch({executablePath: process.env.PP_CHROMIUM || undefined});
  arreter.push(() => navigateur.close());
  const grist = await fauxGrist();

  const series = [
    ['banc, jeu minimal', () => essai(navigateur, `${urlTsDev}/dev-bench.html`, {}), () => essai(navigateur, `${urlJsDev}/dev-bench.html`, {})],
    ['banc, jeu réaliste', () => essai(navigateur, `${urlTsDev}/dev-bench.html`, {jeuRealiste: true, extension: 'ts'}), () => essai(navigateur, `${urlJsDev}/dev-bench.html`, {jeuRealiste: true, extension: 'js'})],
    ['démarrage complet, faux Grist (paquet contre site assemblé)', () => essai(navigateur, `${urlTsProd}/index.html`, {grist}), () => essai(navigateur, `${urlJsProd}/index.html`, {grist})],
  ];

  for (const [titre, versTs, versJs] of series) {
    const [ts, js] = [await versTs(), await versJs()];
    console.log(`\n${titre}`);
    console.log(`  ${'onglet'.padEnd(26)} ${'DOM'.padEnd(18)} styles    écran       impression  identique`);
    let identiques = 0;
    const n = Math.max(ts.onglets.length, js.onglets.length);
    for (let i = 0; i < n; i++) {
      const a = ts.onglets[i], b = js.onglets[i];
      const memes = a && b && a.dom === b.dom && a.styles === b.styles && a.ecran === b.ecran && a.impression === b.impression;
      if (memes) identiques++;
      console.log(`  ${(a?.onglet ?? b?.onglet ?? '?').padEnd(26)} ${(a?.dom ?? '-').padEnd(18)} ${(a?.styles ?? '-').padEnd(8)} ${(a?.ecran ?? '-').padEnd(11)} ${(a?.impression ?? '-').padEnd(11)} ${memes ? 'oui' : `NON (JS : ${b?.dom} ${b?.styles} ${b?.ecran} ${b?.impression})`}`);
    }
    console.log(`  → ${identiques}/${n} onglets identiques ; problèmes TS : ${ts.problemes.length}, JS : ${js.problemes.length}`);
    for (const p of [...ts.problemes.map((x) => `TS : ${x}`), ...js.problemes.map((x) => `JS : ${x}`)].slice(0, 10)) console.log(`    ${p}`);
    if (identiques !== n || n !== 13 || ts.problemes.length || js.problemes.length) echec = true;
  }

  const iframe = await essaiIframeSansOrigine(navigateur, `${urlJsProd}/index.html`, grist);
  console.log(`\nsite assemblé (${fichiersJs.length} fichiers) dans un iframe sans origine : ${iframe.onglets} onglets affichés ; problèmes : ${iframe.problemes.length}`);
  for (const p of iframe.problemes.slice(0, 10)) console.log(`    ${p}`);
  if (iframe.onglets !== 13 || iframe.problemes.length) echec = true;
} finally {
  for (const f of arreter.reverse()) await Promise.resolve(f()).catch(() => {});
  fs.rmSync(temporaire, {recursive: true, force: true});
}

console.log(echec ? '\nDifférences ou problèmes constatés.' : '\nTout est identique.');
process.exit(echec ? 1 : 0);
