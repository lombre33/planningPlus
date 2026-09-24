/**
 * Tests des fonctions dérivées pour les deux vues imprimables (roster
 * bénévoles, plannings équipe — demande d'Antoine du 2026-09-23).
 */
import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {indexer} from './derive';
import {
  affectationsQuartParBenevole, affectationsQuartParMission,
  creneauxConflitArtisteParBenevole, creneauxVoirArtisteParBenevole, indicatifDuJour, segmenterQuarts,
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
  it('regroupe les deux places d’un même binôme en une seule entrée, omet une mission sans aucun indicatif positionné', () => {
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
    const entrees = affectations.get(1)?.get(Q0)?.entrees;
    expect(entrees).toHaveLength(1);
    expect(entrees?.[0]?.groupeCode).toBe('A1');
    expect(entrees?.[0]?.benevoleNoms.slice().sort()).toEqual(['Karim', 'Marie']);
    // La mission 2 (besoin 2) n'a aucun indicatif positionné : rien à afficher.
    expect(affectations.has(2)).toBe(false);
  });

  it('affiche un indicatif positionné même sans aucun bénévole dessus (retour Antoine 2026-09-24)', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      missions: [{id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: Q0, Fin: Q2}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 2, Taille_groupe: 2}],
      groupes: [{id: 1, Code: 'A1', Taille: 2, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      // Les deux places du binôme existent (créées avec le groupe) mais aucune n'est pourvue.
      places: [
        {id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 2, Groupe: 1, Rang: 2, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
      ],
    });
    const ix = indexer(m);
    const affectations = affectationsQuartParMission(m, ix, new Set([Q0, Q1]));
    const entrees = affectations.get(1)?.get(Q0)?.entrees;
    expect(entrees).toHaveLength(1);
    expect(entrees?.[0]?.groupeCode).toBe('A1');
    expect(entrees?.[0]?.benevoleNoms).toEqual([]);
  });

  it('garde un indicatif par binôme quand plusieurs couvrent le même besoin (retour Antoine 2026-09-24)', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: Q0, Fin: Q2}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 6, Taille_groupe: 2}],
      groupes: [
        {id: 1, Code: 'A1', Taille: 2, Equipe: 1, Notes: ''},
        {id: 2, Code: 'A2', Taille: 2, Equipe: 1, Notes: ''},
        {id: 3, Code: 'A3', Taille: 2, Equipe: 1, Notes: ''},
      ],
      positionsGroupe: [
        {id: 1, Groupe: 1, Besoin: 1},
        {id: 2, Groupe: 2, Besoin: 1},
        {id: 3, Groupe: 3, Besoin: 1},
      ],
      places: [
        {id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 2, Groupe: 1, Rang: 2, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 3, Groupe: 2, Rang: 1, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 4, Groupe: 2, Rang: 2, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 5, Groupe: 3, Rang: 1, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 6, Groupe: 3, Rang: 2, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
      ],
    });
    const ix = indexer(m);
    const affectations = affectationsQuartParMission(m, ix, new Set([Q0, Q1]));
    const entrees = affectations.get(1)?.get(Q0)?.entrees;
    expect(entrees?.map((e) => e.groupeCode).sort()).toEqual(['A1', 'A2', 'A3']);
    expect(entrees?.find((e) => e.groupeCode === 'A1')?.benevoleNoms).toEqual(['Marie']);
    expect(entrees?.find((e) => e.groupeCode === 'A2')?.benevoleNoms).toEqual([]);
  });
});

