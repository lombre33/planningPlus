#!/usr/bin/env node
/**
 * Assemble le dossier à publier : `index.html` et, à partir de ses balises, les
 * seuls fichiers dont le widget a besoin. Les tests, les fichiers de
 * développement (`dev/`, `dev-bench.js`) et les scripts n'y entrent jamais.
 *
 * Usage : node outils/assembler-site.mjs <dossier-de-sortie>
 *
 * Il n'y a rien à compiler : les fichiers sont copiés tels quels, aux mêmes
 * chemins relatifs. Le dossier de sortie peut être servi par n'importe quel
 * hébergement statique (`node outils/servir.mjs --racine <dossier-de-sortie>`
 * pour l'essayer en local).
 *
 * Les fichiers à copier se trouvent en suivant les imports (`import … from
 * './x.js'`, `export … from`, `import('./x.js')`) depuis les scripts de type
 * module de la page. Un import qui ne mène à aucun fichier arrête l'assemblage
 * plutôt que de publier un widget cassé.
 */

import {cp, mkdir, readFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const RACINE_WIDGET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Efface les commentaires en gardant les sauts de ligne, pour que le repérage des imports n'y lise rien. */
function sansCommentaires(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

const IMPORT_STATIQUE = /^[ \t]*(?:import|export)\b(?:[^;'"`]*?\bfrom\b)?\s*(['"])(\.{1,2}\/[^'"\n]+)\1/gm;
const IMPORT_DYNAMIQUE = /\bimport\(\s*(['"])(\.{1,2}\/[^'"\n]+)\1\s*\)/g;

/**
 * Spécificateurs relatifs cités par un module JavaScript.
 * @param {string} source
 * @returns {string[]}
 */
export function importsRelatifs(source) {
  const texte = sansCommentaires(source);
  return [...texte.matchAll(IMPORT_STATIQUE), ...texte.matchAll(IMPORT_DYNAMIQUE)].map((m) => m[2]);
}

/** Adresses locales (`./…`) d'attributs `src` et `href` d'une page. */
function referencesDePage(html) {
  const sans = html.replace(/<!--[\s\S]*?-->/g, '');
  const balises = [...sans.matchAll(/<(script|link)\b([^>]*)>/gi)];
  return balises.flatMap(([, nom, attributs]) => {
    const adresse = attributs.match(/\b(?:src|href)="(\.\/[^"]+)"/)?.[1];
    if (!adresse) return [];
    const module = /\btype="module"/.test(attributs);
    return [{adresse: adresse.slice(2), module, balise: nom.toLowerCase()}];
  });
}

/**
 * Copie dans `sortie` la page et tout ce qu'elle charge.
 * @param {{racine?: string, sortie: string, page?: string}} options
 * @returns {Promise<string[]>} chemins copiés, relatifs à `racine`, triés
 */
export async function assemblerSite({racine = RACINE_WIDGET, sortie, page = 'index.html'}) {
  const base = path.resolve(racine);
  const copies = new Set([page]);
  const existe = async (relatif) => {
    try { return (await stat(path.join(base, relatif))).isFile(); } catch { return false; }
  };

  const aVisiter = [];
  for (const ref of referencesDePage(await readFile(path.join(base, page), 'utf8'))) {
    if (!(await existe(ref.adresse))) throw new Error(`${page} : fichier introuvable : ${ref.adresse}`);
    copies.add(ref.adresse);
    if (ref.module) aVisiter.push(ref.adresse);
  }

  const vus = new Set();
  while (aVisiter.length) {
    const courant = aVisiter.pop();
    if (vus.has(courant)) continue;
    vus.add(courant);
    if (!courant.endsWith('.js')) continue;
    const source = await readFile(path.join(base, courant), 'utf8');
    for (const specificateur of importsRelatifs(source)) {
      const cible = path.posix.normalize(path.posix.join(path.posix.dirname(courant), specificateur));
      if (cible.startsWith('..')) throw new Error(`${courant} : import qui sort du dossier du widget : ${specificateur}`);
      if (!(await existe(cible))) throw new Error(`${courant} : import introuvable : ${specificateur}`);
      copies.add(cible);
      aVisiter.push(cible);
    }
  }

  await rm(sortie, {recursive: true, force: true});
  for (const relatif of copies) {
    const destination = path.join(sortie, relatif);
    await mkdir(path.dirname(destination), {recursive: true});
    await cp(path.join(base, relatif), destination);
  }
  return [...copies].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [sortie] = process.argv.slice(2);
  if (!sortie) {
    console.error('Usage : node outils/assembler-site.mjs <dossier-de-sortie>');
    process.exit(2);
  }
  try {
    const fichiers = await assemblerSite({sortie});
    console.log(`${fichiers.length} fichiers copiés dans ${sortie}`);
  } catch (erreur) {
    console.error(erreur.message);
    process.exit(1);
  }
}
