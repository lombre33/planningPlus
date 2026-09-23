import {describe, expect, it} from 'vitest';
import {
  actionsActualiserBenevolesSource,
  actionsCreerArtiste,
  actionsCreerBenevolesSource,
  actionsCreerBesoin,
  actionsCreerGroupe,
  actionsCreerMacroCreneau,
  actionsCreerMission,
  actionsCreerSousCreneaux,
  actionsDefinirAbsence,
  actionsDefinirCompetencesBenevole,
  actionsDefinirParametre,
  actionsDefinirPlaces,
  actionsDeplacerMacroCreneau,
  actionsDeplacerPositionGroupe,
  actionsEcrireDisponibilites,
  actionsEnregistrerHeureCoupure,
  actionsEnregistrerParametresAlgorithme,
  actionsModifierArtiste,
  actionsModifierGroupe,
  actionsModifierMission,
  actionsModifierPlaces,
  actionsModifierSousCreneau,
  actionsModifierSousCreneaux,
  actionsPositionnerGroupe,
  actionsRenommerMacroCreneau,
  actionsRetirerPositionGroupe,
  actionsSupprimerBesoin,
  actionsSupprimerDisponibilites,
  actionsSupprimerGroupe,
  actionsSupprimerMacroCreneau,
  actionsSupprimerMission,
  actionsSupprimerSousCreneaux,
  actionsVerrouillerPlace,
  appliquerActions,
} from './ecriture';
import {PARAMETRES_PAR_DEFAUT} from '../moteur/types';

describe('actionsCreerMission', () => {
  it('construit un AddRecord avec Lieu/Equipe encodés et les compétences en ChoiceList', () => {
    expect(actionsCreerMission({
      nom: 'Bar principal',
      description: 'Servir les boissons',
      lieuId: 3,
      equipeId: 1,
      priorite: 'Critique',
      competencesRequises: ['Majeur', 'Caisse'],
    })).toEqual([
      ['AddRecord', 'Missions', null, {
        Nom: 'Bar principal',
        Description: 'Servir les boissons',
        Lieu: 3,
        Equipe: 1,
        Priorite: 'Critique',
        Competences_requises: ['L', 'Majeur', 'Caisse'],
      }],
    ]);
  });

  it('encode un lieu ou une équipe absents en 0, et une description/compétences absentes en vide', () => {
    const action = actionsCreerMission({nom: 'X', lieuId: null, equipeId: null, priorite: 'Normale'})[0]!;
    expect(action[3]).toEqual({
      Nom: 'X', Description: '', Lieu: 0, Equipe: 0, Priorite: 'Normale', Competences_requises: ['L'],
    });
  });
});

describe('actionsModifierMission', () => {
  it('ne touche que les champs fournis', () => {
    expect(actionsModifierMission(9, {nom: 'Bar VIP'})).toEqual([
      ['UpdateRecord', 'Missions', 9, {Nom: 'Bar VIP'}],
    ]);
  });

  it('efface une référence explicitement mise à null (encodée 0, jamais null)', () => {
    expect(actionsModifierMission(9, {lieuId: null})).toEqual([
      ['UpdateRecord', 'Missions', 9, {Lieu: 0}],
    ]);
  });

  it("ne construit aucune action quand aucun champ n'est fourni", () => {
    expect(actionsModifierMission(9, {})).toEqual([]);
  });
});

describe('actionsCreerArtiste', () => {
  it('construit un AddRecord avec Lieu encodé', () => {
    expect(actionsCreerArtiste({nom: 'DJ Set', lieuId: 3, debut: 1000, fin: 2000})).toEqual([
      ['AddRecord', 'Artistes', null, {Nom: 'DJ Set', Lieu: 3, Debut: 1000, Fin: 2000}],
    ]);
  });

  it('encode un lieu absent en 0', () => {
    const action = actionsCreerArtiste({nom: 'X', lieuId: null, debut: 0, fin: 1})[0]!;
    expect(action[3]).toEqual({Nom: 'X', Lieu: 0, Debut: 0, Fin: 1});
  });
});