describe('creneauxVoirArtisteParBenevole', () => {
  it('retient les quarts libres du passage d’un artiste souhaité quand 30 minutes libres sont possibles', () => {
    const m = new Magasin({
      ...modeleVide(),
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 0, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      artistes: [{id: 1, Nom: 'Grand Concert', Lieu: 0, Debut: Q0, Fin: Q0 + 3600}],
      // Souhaite voir l'artiste 1 — une seule ligne suffit (même lecture que le panneau Indicatifs).
      disponibilites: [{Benevole: 1, Quart_heure: Q0, Statut: 'Artiste', Artiste: 1}],
    });
    const ix = indexer(m);
    const quartsDuJour = new Set([Q0, Q1, Q2, Q3]);
    const resultat = creneauxVoirArtisteParBenevole(m, ix, quartsDuJour, new Map());
    expect(resultat.get(1)?.get(Q0)).toBe('Grand Concert');
    expect(resultat.get(1)?.get(Q3)).toBe('Grand Concert');
  });

  it('exclut les quarts déjà occupés par une mission, même si le passage reste vu par ailleurs', () => {
    const m = new Magasin({
      ...modeleVide(),
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 0, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      artistes: [{id: 1, Nom: 'Grand Concert', Lieu: 0, Debut: Q0, Fin: Q0 + 3600}],
      disponibilites: [{Benevole: 1, Quart_heure: Q0, Statut: 'Artiste', Artiste: 1}],
    });
    const ix = indexer(m);
    const quartsDuJour = new Set([Q0, Q1, Q2, Q3]);
    // Q0 occupé par une mission : les 3 quarts libres restants suffisent encore (>= 30 min).
    const affectations = new Map([[1, new Map([[Q0, {missionNom: 'Accueil', groupeCode: 'A1'}]])]]);
    const resultat = creneauxVoirArtisteParBenevole(m, ix, quartsDuJour, affectations);
    expect(resultat.get(1)?.has(Q0)).toBe(false);
    expect(resultat.get(1)?.get(Q1)).toBe('Grand Concert');
  });

  it('ne retient rien pour un bénévole n’ayant exprimé aucun souhait d’artiste', () => {
    const m = new Magasin({
      ...modeleVide(),
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 0, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      artistes: [{id: 1, Nom: 'Grand Concert', Lieu: 0, Debut: Q0, Fin: Q0 + 3600}],
      disponibilites: [{Benevole: 1, Quart_heure: Q0, Statut: 'Disponible', Artiste: null}],
    });
    const ix = indexer(m);
    const resultat = creneauxVoirArtisteParBenevole(m, ix, new Set([Q0, Q1, Q2, Q3]), new Map());
    expect(resultat.has(1)).toBe(false);
  });
});

describe('creneauxConflitArtisteParBenevole', () => {
  it('signale les quarts affectés qui empêchent d’atteindre 30 minutes libres pendant le passage souhaité', () => {
    const m = new Magasin({
      ...modeleVide(),
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 0, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      artistes: [{id: 1, Nom: 'Grand Concert', Lieu: 0, Debut: Q0, Fin: Q0 + 3600}],
      disponibilites: [{Benevole: 1, Quart_heure: Q0, Statut: 'Artiste', Artiste: 1}],
    });
    const ix = indexer(m);
    const quartsDuJour = new Set([Q0, Q1, Q2, Q3]);
    // 3 des 4 quarts du passage sont affectés : il ne reste que 15 min libres (< 30 min).
    const affectations = new Map([[1, new Map([
      [Q0, {missionNom: 'Accueil', groupeCode: 'A1'}],
      [Q1, {missionNom: 'Accueil', groupeCode: 'A1'}],
      [Q2, {missionNom: 'Accueil', groupeCode: 'A1'}],
    ])]]);
    const resultat = creneauxConflitArtisteParBenevole(m, ix, quartsDuJour, affectations);
    expect(resultat.get(1)?.get(Q0)).toBe('Grand Concert');
    expect(resultat.get(1)?.get(Q1)).toBe('Grand Concert');
    expect(resultat.get(1)?.get(Q2)).toBe('Grand Concert');
    // Q3 n'est pas affecté : jamais un trou du planning marqué en conflit.
    expect(resultat.get(1)?.has(Q3)).toBe(false);
  });

  it('ne signale rien quand 30 minutes libres restent possibles malgré les affectations', () => {
    const m = new Magasin({
      ...modeleVide(),
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 0, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      artistes: [{id: 1, Nom: 'Grand Concert', Lieu: 0, Debut: Q0, Fin: Q0 + 3600}],
      disponibilites: [{Benevole: 1, Quart_heure: Q0, Statut: 'Artiste', Artiste: 1}],
    });
    const ix = indexer(m);
    const quartsDuJour = new Set([Q0, Q1, Q2, Q3]);
    const affectations = new Map([[1, new Map([[Q0, {missionNom: 'Accueil', groupeCode: 'A1'}]])]]);
    const resultat = creneauxConflitArtisteParBenevole(m, ix, quartsDuJour, affectations);
    expect(resultat.has(1)).toBe(false);
  });

  it('ne signale rien pour un artiste que le bénévole n’a pas déclaré vouloir voir', () => {
    const m = new Magasin({
      ...modeleVide(),
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 0, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      artistes: [{id: 1, Nom: 'Grand Concert', Lieu: 0, Debut: Q0, Fin: Q0 + 3600}],
      disponibilites: [{Benevole: 1, Quart_heure: Q0, Statut: 'Disponible', Artiste: null}],
    });
    const ix = indexer(m);
    const quartsDuJour = new Set([Q0, Q1, Q2, Q3]);
    const affectations = new Map([[1, new Map([
      [Q0, {missionNom: 'Accueil', groupeCode: 'A1'}],
      [Q1, {missionNom: 'Accueil', groupeCode: 'A1'}],
      [Q2, {missionNom: 'Accueil', groupeCode: 'A1'}],
    ])]]);
    const resultat = creneauxConflitArtisteParBenevole(m, ix, quartsDuJour, affectations);
    expect(resultat.has(1)).toBe(false);
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
