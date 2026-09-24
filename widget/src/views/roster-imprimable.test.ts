/**
 * Vue « roster imprimable » (demande d'Antoine du 2026-09-23, point 1) sur
 * un document pauvre ou vide — même discipline que les autres vues
 * ([[vues-vides-audit]] en mémoire d'équipe) : une vue vide doit dire
 * pourquoi, jamais un écran muet.
 */
import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {montrerRosterImprimable} from './roster-imprimable';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [],
  };
}

const DEBUT = 1_800_000_000;
const FIN = DEBUT + 4 * 3600; // 4h, soit 16 quarts

describe('montrerRosterImprimable sans aucun macro-créneau', () => {
  it('explique l’absence de contenu plutôt que d’afficher un écran vide', () => {
    const m = new Magasin(modeleVide());
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);
    expect(container.textContent).toContain('Aucun macro-créneau');
  });
});

describe('montrerRosterImprimable sans aucun bénévole disponible', () => {
  it('dit pourquoi le roster est vide plutôt que de rendre un tableau vide', () => {
    const m = new Magasin({
      ...modeleVide(),
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
    });
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);
    expect(container.textContent).toContain('Aucun bénévole disponible ce jour-là');
  });
});

describe('montrerRosterImprimable avec un bénévole partiellement disponible et affecté', () => {
  it('affiche une ligne avec son indicatif du jour et le nom de sa mission dans le créneau affecté', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 3600}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
      // Disponible sur un seul quart d'heure (créneau réduit), pas toute la journée.
      disponibilites: [{Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null}],
    });
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);

    expect(container.textContent).toContain('Marie');
    expect(container.querySelector('.impression-table__indicatif')?.textContent).toBe('A1');
    expect(container.textContent).toContain('Accueil');
    expect(container.querySelectorAll('tbody tr').length).toBe(1);
  });
});

describe('montrerRosterImprimable avec un créneau trop court pour le nom complet', () => {
  it('tronque avec une ellipse plutôt que de laisser le bloc bleu sans aucun texte (retour Antoine 2026-09-24)', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Comptage entrée Village partenaire', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      // Un seul quart d'heure de mission : bien plus court qu'il n'en faut pour le nom complet.
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 900}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
      disponibilites: [{Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null}],
    });
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);

    const bloc = container.querySelector('.impression-bloc--assignee');
    expect(bloc).not.toBeNull();
    expect(bloc?.getAttribute('title')).toBe('Comptage entrée Village partenaire');
    // Jamais vide : au moins un fragment du nom, terminé par une ellipse.
    expect(bloc?.textContent).not.toBe('');
    expect(bloc?.textContent).not.toBe('Comptage entrée Village partenaire');
    expect(bloc?.textContent?.endsWith('…')).toBe(true);
  });
});

describe('montrerRosterImprimable avec un bénévole pouvant aller voir son artiste', () => {
  it('colore en violet les quarts libres du passage, avec le nom de l’artiste', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      artistes: [{id: 1, Nom: 'Grand Concert', Lieu: 0, Debut: DEBUT, Fin: DEBUT + 3600}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      // Une vraie disponibilité (sinon absente du roster, logic/derive.ts benevolesDisponiblesCeJour)
      // et, séparément, le souhait de voir l'artiste. Aucune mission : Marie est libre tout le
      // passage de l'artiste (1h >= 30 min).
      disponibilites: [
        {Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null},
        {Benevole: 1, Quart_heure: DEBUT + 900, Statut: 'Artiste', Artiste: 1},
      ],
    });
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);

    const bloc = container.querySelector('.impression-bloc--artiste');
    expect(bloc).not.toBeNull();
    expect(bloc?.getAttribute('title')).toBe('Grand Concert');
    expect(container.querySelector('.impression-bloc--assignee')).toBeNull();
  });
});
