/**
 * Tests de la checklist de respect des souhaits par bénévole (demande
 * d'Antoine du 2026-09-25 : disponibilité, binôme souhaité, 30 min de
 * chaque artiste à voir).
 */
import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {calculerChecklistBenevoles} from './checklist-benevoles';
import {indexer, regrouperParJour} from './derive';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [], presences: [],
  };
}

const Q0 = 1000 * 900; // un quart d'heure arbitraire, aligné sur le pas (900s)
const Q1 = Q0 + 900;
const Q2 = Q0 + 1800;
const Q3 = Q0 + 2700;
const Q4 = Q0 + 3600;

const EQUIPE = {id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''};
const MACRO = {id: 1, Nom: 'Jour 1', Debut: Q0, Fin: Q4 + 900};

function benevole(id: number, nom: string) {
  return {id, Nom: nom, Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif' as const, Notes: ''};
}

/** Affecte un bénévole seul sur un besoin/mission couvrant [debut, fin), via un groupe dédié à cet id. */
function fixtureAssignation(idGroupe: number, benevoleId: number, debut: number, fin: number) {
  return {
    missions: [{id: idGroupe, Nom: `Mission ${idGroupe}`, Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale' as const, Competences_requises: []}],
    sousCreneaux: [{id: idGroupe, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: debut, Fin: fin}],
    besoins: [{id: idGroupe, Mission: idGroupe, Sous_creneau: idGroupe, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
    groupes: [{id: idGroupe, Code: `A${idGroupe}`, Taille: 1, Equipe: 1, Notes: ''}],
    positionsGroupe: [{id: idGroupe, Groupe: idGroupe, Besoin: idGroupe}],
    places: [{id: idGroupe, Groupe: idGroupe, Rang: 1, Benevole: benevoleId, Origine: 'Manuel' as const, Verrouillee: false, Score: 0}],
  };
}

function jourUnique(m: InstanceType<typeof Magasin>) {
  const jours = regrouperParJour(m.macroCreneaux);
  return jours[0]!;
}

describe('calculerChecklistBenevoles', () => {
  it('ne liste que les bénévoles affectés le jour donné', () => {
    const a = fixtureAssignation(1, 1, Q0, Q1);
    const m = new Magasin({
      ...modeleVide(), macroCreneaux: [MACRO], equipes: [EQUIPE],
      benevoles: [benevole(1, 'Marie'), benevole(2, 'Sans affectation')],
      ...a,
    });
    const ix = indexer(m);
    const lignes = calculerChecklistBenevoles(m, ix, jourUnique(m), new Map());
    expect(lignes.map((l) => l.nom)).toEqual(['Marie']);
  });

  describe('disponibilité', () => {
    it('dit "pas de donnée" pour un bénévole affecté sans aucune disponibilité déclarée (piège à ne jamais réintroduire)', () => {
      const a = fixtureAssignation(1, 1, Q0, Q1);
      const m = new Magasin({
        ...modeleVide(), macroCreneaux: [MACRO], equipes: [EQUIPE], benevoles: [benevole(1, 'Marie')], ...a,
      });
      const ix = indexer(m);
      const [ligne] = calculerChecklistBenevoles(m, ix, jourUnique(m), new Map());
      expect(ligne!.disponibilite.etat).toBe('sans-donnee');
    });

    it('respecte quand tous les quarts affectés sont déclarés disponibles', () => {
      const a = fixtureAssignation(1, 1, Q0, Q1);
      const m = new Magasin({
        ...modeleVide(), macroCreneaux: [MACRO], equipes: [EQUIPE], benevoles: [benevole(1, 'Marie')], ...a,
        disponibilites: [{Benevole: 1, Quart_heure: Q0, Statut: 'Disponible', Artiste: null}],
      });
      const ix = indexer(m);
      const [ligne] = calculerChecklistBenevoles(m, ix, jourUnique(m), new Map());
      expect(ligne!.disponibilite.etat).toBe('respecte');
    });

    it('viole quand un quart affecté n’est pas déclaré disponible', () => {
      const a = fixtureAssignation(1, 1, Q0, Q2); // deux quarts : Q0, Q1
      const m = new Magasin({
        ...modeleVide(), macroCreneaux: [MACRO], equipes: [EQUIPE], benevoles: [benevole(1, 'Marie')], ...a,
        // Seul Q0 est déclaré disponible ; Q1 (affecté) n'a aucune entrée -> pas "vraiment disponible".
        disponibilites: [{Benevole: 1, Quart_heure: Q0, Statut: 'Disponible', Artiste: null}],
      });
      const ix = indexer(m);
      const [ligne] = calculerChecklistBenevoles(m, ix, jourUnique(m), new Map());
      expect(ligne!.disponibilite.etat).toBe('viole');
      expect(ligne!.disponibilite.detail).toContain('1 quart');
    });
  });

  describe('binôme', () => {
    it('sans objet si aucun binôme souhaité n’est déclaré', () => {
      const a = fixtureAssignation(1, 1, Q0, Q1);
      const m = new Magasin({
        ...modeleVide(), macroCreneaux: [MACRO], equipes: [EQUIPE], benevoles: [benevole(1, 'Marie')], ...a,
      });
      const ix = indexer(m);
      const [ligne] = calculerChecklistBenevoles(m, ix, jourUnique(m), new Map());
      expect(ligne!.binome.etat).toBe('sans-objet');
    });

    it('respecte quand le binôme souhaité partage le même indicatif ce jour-là', () => {
      const a = fixtureAssignation(1, 1, Q0, Q1);
      const m = new Magasin({
        ...modeleVide(), macroCreneaux: [MACRO], equipes: [EQUIPE],
        benevoles: [benevole(1, 'Marie'), benevole(2, 'Karim')],
        missions: a.missions, sousCreneaux: a.sousCreneaux,
        besoins: [{...a.besoins[0]!, Effectif_max: 2, Taille_groupe: 2}],
        groupes: [{...a.groupes[0]!, Taille: 2}],
        positionsGroupe: a.positionsGroupe,
        places: [...a.places, {id: 2, Groupe: 1, Rang: 2, Benevole: 2, Origine: 'Manuel', Verrouillee: false, Score: 0}],
        affinites: [{id: 1, Benevole_A: 1, Benevole_B: 2, Type: 'Ensemble'}],
      });
      const ix = indexer(m);
      const lignes = calculerChecklistBenevoles(m, ix, jourUnique(m), new Map());
      expect(lignes.find((l) => l.nom === 'Marie')!.binome.etat).toBe('respecte');
    });

    it('viole et distingue "affecté ailleurs" d’un binôme non affecté du tout', () => {
      const a1 = fixtureAssignation(1, 1, Q0, Q1);
      const a2 = fixtureAssignation(2, 2, Q0, Q1); // Karim affecté ailleurs, pas avec Marie
      const m = new Magasin({
        ...modeleVide(), macroCreneaux: [MACRO], equipes: [EQUIPE],
        benevoles: [benevole(1, 'Marie'), benevole(2, 'Karim'), benevole(3, 'Alex')],
        missions: [...a1.missions, ...a2.missions],
        sousCreneaux: [...a1.sousCreneaux, ...a2.sousCreneaux],
        besoins: [...a1.besoins, ...a2.besoins],
        groupes: [...a1.groupes, ...a2.groupes],
        positionsGroupe: [...a1.positionsGroupe, ...a2.positionsGroupe],
        places: [...a1.places, ...a2.places],
        // Marie souhaite être avec Karim ET Alex ; ni l'un ni l'autre n'est avec elle.
        affinites: [
          {id: 1, Benevole_A: 1, Benevole_B: 2, Type: 'Ensemble'},
          {id: 2, Benevole_A: 1, Benevole_B: 3, Type: 'Ensemble'},
        ],
      });
      const ix = indexer(m);
      const marie = calculerChecklistBenevoles(m, ix, jourUnique(m), new Map()).find((l) => l.nom === 'Marie')!;
      expect(marie.binome.etat).toBe('viole');
      expect(marie.binome.detail).toContain('Karim est affecté ailleurs');
      expect(marie.binome.detail).toContain('Alex n’est affecté à aucun indicatif');
    });
  });

  describe('artiste (règle des 30 minutes)', () => {
    it('sans objet si aucun artiste n’est souhaité', () => {
      const a = fixtureAssignation(1, 1, Q0, Q1);
      const m = new Magasin({
        ...modeleVide(), macroCreneaux: [MACRO], equipes: [EQUIPE], benevoles: [benevole(1, 'Marie')], ...a,
      });
      const ix = indexer(m);
      const [ligne] = calculerChecklistBenevoles(m, ix, jourUnique(m), new Map());
      expect(ligne!.artiste.etat).toBe('sans-objet');
    });

    it('respecte quand 30 minutes libres sont possibles pendant le passage souhaité', () => {
      // Affectée uniquement sur Q0-Q1 (mission) ; l'artiste joue sur Q2-Q4, entièrement libre.
      const a = fixtureAssignation(1, 1, Q0, Q1);
      const m = new Magasin({
        ...modeleVide(), macroCreneaux: [MACRO], equipes: [EQUIPE], benevoles: [benevole(1, 'Marie')], ...a,
        artistes: [{id: 1, Nom: 'DJ Test', Lieu: 0, Debut: Q2, Fin: Q4}],
        disponibilites: [{Benevole: 1, Quart_heure: Q2, Statut: 'Artiste', Artiste: 1}],
      });
      const ix = indexer(m);
      const [ligne] = calculerChecklistBenevoles(m, ix, jourUnique(m), new Map());
      expect(ligne!.artiste.etat).toBe('respecte');
    });

    it('viole quand moins de 30 minutes libres restent pendant le passage souhaité', () => {
      // Affectée sur Q0-Q2 (3 quarts, Q0,Q1,Q2) ; l'artiste joue sur Q0-Q4 (4 quarts) : seul Q3 reste libre (15 min).
      const a = fixtureAssignation(1, 1, Q0, Q3);
      const m = new Magasin({
        ...modeleVide(), macroCreneaux: [MACRO], equipes: [EQUIPE], benevoles: [benevole(1, 'Marie')], ...a,
        artistes: [{id: 1, Nom: 'DJ Test', Lieu: 0, Debut: Q0, Fin: Q4}],
        disponibilites: [{Benevole: 1, Quart_heure: Q0, Statut: 'Artiste', Artiste: 1}],
      });
      const ix = indexer(m);
      const [ligne] = calculerChecklistBenevoles(m, ix, jourUnique(m), new Map());
      expect(ligne!.artiste.etat).toBe('viole');
      expect(ligne!.artiste.detail).toContain('DJ Test');
    });
  });
});
