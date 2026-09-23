/**
 * Points 4 et 5 de la mega-demande d'Antoine du 22h01 (2026-09-23), corrigés
 * après relecture du coordinateur : le premier jet ciblait les mauvaises
 * contraintes (dures plutôt que molles) pour le point 4, et un périmètre
 * "tous jours confondus" au lieu du jour affiché pour le point 5. Ce test
 * fige le comportement corrigé pour éviter de reproduire la même erreur.
 *
 * Modèle : un seul jour (deux quarts), Alix libre partout mais en conflit
 * "voir un artiste" sur le quart cible, Bao dans le même conflit MAIS déjà
 * affectée ce jour-là sur une autre place (verrouillée) — Bao ne doit donc
 * pas apparaître comme candidate bloquée pour la place cible, même si elle
 * porte la même étiquette molle qu'Alix.
 */
import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {montrerAffectation} from './affectation';

function construireModele(): Modele {
  return {
    equipes: [{id: 1, Nom: 'Bar', Couleur: '#c00', Referent: null, Notes: ''}],
    lieux: [],
    benevoles: [
      {id: 1, Nom: 'Alix', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      {id: 2, Nom: 'Bao', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
    ],
    missions: [
      {id: 1, Nom: 'Scène', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Critique', Competences_requises: []},
      {id: 2, Nom: 'Bar', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
    ],
    artistes: [{id: 1, Nom: 'DJ X', Lieu: 0, Debut: 0, Fin: 900}],
    macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 1800}],
    sousCreneaux: [
      {id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Cible', Debut: 0, Fin: 900},
      {id: 2, Macro_creneau: 1, Mission: null, Libelle: 'Autre', Debut: 900, Fin: 1800},
    ],
    besoins: [
      {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      {id: 2, Mission: 2, Sous_creneau: 2, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
    ],
    groupes: [
      {id: 1, Code: 'CIBLE', Taille: 1, Equipe: 1, Notes: ''},
      {id: 2, Code: 'AUTRE', Taille: 1, Equipe: 1, Notes: ''},
    ],
    positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}, {id: 2, Groupe: 2, Besoin: 2}],
    places: [
      {id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0},
      {id: 2, Groupe: 2, Rang: 1, Benevole: 2, Origine: 'Algorithme', Verrouillee: true, Score: 0},
    ],
    disponibilites: [
      {Benevole: 1, Quart_heure: 0, Statut: 'Artiste', Artiste: 1},
      {Benevole: 2, Quart_heure: 0, Statut: 'Artiste', Artiste: 1},
      {Benevole: 2, Quart_heure: 900, Statut: 'Disponible', Artiste: null},
    ],
    souhaitsMissions: [],
    affinites: [],
  };
}

describe('montrerAffectation — point 4 (candidats bloqués sur place prioritaire)', () => {
  it("propose Alix (non affectée ce jour, contrainte molle « voir un artiste »), pas Bao (déjà affectée ce jour ailleurs)", () => {
    const m = new Magasin(construireModele());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const candidats = Array.from(container.querySelectorAll('.candidat__nom')).map((n) => n.textContent);
    expect(candidats).toContain('Alix');
    expect(candidats).not.toContain('Bao');
    expect(container.textContent).toContain('veut voir un artiste sur ce créneau');
  });
});

describe('montrerAffectation — point 5 (filtre roster « non affectés seulement »)', () => {
  it('masque Bao (déjà affectée ce jour) une fois la case cochée, garde Alix', () => {
    const m = new Magasin(construireModele());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    expect(Array.from(container.querySelectorAll('.roster-card__nom')).map((n) => n.textContent)).toEqual(['Alix', 'Bao']);

    const checkbox = Array.from(container.querySelectorAll('input[type=checkbox]'))
      .find((i) => i.parentElement?.textContent?.includes('Non affectés seulement')) as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(Array.from(container.querySelectorAll('.roster-card__nom')).map((n) => n.textContent)).toEqual(['Alix']);
  });
});
