import {describe, expect, it} from 'vitest';
import {construireDonneesPlanning, construireLignesParametres, zipperTable, type DocumentBrut} from './lecture';

describe('zipperTable', () => {
  it('dézippe une table colonnaire en tableau de lignes', () => {
    const table = {id: [1, 2], Nom: ['Alice', 'Bob'], Age: [30, 40]};
    expect(zipperTable(table)).toEqual([
      {id: 1, Nom: 'Alice', Age: 30},
      {id: 2, Nom: 'Bob', Age: 40},
    ]);
  });

  it('rend un tableau vide pour une table absente ou sans id', () => {
    expect(zipperTable(undefined)).toEqual([]);
    expect(zipperTable({Nom: ['Alice']})).toEqual([]);
  });

  it('rend un tableau vide pour une table réellement vide', () => {
    expect(zipperTable({id: []})).toEqual([]);
  });
});

/** Un document minimal mais complet, une ligne par table concernée. */
function documentDeTest(): DocumentBrut {
  return {
    Benevoles: {
      id: [1],
      Nom: ['Alice Martin'],
      Contact: ['alice@exemple.test'],
      Equipe: [10],
      Competences: [['L', 'Majeur', 'SST']],
      Quota_heures_min: [4],
      Quota_heures_max: [12],
      Statut: ['Actif'],
      Notes: [''],
    },
    Missions: {
      id: [20],
      Nom: ['Bar chapiteau'],
      Description: [''],
      Lieu: [0],
      Equipe: [10],
      Priorite: ['Critique'],
      Competences_requises: [['L', 'Majeur']],
    },
    Sous_creneaux: {
      id: [30],
      Macro_creneau: [40],
      Mission: [0],
      Libelle: ['10h–11h30'],
      Debut: [1000],
      Fin: [2000],
    },
    Besoins: {
      id: [50],
      Mission: [20],
      Sous_creneau: [30],
      Effectif_min: [2],
      Effectif_max: [4],
      Taille_groupe: [2],
    },
    Groupes: {
      id: [60],
      Code: ['AC01'],
      Taille: [2],
      Equipe: [10],
      Notes: [''],
    },
    Positions_groupe: {
      id: [70],
      Groupe: [60],
      Besoin: [50],
    },
    Places: {
      id: [80, 81],
      Groupe: [60, 60],
      Rang: [1, 2],
      Benevole: [1, 0],
      Origine: ['Algorithme', 'Algorithme'],
      Verrouillee: [false, true],
      Score: [0.8, null],
    },
    Disponibilites: {
      id: [90],
      Benevole: [1],
      Quart_heure: [1000],
      Statut: ['Disponible'],
      Artiste: [0],
    },
    Souhaits_missions: {
      id: [100],
      Benevole: [1],
      Mission: [20],
      Preference: ['Souhaite fortement'],
    },
    Affinites: {
      id: [110],
      Benevole_A: [1],
      Benevole_B: [2],
      Type: ['Éviter'],
    },
    Parametres: {
      id: [120, 121],
      Cle: ['heure_coupure_jour', 'pas_secondes'],
      Valeur: ['6', '900'],
    },
  };
}

describe('construireDonneesPlanning', () => {
  const donnees = construireDonneesPlanning(documentDeTest());

  it('décode un bénévole, y compris sa ChoiceList de compétences', () => {
    expect(donnees.benevoles).toEqual([{
      id: 1,
      nom: 'Alice Martin',
      equipeId: 10,
      competences: ['Majeur', 'SST'],
      quotaHeuresMin: 4,
      quotaHeuresMax: 12,
      statut: 'Actif',
    }]);
  });

  it('décode une mission', () => {
    expect(donnees.missions).toEqual([{
      id: 20,
      nom: 'Bar chapiteau',
      equipeId: 10,
      priorite: 'Critique',
      competencesRequises: ['Majeur'],
    }]);
  });

  it('décode un besoin et un groupe positionné dessus', () => {
    expect(donnees.besoins).toEqual([{
      id: 50, missionId: 20, sousCreneauId: 30, effectifMin: 2, effectifMax: 4, tailleGroupe: 2,
    }]);
    expect(donnees.groupes).toEqual([{id: 60, code: 'AC01', taille: 2, equipeId: 10}]);
    expect(donnees.positionsGroupe).toEqual([{id: 70, groupeId: 60, besoinId: 50}]);
  });

  it('décode les places du groupe, y compris une place non pourvue et une place verrouillée', () => {
    expect(donnees.places).toEqual([
      {id: 80, groupeId: 60, rang: 1, benevoleId: 1, origine: 'Algorithme', verrouillee: false, score: 0.8},
      {id: 81, groupeId: 60, rang: 2, benevoleId: null, origine: 'Algorithme', verrouillee: true, score: null},
    ]);
  });

  it('décode une disponibilité, sans id (clé naturelle bénévole+quart)', () => {
    expect(donnees.disponibilites).toEqual([
      {benevoleId: 1, quartHeure: 1000, statut: 'Disponible', artisteId: null},
    ]);
  });

  it('décode un souhait de mission et une affinité', () => {
    expect(donnees.souhaitsMissions).toEqual([
      {benevoleId: 1, missionId: 20, preference: 'Souhaite fortement'},
    ]);
    expect(donnees.affinites).toEqual([{benevoleAId: 1, benevoleBId: 2, type: 'Éviter'}]);
  });

  it('rend des tableaux vides pour les tables absentes du document', () => {
    const vide = construireDonneesPlanning({});
    expect(vide.benevoles).toEqual([]);
    expect(vide.places).toEqual([]);
  });
});

describe('construireLignesParametres', () => {
  it('décode la table Parametres en lignes clé/valeur, id de ligne inclus', () => {
    expect(construireLignesParametres(documentDeTest())).toEqual([
      {id: 120, cle: 'heure_coupure_jour', valeur: '6'},
      {id: 121, cle: 'pas_secondes', valeur: '900'},
    ]);
  });

  it('rend un tableau vide si la table Parametres n\'existe pas encore', () => {
    expect(construireLignesParametres({})).toEqual([]);
  });
});