describe('actionsModifierArtiste', () => {
  it('ne touche que les champs fournis', () => {
    expect(actionsModifierArtiste(4, {nom: 'DJ Set (retard)'})).toEqual([
      ['UpdateRecord', 'Artistes', 4, {Nom: 'DJ Set (retard)'}],
    ]);
  });

  it('efface une référence explicitement mise à null (encodée 0, jamais null)', () => {
    expect(actionsModifierArtiste(4, {lieuId: null})).toEqual([
      ['UpdateRecord', 'Artistes', 4, {Lieu: 0}],
    ]);
  });

  it("ne construit aucune action quand aucun champ n'est fourni", () => {
    expect(actionsModifierArtiste(4, {})).toEqual([]);
  });
});

describe('actionsSupprimerMission', () => {
  it('construit un RemoveRecord', () => {
    expect(actionsSupprimerMission(9)).toEqual([['RemoveRecord', 'Missions', 9]]);
  });
});

describe('actionsCreerMacroCreneau', () => {
  it('construit un AddRecord avec Debut/Fin', () => {
    expect(actionsCreerMacroCreneau({nom: 'Journée vendredi', debut: 1000, fin: 2000})).toEqual([
      ['AddRecord', 'Macro_creneaux', null, {Nom: 'Journée vendredi', Debut: 1000, Fin: 2000}],
    ]);
  });
});

describe('actionsDeplacerMacroCreneau', () => {
  it('construit un UpdateRecord ciblant Debut/Fin', () => {
    expect(actionsDeplacerMacroCreneau(7, 1100, 2100)).toEqual([
      ['UpdateRecord', 'Macro_creneaux', 7, {Debut: 1100, Fin: 2100}],
    ]);
  });
});

describe('actionsRenommerMacroCreneau', () => {
  it('construit un UpdateRecord ciblant Nom', () => {
    expect(actionsRenommerMacroCreneau(7, 'Journée samedi')).toEqual([
      ['UpdateRecord', 'Macro_creneaux', 7, {Nom: 'Journée samedi'}],
    ]);
  });
});

describe('actionsSupprimerMacroCreneau', () => {
  it('construit un RemoveRecord', () => {
    expect(actionsSupprimerMacroCreneau(7)).toEqual([['RemoveRecord', 'Macro_creneaux', 7]]);
  });
});

describe('actionsCreerSousCreneaux', () => {
  it('construit un BulkAddRecord avec Mission encodée en Ref (null pour un sous-créneau commun)', () => {
    const actions = actionsCreerSousCreneaux([
      {macroCreneauId: 7, missionId: null, libelle: '10:00–11:30', debut: 1000, fin: 1900},
      {macroCreneauId: 7, missionId: 12, libelle: '11:30–13:00', debut: 1900, fin: 2800},
    ]);
    expect(actions).toEqual([[
      'BulkAddRecord', 'Sous_creneaux', [null, null],
      {
        Macro_creneau: [7, 7],
        Mission: [0, 12],
        Libelle: ['10:00–11:30', '11:30–13:00'],
        Debut: [1000, 1900],
        Fin: [1900, 2800],
      },
    ]]);
  });

  it('ne construit aucune action pour une liste vide', () => {
    expect(actionsCreerSousCreneaux([])).toEqual([]);
  });
});

describe('actionsModifierSousCreneau', () => {
  it('ne touche que les champs fournis, Mission encodée en Ref', () => {
    expect(actionsModifierSousCreneau(15, {missionId: 12, libelle: '11:30–13:00'})).toEqual([
      ['UpdateRecord', 'Sous_creneaux', 15, {Mission: 12, Libelle: '11:30–13:00'}],
    ]);
  });

  it('efface la mission (sous-créneau commun) quand missionId est explicitement null', () => {
    expect(actionsModifierSousCreneau(15, {missionId: null})).toEqual([
      ['UpdateRecord', 'Sous_creneaux', 15, {Mission: 0}],
    ]);
  });
});

