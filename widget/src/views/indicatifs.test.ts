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

  it("un besoin fraîchement créé n'a encore aucun binôme (plus de création automatique)", () => {
    const m = new Magasin(modele());
    m.creerBesoin(1, 1);
    montrerIndicatifs(container, m);
    expect(container.querySelector('.groupe-chip')).toBeNull();
    expect(container.querySelector('.ajouter-binome')?.textContent).toBe('+');
    expect(container.querySelector('.ajouter-binome')?.getAttribute('title')).toBe('Positionner un binôme sur ce besoin (§6.3)');
  });

  it('indique le nombre de binômes recommandé (effectif ÷ 2, arrondi au-dessus), sans jamais en créer', () => {
    const m = new Magasin(modele());
    m.creerBesoin(1, 1, {effectifMin: 5});
    montrerIndicatifs(container, m);
    expect(container.querySelector('.indicatif-cell__reco')?.textContent).toBe('≈3 binômes');
    expect(container.querySelector('.groupe-chip')).toBeNull();
  });

  describe('création explicite d’un binôme depuis la case (bouton « + binôme », selectionnerNouveauGroupe)', () => {
    function ecritureQuiRefuseTout(): EcritureGrist {
      const refuse = () => async () => { throw new Error('document indisponible'); };
      return {
        creerEquipe: refuse(), creerMission: refuse(), creerMacroCreneau: refuse(), modifierMacroCreneau: refuse(),
        supprimerMacroCreneau: refuse(), creerArtiste: refuse(), modifierArtiste: refuse(),
        remplacerSousCreneaux: refuse(), modifierSousCreneaux: refuse(), repointerBesoins: refuse(),
        creerBesoin: refuse(), creerGroupe: refuse(), positionnerGroupe: refuse(),
        definirPlaces: refuse(), deplacerPosition: refuse(), ajouterPosition: refuse(),
        supprimerPosition: refuse(),
      };
    }

    it('en mode démo, chaque clic crée un binôme de plus, sans limite ni message d’échec', async () => {
      const m = new Magasin(modele());
      await m.creerBesoin(1, 1);
      montrerIndicatifs(container, m);

      for (const attendu of [1, 2, 3]) {
        container.querySelector<HTMLButtonElement>('.ajouter-binome')!.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(container.querySelectorAll('.groupe-chip')).toHaveLength(attendu);
      }
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

describe('glisser un binôme entre deux besoins (retour Antoine 2026-09-23 : Alt = ajouter au lieu de déplacer)', () => {
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
      sousCreneaux: [
        {id: 1, Macro_creneau: 1, Mission: null, Libelle: '10h-11h', Debut: 1_700_000_000, Fin: 1_700_003_600},
        {id: 2, Macro_creneau: 1, Mission: null, Libelle: '11h-12h', Debut: 1_700_003_600, Fin: 1_700_007_200},
      ],
    };
  }

  async function preparer(): Promise<{m: Magasin; groupeId: number}> {
    const m = new Magasin(modele());
    await m.creerBesoin(1, 1);
    await m.creerBesoin(1, 2);
    const groupeId = await m.creerGroupeSurBesoin(m.besoins[0]!.id);
    montrerIndicatifs(container, m);
    return {m, groupeId};
  }

  // jsdom ne fournit pas `DragEvent`/`DataTransfer` : un `MouseEvent` porte
  // déjà tout ce que nos écouteurs lisent (`altKey`, `preventDefault`), donc
  // sert de doublure fidèle sans dépendre d'une API absente de l'environnement
  // de test.
  function glisser(source: Element, cible: Element, altKey: boolean): void {
    const options = {bubbles: true, cancelable: true, altKey};
    source.dispatchEvent(new MouseEvent('dragstart', options));
    cible.dispatchEvent(new MouseEvent('dragover', options));
    cible.dispatchEvent(new MouseEvent('drop', options));
    source.dispatchEvent(new MouseEvent('dragend', options));
  }

  it('sans Alt : déplace (retire la position d’origine)', async () => {
    const {m, groupeId} = await preparer();
    const cellules = container.querySelectorAll('.indicatif-cell');
    glisser(cellules[0]!.querySelector('.groupe-chip')!, cellules[1]!, false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.positionsGroupe.filter((p) => p.Groupe === groupeId)).toHaveLength(1);
    const apres = container.querySelectorAll('.indicatif-cell');
    expect(apres[0]!.querySelector('.groupe-chip')).toBeNull();
    expect(apres[1]!.querySelector('.groupe-chip')).not.toBeNull();
  });

  it('Alt+glisser : ajoute une position sur la case cible sans retirer l’origine', async () => {
    const {m, groupeId} = await preparer();
    const cellules = container.querySelectorAll('.indicatif-cell');
    glisser(cellules[0]!.querySelector('.groupe-chip')!, cellules[1]!, true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.positionsGroupe.filter((p) => p.Groupe === groupeId)).toHaveLength(2);
    const apres = container.querySelectorAll('.indicatif-cell');
    expect(apres[0]!.querySelector('.groupe-chip')).not.toBeNull();
    expect(apres[1]!.querySelector('.groupe-chip')).not.toBeNull();
  });

  it('Alt+glisser déposé sur la case d’origine ne fait rien (comme sans Alt)', async () => {
    const {m, groupeId} = await preparer();
    const cellules = container.querySelectorAll('.indicatif-cell');
    glisser(cellules[0]!.querySelector('.groupe-chip')!, cellules[0]!, true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.positionsGroupe.filter((p) => p.Groupe === groupeId)).toHaveLength(1);
  });
});

describe('panneau : supprimer une position (retour Antoine 2026-09-23 : jusqu’ici on ne pouvait que déplacer)', () => {
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
      sousCreneaux: [
        {id: 1, Macro_creneau: 1, Mission: null, Libelle: '10h-11h', Debut: 1_700_000_000, Fin: 1_700_003_600},
        {id: 2, Macro_creneau: 1, Mission: null, Libelle: '11h-12h', Debut: 1_700_003_600, Fin: 1_700_007_200},
      ],
    };
  }

  async function preparerAvecPanneauOuvert(): Promise<{m: Magasin; groupeId: number}> {
    const m = new Magasin(modele());
    await m.creerBesoin(1, 1);
    await m.creerBesoin(1, 2);
    const groupeId = await m.creerGroupeSurBesoin(m.besoins[0]!.id);
    await m.ajouterPosition(groupeId, m.besoins[1]!.id);
    montrerIndicatifs(container, m);
    container.querySelector<HTMLButtonElement>('.groupe-chip')!.click();
    return {m, groupeId};
  }

  function boutonsSupprimer(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('#panneau-lateral .trajectoire-etape button'))
      .filter((b) => b.textContent === 'Supprimer');
  }

  it('un bouton Supprimer apparaît à côté de Déplacer… pour chaque étape', async () => {
    const {} = await preparerAvecPanneauOuvert();
    const etapes = document.querySelectorAll('#panneau-lateral .trajectoire-etape');
    expect(etapes).toHaveLength(2);
    expect(boutonsSupprimer()).toHaveLength(2);
  });

  it('cliquer Supprimer retire cette seule position, garde le groupe et ses places', async () => {
    const {m, groupeId} = await preparerAvecPanneauOuvert();
    const placesAvant = m.places.filter((p) => p.Groupe === groupeId);

    boutonsSupprimer()[0]!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.positionsGroupe.filter((p) => p.Groupe === groupeId)).toHaveLength(1);
    expect(m.groupes.find((g) => g.id === groupeId)).toBeDefined();
    expect(m.places.filter((p) => p.Groupe === groupeId)).toEqual(placesAvant);
    expect(document.querySelectorAll('#panneau-lateral .trajectoire-etape')).toHaveLength(1);
  });

  it('supprimer la dernière position affiche « pas encore positionné », sans supprimer le groupe', async () => {
    const {m, groupeId} = await preparerAvecPanneauOuvert();

    // Les deux boutons capturés ici restent valides même après le
    // redessin synchrone déclenché par le premier clic (mode démo : sans
    // écriture branchée, `supprimerPosition` n'attend rien de réel, donc
    // `notifier()` — et le redessin qu'il déclenche — s'exécute avant que
    // ce clic ne retourne) : chaque bouton garde sa propre position en
    // fermeture, indépendamment de son détachement du DOM.
    for (const bouton of boutonsSupprimer()) { bouton.click(); }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.positionsGroupe.filter((p) => p.Groupe === groupeId)).toHaveLength(0);
    expect(m.groupes.find((g) => g.id === groupeId)).toBeDefined();
    expect(document.querySelector('#panneau-lateral .empty')?.textContent).toContain('Pas encore positionné');
  });

  it('en mode connecté, si le pont refuse, affiche un message d’échec et garde la position', async () => {
    const {m} = await preparerAvecPanneauOuvert();
    m.brancherEcriture({
      creerEquipe: async () => 1, creerMission: async () => 1, creerMacroCreneau: async () => 1,
      modifierMacroCreneau: async () => {}, supprimerMacroCreneau: async () => {},
      creerArtiste: async () => 1, modifierArtiste: async () => {},
      remplacerSousCreneaux: async () => [], modifierSousCreneaux: async () => {}, repointerBesoins: async () => {},
      creerBesoin: async () => 1, creerGroupe: async () => 1, positionnerGroupe: async () => {},
      definirPlaces: async () => {}, deplacerPosition: async () => {}, ajouterPosition: async () => 1,
      supprimerPosition: async () => { throw new Error('document indisponible'); },
    });
    const nbPositionsAvant = m.positionsGroupe.length;

    boutonsSupprimer()[0]!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.positionsGroupe).toHaveLength(nbPositionsAvant);
    expect(container.querySelector('.pill--danger')?.textContent).toContain("Échec de l'écriture");
  });
});

