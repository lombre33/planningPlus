/**
 * Convertit `widget/` (TypeScript, la V1) en `widget-js/` (JavaScript natif, la
 * V2) : les types sont effacés, les imports reçoivent leur extension, rien
 * d'autre ne change. Le dossier produit se sert tel quel, sans compilation.
 *
 * Usage (depuis la racine du dépôt, après `npm ci` dans `widget/`) :
 *
 *   node migration/convertir.mjs                 écrit widget-js/src et widget-js/scripts
 *   node migration/convertir.mjs --verifier      n'écrit rien : signale ce qui a changé
 *   node migration/convertir.mjs --sortie <dir>  écrit dans <dir> au lieu de widget-js/
 *                                                (pour comparer, ou reporter un changement de widget/)
 *   node migration/convertir.mjs --forcer        écrase widget-js/ même s'il a été modifié à la main
 *
 * Tant que personne n'a modifié `widget-js/src` ni `scripts`, ces dossiers sont
 * le reflet de `widget/`. Le sceau `widget-js/.sceau-conversion`, écrit avec
 * eux, le constate : dès qu'un fichier a bougé à la main (la V2 se construit),
 * la conversion refuse d'écraser et `--verifier` n'a plus rien à comparer. À
 * la bascule, ce dossier `migration/` disparaît avec `widget/`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {effacerTypes} from './effacer-types.mjs';
import {comparer, erreursDeSyntaxe, estVide} from './equivalence.mjs';
import {appliquerRetouches, reecrireMentionsCss, reecrireMentionsTs} from './retouches.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const args = new Set(argv);
const verifierSeulement = args.has('--verifier');
const forcer = args.has('--forcer');
const positionSortie = argv.indexOf('--sortie');
const dossierSortie = positionSortie >= 0 ? argv[positionSortie + 1] : null;
if (positionSortie >= 0 && !dossierSortie) {
  console.error('--sortie attend un dossier.');
  process.exit(2);
}

const source = path.join(racine, 'widget');
const miroir = path.join(racine, 'widget-js');
const cible = dossierSortie ? path.resolve(dossierSortie) : miroir;
const schemaPartage = path.join(racine, 'dev', 'seed', 'schema.mjs');

let ts;
try {
  ts = createRequire(path.join(source, 'package.json'))('typescript');
} catch {
  console.error('TypeScript est introuvable : lancer `npm ci` dans widget/ (il ne sert qu\'à cette conversion).');
  process.exit(2);
}

function lister(dossier, acc = []) {
  for (const entree of fs.readdirSync(dossier, {withFileTypes: true})) {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) lister(chemin, acc);
    else acc.push(chemin);
  }
  return acc.sort();
}

// --- Inventaire ---------------------------------------------------------

/** @type {{src: string, dest: string, genre: 'ts' | 'dts' | 'copie'}[]} */
const entrees = [];
for (const [dossierSource, dossierCible] of [['src', 'src'], ['scripts', 'scripts']]) {
  for (const f of lister(path.join(source, dossierSource))) {
    const relatif = path.relative(path.join(source, dossierSource), f);
    if (relatif === 'tsconfig.json') continue;
    const dest = path.join(cible, dossierCible, relatif);
    if (f.endsWith('.d.ts')) entrees.push({src: f, dest, genre: 'dts'});
    else if (f.endsWith('.ts')) entrees.push({src: f, dest: dest.replace(/\.ts$/, '.js'), genre: 'ts'});
    else entrees.push({src: f, dest, genre: 'copie'});
  }
}

const sansExtension = (p) => p.replace(/(\.d)?\.ts$/, '');
const fichiersTs = new Set(entrees.filter((e) => e.genre === 'ts').map((e) => sansExtension(e.src)));

