import {afterEach, describe, expect, it, vi} from 'vitest';
import {LIBELLE_PAR_TABLE} from './grist';
import {epochDepuisHeureLocale} from './temps';

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
    // `demarrer()` n'est pas exposé : on laisse ses micro-tâches se dérouler.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** Les identifiants réels tels que `docApi.listTables()` les renverrait :
   *  les libellés (titres), pas les noms de schéma — `resoudreIdsTables`
   *  résout par comparaison normalisée avec `LIBELLE_PAR_TABLE`, exactement
   *  comme Grist dérive l'identifiant réel d'une table de son titre (voir
   *  `grist/tables.ts`). `Positions_groupe`/`Souhaits_missions` sont les cas
   *  où schéma et libellé divergent le plus — piège vécu par ce module. */
  const TOUTES_LES_TABLES = Object.values(LIBELLE_PAR_TABLE);

  it('avec un document Grist connecté dont les tables existent mais sont vides (premier jour), monte la maquette dessus', async () => {
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

  it("si la lecture du document Grist échoue (vrai échec), affiche l'échec plutôt que de casser la page silencieusement — plus de repli sur une démonstration (retrait du 2026-09-23)", async () => {
    window.grist = {
      ready: () => {},
      docApi: {
        listTables: async () => { throw new Error('document indisponible'); },
        fetchTable: async () => ({id: []}),
        applyUserActions: async () => ({retValues: []}),
      },
    };
    await demarrerEtAttendre();
    expect(document.querySelector('.pill--neutral')).toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('Échec de connexion au document Grist');
    expect(document.body.textContent).toContain('document indisponible');
  });

  it("si le document connecté n'a aucune des tables attendues, ce n'est pas une vue vide silencieuse : un message le dit", async () => {
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

  it("en mode connecté, un redécoupage automatique crée d'abord les nouveaux sous-créneaux puis supprime les anciens (jamais l'inverse) ; si la suppression échoue après la création, le dit sans prétendre à une annulation", async () => {
    const debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12});
    const actionsRecues: unknown[][][] = [];
    window.grist = {
      ready: () => {},
      docApi: {
        listTables: async () => TOUTES_LES_TABLES,
        fetchTable: async (id: string) => {
          if (id === LIBELLE_PAR_TABLE.Macro_creneaux) { return {id: [1], Nom: ['Vendredi'], Debut: [debut], Fin: [fin]}; }
          if (id === LIBELLE_PAR_TABLE.Sous_creneaux) {
            return {id: [10], Macro_creneau: [1], Mission: [0], Libelle: ['ancien'], Debut: [debut], Fin: [debut + 3600]};
          }
          return {id: []};
        },
        applyUserActions: async (actions: unknown[][]) => {
          actionsRecues.push(actions);
          const type = (actions[0] as unknown[])[0];
          if (type === 'BulkAddRecord') { return {retValues: [[701, 702]]}; }
          if (type === 'BulkRemoveRecord') { throw new Error('document indisponible'); }
          return {retValues: []};
        },
      },
    };
    await demarrerEtAttendre();
    expect(document.querySelector('.pill--neutral')?.textContent).toBe('Document Grist connecté');

    const boutonModifier = Array.from(document.querySelectorAll('button')).find((b) => b.title === 'Modifier') as HTMLButtonElement;
    boutonModifier.click();
    const boutonRedecouper = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Redécouper automatiquement') as HTMLButtonElement;
    boutonRedecouper.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actionsRecues).toHaveLength(2);
    expect((actionsRecues[0]![0] as unknown[])[0]).toBe('BulkAddRecord');
    expect((actionsRecues[1]![0] as unknown[])[0]).toBe('BulkRemoveRecord');
    const messageErreur = document.querySelector('.field-erreur:not([hidden])')?.textContent;
    expect(messageErreur).toContain('bien été créés');
    expect(messageErreur).not.toContain('annulé');
  });

  it("sur un document vide, lancer l'algorithme depuis l'onglet Affectation dit ce qui manque en langage métier plutôt que de prétendre que tout est couvert", async () => {
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

    const ongletAffectation = Array.from(document.querySelectorAll('.rail__item'))
      .find((b) => b.textContent?.includes('Affectation')) as HTMLButtonElement;
    ongletAffectation.click();
    const boutonLancer = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === "Lancer l'algorithme") as HTMLButtonElement;
    boutonLancer.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Rien n'est positionné (aucun indicatif) : ni le faux « 0/0 places
    // remplies, aucune anomalie » de l'ancien comportement, ni un message
    // technique — juste ce qui manque et où aller le faire.
    expect(document.body.textContent).not.toContain('entièrement couvert');
    expect(document.body.textContent).toContain("Positionnez des indicatifs");
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

  it("sur un document neuf sans la table Parametres, la crée automatiquement (Cle/Valeur) plutôt que de laisser "
    + 'toute écriture qui en dépend échouer en silence (régression constatée par Connexion Grist le 2026-09-23 : '
    + 'Parametres manquait de TABLES_REQUISES malgré des écritures qui en dépendent désormais)', async () => {
    let parametresCreee = false;
    const actionsRecues: unknown[][][] = [];
    window.grist = {
      ready: () => {},
      docApi: {
        listTables: async () => (
          parametresCreee ? TOUTES_LES_TABLES : TOUTES_LES_TABLES.filter((t) => t !== LIBELLE_PAR_TABLE.Parametres)
        ),
        fetchTable: async () => ({id: []}),
        applyUserActions: async (actions: unknown[][]) => {
          actionsRecues.push(actions);
          if ((actions[0] as unknown[])?.[0] === 'AddTable' && (actions[0] as unknown[])?.[1] === 'Parametres') {
            parametresCreee = true;
          }
          return {retValues: []};
        },
      },
    };
    await demarrerEtAttendre();

    expect(document.querySelector('.pill--neutral')?.textContent).toBe('Document Grist connecté');
    expect(actionsRecues).toEqual([[['AddTable', 'Parametres', [
      {id: 'Cle', type: 'Text', isFormula: false, formula: '', label: 'Clé'},
      {id: 'Valeur', type: 'Text', isFormula: false, formula: '', label: 'Valeur'},
    ]]]]);
  });

  it("sur un document où Parametres existe déjà avec des lignes, ne la recrée ni ne l'écrase (document de "
    + 'production, pas un document neuf)', async () => {
    const actionsRecues: unknown[][][] = [];
    window.grist = {
      ready: () => {},
      docApi: {
        listTables: async () => TOUTES_LES_TABLES,
        fetchTable: async (id: string) => (
          id === LIBELLE_PAR_TABLE.Parametres
            ? {id: [1], Cle: ['heure_coupure_jour'], Valeur: ['7']}
            : {id: []}
        ),
        applyUserActions: async (actions: unknown[][]) => { actionsRecues.push(actions); return {retValues: []}; },
      },
    };
    await demarrerEtAttendre();

    expect(document.querySelector('.pill--neutral')?.textContent).toBe('Document Grist connecté');
    expect(actionsRecues).toEqual([]);
  });
});
