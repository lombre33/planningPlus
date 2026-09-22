import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {type EcritureGrist, Magasin} from '../store';
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

  it("le bouton « + Nouvelle mission », sur un document sans aucune équipe, propose de la nommer plutôt que de bloquer (demande d'Antoine du 2026-09-22)", () => {
    const container = document.createElement('div');
    document.body.append(container);
    const m = new Magasin(modeleVide());
    montrerGrille(container, m);

    const bouton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '+ Nouvelle mission') as HTMLButtonElement;
    expect(() => bouton.click()).not.toThrow();

    // Pas de blocage à l'ouverture : le champ « Équipe » est un texte libre,
    // pas un sélecteur vide, et aucune erreur ne s'affiche encore.
    expect((document.querySelector('.field-erreur') as HTMLElement | null)?.hidden).not.toBe(false);
    expect(document.body.textContent).toContain("aucune équipe");

    // La modale n'est pas dans `container` (voir `ouvrirModal`) : la fermer
    // explicitement pour ne pas polluer les tests suivants.
    (Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Annuler') as HTMLButtonElement).click();
    container.remove();
  });

  it("créer une mission sur un document sans équipe crée l'équipe nommée puis la mission, et l'utilise aussitôt", async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const m = new Magasin(modeleVide());
    montrerGrille(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '+ Nouvelle mission') as HTMLButtonElement).click();

    const champNom = document.querySelector('input[placeholder="Contrôle des bracelets"]') as HTMLInputElement;
    champNom.value = 'Contrôle billetterie';
    champNom.dispatchEvent(new Event('input'));
    const champEquipe = document.querySelector('input[placeholder="Bars"]') as HTMLInputElement;
    champEquipe.value = 'Bars';
    champEquipe.dispatchEvent(new Event('input'));

    const boutonCreer = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Créer') as HTMLButtonElement;
    boutonCreer.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.equipes).toHaveLength(1);
    expect(m.equipes[0]?.Nom).toBe('Bars');
    expect(m.missions).toHaveLength(1);
    expect(m.missions[0]?.Equipe).toBe(m.equipes[0]?.id);
    expect(document.querySelector('.modal-backdrop')).toBeNull();

    container.remove();
  });

  it("en mode connecté, si la création de l'équipe réussit mais celle de la mission échoue, un nouvel essai réutilise l'équipe déjà créée plutôt que d'en recréer une seconde", async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const m = new Magasin(modeleVide());
    let idEquipeSuivant = 501;
    let echecMission = true;
    const ecriture: EcritureGrist = {
      creerEquipe: async () => idEquipeSuivant++,
      creerMission: async () => { if (echecMission) { throw new Error('document indisponible'); } return 1; },
      creerMacroCreneau: async () => 1,
      modifierMacroCreneau: async () => {},
      remplacerSousCreneaux: async () => [],
      creerBesoin: async () => 1,
      creerGroupe: async () => 1,
      positionnerGroupe: async () => {},
      definirPlaces: async () => {},
      deplacerPosition: async () => {},
      ajouterPosition: async () => 1,
    };
    m.brancherEcriture(ecriture);
    montrerGrille(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '+ Nouvelle mission') as HTMLButtonElement).click();
    const champNom = document.querySelector('input[placeholder="Contrôle des bracelets"]') as HTMLInputElement;
    champNom.value = 'Contrôle billetterie';
    champNom.dispatchEvent(new Event('input'));
    const champEquipe = document.querySelector('input[placeholder="Bars"]') as HTMLInputElement;
    champEquipe.value = 'Bars';
    champEquipe.dispatchEvent(new Event('input'));
    const boutonCreer = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Créer') as HTMLButtonElement;

    boutonCreer.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(m.equipes).toHaveLength(1);
    expect(m.missions).toHaveLength(0);
    expect(document.querySelector('.field-erreur:not([hidden])')?.textContent).toContain("Échec de l'écriture");

    echecMission = false;
    boutonCreer.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(m.equipes).toHaveLength(1);
    expect(m.missions).toHaveLength(1);
    expect(m.missions[0]?.Equipe).toBe(m.equipes[0]?.id);

    container.remove();
  });
});
