// @vitest-environment node
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';

const lire = (relatif) => readFile(new URL(`../${relatif}`, import.meta.url));

describe('vendor/grist-plugin-api.js', () => {
  it("correspond à l'empreinte SHA-256 annoncée dans vendor/README.md", async () => {
    const readme = (await lire('vendor/README.md')).toString('utf8');
    const annoncee = readme.match(/Empreinte SHA-256 :\*\* `([0-9a-f]{64})`/)?.[1];
    expect(annoncee, "empreinte absente de vendor/README.md").toBeDefined();
    const reelle = createHash('sha256').update(await lire('vendor/grist-plugin-api.js')).digest('hex');
    expect(reelle).toBe(annoncee);
  });
});
