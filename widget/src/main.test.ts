import {afterEach, describe, expect, it, vi} from 'vitest';
import {LIBELLE_PAR_TABLE} from './grist';

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

  /** Les identifiants réels tels que `docApi.listTables()` les renverrait :
   *  les libellés (titres), pas les noms de schéma — `resoudreIdsTables`
   *  résout par comparaison normalisée avec `LIBELLE_PAR_TABLE`, exactement
   *  comme Grist dérive l'identifiant réel d'une table de son titre (voir
   *  `grist/tables.ts`). `Positions_groupe`/`Souhaits_missions` sont les cas
   *  où schéma et libellé divergent le plus — piège vécu par ce module. */
  const TOUTES_LES_TABLES = Object.values(LIBELLE_PAR_TABLE);

  it("avec un document Grist connecté dont les tables existent mais sont vides (premier jour), monte la maquette dessus plutôt que la démo", async () => {
    window.grist = {
      ready: () => {},
      docApi: {
        listTables: async () => TOUTES_LES_TABLES,
        fetchTable: async () => ({id: []}),
        applyUserActions: async () => ({retValues: []}),
      },
    };
    await demarrerEtAttendre();
    expect(document.querySelector('.pill--neutral')?.textContent).toBe('Document Grist connecté');
  });

  it("si la lecture du document Grist échoue (vrai échec), retombe sur la démonstration plutôt que de casser la page", async () => {
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

  it("si le document connecté n'a aucune des tables attendues, ce n'est ni la démo ni des vues vides silencieuses : un message le dit", async () => {
    window.grist = {
      ready: () => {},
      docApi: {
        listTables: async () => [],
        fetchTable: async () => ({id: []}),
        applyUserActions: async () => ({retValues: []}),
      },
    };
    await demarrerEtAttendre();
    expect(document.querySelector('.pill--neutral')).toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('Document Grist non reconnu');
    expect(document.body.textContent).toContain('Équipes');
  });

  it("si une seule table manque (ex. Macro-créneaux), nomme précisément celle-là plutôt que de démarrer avec un trou silencieux", async () => {
    window.grist = {
      ready: () => {},
      docApi: {
        listTables: async () => TOUTES_LES_TABLES.filter((t) => t !== LIBELLE_PAR_TABLE.Macro_creneaux),
        fetchTable: async () => ({id: []}),
        applyUserActions: async () => ({retValues: []}),
      },
    };
    await demarrerEtAttendre();
    expect(document.querySelector('.pill--neutral')).toBeNull();
    expect(document.body.textContent).toContain('Macro-créneaux');
  });
});
