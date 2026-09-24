import {describe, expect, it} from 'vitest';
import type {Id, Modele} from '../domain/types';
import {indexer} from '../logic/derive';
import {Magasin} from '../store';
import {calculerAnomalies, classerCandidats, proposerPermutation, raisonsPlaceVide, versDonneesPlanning} from './adaptateur-magasin';

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
    presences: [],
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

  it("ne plante pas quand un candidat porte une référence d'équipe orpheline (Affectation cassée en entier sur le banc, 2026-09-23) : tag « ? » plutôt qu'une exception", () => {
    const modele = construireModele();
    modele.benevoles[1]!.Equipe = 99; // Bao — aucune équipe 99 dans ce modèle
    const m = new Magasin(modele);
    const ix = indexer(m);
    expect(() => classerCandidats(m, ix, 1)).not.toThrow();
    const bao = classerCandidats(m, ix, 1).find((c) => c.benevoleId === 2);
    expect(bao?.equipeNom).toBe('?');
    expect(bao?.tags.map((t) => t.texte)).toContain('hors équipe (?)');
  });
});

/**
 * Un groupe de taille 2 (BAR2), une place déjà tenue par Zoé, une place à
 * pourvoir — pour exercer le tag de binôme souhaité (§7.2 objectif 2,
 * demande d'Antoine 2026-09-23), qui manquait : l'affinité était déjà
 * calculée dans le score du moteur (`explication.affinite`), mais jamais
 * traduite en tag lisible pour l'écran (voir la note du coordinateur sur
 * l'explicabilité).
 */
function construireModeleBinome(typeAffinite: 'Ensemble' | 'Éviter'): Modele {
  return {
    equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
    lieux: [],
    benevoles: [
      {id: 1, Nom: 'Zoé', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      {id: 2, Nom: 'Alix', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
    ],
    missions: [{id: 1, Nom: 'Bar', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
    artistes: [],
    macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 3600}],
    sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'SC1', Debut: 0, Fin: 3600}],
    besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 2, Effectif_max: 2, Taille_groupe: 2}],
    groupes: [{id: 1, Code: 'BAR2', Taille: 2, Equipe: 1, Notes: ''}],
    positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
    places: [
      {id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Algorithme', Verrouillee: true, Score: 0},
      {id: 2, Groupe: 1, Rang: 2, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0},
    ],
    disponibilites: [0, 900, 1800, 2700].flatMap((q) => [
      {Benevole: 1, Quart_heure: q, Statut: 'Disponible' as const, Artiste: null},
      {Benevole: 2, Quart_heure: q, Statut: 'Disponible' as const, Artiste: null},
    ]),
    souhaitsMissions: [],
    affinites: [{id: 1, Benevole_A: 1, Benevole_B: 2, Type: typeAffinite}],
    presences: [],
  };
}

describe('classerCandidats (adaptateur) — tag de binôme souhaité', () => {
  it('ajoute un tag « plus » quand le candidat a une affinité « Ensemble » avec un coéquipier déjà en place', () => {
    const m = new Magasin(construireModeleBinome('Ensemble'));
    const ix = indexer(m);
    const candidats = classerCandidats(m, ix, 1);
    const alix = candidats.find((c) => c.benevoleId === 2);
    expect(alix?.tags.map((t) => t.texte)).toContain('binôme souhaité');
    expect(alix?.tags.find((t) => t.texte === 'binôme souhaité')?.sens).toBe('plus');
  });

  it('ajoute un tag « moins » quand le candidat a une affinité « Éviter » avec un coéquipier déjà en place', () => {
    const m = new Magasin(construireModeleBinome('Éviter'));
    const ix = indexer(m);
    const candidats = classerCandidats(m, ix, 1);
    const alix = candidats.find((c) => c.benevoleId === 2);
    expect(alix?.tags.find((t) => t.texte.includes('éviter'))?.sens).toBe('moins');
  });

  it("avec placeIdCible, inclut l'occupant actuel de cette place dans le classement (sinon exclu comme « déjà occupé » de son propre groupe)", () => {
    const m = new Magasin(construireModeleBinome('Ensemble'));
    const ix = indexer(m);
    // Sans placeIdCible : Zoé (déjà sur la place 1 du même groupe) est exclue de son propre classement.
    expect(classerCandidats(m, ix, 1).map((c) => c.benevoleId)).not.toContain(1);
    // Avec placeIdCible : Zoé redevient candidate, pour qu'on puisse expliquer pourquoi elle est là.
    const avecCible = classerCandidats(m, ix, 1, {placeIdCible: 1});
    expect(avecCible.map((c) => c.benevoleId)).toContain(1);
  });
});