describe('créneaux propres à une mission (retour Antoine 2026-09-23, §6.2 : « communs, avec exceptions »)', () => {
  // Mission A (id 1) a matérialisé ses deux créneaux propres (décalés de
  // 30 min par rapport aux communs, comme le fait un glisser dans la vue
  // Missions) ; Mission B (id 2) n'a jamais touché aux siens et voit encore
  // les communs. §6.2 est tout ou rien par mission par jour : dès qu'une
  // mission a un propre, ses communs ne s'appliquent plus du tout à elle.
  function modele(): Modele {
    return {
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      missions: [
        {id: 1, Nom: 'Buvette', Description: '', Lieu: 1, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
        {id: 2, Nom: 'Accueil', Description: '', Lieu: 1, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
      ],
      lieux: [{id: 1, Nom: 'Scène A', Description: ''}],
      macroCreneaux: [{id: 1, Nom: 'Vendredi', Debut: 1_700_000_000, Fin: 1_700_030_000}],
      sousCreneaux: [
        {id: 1, Macro_creneau: 1, Mission: null, Libelle: '10h-11h (commun)', Debut: 1_700_000_000, Fin: 1_700_003_600},
        {id: 2, Macro_creneau: 1, Mission: null, Libelle: '11h-12h (commun)', Debut: 1_700_003_600, Fin: 1_700_007_200},
        {id: 10, Macro_creneau: 1, Mission: 1, Libelle: '10h30-11h30 (propre A)', Debut: 1_700_001_800, Fin: 1_700_005_400},
        {id: 11, Macro_creneau: 1, Mission: 1, Libelle: '11h30-12h30 (propre A)', Debut: 1_700_005_400, Fin: 1_700_009_000},
      ],
      besoins: [
        // Mission A repointée vers sa copie propre (même id de besoin,
        // `Sous_creneau` change — c'est ce que fait `repointerBesoins`).
        {id: 1, Mission: 1, Sous_creneau: 10, Effectif_min: 2, Effectif_max: 2, Taille_groupe: 2},
        // Mission B, elle, est toujours sur le commun.
        {id: 2, Mission: 2, Sous_creneau: 1, Effectif_min: 2, Effectif_max: 2, Taille_groupe: 2},
      ],
      groupes: [{id: 1, Code: 'A1', Taille: 2, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [
        {id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 2, Groupe: 1, Rang: 2, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
      ],
    };
  }

  // La frise (retour Antoine 2026-09-23 : un tableau à colonnes communes
  // explose dès que plusieurs missions divergent) n'a pas de colonnes
  // partagées entre missions : chaque ligne ne montre que ses propres blocs,
  // reliés à leur ligne via le même `style.gridRow` que `ui/frise.ts` leur
  // pose (aucun autre lien dans le DOM entre un bloc et sa mission).
  function blocsDeLigne(nomMission: string): HTMLElement[] {
    const labels = Array.from(container.querySelectorAll<HTMLElement>('.timeline__label'));
    const label = labels.find((l) => l.textContent?.includes(nomMission))!;
    const rangee = label.style.gridRow;
    return Array.from(container.querySelectorAll<HTMLElement>('.timeline__bloc'))
      .filter((b) => b.style.gridRow === rangee);
  }

  it('chaque mission ne montre que ses créneaux applicables, plus de colonnes communes à toutes', () => {
    const m = new Magasin(modele());
    montrerIndicatifs(container, m);
    expect(blocsDeLigne('Buvette')).toHaveLength(2); // ses 2 propres, jamais les communs qu'elle n'utilise plus
    expect(blocsDeLigne('Accueil')).toHaveLength(2); // ses 2 communs à elle, jamais les propres de Buvette
  });

  it('le binôme de la mission A apparaît sous son créneau propre, l’autre propre reste vide', () => {
    const m = new Magasin(modele());
    montrerIndicatifs(container, m);
    const blocs = blocsDeLigne('Buvette');
    const avecBinome = blocs.find((b) => b.querySelector('.groupe-chip'));
    expect(avecBinome).not.toBeUndefined();
    expect(avecBinome!.textContent).toContain('10h30-11h30 (propre A)');
    const autre = blocs.find((b) => b !== avecBinome)!;
    expect(autre.className).toContain('besoin-cell--vide');
    expect(autre.title).toBe('11h30-12h30 (propre A)');
  });

  it('la mission B, non concernée, garde ses deux communs et ne voit jamais les propres de A', () => {
    const m = new Magasin(modele());
    montrerIndicatifs(container, m);
    const blocs = blocsDeLigne('Accueil');
    expect(blocs).toHaveLength(2);
    expect(blocs.some((b) => b.textContent?.includes('10h-11h (commun)'))).toBe(true);
    expect(blocs.some((b) => b.title === '11h-12h (commun)' && b.className.includes('besoin-cell--vide'))).toBe(true);
    expect(blocs.some((b) => b.textContent?.includes('propre A'))).toBe(false);
    expect(blocs.every((b) => b.querySelector('.groupe-chip') === null)).toBe(true); // aucun binôme positionné pour B
  });

  it('un redimensionnement fait ailleurs (vue Missions) se répercute ici sans démonter la vue', async () => {
    const m = new Magasin(modele());
    montrerIndicatifs(container, m);
    const blocAvant = blocsDeLigne('Buvette').find((b) => b.querySelector('.groupe-chip'))!;
    const libelleAvant = blocAvant.textContent;

    // Même écriture que la vue Missions (`Magasin.redimensionnerCreneauMission`,
    // poignée de bord) — les deux vues partagent le même Magasin, donc pas
    // besoin de remonter la vue pour voir le changement (retour Antoine :
    // « il faut que les créneaux affichés s'adaptent en temps réel »).
    await m.redimensionnerCreneauMission(10, 1, false, 1800);
    const blocApres = blocsDeLigne('Buvette').find((b) => b.querySelector('.groupe-chip'))!;

    expect(blocApres.textContent).not.toBe(libelleAvant);
  });
});
