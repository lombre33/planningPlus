/**
 * Création et édition d'un passage artiste depuis la vue Artistes (§8.8,
 * demande d'Antoine du 2026-09-22 : « réutiliser le système de création des
 * besoins/sous-créneaux mais sur des tailles de créneau libres »). Couvre le
 * mode démo (pas de document Grist branché) et le mode connecté (échec puis
 * réussite de l'écriture), sur le même principe que `grille.test.ts`.
 */
import {beforeEach, describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {type EcritureGrist, Magasin} from '../store';
import {montrerArtistes} from './artistes';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [{id: 1, Nom: 'Grande scène', Description: ''}], benevoles: [], missions: [], artistes: [],
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

function remplirFormulaire(nom: string, debut: string, fin: string): void {
  const champNom = document.querySelector('input[placeholder="Nom de l’artiste"]') as HTMLInputElement;
  champNom.value = nom;
  champNom.dispatchEvent(new Event('input'));
  const champsDate = document.querySelectorAll('input[type="datetime-local"]');
  (champsDate[0] as HTMLInputElement).value = debut;
  (champsDate[0] as HTMLInputElement).dispatchEvent(new Event('input'));
  (champsDate[1] as HTMLInputElement).value = fin;
  (champsDate[1] as HTMLInputElement).dispatchEvent(new Event('input'));
}

function boutonTexte(texte: string): HTMLButtonElement {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent === texte) as HTMLButtonElement;
}

describe('vue Artistes sans aucun artiste', () => {
  it("affiche quand même la frise (axe, structure), pas seulement un message — même principe que Missions "
    + "dont la frise vient des macro-créneaux, indépendants des missions (défaut signalé par Antoine le "
    + '2026-09-23 : « complètement différent de Missions, pas de timeline »)', () => {
    const m = new Magasin(modeleVide());
    montrerArtistes(container, m);

    expect(container.querySelector('.timeline-wrap')).not.toBeNull();
    expect(container.querySelector('.timeline')).not.toBeNull();
    expect(container.textContent).toContain('Aucun artiste dans ce jeu de données');
  });
});

describe('création d’un passage, sans document Grist branché (mode démo)', () => {
  it('ajoute le passage et referme la modale', async () => {
    const m = new Magasin(modeleVide());
    montrerArtistes(container, m);

    boutonTexte('+ Nouveau passage').click();
    remplirFormulaire('Nuit Blanche', '2026-07-18T22:00', '2026-07-19T00:30');
    boutonTexte('Créer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes).toHaveLength(1);
    expect(m.artistes[0]?.Nom).toBe('Nuit Blanche');
    expect(m.artistes[0]!.Fin > m.artistes[0]!.Debut).toBe(true);
    expect(document.querySelector('.modal-backdrop')).toBeNull();
  });

  it("crée le passage sans lieu (« — aucun — », les lieux ne servent pas encore — demande d'Antoine du 2026-09-23), sans rien casser à l'affichage", async () => {
    const m = new Magasin({...modeleVide(), lieux: []});
    montrerArtistes(container, m);

    boutonTexte('+ Nouveau passage').click();
    remplirFormulaire('Nuit Blanche', '2026-07-18T22:00', '2026-07-19T00:30');
    boutonTexte('Créer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes).toHaveLength(1);
    expect(m.artistes[0]?.Lieu).toBe(0);
    expect(document.querySelector('.modal-backdrop')).toBeNull();
    expect(() => container.textContent).not.toThrow();
  });

  it('refuse une fin avant le début, sans rien créer', async () => {
    const m = new Magasin(modeleVide());
    montrerArtistes(container, m);

    boutonTexte('+ Nouveau passage').click();
    remplirFormulaire('Nuit Blanche', '2026-07-18T22:00', '2026-07-18T20:00');
    boutonTexte('Créer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes).toHaveLength(0);
    expect(document.querySelector('.field-erreur:not([hidden])')?.textContent).toContain('après le début');
    boutonTexte('Annuler').click();
  });
});

describe('édition d’un passage existant', () => {
  function modeleAvecPassage(): Modele {
    return {
      ...modeleVide(),
      artistes: [{id: 1, Nom: 'DJ Test', Lieu: 1, Debut: 1000, Fin: 2000}],
    };
  }

  it('pré-remplit le formulaire et met à jour le nom', async () => {
    const m = new Magasin(modeleAvecPassage());
    montrerArtistes(container, m);

    (container.querySelector('[data-bloc-id="1"]') as HTMLButtonElement).click();
    const champNom = document.querySelector('input[placeholder="Nom de l’artiste"]') as HTMLInputElement;
    expect(champNom.value).toBe('DJ Test');

    champNom.value = 'DJ Testé';
    champNom.dispatchEvent(new Event('input'));
    boutonTexte('Enregistrer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes).toHaveLength(1);
    expect(m.artistes[0]?.Nom).toBe('DJ Testé');
  });
});

describe('document connecté : échec d’écriture puis nouvel essai', () => {
  it("affiche l'erreur au premier échec, crée le passage au second essai", async () => {
    const m = new Magasin(modeleVide());
    let echec = true;
    const ecriture: EcritureGrist = {
      creerEquipe: async () => 1, creerMission: async () => 1,
      creerMacroCreneau: async () => 1, modifierMacroCreneau: async () => {},
      supprimerMacroCreneau: async () => {},
      creerArtiste: async () => { if (echec) { throw new Error('document indisponible'); } return 1; },
      modifierArtiste: async () => {},
      remplacerSousCreneaux: async () => [], modifierSousCreneaux: async () => {}, repointerBesoins: async () => {},
      creerBesoin: async () => 1,
      creerGroupe: async () => 1, positionnerGroupe: async () => {},
      definirPlaces: async () => {}, deplacerPosition: async () => {}, ajouterPosition: async () => 1,
      modifierPlaces: async () => {}, supprimerPosition: async () => {}, definirAbsence: async () => {},
    };
    m.brancherEcriture(ecriture);
    montrerArtistes(container, m);

    boutonTexte('+ Nouveau passage').click();
    remplirFormulaire('Nuit Blanche', '2026-07-18T22:00', '2026-07-19T00:30');
    boutonTexte('Créer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes).toHaveLength(0);
    expect(document.querySelector('.field-erreur:not([hidden])')?.textContent).toContain("Échec de l'écriture");

    echec = false;
    boutonTexte('Créer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes).toHaveLength(1);
    expect(document.querySelector('.modal-backdrop')).toBeNull();
  });
});