describe('actionsModifierSousCreneaux', () => {
  it('groupe en un seul BulkUpdateRecord les patches qui partagent le même jeu de champs (redimensionnement avec poussée)', () => {
    expect(actionsModifierSousCreneaux([
      {id: 15, debut: 1000, fin: 1900},
      {id: 16, debut: 1900, fin: 2800},
    ])).toEqual([
      ['BulkUpdateRecord', 'Sous_creneaux', [15, 16], {Debut: [1000, 1900], Fin: [1900, 2800]}],
    ]);
  });

  it('garde un patch isolé (jeu de champs unique) en UpdateRecord', () => {
    expect(actionsModifierSousCreneaux([
      {id: 15, debut: 1000, fin: 1900},
      {id: 16, debut: 1900, fin: 2800},
      {id: 17, libelle: 'Renommé'},
    ])).toEqual([
      ['BulkUpdateRecord', 'Sous_creneaux', [15, 16], {Debut: [1000, 1900], Fin: [1900, 2800]}],
      ['UpdateRecord', 'Sous_creneaux', 17, {Libelle: 'Renommé'}],
    ]);
  });

  it("ne construit aucune action pour un patch sans champ, ni pour une liste vide", () => {
    expect(actionsModifierSousCreneaux([{id: 15}])).toEqual([]);
    expect(actionsModifierSousCreneaux([])).toEqual([]);
  });
});

describe('actionsSupprimerSousCreneaux', () => {
  it('construit un BulkRemoveRecord', () => {
    expect(actionsSupprimerSousCreneaux([15, 16])).toEqual([
      ['BulkRemoveRecord', 'Sous_creneaux', [15, 16]],
    ]);
  });

  it('ne construit aucune action pour une liste vide', () => {
    expect(actionsSupprimerSousCreneaux([])).toEqual([]);
  });
});

describe('actionsCreerBesoin', () => {
  it('construit un AddRecord avec Mission et Sous_creneau en Ref simples (jamais 0, toujours fournis)', () => {
    expect(actionsCreerBesoin({
      missionId: 12, sousCreneauId: 15, effectifMin: 1, effectifMax: 3, tailleGroupe: 2,
    })).toEqual([
      ['AddRecord', 'Besoins', null, {
        Mission: 12, Sous_creneau: 15, Effectif_min: 1, Effectif_max: 3, Taille_groupe: 2,
      }],
    ]);
  });
});

describe('actionsSupprimerBesoin', () => {
  it('construit un RemoveRecord', () => {
    expect(actionsSupprimerBesoin(50)).toEqual([['RemoveRecord', 'Besoins', 50]]);
  });
});

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

describe('actionsModifierGroupe', () => {
  it('ne touche que les champs fournis', () => {
    expect(actionsModifierGroupe(60, {taille: 3})).toEqual([
      ['UpdateRecord', 'Groupes', 60, {Taille: 3}],
    ]);
  });
});