/** Suffixe à ajouter à un spécificateur relatif : `.js`, `/index.js`, ou undefined s'il ne mène nulle part. */
function suffixePour(fichierSource, specificateur) {
  const cibleAbsolue = path.resolve(path.dirname(fichierSource), specificateur);
  if (fichiersTs.has(cibleAbsolue)) return '.js';
  if (fichiersTs.has(path.join(cibleAbsolue, 'index'))) return '/index.js';
  return undefined;
}

/**
 * Retouches exactes du texte source, hors documentation : les messages d'usage des scripts
 * de vérification, qui se lançaient avec `vite-node` et se lancent maintenant avec Node.
 */
const retouches = [
  ...['verifier-integration', 'verifier-ecritures-v01'].flatMap((nom) => [
    {fichier: `scripts/${nom}.ts`, de: `\`npx vite-node scripts/${nom}.ts\n`, vers: `\`node scripts/${nom}.js\n`},
    {fichier: `scripts/${nom}.ts`, de: `'Usage : npx vite-node scripts/${nom}.ts `, vers: `'Usage : node scripts/${nom}.js `},
  ]),
];

/**
 * Genre du fichier qui remplace un nom `.ts` cité dans un commentaire ou un titre de test.
 * Le nom peut être abrégé (`grille` pour `views/grille`). S'il désigne plusieurs fichiers de
 * genres différents, on retient celui du dossier de l'auteur de la citation.
 */
