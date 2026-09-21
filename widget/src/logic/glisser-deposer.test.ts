import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {apercuAffectation, apercuEchange, verifierDepot} from './glisser-deposer';

/**
 * Petit jeu de données déterministe, indépendant du jeu de démonstration :
 * une équipe, deux bénévoles, une mission, et trois sous-créneaux dont deux
 * se chevauchent partiellement (SC1 0–3600, SC2 3600–7200, SC3 1800–5400,
 * en secondes, pas de 900 s = 15 min) pour éprouver la détection de
 * chevauchement indépendamment de tout jeu de démonstration.
 */
function construireModele(): Modele {
  return {
    equipes: [{id: 1, Nom: 'Bar', Couleur: '#123456', Referent: null, Notes: ''}],
    lieux: [{id: 1, Nom: 'Scène', Description: ''}],
    benevoles: [
      {id: 1, Nom: 'Alix', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      {id: 2, Nom: 'Bao', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
    ],
    missions: [{id: 1, Nom: 'Bar', Description: '', Lieu: 1, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
    artistes: [],
    macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 7200}],
    sousCreneaux: [
      {id: 1, Macro_creneau: 1, Mission: null, Libelle: 'SC1', Debut: 0, Fin: 3600},
      {id: 2, Macro_creneau: 1, Mission: null, Libelle: 'SC2', Debut: 3600, Fin: 7200},
      {id: 3, Macro_creneau: 1, Mission: null, Libelle: 'SC3 (chevauche SC1 et SC2)', Debut: 1800, Fin: 5400},
    ],
    besoins: [
      {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      {id: 2, Mission: 1, Sous_creneau: 2, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      {id: 3, Mission: 1, Sous_creneau: 3, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
    ],
    groupes: [
      {id: 1, Code: 'G1', Taille: 1, Equipe: 1, Notes: ''},
      {id: 2, Code: 'G2', Taille: 1, Equipe: 1, Notes: ''},
      {id: 3, Code: 'G3', Taille: 1, Equipe: 1, Notes: ''},
    ],
    positionsGroupe: [
      {id: 1, Groupe: 1, Besoin: 1},
      {id: 2, Groupe: 2, Besoin: 2},
      {id: 3, Groupe: 3, Besoin: 3},
    ],
    places: [
      {id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0},
      {id: 2, Groupe: 2, Rang: 1, Benevole: 1, Origine: 'Algorithme', Verrouillee: false, Score: 1},
      {id: 3, Groupe: 3, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0},
    ],
    // Le vrai moteur (`moteur/anomalies.ts`) considère par défaut qu'un
    // bénévole sans disponibilité renseignée pour un quart est indisponible
    // (choix conservateur) : on couvre donc explicitement tous les quarts du
    // modèle (0 à 6300 par pas de 900 s) pour les deux bénévoles, sinon
    // chaque affectation de ce jeu de test déclencherait une fausse
    // « indisponibilité ».
    disponibilites: [0, 900, 1800, 2700, 3600, 4500, 5400, 6300].flatMap((quart) => ([
      {Benevole: 1, Quart_heure: quart, Statut: 'Disponible' as const, Artiste: null},
      {Benevole: 2, Quart_heure: quart, Statut: 'Disponible' as const, Artiste: null},
    ])),
    souhaitsMissions: [],
    affinites: [],
  };
}

describe('verifierDepot', () => {
  it('autorise un dépôt sur une place vide sans conflit', () => {
    const m = new Magasin(construireModele());
    // Place 1 (SC1 : 0-3600) ne chevauche pas la place 2 déjà tenue par Alix (SC2 : 3600-7200).
    expect(verifierDepot(m, 1, 1)).toEqual({ok: true});
  });

  it('refuse un dépôt qui chevaucherait un autre créneau déjà tenu par le même bénévole', () => {
    const m = new Magasin(construireModele());
    // Place 3 (SC3 : 1800-5400) chevauche la place 2 déjà tenue par Alix (SC2 : 3600-7200) sur 3600/4500.
    const verdict = verifierDepot(m, 1, 3);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) { expect(verdict.motif).toMatch(/chevauche/); }
  });

  it('refuse un dépôt sur une place verrouillée', () => {
    const modele = construireModele();
    modele.places[1]!.Verrouillee = true;
    const m = new Magasin(modele);
    const verdict = verifierDepot(m, 2, 2);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) { expect(verdict.motif).toMatch(/verrouillée/); }
  });

  it('ignore les places listées pour vérifier un déplacement sans se bloquer soi-même', () => {
    const m = new Magasin(construireModele());
    // Sans ignorer la place 2, Alix s'y chevaucherait elle-même (aucun sens pour un déplacement).
    expect(verifierDepot(m, 1, 2, [2]).ok).toBe(true);
  });
});

describe('apercuAffectation', () => {
  it('ne signale aucune anomalie nouvelle pour une affectation propre', () => {
    const m = new Magasin(construireModele());
    const diff = apercuAffectation(m, 1, 1);
    expect(diff.creees).toEqual([]);
    // L'état réel n'a pas été modifié par l'aperçu.
    expect(m.places.find((p) => p.id === 1)?.Benevole).toBeNull();
  });

  it('signale un souhait refusé quand on force malgré tout le placement', () => {
    const modele = construireModele();
    modele.souhaitsMissions.push({id: 1, Benevole: 2, Mission: 1, Preference: 'Refuse'});
    const m = new Magasin(modele);
    const diff = apercuAffectation(m, 1, 2);
    expect(diff.creees).toHaveLength(1);
    expect(diff.creees[0]).toMatchObject({type: 'souhait-refuse'});
  });

  it('signale la résolution du sous-effectif quand la place se remplit', () => {
    const m = new Magasin(construireModele());
    const avant = apercuAffectation(m, 1, 1);
    expect(avant.avant.some((a) => a.type === 'sous-effectif' && a.besoin.id === 1)).toBe(true);
    expect(avant.resolues.some((a) => a.type === 'sous-effectif' && a.besoin.id === 1)).toBe(true);
  });

  it('vider une place réintroduit l’anomalie de sous-effectif', () => {
    const m = new Magasin(construireModele());
    const diff = apercuAffectation(m, 2, null);
    expect(diff.creees.some((a) => a.type === 'sous-effectif' && a.besoin.id === 2)).toBe(true);
  });
});

describe('apercuEchange', () => {
  it('échange les occupants de deux places sans muter le magasin réel', () => {
    const modele = construireModele();
    modele.places[0]!.Benevole = 2; // place 1 tenue par Bao, place 2 par Alix
    const m = new Magasin(modele);
    apercuEchange(m, 1, 2);
    expect(m.places.find((p) => p.id === 1)?.Benevole).toBe(2);
    expect(m.places.find((p) => p.id === 2)?.Benevole).toBe(1);
  });
});
