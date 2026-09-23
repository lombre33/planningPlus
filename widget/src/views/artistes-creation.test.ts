/**
 * Création et édition d'un passage artiste depuis la vue Artistes (§8.8).
 * « + Nouvel artiste » ne crée que l'identité (nom, lieu) — pas d'horaire,
 * ça n'a pas de sens dans cette modale (demande d'Antoine du 2026-09-23,
 * en réaction directe à l'ancienne version qui en demandait un) : le
 * passage se pose ensuite d'un clic sur la ligne, via
 * `ouvrirModalCreationPassagePourArtiste`, même principe que
 * `ouvrirCreationMission`/`ouvrirCreationCreneauMission` dans `grille.ts`.
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

function remplirIdentite(nom: string): void {
  const champNom = document.querySelector('input[placeholder="Nom de l’artiste"]') as HTMLInputElement;
  champNom.value = nom;
  champNom.dispatchEvent(new Event('input'));
}

function boutonTexte(texte: string): HTMLButtonElement {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent === texte) as HTMLButtonElement;
}

describe('vue Artistes sans aucun macro-créneau', () => {
  it("affiche un message plutôt qu'une frise sans axe — même règle que Missions sur un document sans macro-créneau (grille.test.ts)", () => {
    const m = new Magasin(modeleVide());
    montrerArtistes(container, m);

    expect(container.querySelector('.timeline-wrap')).toBeNull();
    expect(container.textContent).toContain('Aucun macro-créneau');
    // Créer un artiste ne dépend pas du filtre jour : le bouton reste utilisable.
    expect(boutonTexte('+ Nouvel artiste')).toBeDefined();
  });
});

describe('vue Artistes avec un macro-créneau mais aucun artiste', () => {
  function modeleAvecMacro(): Modele {
    return {...modeleVide(), macroCreneaux: [{id: 1, Nom: 'Jour 1', Debut: 0, Fin: 86400}]};
  }

  it("affiche quand même la frise (axe, structure), pas seulement un message — même principe que Missions "
    + "dont la frise vient des macro-créneaux, indépendants des missions (défaut signalé par Antoine le "
    + '2026-09-23 : « complètement différent de Missions, pas de timeline »)', () => {
    const m = new Magasin(modeleAvecMacro());
    montrerArtistes(container, m);

    expect(container.querySelector('.timeline-wrap')).not.toBeNull();
    expect(container.querySelector('.timeline')).not.toBeNull();
    expect(container.textContent).toContain('Aucun artiste dans ce jeu de données');
  });
});

describe('« + Nouvel artiste » : identité seule, sans horaire (demande d’Antoine du 2026-09-23)', () => {
  it('ajoute une ligne sans passage (Debut === Fin, aucun horaire demandé) et referme la modale', async () => {
    const m = new Magasin(modeleVide());
    montrerArtistes(container, m);

    boutonTexte('+ Nouvel artiste').click();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    remplirIdentite('Nuit Blanche');
    boutonTexte('Créer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes).toHaveLength(1);
    expect(m.artistes[0]?.Nom).toBe('Nuit Blanche');
    expect(m.artistes[0]!.Debut).toBe(m.artistes[0]!.Fin);
    expect(document.querySelector('.modal-backdrop')).toBeNull();
  });

  it("crée l'artiste sans lieu (« — aucun — », les lieux ne servent pas encore — demande d'Antoine du 2026-09-23), sans rien casser à l'affichage", async () => {
    const m = new Magasin({...modeleVide(), lieux: []});
    montrerArtistes(container, m);

    boutonTexte('+ Nouvel artiste').click();
    remplirIdentite('Nuit Blanche');
    boutonTexte('Créer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes).toHaveLength(1);
    expect(m.artistes[0]?.Lieu).toBe(0);
    expect(document.querySelector('.modal-backdrop')).toBeNull();
    expect(() => container.textContent).not.toThrow();
  });

  it('refuse un nom vide, sans rien créer', async () => {
    const m = new Magasin(modeleVide());
    montrerArtistes(container, m);

    boutonTexte('+ Nouvel artiste').click();
    boutonTexte('Créer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes).toHaveLength(0);
    expect(document.querySelector('.field-erreur:not([hidden])')?.textContent).toContain('nom');
    boutonTexte('Annuler').click();
  });

  it('le premier passage posé sur la ligne (bouton « + passage ») remplace le placeholder en place, sans laisser de ligne vide en plus (§8.8, points 3 et 4 d’Antoine du 2026-09-23)', async () => {
    const m = new Magasin({...modeleVide(), macroCreneaux: [{id: 1, Nom: 'Jour 1', Debut: 0, Fin: 86400}]});
    montrerArtistes(container, m);

    boutonTexte('+ Nouvel artiste').click();
    remplirIdentite('Nuit Blanche');
    boutonTexte('Créer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const idPlaceholder = m.artistes[0]!.id;

    const boutonLigne = Array.from(container.querySelectorAll('.timeline__label button'))
      .find((b) => b.textContent === '+ passage') as HTMLButtonElement;
    expect(boutonLigne).toBeTruthy();
    boutonLigne.click();

    const champNom = document.querySelector('input[placeholder="Nom de l’artiste"]') as HTMLInputElement;
    expect(champNom.value).toBe('Nuit Blanche');
    expect(champNom.disabled).toBe(true);
    const champsDate = document.querySelectorAll('input[type="datetime-local"]');
    (champsDate[0] as HTMLInputElement).value = '2026-07-18T22:00';
    (champsDate[0] as HTMLInputElement).dispatchEvent(new Event('input'));
    (champsDate[1] as HTMLInputElement).value = '2026-07-19T00:30';
    (champsDate[1] as HTMLInputElement).dispatchEvent(new Event('input'));
    boutonTexte('Créer').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Toujours une seule ligne : le placeholder a été mis à jour, pas dupliqué.
    expect(m.artistes).toHaveLength(1);
    expect(m.artistes[0]!.id).toBe(idPlaceholder);
    expect(m.artistes[0]!.Fin).toBeGreaterThan(m.artistes[0]!.Debut);
  });
});

describe('édition d’un passage existant', () => {
  function modeleAvecPassage(): Modele {
    return {
      ...modeleVide(),
      macroCreneaux: [{id: 1, Nom: 'Jour 1', Debut: 0, Fin: 3000}],
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
  it("affiche l'erreur au premier échec, crée l'artiste au second essai", async () => {
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
      valeursColonneBrute: async () => new Map(),
      colonnesTable: async () => [],
      definirParametre: async () => {},
      remplacerDisponibilites: async () => {},
    };
    m.brancherEcriture(ecriture);
    montrerArtistes(container, m);

    boutonTexte('+ Nouvel artiste').click();
    remplirIdentite('Nuit Blanche');
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