const genreParNom = new Map();
for (const e of entrees.filter((x) => x.genre === 'ts')) genreParNom.set(path.relative(source, sansExtension(e.src)), e);
const genreDe = (cle) => (modulesSansCode.has(sansExtension(genreParNom.get(cle).src)) ? 'd.ts' : 'js');
function genreMention(mention, entree) {
  const nom = mention.replace(/^(widget|widget-js)\//, '');
  const candidats = [...genreParNom.keys()].filter((k) => k === nom || k.endsWith(`/${nom}`));
  if (candidats.length === 0) return null;
  const genres = new Set(candidats.map(genreDe));
  if (genres.size === 1) return [...genres][0];
  const local = candidats.find((k) => k === path.join(path.relative(source, path.dirname(entree.src)), nom));
  return local ? genreDe(local) : null;
}

/** Texte source retouché : noms de fichiers cités et messages d'usage. */
const mentionsCorrigees = {ts: 0, css: 0};
function retoucher(entree, texte) {
  const relatif = path.relative(source, entree.src);
  const retouche = appliquerRetouches(texte, retouches, relatif);
  if (relatif.endsWith('.css') || entree.src.endsWith('.css')) {
    const r = reecrireMentionsCss(retouche, (m) => genreMention(m, entree));
    mentionsCorrigees.css += r.corrigees;
    return r.texte;
  }
  const r = reecrireMentionsTs(ts, retouche, relatif, (m) => genreMention(m, entree));
  mentionsCorrigees.ts += r.corrigees;
  return r.texte;
}

// --- Effacement des types, en deux passes ---------------------------------

function effacer(entree, modulesSansCode) {
  const texte = retoucher(entree, fs.readFileSync(entree.src, 'utf8'));
  const nom = path.relative(racine, entree.src);
  const resultat = effacerTypes(ts, texte, nom, {
    reecrireSpecificateur: (spec) => suffixePour(entree.src, spec),
    estModuleSansCode: (spec) => modulesSansCode.has(path.resolve(path.dirname(entree.src), spec)) || modulesSansCode.has(path.join(path.resolve(path.dirname(entree.src), spec), 'index')),
    genreMention,
  });
  return {texte, nom, ...resultat};
}

const modulesSansCode = new Set();
for (const e of entrees.filter((x) => x.genre === 'ts')) {
  const {code} = effacer(e, modulesSansCode);
  if (estVide(ts, code)) modulesSansCode.add(sansExtension(e.src));
}

const sorties = new Map(); // chemin cible -> contenu
const feuillesParFichier = new Map(); // fichier produit -> feuilles de style qu'il importait
const rapport = {
  convertis: 0, ligneAvant: 0, ligneApres: 0, commentairesAvant: 0, commentairesApres: 0,
  typesSeulement: [], css: new Map(), json: [], parametresPropriete: 0, erreurs: [], differences: [],
};
const compterCommentaires = (t) => t.split('\n').filter((l) => /^\s*(\/\/|\/\*|\*)/.test(l)).length;
const compterLignes = (t) => t.split('\n').length - (t.endsWith('\n') ? 1 : 0);

for (const e of entrees) {
  if (e.genre === 'copie' || e.genre === 'dts') {
    sorties.set(e.dest, e.src.endsWith('.css') ? retoucher(e, fs.readFileSync(e.src, 'utf8')) : fs.readFileSync(e.src));
    continue;
  }
  if (modulesSansCode.has(sansExtension(e.src))) {
    // Un module de types seulement : on garde ses déclarations, documentation
    // comprise, dans un fichier .d.ts à côté (elles serviront aux types en commentaires).
    rapport.typesSeulement.push(path.relative(racine, e.src));
    sorties.set(e.dest.replace(/\.js$/, '.d.ts'), retoucher(e, fs.readFileSync(e.src, 'utf8')));
    continue;
  }
  let sortie;
  try {
    sortie = effacer(e, modulesSansCode);
  } catch (erreur) {
    rapport.erreurs.push(erreur.message);
    continue;
  }
  sorties.set(e.dest, sortie.code);
  rapport.convertis++;
  rapport.ligneAvant += compterLignes(sortie.texte);
  rapport.ligneApres += compterLignes(sortie.code);
  rapport.commentairesAvant += compterCommentaires(sortie.texte);
  rapport.commentairesApres += compterCommentaires(sortie.code);
  rapport.parametresPropriete += sortie.parametresPropriete;
  feuillesParFichier.set(e.dest, sortie.cssImportes.map((css) => path.resolve(path.dirname(e.dest), css)));
  for (const css of sortie.cssImportes) rapport.css.set(path.resolve(path.dirname(e.dest), css), path.relative(racine, e.src));
  for (const j of sortie.jsonImportes) rapport.json.push(`${path.relative(racine, e.src)} → ${j}`);

  for (const erreur of erreursDeSyntaxe(ts, sortie.code, e.dest)) rapport.erreurs.push(`${path.relative(racine, e.dest)} : ${erreur}`);
  const difference = comparer(ts, sortie.texte, sortie.code, sortie.nom, (spec) => spec.endsWith('.css') || modulesSansCode.has(path.resolve(path.dirname(e.src), spec)) || modulesSansCode.has(path.join(path.resolve(path.dirname(e.src), spec), 'index')));
  if (difference) rapport.differences.push(`${sortie.nom}\n    ${difference.contexte}`);
}

// Le schéma vit dans dev/seed/ (`schema.ts` ne fait que le ré-exporter) : le
// dossier servi doit le contenir, sinon la page reste blanche (404).
const schemaSortie = path.join(cible, 'src', 'grist', 'schema.js');
if (sorties.has(schemaSortie)) sorties.set(schemaSortie, fs.readFileSync(schemaPartage));

// --- Contrôles sur le résultat -------------------------------------------

/** Chaque import relatif du dossier produit doit mener à un fichier existant. */
function verifierImports() {
  const existe = (p) => sorties.has(p) || fs.existsSync(p);
  for (const [chemin, contenu] of sorties) {
    if (!chemin.endsWith('.js') || typeof contenu !== 'string') continue;
    const sf = ts.createSourceFile(chemin, contenu, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const specificateurs = [];
    const visiter = (n) => {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) specificateurs.push(n.moduleSpecifier.text);
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) specificateurs.push(n.arguments[0].text);
      ts.forEachChild(n, visiter);
    };
    visiter(sf);
    for (const s of specificateurs) {
      if (!s.startsWith('.')) continue;
      if (!existe(path.resolve(path.dirname(chemin), s))) rapport.erreurs.push(`${path.relative(racine, chemin)} : import introuvable ${s}`);
    }
  }
}
verifierImports();

