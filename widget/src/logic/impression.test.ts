/**
 * Tests des fonctions dérivées pour les deux vues imprimables (roster
 * bénévoles, plannings équipe — demande d'Antoine du 2026-09-23).
 */
import {describe, expect, it} from 'vitest';
import type {Disponibilite, Id, Modele} from '../domain/types';
import {Magasin} from '../store';
import {indexer} from './derive';
import {
  affectationsQuartParBenevole, affectationsQuartParMission, benevolesDisponiblesCeJour, indicatifDuJour,
  segmenterQuarts,
} from './impression';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [],
  };
}

const Q0 = 1000 * 900; // un quart d'heure arbitraire, aligné sur le pas (900s)
const Q1 = Q0 + 900;
const Q2 = Q0 + 1800;
const Q3 = Q0 + 2700;

describe('benevolesDisponiblesCeJour', () => {
  it('inclut un bénévole disponible sur un seul quart (créneau réduit), exclut celui sans aucune ligne', () => {
    const benevoles = [
      {id: 1, Nom: 'Partiel'}, {id: 2, Nom: 'Sans donnée'}, {id: 3, Nom: 'Veut voir un artiste'},
      {id: 4, Nom: 'Indisponible partout'},
    ];
    const index = new Map<Id, Map<number, Disponibilite>>([
      [1, new Map([[Q0, {Benevole: 1, Quart_heure: Q0, Statut: 'Disponible', Artiste: null}]])],
      [3, new Map([[Q0, {Benevole: 3, Quart_heure: Q0, Statut: 'Artiste', Artiste: null}]])],
      [4, new Map([[Q0, {Benevole: 4, Quart_heure: Q0, Statut: 'Indisponible', Artiste: null}]])],
    ]);
    const resultat = benevolesDisponiblesCeJour(benevoles, index, [Q0, Q1]);
    expect(resultat.map((b) => b.id)).toEqual([1, 3]);
  });
});

describe('affectationsQuartParBenevole et indicatifDuJour', () => {
  it('retrouve la mission et l’indicatif d’un bénévole affecté, ignore un groupe orphelin sans planter', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
        {id: 2, Nom: 'Orpheline', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: Q0, Fin: Q2}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [
        {id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0},
        // Groupe 99 inexistant : ne doit jamais faire planter le calcul.
        {id: 2, Groupe: 99, Rang: 1, Benevole: 2, Origine: 'Manuel', Verrouillee: false, Score: 0},
      ],
    });
    const ix = indexer(m);
    const affectations = affectationsQuartParBenevole(m, ix, new Set([Q0, Q1]));
    expect(indicatifDuJour(affectations.get(1))).toBe('A1');
    expect(affectations.get(1)?.get(Q0)?.missionNom).toBe('Accueil');
    expect(indicatifDuJour(affectations.get(2))).toBeNull();
  });
});

describe('affectationsQuartParMission', () => {
  it('agrège toutes les entrées d’un besoin pourvu, omet un besoin sans aucune place pourvue', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
        {id: 2, Nom: 'Karim', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [
        {id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
        {id: 2, Nom: 'Bar', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
      ],
      sousCreneaux: [
        {id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: Q0, Fin: Q2},
        {id: 2, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: Q0, Fin: Q2},
      ],
      besoins: [
        {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 2, Taille_groupe: 2},
        {id: 2, Mission: 2, Sous_creneau: 2, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      ],
      groupes: [{id: 1, Code: 'A1', Taille: 2, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [
        {id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 2, Groupe: 1, Rang: 2, Benevole: 2, Origine: 'Manuel', Verrouillee: false, Score: 0},
      ],
    });
    const ix = indexer(m);
    const affectations = affectationsQuartParMission(m, ix, new Set([Q0, Q1]));
    expect(affectations.get(1)?.get(Q0)?.entrees.map((e) => e.benevoleNom).sort()).toEqual(['Karim', 'Marie']);
    // La mission 2 (besoin 2) n'a aucune place pourvue : rien à afficher.
    expect(affectations.has(2)).toBe(false);
  });
});

describe('segmenterQuarts', () => {
  it('regroupe les quarts contigus de même valeur, ouvre un nouveau segment au premier changement', () => {
    const quarts = [Q0, Q1, Q2, Q3];
    const valeurs = new Map([[Q0, 'A'], [Q1, 'A'], [Q2, 'B'], [Q3, 'B']]);
    const segments = segmenterQuarts(quarts, (q) => valeurs.get(q)!, (v) => v);
    expect(segments).toEqual([
      {quarts: [Q0, Q1], valeur: 'A'},
      {quarts: [Q2, Q3], valeur: 'B'},
    ]);
  });

  it('ne fusionne jamais deux segments identiques séparés par un changement intermédiaire', () => {
    const quarts = [Q0, Q1, Q2];
    const valeurs = new Map([[Q0, 'A'], [Q1, 'B'], [Q2, 'A']]);
    const segments = segmenterQuarts(quarts, (q) => valeurs.get(q)!, (v) => v);
    expect(segments).toEqual([
      {quarts: [Q0], valeur: 'A'},
      {quarts: [Q1], valeur: 'B'},
      {quarts: [Q2], valeur: 'A'},
    ]);
  });
});
