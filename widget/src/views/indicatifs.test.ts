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
    expect(container.querySelector('.ajouter-binome')?.textContent).toBe('+ positionner un binôme');
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

  it('la grille montre l’union des créneaux applicables (4 colonnes), pas seulement les communs', () => {
    const m = new Magasin(modele());
    montrerIndicatifs(container, m);
    expect(container.querySelectorAll('.grille thead th')).toHaveLength(1 + 4); // Mission + 4 créneaux
  });

  it('le binôme de la mission A apparaît sous sa colonne propre, pas perdu au commun qu’elle n’utilise plus', () => {
    const m = new Magasin(modele());
    montrerIndicatifs(container, m);
    const lignes = container.querySelectorAll('.grille tbody tr');
    const ligneA = Array.from(lignes).find((tr) => tr.textContent?.includes('Buvette'))!;
    const cellules = ligneA.querySelectorAll('td');
    // [0] mission, puis colonnes triées par Debut : commun 10-11, propre A
    // 10h30-11h30, commun 11-12, propre A 11h30-12h30.
    expect(cellules[0]!.textContent).toContain('Buvette');
    expect(cellules[1]!.className).toContain('besoin-cell--na'); // commun 10-11 : ne s'applique plus à A
    expect(cellules[2]!.querySelector('.groupe-chip')).not.toBeNull(); // son propre 10h30-11h30
    expect(cellules[3]!.className).toContain('besoin-cell--na'); // commun 11-12 : idem
    expect(cellules[4]!.className).toContain('besoin-cell--vide'); // son propre 11h30-12h30, pas encore de besoin
  });

  it('la mission B, non concernée, garde ses communs et voit les propres de A comme non applicables', () => {
    const m = new Magasin(modele());
    montrerIndicatifs(container, m);
    const lignes = container.querySelectorAll('.grille tbody tr');
    const ligneB = Array.from(lignes).find((tr) => tr.textContent?.includes('Accueil'))!;
    const cellules = ligneB.querySelectorAll('td');
    expect(cellules[1]!.querySelector('.groupe-chip')).toBeNull();
    expect(cellules[1]!.className).not.toContain('besoin-cell--na'); // son commun à elle, applicable
    expect(cellules[2]!.className).toContain('besoin-cell--na'); // propre de A, pas le sien
    expect(cellules[4]!.className).toContain('besoin-cell--na'); // idem
  });

  it('un redimensionnement fait ailleurs (vue Missions) se répercute ici sans démonter la vue', async () => {
    const m = new Magasin(modele());
    montrerIndicatifs(container, m);
    const libelleAvant = container.querySelector('.grille thead th:nth-child(3)')?.textContent;

    // Même écriture que la vue Missions (`Magasin.redimensionnerCreneauMission`,
    // glisser en tenant Alt) — les deux vues partagent le même Magasin, donc
    // pas besoin de remonter la vue pour voir le changement (retour Antoine :
    // « il faut que les créneaux affichés s'adaptent en temps réel »).
    await m.redimensionnerCreneauMission(10, 1, false, 1800);
    const libelleApres = container.querySelector('.grille thead th:nth-child(3)')?.textContent;

    expect(libelleApres).not.toBe(libelleAvant);
  });
});
