// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';

const lire = (relatif) => readFile(new URL(`../${relatif}`, import.meta.url), 'utf8');

describe('src/grist/schema.js', () => {
  it('reste identique à dev/seed/schema.mjs, que les scripts de dev/seed lisent aussi', async () => {
    // Le dossier publié doit se suffire (GitHub Pages ne sert pas dev/) : schema.js en est une copie.
    // Pour changer le schéma, modifier dev/seed/schema.mjs puis copier le fichier dans src/grist/schema.js.
    const source = await lire('../dev/seed/schema.mjs');
    const copie = await lire('src/grist/schema.js');
    expect(copie).toBe(source);
  });
});
