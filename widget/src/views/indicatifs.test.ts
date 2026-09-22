/**
 * Vérifie que la page Indicatifs ne casse jamais face à un document Grist
 * pris à un stade incomplet — le point de départ réel d'Antoine (V0.1) : un
 * document vierge (tables présentes, aucune ligne), puis chaque étape
 * intermédiaire du parcours (macro-créneaux posés mais aucun sous-créneau,
 * sous-créneaux posés mais aucune mission), jamais le jeu de démonstration
 * figé. Complète `partiel.test.ts` (Bénévole/Équipe/Artistes), qui ne
 * couvre pas cette vue.
 */
import {beforeEach, describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {type EcritureGrist, Magasin} from '../store';
import {montrerIndicatifs} from './indicatifs';

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

describe('document vierge (avant toute saisie)', () => {
  it('ne lève pas et invite à commencer par l’agenda', () => {
    const m = new Magasin(modeleVide());
    expect(() => montrerIndicatifs(container, m)).not.toThrow();
    expect(container.textContent).toContain('macro-créneau');
  });
});

describe('macro-créneaux posés, aucun sous-créneau dessous', () => {
  function modele(): Modele {
    return {
      ...modeleVide(),
      macroCreneaux: [{id: 1, Nom: 'Vendredi', Debut: 1_700_000_000, Fin: 1_700_030_000}],
    };
  }

  it('ne lève pas et distingue ce cas du document vierge', () => {
    const m = new Magasin(modele());
    expect(() => montrerIndicatifs(container, m)).not.toThrow();
    expect(container.textContent).toContain('Aucun sous-créneau ce jour');
  });
});

describe('sous-créneaux posés, aucune mission créée', () => {
  function modele(): Modele {
    return {
      ...modeleVide(),
      macroCreneaux: [{id: 1, Nom: 'Vendredi', Debut: 1_700_000_000, Fin: 1_700_030_000}],
      sousCreneaux: [{
        id: 1, Macro_creneau: 1, Mission: null, Libelle: '10h-11h',
        Debut: 1_700_000_000, Fin: 1_700_003_600,
      }],
    };
  }

  it('ne lève pas et invite à créer des missions', () => {
    const m = new Magasin(modele());
    expect(() => montrerIndicatifs(container, m)).not.toThrow();
    expect(container.textContent).toContain('Aucune mission');
  });
});

describe('planning complet : missions et besoin, mais zone volontairement vide', () => {
  function modele(): Modele {
    return {
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      missions: [{
        id: 1, Nom: 'Buvette', Description: '', Lieu: 1, Equipe: 1,
        Priorite: 'Normale', Competences_requises: [],
      }],
      lieux: [{id: 1, Nom: 'Scène A', Description: ''}],
      macroCreneaux: [{id: 1, Nom: 'Vendredi', Debut: 1_700_000_000, Fin: 1_700_030_000}],
      sousCreneaux: [{
        id: 1, Macro_creneau: 1, Mission: null, Libelle: '10h-11h',
        Debut: 1_700_000_000, Fin: 1_700_003_600,
      }],
      // Aucun besoin pour ce couple mission/sous-créneau : case hachurée.
    };
  }

  it('affiche la grille avec une case vide, sans bouton de création (réservé à la vue Missions)', () => {
    const m = new Magasin(modele());
    expect(() => montrerIndicatifs(container, m)).not.toThrow();
    expect(container.querySelector('.besoin-cell--vide')).not.toBeNull();
    expect(container.querySelector('.ajouter-binome')).toBeNull();
  });

  it("crée un indicatif dès qu'un besoin existe sur la case, avec son binôme par défaut", () => {
    const m = new Magasin(modele());
    m.creerBesoin(1, 1);
    montrerIndicatifs(container, m);
    expect(container.querySelector('.groupe-chip')).not.toBeNull();
    expect(container.querySelectorAll('.groupe-chip')).toHaveLength(1);
  });

  describe('ajout d’un binôme depuis la case (bouton « + binôme », selectionnerNouveauGroupe)', () => {
    function ecritureQuiRefuseTout(): EcritureGrist {
      const refuse = () => async () => { throw new Error('document indisponible'); };
      return {
        creerMission: refuse(), creerMacroCreneau: refuse(), modifierMacroCreneau: refuse(),
        remplacerSousCreneaux: refuse(), creerBesoin: refuse(), creerGroupe: refuse(), positionnerGroupe: refuse(),
        definirPlaces: refuse(), deplacerPosition: refuse(), ajouterPosition: refuse(),
      };
    }

    it('en mode démo, crée le second indicatif sans afficher de message d’échec', async () => {
      const m = new Magasin(modele());
      await m.creerBesoin(1, 1);
      montrerIndicatifs(container, m);

      container.querySelector<HTMLButtonElement>('.ajouter-binome')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(container.querySelectorAll('.groupe-chip')).toHaveLength(2);
      expect(container.querySelector('.pill--danger')).toBeNull();
    });

    it('en mode connecté, si le pont refuse, affiche un message d’échec et ne crée rien de plus', async () => {
      const m = new Magasin(modele());
      await m.creerBesoin(1, 1);
      m.brancherEcriture(ecritureQuiRefuseTout());
      montrerIndicatifs(container, m);
      const nbGroupesAvant = m.groupes.length;

      container.querySelector<HTMLButtonElement>('.ajouter-binome')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(m.groupes).toHaveLength(nbGroupesAvant);
      expect(container.querySelector('.pill--danger')?.textContent).toContain("Échec de l'écriture");
    });
  });
});