/**
 * Un groupe (Bar, 1 place) sur un besoin, un unique bénévole dans le
 * roster : `dispo`/`competences` contrôlent s'il est candidat, pour isoler
 * chaque raison d'inéligibilité une à la fois (§7.5.3, question du
 * coordinateur 2026-09-23 sur l'explicabilité des échecs).
 */
function construireModeleRaisonVide(options: {
  dispo?: boolean; competencesRequises?: string[]; competencesBenevole?: string[]; statut?: 'Actif' | 'Absent';
} = {}): Modele {
  return {
    equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
    lieux: [],
    benevoles: [{
      id: 1, Nom: 'Alix', Contact: '', Equipe: 1, Competences: options.competencesBenevole ?? [],
      Quota_heures_min: 0, Quota_heures_max: 40, Statut: options.statut ?? 'Actif', Notes: '',
    }],
    missions: [{
      id: 1, Nom: 'Bar', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale',
      Competences_requises: options.competencesRequises ?? [],
    }],
    artistes: [],
    macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 3600}],
    sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'SC1', Debut: 0, Fin: 3600}],
    besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
    groupes: [{id: 1, Code: 'BAR1', Taille: 1, Equipe: 1, Notes: ''}],
    positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
    places: [{id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0}],
    disponibilites: options.dispo === false ? [] : [0, 900, 1800, 2700].map((q) => (
      {Benevole: 1, Quart_heure: q, Statut: 'Disponible' as const, Artiste: null}
    )),
    souhaitsMissions: [],
    affinites: [],
    presences: [],
  };
}