describe('actionsSupprimerGroupe', () => {
  it('construit un RemoveRecord', () => {
    expect(actionsSupprimerGroupe(60)).toEqual([['RemoveRecord', 'Groupes', 60]]);
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

describe('actionsDeplacerPositionGroupe', () => {
  it('construit un UpdateRecord ciblant Besoin, en gardant l\'id de la position', () => {
    expect(actionsDeplacerPositionGroupe(500, 51)).toEqual([
      ['UpdateRecord', 'Positions_groupe', 500, {Besoin: 51}],
    ]);
  });
});

describe('actionsRetirerPositionGroupe', () => {
  it('construit un RemoveRecord', () => {
    expect(actionsRetirerPositionGroupe(500)).toEqual([['RemoveRecord', 'Positions_groupe', 500]]);
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

describe('actionsModifierPlaces', () => {
  it('groupe plusieurs patches en un seul BulkUpdateRecord (application des propositions d\'un algorithme)', () => {
    expect(actionsModifierPlaces([
      {id: 81, benevoleId: 3, origine: 'Algorithme', verrouillee: false, score: 0.8},
      {id: 82, benevoleId: null, origine: 'Manuel', verrouillee: true, score: null},
    ])).toEqual([[
      'BulkUpdateRecord', 'Places', [81, 82],
      {
        Benevole: [3, 0],
        Origine: ['Algorithme', 'Manuel'],
        Verrouillee: [false, true],
        Score: [0.8, null],
      },
    ]]);
  });

  it('garde un patch isolé en UpdateRecord', () => {
    expect(actionsModifierPlaces([
      {id: 81, benevoleId: 3, origine: 'Manuel', verrouillee: true, score: 1},
    ])).toEqual([
      ['UpdateRecord', 'Places', 81, {Benevole: 3, Origine: 'Manuel', Verrouillee: true, Score: 1}],
    ]);
  });

  it('ne construit aucune action pour une liste vide', () => {
    expect(actionsModifierPlaces([])).toEqual([]);
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

describe('actionsSupprimerDisponibilites', () => {
  it('construit un BulkRemoveRecord', () => {
    expect(actionsSupprimerDisponibilites([10, 11, 12])).toEqual([
      ['BulkRemoveRecord', 'Disponibilites', [10, 11, 12]],
    ]);
  });

  it('ne construit aucune action pour une liste vide', () => {
    expect(actionsSupprimerDisponibilites([])).toEqual([]);
  });
});

describe('actionsDefinirCompetencesBenevole', () => {
  it('encode la ChoiceList avec le code L', () => {
    expect(actionsDefinirCompetencesBenevole(1, ['Majeur', 'SST'])).toEqual([
      ['UpdateRecord', 'Benevoles', 1, {Competences: ['L', 'Majeur', 'SST']}],
    ]);
  });
});

describe('actionsCreerBenevolesSource', () => {
  it('construit un BulkAddRecord avec Id_source, une équipe par défaut commune, et des quotas/statut par défaut', () => {
    expect(actionsCreerBenevolesSource(
      [{idSource: 501, nom: 'Alice', contact: '0600000000'}, {idSource: 502, nom: 'Bob', contact: ''}],
      7,
    )).toEqual([[
      'BulkAddRecord', 'Benevoles', [null, null],
      {
        Nom: ['Alice', 'Bob'],
        Contact: ['0600000000', ''],
        Equipe: [7, 7],
        Quota_heures_min: [0, 0],
        Quota_heures_max: [40, 40],
        Statut: ['Actif', 'Actif'],
        Id_source: [501, 502],
      },
    ]]);
  });

  it('tableau vide : aucune action', () => {
    expect(actionsCreerBenevolesSource([], 7)).toEqual([]);
  });
});

describe('actionsActualiserBenevolesSource', () => {
  it('construit un BulkUpdateRecord limité à Nom/Contact, jamais équipe/quota/statut', () => {
    expect(actionsActualiserBenevolesSource([
      {id: 1, nom: 'Alice Martin', contact: '0600000000'},
      {id: 2, nom: 'Bob', contact: ''},
    ])).toEqual([[
      'BulkUpdateRecord', 'Benevoles', [1, 2],
      {Nom: ['Alice Martin', 'Bob'], Contact: ['0600000000', '']},
    ]]);
  });

  it('tableau vide : aucune action', () => {
    expect(actionsActualiserBenevolesSource([])).toEqual([]);
  });
});

describe('actionsDefinirAbsence', () => {
  it('marque le bénévole absent et libère plusieurs places en un BulkUpdateRecord', () => {
    expect(actionsDefinirAbsence(1, true, [81, 82])).toEqual([
      ['UpdateRecord', 'Benevoles', 1, {Statut: 'Absent'}],
      ['BulkUpdateRecord', 'Places', [81, 82], {Benevole: [0, 0], Origine: ['Manuel', 'Manuel'], Score: [0, 0]}],
    ]);
  });

  it('libère une seule place en UpdateRecord', () => {
    expect(actionsDefinirAbsence(1, true, [81])).toEqual([
      ['UpdateRecord', 'Benevoles', 1, {Statut: 'Absent'}],
      ['UpdateRecord', 'Places', 81, {Benevole: 0, Origine: 'Manuel', Score: 0}],
    ]);
  });

  it('un retour (absent=false) ne construit qu\'une action, même avec une liste non vide', () => {
    expect(actionsDefinirAbsence(1, false, [])).toEqual([
      ['UpdateRecord', 'Benevoles', 1, {Statut: 'Actif'}],
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

  it('actionsDefinirParametre crée la ligne pour une clé quelconque absente', () => {
    expect(actionsDefinirParametre('cle_arbitraire', 'valeur', [])).toEqual([
      ['AddRecord', 'Parametres', null, {Cle: 'cle_arbitraire', Valeur: 'valeur'}],
    ]);
  });

  it('actionsDefinirParametre met à jour la ligne existante plutôt que d\'en créer une deuxième', () => {
    const existantes = [{id: 55, cle: 'cle_arbitraire', valeur: 'ancienne'}];
    expect(actionsDefinirParametre('cle_arbitraire', 'nouvelle', existantes)).toEqual([
      ['UpdateRecord', 'Parametres', 55, {Valeur: 'nouvelle'}],
    ]);
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
