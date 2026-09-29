// @vitest-environment node
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {assemblerSite, importsRelatifs} from './assembler-site.mjs';

const dossiers = [];
const dossierTemporaire = async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), 'pp-site-'));
  dossiers.push(d);
  return d;
};
afterEach(async () => { await Promise.all(dossiers.splice(0).map((d) => rm(d, {recursive: true, force: true}))); });

async function listerFichiers(dossier, prefixe = '') {
  const sortie = [];
  for (const e of await readdir(path.join(dossier, prefixe), {withFileTypes: true})) {
    const relatif = path.posix.join(prefixe, e.name);
    if (e.isDirectory()) sortie.push(...(await listerFichiers(dossier, relatif)));
    else sortie.push(relatif);
  }
  return sortie.sort();
}

describe('importsRelatifs', () => {
  it('lit les imports, les ré-exports et import() ; ignore les commentaires et les chaînes de texte', () => {
    const source = `
      // import {a} from './commentaire.js';
      /* import {b} from './bloc.js'; */
      import {a, b} from './un.js';
      import {
        c,
        d,
      } from '../deux.js';
      import './effet.js';
      import donnees from './donnees.json' with {type: 'json'};
      export * from './trois.js';
      export {e} from './quatre.js';
      export const texte = "import {x} from './chaine.js'";
      import {f} from 'paquet-npm';
      const plus = await import('./dynamique.js');
      const adresse = 'https://exemple.fr/x.js'; // import {g} from './fin-de-ligne.js';
    `;
    expect(importsRelatifs(source).sort()).toEqual(['../deux.js', './donnees.json', './dynamique.js', './effet.js', './quatre.js', './trois.js', './un.js']);
  });
});

describe('assemblerSite', () => {
  it('copie la page, ses feuilles de style, le fichier vendorisé et les seuls modules atteints', async () => {
    const sortie = path.join(await dossierTemporaire(), 'site');
    const fichiers = await assemblerSite({sortie});
    expect(await listerFichiers(sortie)).toEqual(fichiers);
    for (const attendu of ['index.html', 'src/main.js', 'src/app.js', 'src/style.css', 'src/ui/impression.css', 'vendor/grist-plugin-api.js', 'img/grist-factory-logo.jpg']) {
      expect(fichiers, attendu).toContain(attendu);
    }
    const intrus = fichiers.filter((f) => /\.test\.js$|\.d\.ts$|^scripts\/|^src\/dev\/|dev-bench|test-fixtures|^outils\/|node_modules/.test(f));
    expect(intrus).toEqual([]);
  });

  it('livre un site fermé : chaque import relatif de chaque module copié mène à un fichier copié', async () => {
    const sortie = path.join(await dossierTemporaire(), 'site');
    const fichiers = new Set(await assemblerSite({sortie}));
    const manquants = [];
    for (const f of [...fichiers].filter((x) => x.endsWith('.js'))) {
      if (f.startsWith('vendor/')) continue;
      for (const s of importsRelatifs(await readFile(path.join(sortie, f), 'utf8'))) {
        const cible = path.posix.normalize(path.posix.join(path.posix.dirname(f), s));
        if (!fichiers.has(cible)) manquants.push(`${f} → ${s}`);
      }
    }
    expect(manquants).toEqual([]);
  });

  it('arrête l\'assemblage sur un import qui ne mène à rien', async () => {
    const racine = await dossierTemporaire();
    await writeFile(path.join(racine, 'index.html'), '<script type="module" src="./a.js"></script>');
    await writeFile(path.join(racine, 'a.js'), "import './absent.js';\n");
    await expect(assemblerSite({racine, sortie: path.join(racine, 'sortie')})).rejects.toThrow(/import introuvable : \.\/absent\.js/);
  });

  it('arrête l\'assemblage sur l\'import d\'une feuille de style, que le navigateur ne sait pas charger ainsi', async () => {
    const racine = await dossierTemporaire();
    await writeFile(path.join(racine, 'index.html'), '<script type="module" src="./a.js"></script>');
    await writeFile(path.join(racine, 'a.js'), "import './style.css';\n");
    await writeFile(path.join(racine, 'style.css'), 'body {}\n');
    await expect(assemblerSite({racine, sortie: path.join(racine, 'sortie')})).rejects.toThrow(/import d'une feuille de style \(\.\/style\.css\).*<link> dans index\.html/);
  });

  it('arrête l\'assemblage sur une balise qui cite un fichier absent', async () => {
    const racine = await dossierTemporaire();
    await writeFile(path.join(racine, 'index.html'), '<link rel="stylesheet" href="./style.css" />');
    await expect(assemblerSite({racine, sortie: path.join(racine, 'sortie')})).rejects.toThrow(/fichier introuvable : style\.css/);
  });

  it('suit les imports jusque dans les sous-dossiers, et copie un JSON importé', async () => {
    const racine = await dossierTemporaire();
    await mkdir(path.join(racine, 'src/sous'), {recursive: true});
    await writeFile(path.join(racine, 'index.html'), '<script type="module" src="./src/a.js"></script>');
    await writeFile(path.join(racine, 'src/a.js'), "import {b} from './sous/b.js';\nimport d from './d.json' with {type: 'json'};\n");
    await writeFile(path.join(racine, 'src/sous/b.js'), "export {c} from '../c.js';\n");
    await writeFile(path.join(racine, 'src/c.js'), 'export const c = 1;\n');
    await writeFile(path.join(racine, 'src/d.json'), '{}');
    await writeFile(path.join(racine, 'src/jamais.js'), 'export const jamais = 1;\n');
    const fichiers = await assemblerSite({racine, sortie: path.join(racine, 'sortie')});
    expect(fichiers).toEqual(['index.html', 'src/a.js', 'src/c.js', 'src/d.json', 'src/sous/b.js']);
  });
});
