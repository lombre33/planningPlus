/**
 * Vue « plannings équipes imprimables » (demande d'Antoine du 2026-09-23,
 * point 2) sur un document pauvre ou vide — même discipline que les autres
 * vues ([[vues-vides-audit]] en mémoire d'équipe).
 */
import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {montrerEquipesImprimables} from './equipes-imprimables';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [],
  };
}

const DEBUT = 1_800_000_000;
const FIN = DEBUT + 4 * 3600;

describe('montrerEquipesImprimables sans aucune équipe', () => {
  it('explique l’absence de contenu plutôt que d’afficher un écran vide', () => {
    const m = new Magasin(modeleVide());
    const container = document.createElement('div');
    montrerEquipesImprimables(container, m);
    expect(container.textContent).toContain('Aucune équipe dans ce jeu de données');
  });
});

describe('montrerEquipesImprimables avec une équipe mais aucune mission ce jour-là', () => {
  it('dit pourquoi rien ne s’affiche plutôt que de rendre une page vide', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
    });
    const container = document.createElement('div');
    montrerEquipesImprimables(container, m);
    expect(container.textContent).toContain("Aucune équipe n'a de mission ce jour-là");
  });
});

describe('montrerEquipesImprimables avec une mission pourvue', () => {
  it('affiche une section par équipe avec sa mission et le nom + indicatif du bénévole affecté', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Comptage entrée Village partenaire', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 3600}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
    });
    const container = document.createElement('div');
    montrerEquipesImprimables(container, m);

    expect(container.querySelectorAll('.impression-equipes__equipe').length).toBe(1);
    expect(container.textContent).toContain('Bar');
    expect(container.textContent).toContain('Comptage entrée Village partenaire');
    const celluleAssignee = container.querySelector('.impression-bloc--assignee');
    expect(celluleAssignee?.getAttribute('title')).toContain('Marie (A1)');
  });
});
