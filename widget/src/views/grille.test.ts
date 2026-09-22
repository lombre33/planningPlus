import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {montrerGrille} from './grille';

/** Document Grist « from scratch » : toutes les tables existent (le fichier
 *  modèle les crée) mais aucune n'a de ligne. C'est exactement le point de
 *  départ qu'Antoine aura pour tester la V0.1 — pas un cas limite. */
function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [],
    affinites: [],
  };
}

describe('montrerGrille sur un document vide', () => {
  it("s'affiche sans lever d'exception, sans équipe ni mission ni sous-créneau", () => {
    const container = document.createElement('div');
    const m = new Magasin(modeleVide());

    expect(() => montrerGrille(container, m)).not.toThrow();
    expect(container.querySelector('.empty')?.textContent).toBe('Aucun sous-créneau ce jour.');

    const bouton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '+ Nouvelle mission');
    expect(bouton).toBeDefined();
  });

  it("le bouton « + Nouvelle mission » ouvre une modale qui signale l'absence d'équipe plutôt que de planter", () => {
    const container = document.createElement('div');
    document.body.append(container);
    const m = new Magasin(modeleVide());
    montrerGrille(container, m);

    const bouton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '+ Nouvelle mission') as HTMLButtonElement;
    expect(() => bouton.click()).not.toThrow();

    const erreur = document.querySelector('.field-erreur') as HTMLElement | null;
    expect(erreur?.hidden).toBe(false);
    expect(erreur?.textContent).toContain('Aucune équipe');

    container.remove();
  });
});