/** Feuilles de style atteintes depuis une page : celles qu'elle doit charger par <link>. */
function feuillesAtteintes(entree) {
  const vues = new Set();
  const feuilles = new Set();
  const pile = [entree];
  while (pile.length) {
    const fichier = pile.pop();
    if (vues.has(fichier)) continue;
    vues.add(fichier);
    for (const css of feuillesParFichier.get(fichier) ?? []) feuilles.add(css);
    const contenu = sorties.get(fichier);
    if (typeof contenu !== 'string') continue;
    const sf = ts.createSourceFile(fichier, contenu, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const visiter = (n) => {
      let spec = null;
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) spec = n.moduleSpecifier.text;
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) spec = n.arguments[0].text;
      if (spec?.startsWith('.') && spec.endsWith('.js')) pile.push(path.resolve(path.dirname(fichier), spec));
      ts.forEachChild(n, visiter);
    };
    visiter(sf);
  }
  return [...feuilles].sort();
}

for (const [page, module] of [['index.html', 'src/main.js'], ['dev-bench.html', 'src/dev-bench.js']]) {
  const chemin = path.join(cible, page);
  if (!fs.existsSync(chemin)) continue;
  const attendues = feuillesAtteintes(path.join(cible, module)).map((f) => path.relative(cible, f));
  const liens = [...fs.readFileSync(chemin, 'utf8').matchAll(/<link[^>]*rel="stylesheet"[^>]*href="\.\/([^"]+)"/g)].map((m) => m[1]).sort();
  const manquantes = attendues.filter((a) => !liens.includes(a));
  const enTrop = liens.filter((l) => !attendues.includes(l));
  if (manquantes.length || enTrop.length) {
    rapport.erreurs.push(`${page} : feuilles de style à charger par <link> — manquantes : [${manquantes.join(', ')}], en trop : [${enTrop.join(', ')}]`);
  }
}

// --- Écriture ou vérification --------------------------------------------

const dossiersGeneres = [path.join(cible, 'src'), path.join(cible, 'scripts')];
const existants = dossiersGeneres.flatMap((d) => (fs.existsSync(d) ? lister(d) : []));

/**
 * Sceau : empreinte de tous les fichiers produits (chemin et contenu), écrite avec eux dans
 * `widget-js/.sceau-conversion`. Elle dit deux choses sans autre comparaison : si `widget-js/`
 * a été modifié à la main depuis (l'empreinte du disque diffère du sceau) et si `widget/` a
 * changé depuis (l'empreinte de la conversion d'aujourd'hui diffère du sceau).
 */
const fichierSceau = path.join(miroir, '.sceau-conversion');
function empreinte(fichiers) {
  const h = crypto.createHash('sha256');
  for (const chemin of [...fichiers.keys()].sort()) {
    const relatif = path.relative(cible, chemin).split(path.sep).join('/');
    h.update(`${relatif}\0${crypto.createHash('sha256').update(fichiers.get(chemin)).digest('hex')}\n`);
  }
  return h.digest('hex');
}
const scelle = !dossierSortie;
const sceauEcrit = scelle && fs.existsSync(fichierSceau) ? fs.readFileSync(fichierSceau, 'utf8').trim() : null;
const modifieAMain = scelle && existants.length > 0 && sceauEcrit !== empreinte(new Map(existants.map((f) => [f, fs.readFileSync(f)])));
const widgetChange = scelle && sceauEcrit !== empreinte(sorties);

if (modifieAMain && !verifierSeulement && !forcer) {
  console.error(`${path.relative(racine, miroir)}/ a été modifié depuis la dernière conversion : elle refuse d'écraser ce travail.
  --sortie <dossier>  produit la conversion ailleurs, pour la comparer ou en reporter un changement de widget/
  --forcer            écrase quand même`);
  process.exit(2);
}

