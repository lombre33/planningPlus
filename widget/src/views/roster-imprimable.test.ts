/**
 * Vue « roster imprimable » (demande d'Antoine du 2026-09-23, point 1) sur
 * un document pauvre ou vide — même discipline que les autres vues
 * ([[vues-vides-audit]] en mémoire d'équipe) : une vue vide doit dire
 * pourquoi, jamais un écran muet.
 */
import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {CLE_TABLE_BENEVOLES} from '../logic/parametres-benevoles';
import {type EcritureGrist, Magasin} from '../store';
import {montrerRosterImprimable} from './roster-imprimable';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [], presences: [],
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
  definirPresence: async () => 1,
};

/** Attend un tour de micro-tâches : `nomsCompletsDepuisSource` est async,
 *  résolue avant un premier redessin déclenché par son `.then()`. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const DEBUT = 1_800_000_000;
const FIN = DEBUT + 4 * 3600; // 4h, soit 16 quarts

// jsdom ne déclenche l'événement « change » d'une case à cocher via `.click()`
// que si l'élément est attaché au document — les conteneurs de ces tests ne le
// sont jamais. On coche donc et on déclenche l'événement nous-mêmes.
function cocherCase(container: HTMLElement): void {
  const checkbox = container.querySelector<HTMLInputElement>('input[type=checkbox]');
  if (!checkbox) { throw new Error('case à cocher introuvable'); }
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change'));
}

describe('montrerRosterImprimable sans aucun macro-créneau', () => {
  it('explique l’absence de contenu plutôt que d’afficher un écran vide', () => {
    const m = new Magasin(modeleVide());
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);
    expect(container.textContent).toContain('Aucun macro-créneau');
  });
});

describe('montrerRosterImprimable sans aucun bénévole disponible', () => {
  it('dit pourquoi le roster est vide plutôt que de rendre un tableau vide', () => {
    const m = new Magasin({
      ...modeleVide(),
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
    });
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);
    expect(container.textContent).toContain('Aucun bénévole disponible ce jour-là');
  });
});

describe('montrerRosterImprimable avec un bénévole partiellement disponible et affecté', () => {
  it('affiche une ligne avec son indicatif du jour et le nom de sa mission dans le créneau affecté', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 3600}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
      // Disponible sur un seul quart d'heure (créneau réduit), pas toute la journée.
      disponibilites: [{Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null}],
    });
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);

    expect(container.textContent).toContain('Marie');
    expect(container.querySelector('.impression-table__indicatif')?.textContent).toBe('A1');
    expect(container.querySelector('.impression-table__equipe')?.textContent).toBe('Bénévoles');
    expect(container.textContent).toContain('Accueil');
    expect(container.querySelectorAll('tbody tr').length).toBe(1);
  });
});

describe(
  "montrerRosterImprimable, colonne « Équipe » (retour Antoine 2026-09-24)",
  () => {
    it("affiche l'équipe associée à l'indicatif tenu, pas forcément celle du bénévole lui-même", () => {
      const m = new Magasin({
        ...modeleVide(),
        equipes: [
          {id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''},
          {id: 2, Nom: 'Bar', Couleur: '#111', Referent: null, Notes: ''},
        ],
        benevoles: [
          {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
        ],
        missions: [{id: 1, Nom: 'Comptoir', Description: '', Lieu: 0, Equipe: 2, Priorite: 'Normale', Competences_requises: []}],
        macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
        sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 3600}],
        besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
        // L'indicatif A1 appartient à l'équipe Bar (2), Marie elle-même est de l'équipe Bénévoles (1).
        groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 2, Notes: ''}],
        positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
        places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
        disponibilites: [{Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null}],
      });
      const container = document.createElement('div');
      montrerRosterImprimable(container, m);

      expect(container.querySelector('.impression-table__equipe')?.textContent).toBe('Bar');
    });

    it("affiche un tiret sans planter quand le bénévole ne tient aucun indicatif ce jour-là", () => {
      const m = new Magasin({
        ...modeleVide(),
        equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
        benevoles: [
          {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
        ],
        macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
        disponibilites: [{Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null}],
      });
      const container = document.createElement('div');
      montrerRosterImprimable(container, m);

      expect(container.querySelector('.impression-table__indicatif')?.textContent).toBe('—');
      expect(container.querySelector('.impression-table__equipe')?.textContent).toBe('—');
    });
  },
);

describe('montrerRosterImprimable, noms complets (retour Antoine 2026-09-24)', () => {
  it(
    "affiche le nom complet lu dans la table externe d'Antoine (Id_source) une fois chargé, "
    + 'sans bloquer le premier rendu ni changer le tri alphabétique initial',
    async () => {
      const m = new Magasin(
        {
          ...modeleVide(),
          equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
          benevoles: [
            {
              id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0,
              Quota_heures_max: 99, Statut: 'Actif', Notes: '', Id_source: 42,
            },
          ],
          macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
          disponibilites: [{Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null}],
        },
        [{cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'}],
      );
      m.brancherEcriture({
        ...ecritureMuette,
        colonnesTable: async () => [{colId: 'Nom_prenom', label: 'Nom_prenom', type: 'Text'}],
        valeursColonneBrute: async () => new Map([[42, 'Marie Dupont']]),
      });
      const container = document.createElement('div');
      montrerRosterImprimable(container, m);

      expect(container.textContent).toContain('Marie');
      expect(container.textContent).not.toContain('Marie Dupont');

      await tick();

      expect(container.textContent).toContain('Marie Dupont');
    },
  );
});

describe('montrerRosterImprimable avec un créneau trop court pour le nom complet', () => {
  it('tronque avec une ellipse plutôt que de laisser le bloc bleu sans aucun texte (retour Antoine 2026-09-24)', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Comptage entrée Village partenaire', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      // Un seul quart d'heure de mission : bien plus court qu'il n'en faut pour le nom complet.
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 900}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
      disponibilites: [{Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null}],
    });
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);

    const bloc = container.querySelector('.impression-bloc--assignee');
    expect(bloc).not.toBeNull();
    expect(bloc?.getAttribute('title')).toBe('Comptage entrée Village partenaire');
    // Jamais vide : au moins un fragment du nom, terminé par une ellipse.
    expect(bloc?.textContent).not.toBe('');
    expect(bloc?.textContent).not.toBe('Comptage entrée Village partenaire');
    expect(bloc?.textContent?.endsWith('…')).toBe(true);
  });
});

describe('montrerRosterImprimable avec un bénévole pouvant aller voir son artiste', () => {
  it('colore en violet les quarts libres du passage, avec le nom de l’artiste', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      artistes: [{id: 1, Nom: 'Grand Concert', Lieu: 0, Debut: DEBUT, Fin: DEBUT + 3600}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      // Une vraie disponibilité (sinon absente du roster, logic/derive.ts benevolesDisponiblesCeJour)
      // et, séparément, le souhait de voir l'artiste. Aucune mission : Marie est libre tout le
      // passage de l'artiste (1h >= 30 min).
      disponibilites: [
        {Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null},
        {Benevole: 1, Quart_heure: DEBUT + 900, Statut: 'Artiste', Artiste: 1},
      ],
    });
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);

    const bloc = container.querySelector('.impression-bloc--artiste');
    expect(bloc).not.toBeNull();
    expect(bloc?.getAttribute('title')).toBe('Grand Concert');
    expect(container.querySelector('.impression-bloc--assignee')).toBeNull();
  });
});

describe('montrerRosterImprimable avec une affectation qui empêche de voir un artiste souhaité', () => {
  it('colore en rouge les créneaux affectés concernés, avec le nom de l’artiste dans le titre (retour Antoine 2026-09-24)', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      artistes: [{id: 1, Nom: 'Grand Concert', Lieu: 0, Debut: DEBUT, Fin: DEBUT + 900 * 4}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      // Le passage de l'artiste dure 4 quarts (1h) : affecter 3 de ces 4 quarts ne
      // laisse que 15 min libres, sous le seuil de 30 min.
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 900 * 3}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
      // Vraie disponibilité sur les 3 quarts affectés (jamais le même quart que le souhait
      // d'artiste, sinon `logic/derive.ts` indexerDisponibilites n'en garde qu'un des deux) :
      // isole le motif « artiste » du motif « hors disponibilité », testé séparément plus bas.
      disponibilites: [
        {Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null},
        {Benevole: 1, Quart_heure: DEBUT + 900, Statut: 'Disponible', Artiste: null},
        {Benevole: 1, Quart_heure: DEBUT + 1800, Statut: 'Disponible', Artiste: null},
        {Benevole: 1, Quart_heure: DEBUT + 2700, Statut: 'Artiste', Artiste: 1},
      ],
    });
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);

    // Décochée par défaut (retour Antoine 2026-09-24) : aucun rouge tant qu'on ne l'active pas.
    expect(container.querySelector('.impression-bloc--conflit')).toBeNull();
    cocherCase(container);

    const bloc = container.querySelector('.impression-bloc--conflit');
    expect(bloc).not.toBeNull();
    expect(bloc?.getAttribute('title')).toBe("Accueil — l'empêche de voir Grand Concert");
    expect(container.querySelector('.impression-bloc--assignee')).toBeNull();
  });
});

describe('montrerRosterImprimable avec une affectation qui dépasse la disponibilité réelle du bénévole', () => {
  it('colore en rouge uniquement le quart hors disponibilité, garde le reste du même bloc en bleu (retour Antoine 2026-09-24)', () => {
    const m = new Magasin({
      ...modeleVide(),
      equipes: [{id: 1, Nom: 'Bénévoles', Couleur: '#000', Referent: null, Notes: ''}],
      benevoles: [
        {id: 1, Nom: 'Marie', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99, Statut: 'Actif', Notes: ''},
      ],
      missions: [{id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
      macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: DEBUT, Fin: FIN}],
      // Affectée sur 2 quarts contigus, mais seul le premier est une vraie disponibilité déclarée.
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Bloc', Debut: DEBUT, Fin: DEBUT + 1800}],
      besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
      groupes: [{id: 1, Code: 'A1', Taille: 1, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
      places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}],
      disponibilites: [{Benevole: 1, Quart_heure: DEBUT, Statut: 'Disponible', Artiste: null}],
    });
    const container = document.createElement('div');
    montrerRosterImprimable(container, m);

    // Décochée par défaut (retour Antoine 2026-09-24) : aucun rouge tant qu'on ne l'active pas.
    expect(container.querySelector('.impression-bloc--conflit')).toBeNull();
    cocherCase(container);

    const blocConflit = container.querySelector('.impression-bloc--conflit');
    expect(blocConflit).not.toBeNull();
    expect(blocConflit?.getAttribute('title')).toBe('Accueil — hors de sa disponibilité déclarée');
    // Le premier quart, réellement disponible, reste un bloc « assignee » distinct — jamais fusionné.
    expect(container.querySelector('.impression-bloc--assignee')).not.toBeNull();
  });
});
