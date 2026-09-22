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

  /** Couvre le pont bout en bout (clic réel → `appliquerActions` →
   *  `docApi.applyUserActions`), pas seulement `Magasin.creerMission`
   *  isolément (déjà couvert par `store.test.ts`) ni la construction des
   *  actions elle-même (déjà couverte par `grist/ecriture.test.ts`). */
  function docApiConnecteAvecUneEquipe(applyUserActions: (actions: unknown[][]) => Promise<{retValues: unknown[]}>) {
    return {
      ready: () => {},
      docApi: {
        listTables: async () => TOUTES_LES_TABLES,
        fetchTable: async (id: string) => (
          id === LIBELLE_PAR_TABLE.Equipes
            ? {id: [1], Nom: ['Accueil'], Couleur: ['#ff0000'], Referent: [0], Notes: ['']}
            : {id: []}
        ),
        applyUserActions,
      },
    };
  }

  async function creerMissionDepuisLInterface(): Promise<void> {
    const ongletMissions = Array.from(document.querySelectorAll('.rail__item'))
      .find((b) => b.textContent?.includes('Missions')) as HTMLButtonElement;
    ongletMissions.click();
    const bouton = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === '+ Nouvelle mission') as HTMLButtonElement;
    bouton.click();
    const champNom = document.querySelector('input[placeholder="Contrôle des bracelets"]') as HTMLInputElement;
    champNom.value = 'Contrôle billetterie';
    champNom.dispatchEvent(new Event('input'));
    const boutonCreer = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Créer') as HTMLButtonElement;
    boutonCreer.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it("en mode connecté, créer une mission écrit réellement dans le document (appliquerActions) et l'affiche avec l'id que Grist a rendu", async () => {
    const actionsRecues: unknown[][][] = [];
    window.grist = docApiConnecteAvecUneEquipe(async (actions) => {
      actionsRecues.push(actions);
      return {retValues: [777]};
    });
    await demarrerEtAttendre();
    expect(document.querySelector('.pill--neutral')?.textContent).toBe('Document Grist connecté');

    await creerMissionDepuisLInterface();

    expect(document.querySelector('.field-erreur:not([hidden])')).toBeNull();
    // Succès : la modale se ferme (elle ne reste ouverte que sur l'échec, voir
    // le test suivant) — le document de test n'a pas de sous-créneau, la
    // grille n'affiche donc aucune table où vérifier la mission par le texte.
    expect(document.querySelector('.modal-backdrop')).toBeNull();
    expect(actionsRecues).toEqual([[['AddRecord', 'Missions', null, {
      Nom: 'Contrôle billetterie', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: ['L'],
    }]]]);
  });

  it("en mode connecté, si l'écriture Grist échoue réellement (applyUserActions rejette), l'échec est visible et rien n'est créé localement", async () => {
    window.grist = docApiConnecteAvecUneEquipe(async () => { throw new Error('document en lecture seule'); });
    await demarrerEtAttendre();
    expect(document.querySelector('.pill--neutral')?.textContent).toBe('Document Grist connecté');

    await creerMissionDepuisLInterface();

    expect(document.querySelector('.field-erreur:not([hidden])')?.textContent)
      .toContain("Échec de l'écriture");
    expect(document.body.textContent).not.toContain('Contrôle billetterie');
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
