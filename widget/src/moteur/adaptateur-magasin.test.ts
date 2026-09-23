import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {indexer} from '../logic/derive';
import {Magasin} from '../store';
import {calculerAnomalies, classerCandidats, versDonneesPlanning} from './adaptateur-magasin';

/**
 * Un groupe (Bar) sur un besoin, deux candidats potentiels — l'un excellent
 * (même équipe, souhaite fortement), l'autre correct mais hors équipe — et
 * un besoin voisin (Accueil) sans aucun indicatif positionné, pour vérifier
 * qu'une zone jamais construite ne remonte pas comme un sous-effectif
 * (demande Antoine du 2026-09-21 : « une zone vide est un choix de
 * l'utilisateur, pas une anomalie »).
 */
function construireModele(): Modele {
  return {
    equipes: [
      {id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''},
      {id: 2, Nom: 'Accueil', Couleur: '#0a0', Referent: null, Notes: ''},
    ],
    lieux: [{id: 1, Nom: 'Scène', Description: ''}],
    benevoles: [
      {id: 1, Nom: 'Alix', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      {id: 2, Nom: 'Bao', Contact: '', Equipe: 2, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      {id: 3, Nom: 'Cy', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 1, Statut: 'Actif', Notes: ''},
    ],
    missions: [
      {id: 1, Nom: 'Bar', Description: '', Lieu: 1, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
      {id: 2, Nom: 'Accueil', Description: '', Lieu: 1, Equipe: 2, Priorite: 'Normale', Competences_requises: []},
    ],
    artistes: [],
    macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 7200}],
    sousCreneaux: [
      {id: 1, Macro_creneau: 1, Mission: null, Libelle: 'SC1', Debut: 0, Fin: 3600},
      {id: 2, Macro_creneau: 1, Mission: null, Libelle: 'SC2', Debut: 0, Fin: 3600},
    ],
    besoins: [
      {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      // Besoin Accueil : personne n'y a encore positionné d'indicatif (étape 3 pas atteinte).
      {id: 2, Mission: 2, Sous_creneau: 2, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
    ],
    groupes: [{id: 1, Code: 'BAR1', Taille: 1, Equipe: 1, Notes: ''}],
    positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
    places: [{id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0}],
    disponibilites: [
      {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 900, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 1800, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 2700, Statut: 'Disponible', Artiste: null},
      {Benevole: 2, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 2, Quart_heure: 900, Statut: 'Disponible', Artiste: null},
      {Benevole: 2, Quart_heure: 1800, Statut: 'Disponible', Artiste: null},
      {Benevole: 2, Quart_heure: 2700, Statut: 'Disponible', Artiste: null},
    ],
    souhaitsMissions: [{id: 1, Benevole: 1, Mission: 1, Preference: 'Souhaite fortement'}],
    affinites: [{id: 1, Benevole_A: 1, Benevole_B: 2, Type: 'Ensemble'}],
  };
}

describe('versDonneesPlanning', () => {
  it('convertit les colonnes du Magasin en domaine camelCase du moteur, sans perte', () => {
    const m = new Magasin(construireModele());
    const donnees = versDonneesPlanning(m);
    expect(donnees.benevoles[0]).toMatchObject({id: 1, nom: 'Alix', equipeId: 1, statut: 'Actif'});
    expect(donnees.besoins).toHaveLength(2);
    expect(donnees.positionsGroupe).toEqual([{id: 1, groupeId: 1, besoinId: 1}]);
    // Priorité 3 d'Antoine (2026-09-23) : les affinités sont désormais réellement câblées.
    expect(donnees.affinites).toEqual([{benevoleAId: 1, benevoleBId: 2, type: 'Ensemble'}]);
  });
});

describe('classerCandidats (adaptateur)', () => {
  it('classe Alix devant Bao (même équipe, souhait fort) et ne renvoie que les éligibles, comme l’ancien mock', () => {
    const m = new Magasin(construireModele());
    const ix = indexer(m);
    const candidats = classerCandidats(m, ix, 1);
    expect(candidats.map((c) => c.benevoleId)).toEqual([1, 2]);
    expect(candidats[0]!.score).toBeGreaterThan(candidats[1]!.score);
    expect(candidats[0]!.tags.map((t) => t.texte)).toContain('équipe Bars');
    expect(candidats[0]!.tags.map((t) => t.texte)).toContain('souhaite fortement');
  });

  it('respecte options.exclure', () => {
    const m = new Magasin(construireModele());
    const ix = indexer(m);
    const candidats = classerCandidats(m, ix, 1, {exclure: 1});
    expect(candidats.map((c) => c.benevoleId)).toEqual([2]);
  });
});

describe('calculerAnomalies (adaptateur)', () => {
  it('ne signale PAS de sous-effectif sur un besoin sans aucun indicatif positionné', () => {
    const m = new Magasin(construireModele());
    const ix = indexer(m);
    const anomalies = calculerAnomalies(m, ix);
    expect(anomalies.some((a) => a.type === 'sous-effectif' && a.besoin.id === 2)).toBe(false);
  });

  it('signale le sous-effectif du besoin réellement positionné mais non pourvu, trié gravité danger d’abord', () => {
    const m = new Magasin(construireModele());
    const ix = indexer(m);
    const anomalies = calculerAnomalies(m, ix);
    const sousEffectif = anomalies.find((a) => a.type === 'sous-effectif');
    expect(sousEffectif).toMatchObject({type: 'sous-effectif', gravite: 'danger', manque: 1, missionNom: 'Bar'});
    expect(anomalies.every((a, i) => i === 0 || a.gravite !== 'danger' || anomalies[i - 1]!.gravite === 'danger')).toBe(true);
  });

  it('signale le chevauchement de créneaux du fixture (SC1 et SC2, même macro-créneau, 0-3600 tous les deux)', () => {
    const m = new Magasin(construireModele());
    const ix = indexer(m);
    const anomalies = calculerAnomalies(m, ix);
    const chevauchement = anomalies.find((a) => a.type === 'chevauchement-creneaux');
    expect(chevauchement).toMatchObject({type: 'chevauchement-creneaux', gravite: 'warn'});
    if (chevauchement?.type === 'chevauchement-creneaux') {
      expect([1, 2]).toContain(chevauchement.sousCreneau.id);
    }
  });

  it('signale un double engagement quand une édition directe des tables place le même bénévole sur deux places dont les créneaux se recouvrent', () => {
    const modele = construireModele();
    // Deuxième groupe/place sur le besoin Accueil (SC2, 0-3600, chevauche SC1
    // où Alix est déjà placée) : n'arrive jamais par le glisser-déposer
    // (`verifierDepot` le refuse), seulement par une édition directe.
    modele.groupes.push({id: 2, Code: 'ACC1', Taille: 1, Equipe: 2, Notes: ''});
    modele.positionsGroupe.push({id: 2, Groupe: 2, Besoin: 2});
    modele.places[0]!.Benevole = 1;
    modele.places.push({id: 2, Groupe: 2, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0});
    const m = new Magasin(modele);
    const ix = indexer(m);
    const anomalies = calculerAnomalies(m, ix);
    const doubleEngagement = anomalies.find((a) => a.type === 'double-engagement');
    expect(doubleEngagement).toMatchObject({type: 'double-engagement', gravite: 'danger', benevoleId: 1, benevoleNom: 'Alix'});
  });
});
