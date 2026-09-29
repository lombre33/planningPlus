#!/usr/bin/env node
/**
 * Petit serveur de fichiers pour essayer le widget en local, sans dépendance.
 *
 * Usage : node outils/servir.mjs [--racine <dossier>] [--port <n>] [--page <chemin>]
 *   --racine  dossier servi (par défaut, celui du widget ; `_site/js` pour
 *             essayer le site tel qu'il sera publié)
 *   --port    port d'écoute (5173 par défaut ; 0 laisse le système choisir)
 *   --page    page à afficher dans l'adresse rendue (/index.html par défaut)
 *
 * Il fait ce que fait GitHub Pages : les fichiers tels quels, avec l'en-tête
 * CORS `Access-Control-Allow-Origin: *`. Il ajoute `Cache-Control: no-cache`
 * pour que chaque modification se voie au rechargement. Il n'écoute que sur
 * la machine locale.
 */

import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * Crée le serveur (sans l'écouter). Une adresse qui sortirait de `racine`
 * (`..`) reçoit un 403 ; un chemin absent, un 404.
 * @param {string} racine dossier servi
 */
export function creerServeur(racine) {
  const base = path.resolve(racine);
  return http.createServer(async (requete, reponse) => {
    const repondre = (code, texte, type = 'text/plain; charset=utf-8') => {
      reponse.writeHead(code, {'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache'});
      reponse.end(texte);
    };
    if (requete.method !== 'GET' && requete.method !== 'HEAD') return repondre(405, 'Méthode non permise');
    let chemin;
    try {
      chemin = decodeURIComponent(new URL(requete.url ?? '/', 'http://localhost').pathname);
    } catch {
      return repondre(400, 'Adresse illisible');
    }
    let fichier = path.resolve(base, `.${chemin}`);
    if (fichier !== base && !fichier.startsWith(base + path.sep)) return repondre(403, 'Hors du dossier servi');
    try {
      if ((await stat(fichier)).isDirectory()) fichier = path.join(fichier, 'index.html');
      const contenu = await readFile(fichier);
      reponse.writeHead(200, {
        'Content-Type': TYPES[path.extname(fichier)] ?? 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      reponse.end(requete.method === 'HEAD' ? undefined : contenu);
    } catch {
      repondre(404, `Introuvable : ${chemin}`);
    }
  });
}

function lireOptions(args) {
  const options = {racine: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), port: 5173, page: '/index.html'};
  for (let i = 0; i < args.length; i++) {
    const [nom, valeur] = [args[i], args[i + 1]];
    if (nom === '--racine' && valeur) { options.racine = path.resolve(valeur); i++; }
    else if (nom === '--port' && valeur) { options.port = Number(valeur); i++; }
    else if (nom === '--page' && valeur) { options.page = valeur; i++; }
    else throw new Error(`Option inconnue ou sans valeur : ${nom}`);
  }
  if (!Number.isInteger(options.port) || options.port < 0) throw new Error('--port attend un entier');
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const {racine, port, page} = lireOptions(process.argv.slice(2));
    const serveur = creerServeur(racine);
    serveur.listen(port, '127.0.0.1', () => {
      console.log(`Widget servi depuis ${racine}`);
      console.log(`  http://127.0.0.1:${serveur.address().port}${page}`);
    });
  } catch (erreur) {
    console.error(erreur.message);
    process.exit(2);
  }
}
