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

describe('montrerEquipesImprimables avec plusieurs équipes', () => {
  function modeleDeuxEquipes(): Modele {
    return {
      ...modeleVide(),
      equipes: [
        {id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''},
        {id: 2, Nom: 'Accueil', Couleur: '#000', Referent: null, Notes: ''},
      ],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
        {id: 2, Nom: 'Karim', Contact: '', Equipe: 2, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [
        {id: 1, Nom: 'Bar central', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
        {id: 2, Nom: 'Accueil VIP', Description: '', Lieu: 0, Equipe: 2, Priorite: 'Normale', Competences_requises: []},
      ],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      sousCreneaux: [
        {id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 3600},
        {id: 2, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 3600},
      ],
      besoins: [
        {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
        {id: 2, Mission: 2, Sous_creneau: 2, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      ],
      groupes: [
        {id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''},
        {id: 2, Code: 'B1', Taille: 1, Equipe: 2, Notes: ''},
      ],
      positionsGroupe: [
        {id: 1, Groupe: 1, Besoin: 1},
        {id: 2, Groupe: 2, Besoin: 2},
      ],
      places: [
        {id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 2, Groupe: 2, Rang: 1, Benevole: 2, Origine: 'Manuel', Verrouillee: false, Score: 0},
      ],
    };
  }

  it('affiche toutes les équipes par défaut, une seule après un clic sur son bouton (retour Antoine 2026-09-24 : filtre équipe)', () => {
    const m = new Magasin(modeleDeuxEquipes());
    const container = document.createElement('div');
    montrerEquipesImprimables(container, m);

    expect(container.querySelectorAll('.impression-equipes__equipe').length).toBe(2);

    const trouverBouton = (texte: string) =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('.agenda__toolbar button')).find((b) => b.textContent === texte);

    trouverBouton('Bar')?.click();
    expect(container.querySelectorAll('.impression-equipes__equipe').length).toBe(1);
    expect(container.querySelector('.impression-equipes__titre')?.textContent).toBe('Bar');

    trouverBouton('Toutes les équipes')?.click();
    expect(container.querySelectorAll('.impression-equipes__equipe').length).toBe(2);
  });
});

describe('montrerEquipesImprimables à l’écran avec un créneau trop court même pour le code d’indicatif', () => {
  it('tronque avec une ellipse au plancher écran plutôt que de laisser le bloc sans texte (retour Antoine 2026-09-24 : lisibilité écran)', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Bar central', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      // Un seul quart d'heure, un code d'indicatif assez long pour que même le
      // candidat de secours (le code seul, sans le nom) ne tienne pas au plancher écran.
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 900}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'ZZZZZZZZZZ1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
    });
    const container = document.createElement('div');
    montrerEquipesImprimables(container, m);

    const bloc = container.querySelector('.impression-bloc--assignee');
    const texte = bloc?.querySelector<HTMLElement>('.impression-bloc__texte');
    expect(texte).not.toBeNull();
    expect(texte?.textContent).not.toBe('');
    expect(texte?.textContent?.endsWith('…')).toBe(true);
    // Jamais en dessous du plancher écran (8px), contrairement à l'impression qui peut
    // descendre à 6px.
    expect(texte?.style.fontSize).toBe('8px');
  });
});

describe('montrerEquipesImprimables avec plusieurs binômes sur la même mission au même quart', () => {
  it('affiche une ligne par indicatif, jamais fondues en une seule (retour Antoine 2026-09-24)', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Bar central', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      // Assez large (4 quarts) pour que « Marie (A1) » tienne à l'écran sans tomber
      // sur le repli code-seul, qui n'est pas ce que ce test veut observer.
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 3600}],
      // Trois binômes positionnés sur le même besoin : un seul pourvu, deux encore vides.
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
    const container = document.createElement('div');
    montrerEquipesImprimables(container, m);

    const bloc = container.querySelector('.impression-bloc--assignee');
    expect(bloc).not.toBeNull();
    const lignes = Array.from(bloc?.querySelectorAll<HTMLElement>('.impression-bloc__texte') ?? []).map((l) => l.textContent);
    expect(lignes).toHaveLength(3);
    expect(lignes.some((l) => l?.includes('Marie') && l?.includes('A1'))).toBe(true);
    // Les indicatifs vides s'affichent quand même, par leur seul code.
    expect(lignes).toContain('A2');
    expect(lignes).toContain('A3');
  });

  it('affiche l’indicatif seul, sans bénévole, en style « libre » (retour Antoine 2026-09-24)', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
      missions: [{id: 1, Nom: 'Bar central', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 900}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 2, Taille_groupe: 2}],
      groupes: [{id: 1, Code: 'A1', Taille: 2, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [
        {id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 2, Groupe: 1, Rang: 2, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
      ],
    });
    const container = document.createElement('div');
    montrerEquipesImprimables(container, m);

    expect(container.querySelector('.impression-bloc--assignee')).toBeNull();
    const bloc = container.querySelector('.impression-bloc--libre');
    expect(bloc?.querySelector('.impression-bloc__texte')?.textContent).toBe('A1');
    expect(bloc?.getAttribute('title')).toBe('A1');
  });
});