describe('raisonsPlaceVide (adaptateur)', () => {
  it('signale « personne de disponible » quand le seul bénévole du groupe est indisponible sur ce créneau', () => {
    const m = new Magasin(construireModeleRaisonVide({dispo: false}));
    expect(raisonsPlaceVide(m, 1)).toEqual(['personne de disponible sur ce créneau']);
  });

  it("signale « personne n'a la compétence requise » quand le seul bénévole disponible ne l'a pas", () => {
    const m = new Magasin(construireModeleRaisonVide({competencesRequises: ['SST']}));
    expect(raisonsPlaceVide(m, 1)).toEqual(["personne n'a la compétence requise"]);
  });

  it("signale « déjà occupés ailleurs » quand le seul candidat possible tient déjà une autre place sur ce créneau", () => {
    const modele = construireModeleRaisonVide();
    // Un second groupe, même créneau, où Alix est déjà placée : la seule
    // candidate possible pour BAR1 est donc déjà occupée ailleurs.
    modele.groupes.push({id: 2, Code: 'ACC1', Taille: 1, Equipe: 1, Notes: ''});
    modele.positionsGroupe.push({id: 2, Groupe: 2, Besoin: 1});
    modele.places.push({id: 2, Groupe: 2, Rang: 1, Benevole: 1, Origine: 'Algorithme', Verrouillee: true, Score: 0});
    const m = new Magasin(modele);
    expect(raisonsPlaceVide(m, 1)).toEqual(['les bénévoles disponibles sont déjà occupés ailleurs sur ce créneau']);
  });

  it('rend une liste vide quand un candidat propre existe (ne devrait pas arriver sur une place restée vide)', () => {
    const m = new Magasin(construireModeleRaisonVide());
    expect(raisonsPlaceVide(m, 1)).toEqual([]);
  });

  it("signale « aucun bénévole importé » quand la table des bénévoles est entièrement vide (état d'Antoine avant import, 2026-09-23)", () => {
    const modele = construireModeleRaisonVide();
    modele.benevoles = [];
    const m = new Magasin(modele);
    expect(raisonsPlaceVide(m, 1)).toEqual(['aucun bénévole importé']);
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

describe('proposerPermutation (adaptateur)', () => {
  /**
   * BAR2 (taille 2, quarts [0,3600)) a Alix et Zoé en place ; BAR1 (taille 1,
   * quarts [7200,10800), non chevauchants) a une place vacante. Théo (hors
   * équipe) domine le classement direct de BAR1 par un souhait fort, mais
   * porte un tag « moins » (hors équipe) : aucun remplaçant direct propre,
   * la permutation doit chercher un donneur — Alix, elle, est propre pour
   * BAR1 mais pas la mieux classée (comportement de `directs[0]` préservé
   * tel quel par le déménagement de cette fonction). Bao et Cy sont sinon
   * identiques pour remplacer Alix sur BAR2 : seule une affinité avec Zoé,
   * qui reste en place, doit les départager — la preuve que ce classement
   * vient du vrai moteur (`classerCandidats` ci-dessus) et non de l'ancien
   * mock de `derive.ts`, qui ignorait `m.affinites`.
   */
  function construireModelePermutation(affiniteAvecZoe: {benevoleId: Id; type: 'Ensemble' | 'Éviter'} | null): Modele {
    return {
      equipes: [
        {id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''},
        {id: 2, Nom: 'Ailleurs', Couleur: '#00c', Referent: null, Notes: ''},
      ],
      lieux: [{id: 1, Nom: 'Scène', Description: ''}],
      benevoles: [
        {id: 1, Nom: 'Alix', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
        {id: 2, Nom: 'Bao', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
        {id: 3, Nom: 'Cy', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
        {id: 4, Nom: 'Zoé', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
        {id: 5, Nom: 'Théo', Contact: '', Equipe: 2, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Bar', Description: '', Lieu: 1, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      artistes: [],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 10800}],
      sousCreneaux: [
        {id: 1, Macro_creneau: 1, Mission: null, Libelle: 'SC-donneur', Debut: 0, Fin: 3600},
        {id: 2, Macro_creneau: 1, Mission: null, Libelle: 'SC-cible', Debut: 7200, Fin: 10800},
      ],
      besoins: [
        {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 2, Taille_groupe: 1},
        {id: 2, Mission: 1, Sous_creneau: 2, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      ],
      groupes: [
        {id: 1, Code: 'BAR2', Taille: 2, Equipe: 1, Notes: ''},
        {id: 2, Code: 'BAR1', Taille: 1, Equipe: 1, Notes: ''},
      ],
      positionsGroupe: [
        {id: 1, Groupe: 1, Besoin: 1},
        {id: 2, Groupe: 2, Besoin: 2},
      ],
      places: [
        {id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Algorithme', Verrouillee: false, Score: 0},
        {id: 2, Groupe: 1, Rang: 2, Benevole: 4, Origine: 'Algorithme', Verrouillee: false, Score: 0},
        {id: 3, Groupe: 2, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0},
      ],
      disponibilites: [
        // SC-donneur [0,3600) : Bao et Cy, candidats au remplacement d'Alix sur BAR2.
        ...[0, 900, 1800, 2700].flatMap((q) => [
          {Benevole: 2, Quart_heure: q, Statut: 'Disponible' as const, Artiste: null},
          {Benevole: 3, Quart_heure: q, Statut: 'Disponible' as const, Artiste: null},
        ]),
        // SC-cible [7200,10800) : Alix (donneuse potentielle) et Théo (mieux classé, hors équipe).
        ...[7200, 8100, 9000, 9900].flatMap((q) => [
          {Benevole: 1, Quart_heure: q, Statut: 'Disponible' as const, Artiste: null},
          {Benevole: 5, Quart_heure: q, Statut: 'Disponible' as const, Artiste: null},
        ]),
      ],
      souhaitsMissions: [
        {id: 1, Benevole: 5, Mission: 1, Preference: 'Souhaite fortement'},
      ],
      affinites: affiniteAvecZoe
        ? [{id: 1, Benevole_A: affiniteAvecZoe.benevoleId, Benevole_B: 4, Type: affiniteAvecZoe.type}]
        : [],
      presences: [],
    };
  }

  it("choisit le remplaçant qui a l'affinité « Ensemble » avec sa future coéquipière plutôt qu'un candidat par ailleurs identique", () => {
    const m = new Magasin(construireModelePermutation({benevoleId: 2, type: 'Ensemble'})); // Bao <-> Zoé
    const ix = indexer(m);
    const chaine = proposerPermutation(m, ix, 3); // place vacante de BAR1
    expect(chaine).not.toBeNull();
    expect(chaine![0]).toMatchObject({benevoleId: 1, groupeCode: 'BAR1'}); // Alix rejoint BAR1
    expect(chaine![1]).toMatchObject({benevoleId: 2, groupeCode: 'BAR2'}); // Bao, préféré à Cy grâce à l'affinité
  });

  it("choisit l'autre remplaçant dès que c'est lui qui porte l'affinité « Ensemble », preuve que le classement dépend bien du vrai moteur", () => {
    const m = new Magasin(construireModelePermutation({benevoleId: 3, type: 'Ensemble'})); // Cy <-> Zoé
    const ix = indexer(m);
    const chaine = proposerPermutation(m, ix, 3);
    expect(chaine).not.toBeNull();
    expect(chaine![1]).toMatchObject({benevoleId: 3, groupeCode: 'BAR2'}); // Cy, cette fois préféré à Bao
  });
});
