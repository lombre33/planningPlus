// @vitest-environment node
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {creerServeur} from './servir.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Requête brute : `fetch` réécrit `/../` avant l'envoi, ce qui cacherait justement le cas à tester. */
function requeter(port, chemin, methode = 'GET') {
  return new Promise((resolve, reject) => {
    const requete = http.request({host: '127.0.0.1', port, path: chemin, method: methode}, (reponse) => {
      const morceaux = [];
      reponse.on('data', (m) => morceaux.push(m));
      reponse.on('end', () => resolve({statut: reponse.statusCode, entetes: reponse.headers, corps: Buffer.concat(morceaux).toString('utf8')}));
    });
    requete.on('error', reject);
    requete.end();
  });
}

describe('serveur de développement', () => {
  const serveur = creerServeur(racine);
  let port;
  beforeAll(() => new Promise((resolve) => serveur.listen(0, '127.0.0.1', () => { port = serveur.address().port; resolve(); })));
  afterAll(() => new Promise((resolve) => serveur.close(resolve)));

  it('sert la page d\'accueil avec l\'en-tête CORS de GitHub Pages', async () => {
    const r = await requeter(port, '/');
    expect(r.statut).toBe(200);
    expect(r.entetes['content-type']).toContain('text/html');
    expect(r.entetes['access-control-allow-origin']).toBe('*');
    expect(r.corps).toContain('<title>PlanningPlus</title>');
  });

  it('sert les modules avec un type JavaScript, sans quoi le navigateur les refuse', async () => {
    const r = await requeter(port, '/src/main.js');
    expect(r.statut).toBe(200);
    expect(r.entetes['content-type']).toContain('text/javascript');
  });

  it('refuse de sortir du dossier servi', async () => {
    // Le décodage d'une barre oblique codée est le seul moyen de faire passer un `..` après l'analyse de l'adresse.
    expect((await requeter(port, '/..%2f..%2fpackage.json')).statut).toBe(403);
    expect((await requeter(port, '/src%2f..%2f..%2f..%2fetc/passwd')).statut).toBe(403);
    // Les `..` écrits en clair (ou en %2e) sont résolus avant : ils ne quittent jamais la racine.
    expect((await requeter(port, '/%2e%2e/%2e%2e/package.json')).statut).toBe(200);
  });

  it('répond 404 à un fichier absent et 405 à une écriture', async () => {
    expect((await requeter(port, '/absent.js')).statut).toBe(404);
    expect((await requeter(port, '/', 'POST')).statut).toBe(405);
  });
});
