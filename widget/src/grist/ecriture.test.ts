import {describe, expect, it} from 'vitest';
import {
  actionsCreerGroupe,
  actionsDefinirCompetencesBenevole,
  actionsDefinirPlaces,
  actionsEcrireDisponibilites,
  actionsEnregistrerHeureCoupure,
  actionsEnregistrerParametresAlgorithme,
  actionsPositionnerGroupe,
  actionsVerrouillerPlace,
  appliquerActions,
} from './ecriture';
import {PARAMETRES_PAR_DEFAUT} from '../moteur/types';

describe('actionsCreerGroupe', () => {
  it('construit un AddRecord avec Equipe encodée et un id laissé à Grist', () => {
    expect(actionsCreerGroupe({code: 'AC01', taille: 2, equipeId: 10})).toEqual([
      ['AddRecord', 'Groupes', null, {Code: 'AC01', Taille: 2, Equipe: 10, Notes: ''}],
    ]);
  });

  it('encode une équipe absente en 0, jamais null (valeur Ref vide de Grist)', () => {
    const action = actionsCreerGroupe({code: 'X', taille: 2, equipeId: null})[0]!;
    expect((action[3] as {Equipe: unknown}).Equipe).toBe(0);
  });
});

describe('actionsPositionnerGroupe', () => {
  it('construit un BulkAddRecord répétant le groupe pour chaque besoin', () => {
    expect(actionsPositionnerGroupe(60, [50, 51])).toEqual([
      ['BulkAddRecord', 'Positions_groupe', [null, null], {Groupe: [60, 60], Besoin: [50, 51]}],
    ]);
  });

  it('ne construit aucune action pour une liste de besoins vide', () => {
    expect(actionsPositionnerGroupe(60, [])).toEqual([]);
  });
});

describe('actionsDefinirPlaces', () => {
  it('construit un BulkAddRecord avec les bénévoles encodés en Ref', () => {
    const actions = actionsDefinirPlaces(60, [
      {rang: 1, benevoleId: 1, origine: 'Algorithme', verrouillee: false, score: 0.8},
      {rang: 2, benevoleId: null, origine: 'Algorithme', verrouillee: false, score: null},
    ]);
    expect(actions).toEqual([[
      'BulkAddRecord', 'Places', [null, null],
      {
        Groupe: [60, 60],
        Rang: [1, 2],
        Benevole: [1, 0],
        Origine: ['Algorithme', 'Algorithme'],
        Verrouillee: [false, false],
        Score: [0.8, null],
      },
    ]]);
  });
});

describe('actionsVerrouillerPlace', () => {
  it('construit un UpdateRecord ciblant Verrouillee', () => {
    expect(actionsVerrouillerPlace(81, true)).toEqual([
      ['UpdateRecord', 'Places', 81, {Verrouillee: true}],
    ]);
  });
});

describe('actionsEcrireDisponibilites', () => {
  it('construit un BulkAddRecord avec Artiste encodé en Ref', () => {
    const actions = actionsEcrireDisponibilites([
      {benevoleId: 1, quartHeure: 1000, statut: 'Disponible', artisteId: null},
      {benevoleId: 1, quartHeure: 1900, statut: 'Artiste', artisteId: 5},
    ]);
    expect(actions).toEqual([[
      'BulkAddRecord', 'Disponibilites', [null, null],
      {
        Benevole: [1, 1],
        Quart_heure: [1000, 1900],
        Statut: ['Disponible', 'Artiste'],
        Artiste: [0, 5],
      },
    ]]);
  });

  it('ne construit aucune action pour une liste vide', () => {
    expect(actionsEcrireDisponibilites([])).toEqual([]);
  });
});

describe('actionsDefinirCompetencesBenevole', () => {
  it('encode la ChoiceList avec le code L', () => {
    expect(actionsDefinirCompetencesBenevole(1, ['Majeur', 'SST'])).toEqual([
      ['UpdateRecord', 'Benevoles', 1, {Competences: ['L', 'Majeur', 'SST']}],
    ]);
  });
});

describe('upsert sur Parametres', () => {
  it('actionsEnregistrerHeureCoupure crée la ligne si la clé est absente', () => {
    expect(actionsEnregistrerHeureCoupure(7, [])).toEqual([
      ['AddRecord', 'Parametres', null, {Cle: 'heure_coupure_jour', Valeur: '7'}],
    ]);
  });

  it('actionsEnregistrerHeureCoupure met à jour la ligne existante plutôt que d\'en créer une deuxième', () => {
    const existantes = [{id: 120, cle: 'heure_coupure_jour', valeur: '6'}];
    expect(actionsEnregistrerHeureCoupure(7, existantes)).toEqual([
      ['UpdateRecord', 'Parametres', 120, {Valeur: '7'}],
    ]);
  });

  it('actionsEnregistrerParametresAlgorithme distingue clés existantes et nouvelles dans le même appel', () => {
    const existantes = [{id: 200, cle: 'pas_secondes', valeur: '900'}];
    const actions = actionsEnregistrerParametresAlgorithme(PARAMETRES_PAR_DEFAUT, existantes);

    const majPasSecondes = actions.find((a) => a[0] === 'UpdateRecord' && a[2] === 200);
    expect(majPasSecondes).toEqual(['UpdateRecord', 'Parametres', 200, {Valeur: '900'}]);

    const ajoutsConflitArtiste = actions.filter(
      (a) => a[0] === 'AddRecord' && (a[3] as {Cle: string}).Cle === 'poids.conflit_artiste',
    );
    expect(ajoutsConflitArtiste).toEqual([
      ['AddRecord', 'Parametres', null, {Cle: 'poids.conflit_artiste', Valeur: '-0.4'}],
    ]);

    // Une clé déjà présente ne doit jamais réapparaître comme AddRecord.
    expect(actions.some((a) => a[0] === 'AddRecord' && (a[3] as {Cle: string}).Cle === 'pas_secondes')).toBe(false);
  });
});

describe('appliquerActions', () => {
  it('ne fait aucun appel réseau quand il n\'y a aucune action', async () => {
    let appele = false;
    const docApi = {applyUserActions: async () => { appele = true; return {retValues: []}; }};
    const resultat = await appliquerActions(docApi, []);
    expect(appele).toBe(false);
    expect(resultat).toEqual([]);
  });

  it('extrait retValues d\'un résultat {retValues}', async () => {
    const docApi = {applyUserActions: async () => ({retValues: [42]})};
    expect(await appliquerActions(docApi, [['AddRecord', 'Groupes', null, {}]])).toEqual([42]);
  });

  it('accepte aussi un résultat qui serait directement le tableau retValues', async () => {
    const docApi = {applyUserActions: async () => [42]};
    expect(await appliquerActions(docApi, [['AddRecord', 'Groupes', null, {}]])).toEqual([42]);
  });
});
