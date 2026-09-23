/**
 * Vérifie que les trois vues de consultation (Bénévole, Équipe, Artistes,
 * §8.6-8.8) ne cassent jamais face à un planning partiel : c'est l'état
 * dans lequel Antoine va maintenant les ouvrir au fur et à mesure qu'il
 * construit lui-même son planning, étape par étape (macro-créneaux, puis
 * sous-créneaux/missions, puis indicatifs, puis disponibilités). Chaque cas
 * ci-dessous isole une étape « pas encore faite » plutôt qu'une donnée
 * corrompue : ces vues ne font que lire, jamais que supposer une référence
 * qu'un autre écran n'a pas encore créée.
 */
import {beforeEach, describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {montrerArtistes} from './artistes';
import {montrerBenevole} from './benevole';
import {montrerEquipe} from './equipe';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [],
  };
}

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  return () => container.remove();
});

describe('planning entièrement vide (avant toute saisie)', () => {
  it("montrerBenevole ne lève pas et affiche un état vide", () => {
    const m = new Magasin(modeleVide());
    expect(() => montrerBenevole(container, m)).not.toThrow();
    expect(container.textContent).toContain('Aucun bénévole');
  });

  it("montrerEquipe ne lève pas et affiche un état vide", () => {
    const m = new Magasin(modeleVide());
    expect(() => montrerEquipe(container, m)).not.toThrow();
    expect(container.textContent).toContain('Aucune équipe');
  });

  it("montrerArtistes ne lève pas et affiche un état vide", () => {
    const m = new Magasin(modeleVide());
    expect(() => montrerArtistes(container, m)).not.toThrow();
    expect(container.textContent).toContain('Aucun artiste');
  });
});

describe('macro-créneaux posés, mais aucun sous-créneau créé dessous (zone volontairement vide)', () => {
  function modele(): Modele {
    return {
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      benevoles: [{
        id: 1, Nom: 'Alice', Contact: '', Equipe: 1, Competences: [],
        Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
      }],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 10000}],
      // Aucun sous-créneau : l'agenda existe déjà, mais rien n'est encore
      // détaillé dessous.
    };
  }

  it('montrerBenevole affiche Alice sans aucune étape', () => {
    const m = new Magasin(modele());
    expect(() => montrerBenevole(container, m)).not.toThrow();
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain("Aucune affectation pour l'instant.");
  });

  it('montrerEquipe affiche l’équipe sans aucun indicatif', () => {
    const m = new Magasin(modele());
    expect(() => montrerEquipe(container, m)).not.toThrow();
    expect(container.textContent).toContain('Aucun indicatif pour cette équipe.');
  });
});

describe('indicatif créé et positionné, mais aucune place encore pourvue (roster vide)', () => {
  function modele(): Modele {
    return {
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      lieux: [{id: 1, Nom: 'Grande scène', Description: ''}],
      missions: [{id: 1, Nom: 'Bar principal', Description: '', Lieu: 1, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 10000}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: '14h-15h30', Debut: 0, Fin: 900}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 2, Effectif_max: 3, Taille_groupe: 2}],
      groupes: [{id: 1, Code: 'BA01', Taille: 2, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      // Aucune ligne Place : le roster n'a pas encore été rempli du tout
      // (pas même des places vacantes explicites).
    };
  }

  it('montrerEquipe montre l’indicatif avec un roster vide et une couverture à zéro, sans lever', () => {
    const m = new Magasin(modele());
    expect(() => montrerEquipe(container, m)).not.toThrow();
    expect(container.textContent).toContain('BA01');
    expect(container.textContent).toContain('Bar principal');
  });
});

describe('groupe créé mais pas encore positionné sur un besoin', () => {
  function modele(): Modele {
    return {
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      groupes: [{id: 1, Code: 'BA01', Taille: 2, Equipe: 1, Notes: ''}],
      places: [
        {id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 2, Groupe: 1, Rang: 2, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
      ],
      // Aucune PositionGroupe : l'indicatif existe, avec son roster, mais
      // n'a encore été affecté à aucune mission.
    };
  }

  it('montrerEquipe signale les deux places vacantes et « pas encore positionné », sans lever', () => {
    const m = new Magasin(modele());
    expect(() => montrerEquipe(container, m)).not.toThrow();
    expect(container.textContent).toContain('Pas encore positionné sur un besoin.');
    expect(container.textContent).toContain('place');
  });
});

describe('artiste déclaré sans qu’aucune disponibilité n’ait encore été saisie', () => {
  it('montrerArtistes affiche une demande à zéro pour tous, sans lever', () => {
    const m = new Magasin({
      ...modeleVide(),
      lieux: [{id: 1, Nom: 'Grande scène', Description: ''}],
      macroCreneaux: [{id: 1, Nom: 'Jour', Debut: 0, Fin: 3600}],
      artistes: [{id: 1, Nom: 'Nuit Blanche', Lieu: 1, Debut: 900, Fin: 1800}],
    });
    expect(() => montrerArtistes(container, m)).not.toThrow();
    expect(container.textContent).toContain('Nuit Blanche');
    const bloc = container.querySelector('[data-bloc-id="1"]');
    expect(bloc?.textContent).toContain('0');
    expect(bloc?.getAttribute('title')).toContain('0 intéressé');
  });
});
