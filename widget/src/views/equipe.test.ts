/**
 * Vue Équipe (§8.7) sur un document pauvre ou vide. Même défaut que la
 * vue Artistes ([[vue-artistes-sans-timeline]] en mémoire d'équipe) :
 * `rafraichir()` sortait tôt sur un message texte quand `m.equipes` était
 * vide, avant même de poser la barre d'outils — écran mort sur un document
 * neuf, l'état de départ qu'Antoine voit à chaque étape (2026-09-23,
 * revue préventive des douze vues, pas un signalement d'Antoine).
 */
import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {montrerEquipe} from './equipe';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [],
  };
}

describe('montrerEquipe sans aucune équipe', () => {
  it('pose quand même la barre d’outils ; le message de vide prend la place du contenu, pas de l’écran', () => {
    const m = new Magasin(modeleVide());
    const container = document.createElement('div');
    montrerEquipe(container, m);

    expect(container.querySelector('.agenda__toolbar')).not.toBeNull();
    expect(container.textContent).toContain('Aucune équipe dans ce jeu de données');
  });
});

describe('montrerEquipe avec une équipe sans aucun groupe (indicatif)', () => {
  it('affiche les onglets d’équipe et « aucun indicatif », pas un écran mort', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
    });
    const container = document.createElement('div');
    montrerEquipe(container, m);

    const onglets = container.querySelectorAll('.agenda__toolbar button');
    expect(Array.from(onglets).map((b) => b.textContent)).toEqual(['Bar']);
    expect(container.textContent).toContain('Aucun indicatif pour cette équipe.');
  });
});
