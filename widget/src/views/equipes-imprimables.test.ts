/**
 * Vue « plannings équipes imprimables » (demande d'Antoine du 2026-09-23,
 * point 2) sur un document pauvre ou vide — même discipline que les autres
 * vues ([[vues-vides-audit]] en mémoire d'équipe).
 */
import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {CLE_TABLE_BENEVOLES} from '../logic/parametres-benevoles';
import {type EcritureGrist, Magasin} from '../store';
import {montrerEquipesImprimables} from './equipes-imprimables';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [],
  };
}

const ecritureMuette: EcritureGrist = {
  creerEquipe: async () => 1, creerMission: async () => 1, creerMacroCreneau: async () => 1,
  modifierMacroCreneau: async () => {}, supprimerMacroCreneau: async () => {}, creerArtiste: async () => 1,
  modifierArtiste: async () => {}, remplacerSousCreneaux: async () => [], modifierSousCreneaux: async () => {},
  repointerBesoins: async () => {}, creerBesoin: async () => 1, creerGroupe: async () => 1,
  positionnerGroupe: async () => {}, definirPlaces: async () => {}, deplacerPosition: async () => {},
  ajouterPosition: async () => 1, modifierPlaces: async () => {}, supprimerPosition: async () => {},
  definirAbsence: async () => {}, valeursColonneBrute: async () => new Map(), colonnesTable: async () => [],
  tablesDocument: async () => [], definirParametre: async () => {}, remplacerDisponibilites: async () => {},
  peuplerBenevoles: async () => ({benevoles: [], crees: 0, actualises: 0}), creerAffinites: async () => [],
};

