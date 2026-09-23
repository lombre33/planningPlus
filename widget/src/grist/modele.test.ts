import {describe, expect, it} from 'vitest';
import {type DocumentBrut} from './brut';
import {construireModele} from './modele';

/** Un document minimal mais complet, une ligne par table concernée — les 14 tables du `Modele`. */
function documentDeTest(): DocumentBrut {
  return {
    Equipes: {
      id: [10],
      Nom: ['Accueil'],
      Couleur: ['#ff0000'],
      Referent: [1],
      Notes: [''],
    },
    Lieux: {
      id: [40],
      Nom: ['Grande scène'],
      Description: ['Scène principale'],
    },
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
      Description: ['Service au bar'],
      Lieu: [40],
      Equipe: [10],
      Priorite: ['Critique'],
      Competences_requises: [['L', 'Majeur']],
    },
    Artistes: {
      id: [200],
      Nom: ['Les Baleines'],
      Lieu: [40],
      Debut: [500],
      Fin: [1500],
    },
    Macro_creneaux: {
      id: [400],
      Nom: ['Vendredi soir'],
      Debut: [0],
      Fin: [50000],
    },
    Sous_creneaux: {
      id: [30],
      Macro_creneau: [400],
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
  };
}

describe('construireModele', () => {
  const modele = construireModele(documentDeTest());

  it('décode une équipe, y compris sa référence différée vers un référent bénévole', () => {
    expect(modele.equipes).toEqual([{id: 10, Nom: 'Accueil', Couleur: '#ff0000', Referent: 1, Notes: ''}]);
  });

  it('décode une équipe sans référent (Ref vide -> null)', () => {
    const sansReferent = construireModele({
      Equipes: {id: [11], Nom: ['Logistique'], Couleur: [''], Referent: [0], Notes: ['']},
    });
    expect(sansReferent.equipes).toEqual([{id: 11, Nom: 'Logistique', Couleur: '', Referent: null, Notes: ''}]);
  });

  it('décode un lieu', () => {
    expect(modele.lieux).toEqual([{id: 40, Nom: 'Grande scène', Description: 'Scène principale'}]);
  });

  it('décode un artiste, avec ses bornes en timestamp Unix absolu', () => {
    expect(modele.artistes).toEqual([{id: 200, Nom: 'Les Baleines', Lieu: 40, Debut: 500, Fin: 1500}]);
  });

  it('décode un macro-créneau, sans dépendance à un jour calendaire', () => {
    expect(modele.macroCreneaux).toEqual([{id: 400, Nom: 'Vendredi soir', Debut: 0, Fin: 50000}]);
  });

  it('décode un bénévole avec les noms de colonnes Grist (PascalCase), tous les champs y compris Contact et Notes', () => {
    expect(modele.benevoles).toEqual([{
      id: 1,
      Nom: 'Alice Martin',
      Contact: 'alice@exemple.test',
      Equipe: 10,
      Competences: ['Majeur', 'SST'],
      Quota_heures_min: 4,
      Quota_heures_max: 12,
      Statut: 'Actif',
      Notes: '',
    }]);
  });

  it('décode une mission, y compris Description et Lieu', () => {
    expect(modele.missions).toEqual([{
      id: 20,
      Nom: 'Bar chapiteau',
      Description: 'Service au bar',
      Lieu: 40,
      Equipe: 10,
      Priorite: 'Critique',
      Competences_requises: ['Majeur'],
    }]);
  });

  it("décode une mission sans Priorité renseignée (colonne jamais remplie) comme Normale, pas comme une valeur manquante", () => {
    const sansPriorite = construireModele({
      Missions: {
        id: [21], Nom: ['Sécurité'], Description: [''], Lieu: [0], Equipe: [10],
        Priorite: [''], Competences_requises: [[]],
      },
    });
    expect(sansPriorite.missions[0]).toMatchObject({Priorite: 'Normale'});
  });

  it('décode un sous-créneau, y compris son Libelle', () => {
    expect(modele.sousCreneaux).toEqual([{
      id: 30, Macro_creneau: 400, Mission: null, Libelle: '10h–11h30', Debut: 1000, Fin: 2000,
    }]);
  });

  it('décode un besoin, un groupe et sa position', () => {
    expect(modele.besoins).toEqual([{
      id: 50, Mission: 20, Sous_creneau: 30, Effectif_min: 2, Effectif_max: 4, Taille_groupe: 2,
    }]);
    expect(modele.groupes).toEqual([{id: 60, Code: 'AC01', Taille: 2, Equipe: 10, Notes: ''}]);
    expect(modele.positionsGroupe).toEqual([{id: 70, Groupe: 60, Besoin: 50}]);
  });

  it('décode les places du groupe, y compris une place non pourvue et une place verrouillée', () => {
    expect(modele.places).toEqual([
      {id: 80, Groupe: 60, Rang: 1, Benevole: 1, Origine: 'Algorithme', Verrouillee: false, Score: 0.8},
      {id: 81, Groupe: 60, Rang: 2, Benevole: null, Origine: 'Algorithme', Verrouillee: true, Score: 0},
    ]);
  });

  it('décode une disponibilité, un souhait de mission et une affinité', () => {
    expect(modele.disponibilites).toEqual([
      {Benevole: 1, Quart_heure: 1000, Statut: 'Disponible', Artiste: null},
    ]);
    expect(modele.souhaitsMissions).toEqual([
      {id: 100, Benevole: 1, Mission: 20, Preference: 'Souhaite fortement'},
    ]);
    expect(modele.affinites).toEqual([{id: 110, Benevole_A: 1, Benevole_B: 2, Type: 'Éviter'}]);
  });

  it('rend des tableaux vides pour les 14 tables d\'un document vide, plutôt que de lever', () => {
    const vide = construireModele({});
    expect(vide).toEqual({
      equipes: [], lieux: [], benevoles: [], missions: [], artistes: [], macroCreneaux: [],
      sousCreneaux: [], besoins: [], groupes: [], positionsGroupe: [], places: [],
      disponibilites: [], souhaitsMissions: [], affinites: [],
    });
  });
});