let enRetard = 0;
if (verifierSeulement) {
  // Un dossier modifié à la main n'a plus de raison de ressembler à la conversion : on ne compare
  // plus fichier par fichier, seul compte de savoir si widget/ a bougé depuis.
  if (!modifieAMain) {
    for (const [chemin, contenu] of sorties) {
      const actuel = fs.existsSync(chemin) ? fs.readFileSync(chemin) : null;
      if (!actuel || !actuel.equals(Buffer.isBuffer(contenu) ? contenu : Buffer.from(contenu))) {
        enRetard++;
        console.log(`en retard : ${path.relative(racine, chemin)}`);
      }
    }
    for (const f of existants) {
      if (!sorties.has(f)) { enRetard++; console.log(`en trop : ${path.relative(racine, f)}`); }
    }
  }
} else {
  for (const f of existants) if (!sorties.has(f)) fs.rmSync(f);
  for (const [chemin, contenu] of sorties) {
    fs.mkdirSync(path.dirname(chemin), {recursive: true});
    fs.writeFileSync(chemin, contenu);
  }
  if (scelle) fs.writeFileSync(fichierSceau, `${empreinte(sorties)}\n`);
}

// --- Rapport ---------------------------------------------------------------

console.log(`${rapport.convertis} fichiers TypeScript convertis, ${rapport.typesSeulement.length} modules de types conservés en .d.ts`);
console.log(`lignes : ${rapport.ligneAvant} → ${rapport.ligneApres} ; lignes de commentaire : ${rapport.commentairesAvant} → ${rapport.commentairesApres}`);
console.log(`noms de fichiers corrigés dans la documentation : ${mentionsCorrigees.ts} (code) et ${mentionsCorrigees.css} (feuilles de style)`);
console.log(`feuilles de style retirées des imports : ${[...rapport.css.keys()].map((c) => path.relative(cible, c)).join(', ') || 'aucune'}`);
console.log(`imports JSON : ${rapport.json.join(' ; ') || 'aucun'} ; propriétés de paramètre : ${rapport.parametresPropriete}`);
if (rapport.typesSeulement.length) console.log(`modules de types : ${rapport.typesSeulement.join(', ')}`);
if (rapport.differences.length) {
  console.log(`\n${rapport.differences.length} fichier(s) dont l'arbre diffère de la transpilation officielle :`);
  for (const d of rapport.differences) console.log(`  ${d}`);
}
if (rapport.erreurs.length) {
  console.log(`\n${rapport.erreurs.length} erreur(s) :`);
  for (const e of rapport.erreurs) console.log(`  ${e}`);
}
let enRetardSurWidget = false;
if (verifierSeulement) {
  if (modifieAMain) {
    enRetardSurWidget = widgetChange;
    console.log(sceauEcrit === null
      ? '\nwidget-js/ n\'a pas de sceau de conversion : impossible de dire s\'il reflète widget/. Faire une conversion avec --forcer pour le sceller.'
      : widgetChange
        ? '\nwidget-js/ a été modifié depuis la conversion, et widget/ a changé depuis : reporter le changement dans widget-js/ (voir migration/README.md, « Reporter un changement de widget/ »).'
        : '\nwidget-js/ a été modifié depuis la conversion (la V2 se construit) ; widget/ n\'a pas changé depuis : rien à reporter.');
  } else {
    enRetardSurWidget = enRetard > 0;
    console.log(enRetard ? `\n${enRetard} fichier(s) en retard sur widget/ : widget-js/ n'a pas été modifié depuis la conversion, la relancer suffit (node migration/convertir.mjs).` : '\nwidget-js est à jour.');
  }
}
process.exit(rapport.erreurs.length || rapport.differences.length || enRetardSurWidget ? 1 : 0);