/** Attend un tour de micro-tâches : `nomsCompletsDepuisSource` est async,
 *  résolue avant un premier redessin déclenché par son `.then()`. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

  it(
    "affiche le nom complet lu dans la table externe d'Antoine (Id_source) une fois chargé, "
    + 'sans bloquer le premier rendu (retour Antoine 2026-09-24 : refuse de relancer son import)',
    async () => {
      const m = new Magasin(
        {
          ...modeleVide(),
          equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
          benevoles: [
            {
              id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0,
              Quota_heures_max: 99, Statut: 'Actif', Notes: '', Id_source: 42,
            },
          ],
          missions: [{id: 1, Nom: 'Comptoir', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
          macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
          sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 3600}],
          besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
          groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
          positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
          places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
        },
        [{cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'}],
      );
      m.brancherEcriture({
        ...ecritureMuette,
        colonnesTable: async () => [{colId: 'Nom_prenom', label: 'Nom_prenom', type: 'Text'}],
        valeursColonneBrute: async () => new Map([[42, 'Marie Dupont']]),
      });
      const container = document.createElement('div');
      montrerEquipesImprimables(container, m);

      // Premier rendu : jamais bloqué par la lecture async, garde `Nom` en attendant.
      expect(container.querySelector('.impression-bloc--assignee')?.getAttribute('title')).toContain('Marie (A1)');

      await tick();

      expect(container.querySelector('.impression-bloc--assignee')?.getAttribute('title')).toContain('Marie Dupont (A1)');
    },
  );
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

  it('imprime une section par équipe, jamais découpée en plusieurs pages chronologiques (retour Antoine 2026-09-24, cinquième passage : une équipe = une page, jamais une demi-journée)', () => {
    const m = new Magasin(modeleDeuxEquipes());
    const container = document.createElement('div');
    const zoneImpression = document.createElement('div');
    zoneImpression.id = 'zone-impression';
    document.body.append(zoneImpression);
    window.print = () => {};

    try {
      montrerEquipesImprimables(container, m);
      const boutonImprimer = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.startsWith('Imprimer'));
      boutonImprimer?.click();

      // Une section par équipe, jamais plusieurs pour la même équipe : le découpage
      // chronologique du troisième passage est bien renversé.
      expect(zoneImpression.querySelectorAll('.impression-equipes__equipe').length).toBe(2);
      // Le sous-titre de page (plage horaire) n'existe plus : plus de pagination à sous-titrer.
      expect(zoneImpression.querySelector('.impression-equipes__sous-titre')).toBeNull();

      // WYSIWYG abandonné (sixième passage, régression sur les noms) : les calibrages
      // écran et papier sont redécouplés, donc les deux largeurs diffèrent à nouveau —
      // 16 quarts sur 4h, colonne mission 190px : écran 190+16*34=734px, papier
      // 190+16*(860/16)=1050px (tient sur une page A4 paysage).
      const largeurEcran = container.querySelector<HTMLTableElement>('table.impression-table')?.style.width;
      const largeurImpression = zoneImpression.querySelector<HTMLTableElement>('table.impression-table')?.style.width;
      expect(largeurEcran).toBe('734px');
      expect(largeurImpression).toBe('1050px');
    } finally {
      zoneImpression.remove();
    }
  });
});

describe('montrerEquipesImprimables : calibrages écran et papier (redécouplés au sixième passage, WYSIWYG abandonné)', () => {
  it('donne à l’écran sa propre largeur de quart fixe, et au papier une largeur qui tient la journée entière sur une page A4', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Bar central', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      // Une journée de 8h (32 quarts) pour vérifier que la largeur papier se resserre en
      // conséquence, alors que la largeur écran reste calculée sur sa propre base fixe.
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: DEBUT + 8 * 3600}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 3600}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
    });
    const container = document.createElement('div');
    const zoneImpression = document.createElement('div');
    zoneImpression.id = 'zone-impression';
    document.body.append(zoneImpression);
    window.print = () => {};

    try {
      montrerEquipesImprimables(container, m);

      // Écran : 32 quarts * 34px (largeur fixe, généreuse) + 190px de colonne mission.
      const tableEcran = container.querySelector<HTMLTableElement>('table.impression-table');
      expect(tableEcran?.style.width).toBe('1278px');

      const boutonImprimer = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.startsWith('Imprimer'));
      boutonImprimer?.click();

      // Papier : 32 quarts sur 8h, colonne mission 190px, page ~1050px : (1050-190)/32 =
      // 26.875px/quart, largeur totale = 190 + 32*26.875 = 1050px (tient sur une page).
      const tableImpression = zoneImpression.querySelector<HTMLTableElement>('table.impression-table');
      expect(tableImpression?.style.width).toBe('1050px');
    } finally {
      zoneImpression.remove();
    }
  });
});

describe('montrerEquipesImprimables avec un créneau trop court même pour le code d’indicatif seul (personne dessus)', () => {
  it('tronque avec une ellipse au plancher écran plutôt que de laisser le bloc sans texte', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
      missions: [{id: 1, Nom: 'Bar central', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      // Un seul quart d'heure, un code d'indicatif assez long pour que même le
      // code seul ne tienne pas au plancher — personne dessus, rien d'autre à montrer.
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 900}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 2, Taille_groupe: 2}],
      groupes: [{id: 1, Code: 'ZZZZZZZZZZZZZZZZ', Taille: 2, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [
        {id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 2, Groupe: 1, Rang: 2, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
      ],
    });
    const container = document.createElement('div');
    montrerEquipesImprimables(container, m);

    const bloc = container.querySelector('.impression-bloc--libre');
    const texte = bloc?.querySelector<HTMLElement>('.impression-bloc__texte');
    expect(texte).not.toBeNull();
    expect(texte?.textContent).not.toBe('');
    expect(texte?.textContent?.endsWith('…')).toBe(true);
    // Plancher écran (`TAILLES_POLICE_ECRAN_PX`, redécouplé du papier au sixième passage) :
    // 8px, jamais le plancher papier qui descend à 6px.
    expect(texte?.style.fontSize).toBe('8px');
  });
});

describe('montrerEquipesImprimables : priorité au nom du bénévole sur l’indicatif (retour Antoine 2026-09-24 14h11-14h14)', () => {
  it('affiche le nom même dans un créneau trop court pour "Nom (Code)", plutôt que de retomber sur le code seul', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Bar central', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      // Un seul quart d'heure, un code assez long pour que "Marie (ZZZ...)" ne tienne pas —
      // mais "Marie" seul tient au plancher écran : jamais retomber sur le code.
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 900}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'ZZZZZZZZZZZZZZZZ', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
    });
    const container = document.createElement('div');
    montrerEquipesImprimables(container, m);

    const bloc = container.querySelector('.impression-bloc--assignee');
    const texte = bloc?.querySelector<HTMLElement>('.impression-bloc__texte');
    expect(texte?.textContent).toBe('Marie');
    expect(texte?.textContent?.endsWith('…')).toBe(false);
    expect(texte?.classList.contains('impression-bloc__texte--enveloppe')).toBe(false);
  });

  it('enveloppe le nom sur plusieurs lignes (jamais tronqué ni remplacé par le code) quand même le nom seul ne tient pas sur une ligne', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bar', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {
          id: 1, Nom: 'Maximilienne-Christodoulopoulos', Contact: '', Equipe: 1, Competences: [],
          Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: '',
        },
      ],
      missions: [{id: 1, Nom: 'Bar central', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 900}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
    });
    const container = document.createElement('div');
    montrerEquipesImprimables(container, m);

    const bloc = container.querySelector('.impression-bloc--assignee');
    const texte = bloc?.querySelector<HTMLElement>('.impression-bloc__texte');
    // Jamais tronqué (pas d'ellipse), jamais le code nu : le nom, à envelopper.
    // Le nom SEUL (sans le code) : envelopper le candidat le plus court limite le
    // nombre de lignes nécessaires — vérifié sur un banc de stress (équipe chargée,
    // 12h) où envelopper "Nom (Code)" systématiquement faisait déborder le planning
    // d'une équipe sur une deuxième page. Antoine a déjà accepté que le code
    // disparaisse avant le nom (« quitte à ne pas afficher les indicatifs au pire »).
    expect(texte?.textContent).toBe('Maximilienne-Christodoulopoulos');
    expect(texte?.classList.contains('impression-bloc__texte--enveloppe')).toBe(true);
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
      // Assez large (4 quarts, et une journée courte de 4h) pour que « Marie (A1) » tienne
      // sans tomber sur le repli code-seul, qui n'est pas ce que ce test veut observer.
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
