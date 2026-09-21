import {afterEach, describe, expect, it, vi} from 'vitest';

describe('démarrage du widget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as {grist?: unknown}).grist;
  });

  async function demarrerEtAttendre(): Promise<void> {
    document.body.innerHTML = '<div id="app"></div>';
    // `main.ts` s'exécute à l'import (`void demarrer()`) : un module frais
    // par test isole ce déclenchement, `resetModules` seul ne suffit pas.
    vi.resetModules();
    await import('./main');
    // `demarrer()` n'est pas exposé : on laisse ses micro-tâches (et,
    // pour le cas « pas de réponse », son `setTimeout`) se dérouler.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('sans window.grist, monte la démonstration', async () => {
    await demarrerEtAttendre();
    expect(document.querySelector('.pill--neutral')?.textContent).toBe('Démonstration — jeu de données figé');
  });

  it('avec un document Grist connecté (même vide), monte la maquette sur ses données', async () => {
    window.grist = {
      ready: () => {},
      docApi: {
        listTables: async () => [],
        fetchTable: async () => ({id: []}),
        applyUserActions: async () => ({retValues: []}),
      },
    };
    await demarrerEtAttendre();
    expect(document.querySelector('.pill--neutral')?.textContent).toBe('Document Grist connecté');
  });

  it('si la lecture du document Grist échoue, retombe sur la démonstration plutôt que de casser la page', async () => {
    window.grist = {
      ready: () => {},
      docApi: {
        listTables: async () => { throw new Error('document indisponible'); },
        fetchTable: async () => ({id: []}),
        applyUserActions: async () => ({retValues: []}),
      },
    };
    await demarrerEtAttendre();
    expect(document.querySelector('.pill--neutral')?.textContent).toBe('Démonstration — jeu de données figé');
  });
});
