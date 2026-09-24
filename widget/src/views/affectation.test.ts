/**
 * Points 4 et 5 de la mega-demande d'Antoine du 22h01 (2026-09-23), corrigés
 * après relecture du coordinateur : le premier jet ciblait les mauvaises
 * contraintes (dures plutôt que molles) pour le point 4, et un périmètre
 * "tous jours confondus" au lieu du jour affiché pour le point 5. Ce test
 * fige le comportement corrigé pour éviter de reproduire la même erreur.
 *
 * Modèle : un seul jour (deux quarts), Alix libre partout mais en conflit
 * "voir un artiste" sur le quart cible, Bao dans le même conflit MAIS déjà
 * affectée ce jour-là sur une autre place (verrouillée) — Bao ne doit donc
 * pas apparaître comme candidate bloquée pour la place cible, même si elle
 * porte la même étiquette molle qu'Alix.
 */
import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {TYPE_BENEVOLE_DRAG} from '../logic/dnd-types';
import {type EcritureGrist, Magasin} from '../store';
import {epochDepuisHeureLocale} from '../temps';
import {montrerAffectation} from './affectation';

/** Attend un tour de micro-tâches (le dépôt manuel passe par `assignerPlace`,
 *  une fonction async, avant de redessiner). */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function simulerDepotBenevole(roster: Element, slot: Element, benevoleId: number): void {
  const data = new Map<string, string>();
  const dataTransfer = {
    setData: (t: string, v: string) => data.set(t, v),
    getData: (t: string) => data.get(t) ?? '',
    get types() { return [...data.keys()]; },
  };
  const dragStart = new Event('dragstart', {bubbles: true, cancelable: true});
  Object.assign(dragStart, {dataTransfer});
  roster.dispatchEvent(dragStart);
  data.set(TYPE_BENEVOLE_DRAG, String(benevoleId));

  const dragOver = new Event('dragover', {bubbles: true, cancelable: true});
  Object.assign(dragOver, {dataTransfer});
  slot.dispatchEvent(dragOver);

  const drop = new Event('drop', {bubbles: true, cancelable: true});
  Object.assign(drop, {dataTransfer});
  slot.dispatchEvent(drop);
}

function construireModele(): Modele {
  return {
    equipes: [{id: 1, Nom: 'Bar', Couleur: '#c00', Referent: null, Notes: ''}],
    lieux: [],
    benevoles: [
      {id: 1, Nom: 'Alix', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      {id: 2, Nom: 'Bao', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
    ],
    missions: [
      {id: 1, Nom: 'Scène', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Critique', Competences_requises: []},
      {id: 2, Nom: 'Bar', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
    ],
    artistes: [{id: 1, Nom: 'DJ X', Lieu: 0, Debut: 0, Fin: 900}],
    macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 1800}],
    sousCreneaux: [
      {id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Cible', Debut: 0, Fin: 900},
      {id: 2, Macro_creneau: 1, Mission: null, Libelle: 'Autre', Debut: 900, Fin: 1800},
    ],
    besoins: [
      {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      {id: 2, Mission: 2, Sous_creneau: 2, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
    ],
    groupes: [
      {id: 1, Code: 'CIBLE', Taille: 1, Equipe: 1, Notes: ''},
      {id: 2, Code: 'AUTRE', Taille: 1, Equipe: 1, Notes: ''},
    ],
    positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}, {id: 2, Groupe: 2, Besoin: 2}],
    places: [
      {id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0},
      {id: 2, Groupe: 2, Rang: 1, Benevole: 2, Origine: 'Algorithme', Verrouillee: true, Score: 0},
    ],
    disponibilites: [
      {Benevole: 1, Quart_heure: 0, Statut: 'Artiste', Artiste: 1},
      // Alix a aussi une vraie disponibilité ce jour-là (quart 900, hors de
      // la place ciblée par le test) : sans ça, le correctif du 2026-09-24
      // (benevolesDisponiblesCeJour, un souhait « voir un artiste » n'est
      // pas une vraie disponibilité) la ferait disparaître du roster, ce qui
      // n'est pas ce que ce fichier teste ici.
      {Benevole: 1, Quart_heure: 900, Statut: 'Disponible', Artiste: null},
      {Benevole: 2, Quart_heure: 0, Statut: 'Artiste', Artiste: 1},
      {Benevole: 2, Quart_heure: 900, Statut: 'Disponible', Artiste: null},
    ],
    souhaitsMissions: [],
    affinites: [], presences: [],
  };
}

function construireModeleUnBesoin(): Modele {
  return {
    equipes: [{id: 1, Nom: 'Bar', Couleur: '#c00', Referent: null, Notes: ''}],
    lieux: [],
    benevoles: [
      {id: 1, Nom: 'Alix', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
    ],
    missions: [{id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
    artistes: [],
    macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 900}],
    sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Cible', Debut: 0, Fin: 900}],
    besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1}],
    groupes: [{id: 1, Code: 'ACC1', Taille: 1, Equipe: 1, Notes: ''}],
    positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}],
    places: [{id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0}],
    disponibilites: [{Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null}],
    souhaitsMissions: [],
    affinites: [], presences: [],
  };
}

function construireModeleDeuxJours(): Modele {
  const jour1Debut = epochDepuisHeureLocale({annee: 2026, mois: 9, jour: 26, heures: 10, minutes: 0});
  const jour2Debut = epochDepuisHeureLocale({annee: 2026, mois: 9, jour: 27, heures: 10, minutes: 0});
  return {
    equipes: [{id: 1, Nom: 'Bar', Couleur: '#c00', Referent: null, Notes: ''}],
    lieux: [],
    benevoles: [
      {id: 1, Nom: 'Alix', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
    ],
    missions: [
      {id: 1, Nom: 'Jour1', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Critique', Competences_requises: []},
      {id: 2, Nom: 'Jour2', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Critique', Competences_requises: []},
    ],
    artistes: [],
    macroCreneaux: [
      {id: 1, Nom: 'Jour 1', Debut: jour1Debut, Fin: jour1Debut + 3600},
      {id: 2, Nom: 'Jour 2', Debut: jour2Debut, Fin: jour2Debut + 3600},
    ],
    sousCreneaux: [
      {id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Cible1', Debut: jour1Debut, Fin: jour1Debut + 900},
      {id: 2, Macro_creneau: 2, Mission: null, Libelle: 'Cible2', Debut: jour2Debut, Fin: jour2Debut + 900},
    ],
    besoins: [
      {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      {id: 2, Mission: 2, Sous_creneau: 2, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
    ],
    groupes: [
      {id: 1, Code: 'J1', Taille: 1, Equipe: 1, Notes: ''},
      {id: 2, Code: 'J2', Taille: 1, Equipe: 1, Notes: ''},
    ],
    positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}, {id: 2, Groupe: 2, Besoin: 2}],
    places: [
      {id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0},
      {id: 2, Groupe: 2, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0},
    ],
    disponibilites: [
      {Benevole: 1, Quart_heure: jour1Debut, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: jour2Debut, Statut: 'Disponible', Artiste: null},
    ],
    souhaitsMissions: [],
    affinites: [], presences: [],
  };
}

function construireModeleTroisIndicatifs(): Modele {
  return {
    equipes: [{id: 1, Nom: 'Bar', Couleur: '#c00', Referent: null, Notes: ''}],
    lieux: [],
    benevoles: [
      {id: 1, Nom: 'Alix', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      {id: 2, Nom: 'Bao', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
    ],
    missions: [
      {id: 1, Nom: 'Accueil', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
      {id: 2, Nom: 'Bar', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
      {id: 3, Nom: 'Entrée', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
    ],
    artistes: [],
    macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 900}],
    sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: 'Cible', Debut: 0, Fin: 900}],
    besoins: [
      {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      {id: 2, Mission: 2, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      {id: 3, Mission: 3, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
    ],
    groupes: [
      {id: 1, Code: 'ACC1', Taille: 1, Equipe: 1, Notes: ''},
      {id: 2, Code: 'BAR1', Taille: 1, Equipe: 1, Notes: ''},
      {id: 3, Code: 'ENT1', Taille: 1, Equipe: 1, Notes: ''},
    ],
    positionsGroupe: [{id: 1, Groupe: 1, Besoin: 1}, {id: 2, Groupe: 2, Besoin: 2}, {id: 3, Groupe: 3, Besoin: 3}],
    places: [
      {id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Manuel', Verrouillee: false, Score: 0}, // Alix sur ACC1
      {id: 2, Groupe: 2, Rang: 1, Benevole: 2, Origine: 'Manuel', Verrouillee: false, Score: 0}, // Bao sur BAR1 (complet)
      {id: 3, Groupe: 3, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0}, // ENT1 ouvert
    ],
    disponibilites: [
      {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 2, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
    ],
    souhaitsMissions: [],
    affinites: [], presences: [],
  };
}

describe('montrerAffectation — colonne indicatif du roster (2026-09-24 5h02, en plus du point 4)', () => {
  function selectAlix(container: HTMLElement): HTMLSelectElement {
    const carte = Array.from(container.querySelectorAll('.roster-card')).find((c) => c.textContent?.includes('Alix'))!;
    return carte.querySelector('select') as HTMLSelectElement;
  }

  it('liste Aucun puis les indicatifs du jour par ordre alphabétique, indicatif courant présélectionné', () => {
    const m = new Magasin(construireModeleTroisIndicatifs());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const select = selectAlix(container);
    const options = Array.from(select.options).map((o) => o.textContent);
    // Juste le code, jamais la mission (régression visuelle du 2026-09-24 :
    // un indicatif tourne d'une mission à l'autre au fil de la soirée).
    expect(options).toEqual(['Aucun', 'ACC1', 'BAR1', 'ENT1']);
    expect(select.value).toBe('1'); // ACC1, l'indicatif actuel d'Alix
  });

  it('« Aucun » désaffecte et déverrouille (même comportement que le bouton Désaffecter)', async () => {
    const m = new Magasin(construireModeleTroisIndicatifs());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const select = selectAlix(container);
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await tick();

    const placeAcc1 = m.places.find((p) => p.id === 1);
    expect(placeAcc1?.Benevole).toBeNull();
    expect(placeAcc1?.Verrouillee).toBe(false);
  });

  it('un indicatif complet refuse avec un message clair, sans évincer son occupant', async () => {
    const m = new Magasin(construireModeleTroisIndicatifs());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const select = selectAlix(container);
    select.value = '2'; // BAR1, déjà pris par Bao
    select.dispatchEvent(new Event('change'));
    await tick();

    expect(container.textContent).toContain('Indicatif complet');
    expect(m.places.find((p) => p.id === 1)?.Benevole).toBe(1); // Alix toujours sur ACC1
    expect(m.places.find((p) => p.id === 2)?.Benevole).toBe(2); // Bao pas évincée
  });

  it('un indicatif ouvert réaffecte : libère et déverrouille l\'ancienne place, occupe la nouvelle', async () => {
    const m = new Magasin(construireModeleTroisIndicatifs());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const select = selectAlix(container);
    select.value = '3'; // ENT1, ouvert
    select.dispatchEvent(new Event('change'));
    await tick();

    const placeAcc1 = m.places.find((p) => p.id === 1);
    const placeEnt1 = m.places.find((p) => p.id === 3);
    expect(placeAcc1?.Benevole).toBeNull();
    expect(placeAcc1?.Verrouillee).toBe(false);
    expect(placeEnt1?.Benevole).toBe(1);
  });

  it(
    "un indicatif dont la place vide est verrouillée (déjà vidée à la main plus tôt) reste choisissable, " +
    "pas « complet » (bug bloquant confirmé le 2026-09-24 6h42 sur une vraie instance : la recherche de " +
    "placeCible excluait aussi les places vides verrouillées, donc le geste s'arrêtait sans même tenter " +
    "d'écrire, sans message compréhensible)",
    async () => {
      const modele = construireModeleTroisIndicatifs();
      modele.places = modele.places.map((p) => (p.id === 3 ? {...p, Verrouillee: true} : p));
      const m = new Magasin(modele);
      const container = document.createElement('div');
      montrerAffectation(container, m);

      const select = selectAlix(container);
      select.value = '3'; // ENT1, vide mais verrouillée
      select.dispatchEvent(new Event('change'));
      await tick();

      expect(container.textContent).not.toContain('Indicatif complet');
      const placeAcc1 = m.places.find((p) => p.id === 1);
      const placeEnt1 = m.places.find((p) => p.id === 3);
      expect(placeAcc1?.Benevole).toBeNull();
      expect(placeEnt1?.Benevole).toBe(1);
      expect(placeEnt1?.Verrouillee).toBe(true); // reste verrouillée (origine Manuel)
    },
  );

  it(
    'une exception inattendue pendant le geste affiche un message clair plutôt que de se terminer en ' +
    "silence (filet ajouté le 2026-09-24 6h56 : Antoine toujours bloqué après deux correctifs, aucune " +
    "branche connue ne suffisait à expliquer ce qu'il voyait)",
    async () => {
      const m = new Magasin(construireModeleTroisIndicatifs());
      const echec = 'panne réseau simulée'; // valeur non-Error, pour couvrir le repli String(erreur)
      m.assignerPlace = () => { throw echec; };
      const container = document.createElement('div');
      montrerAffectation(container, m);

      const select = selectAlix(container);
      select.value = '3'; // ENT1, ouvert
      select.dispatchEvent(new Event('change'));
      await tick();

      expect(container.textContent).toContain('Erreur inattendue');
      expect(container.textContent).toContain(echec);
      // La carte doit rester interactive (pas de rendu figé) : un
      // rafraîchissement a bien eu lieu malgré l'exception.
      expect(container.querySelector('.roster-card__indicatif')).not.toBeNull();
    },
  );

  it(
    "si l'écriture Grist de la nouvelle place échoue, l'ancienne reste intacte plutôt que de finir sur Aucun " +
    '(bug bloquant signalé par Antoine le 2026-09-24 5h52 : « je change l\'indicatif, ça remet à Aucun, ça ne ' +
    "prend pas en compte » — l'ancienne place était libérée AVANT que la nouvelle ne soit confirmée)",
    async () => {
      const m = new Magasin(construireModeleTroisIndicatifs());
      let echecEcriture = true;
      const ecriture: EcritureGrist = {
        creerEquipe: async () => 1, creerMission: async () => 1, creerMacroCreneau: async () => 1,
        modifierMacroCreneau: async () => {}, supprimerMacroCreneau: async () => {}, creerArtiste: async () => 1,
        modifierArtiste: async () => {}, remplacerSousCreneaux: async () => [], modifierSousCreneaux: async () => {},
        repointerBesoins: async () => {}, creerBesoin: async () => 1, creerGroupe: async () => 1,
        positionnerGroupe: async () => {}, definirPlaces: async () => {}, deplacerPosition: async () => {},
        ajouterPosition: async () => 1,
        modifierPlaces: async () => { if (echecEcriture) { throw new Error('document indisponible'); } },
        supprimerPosition: async () => {}, definirAbsence: async () => {}, valeursColonneBrute: async () => new Map(),
        colonnesTable: async () => [], tablesDocument: async () => [], definirParametre: async () => {},
        remplacerDisponibilites: async () => {}, peuplerBenevoles: async () => ({benevoles: [], crees: 0, actualises: 0}),
        creerAffinites: async () => [],
        definirPresence: async () => 1,
      };
      m.brancherEcriture(ecriture);
      const container = document.createElement('div');
      montrerAffectation(container, m);

      const select = selectAlix(container);
      select.value = '3'; // ENT1, ouvert
      select.dispatchEvent(new Event('change'));
      await tick();
      await tick();

      const placeAcc1 = m.places.find((p) => p.id === 1);
      const placeEnt1 = m.places.find((p) => p.id === 3);
      expect(placeAcc1?.Benevole).toBe(1); // Alix reste sur ACC1, jamais sans indicatif
      expect(placeEnt1?.Benevole).toBeNull();
      expect(container.textContent).toContain("Échec de l'écriture dans le document Grist connecté");

      echecEcriture = false;
    },
  );
});

describe('montrerAffectation — point 4 de la nuit (2026-09-24, 4h34) : voir/désaffecter depuis le roster', () => {
  it("ne montre plus de bandeau au clic sur une carte affectée (retiré le 2026-09-24 5h28, redondant et trompeur — voir la colonne indicatif)", async () => {
    const modele = construireModeleUnBesoin();
    modele.places = [{...modele.places[0]!, Benevole: 1, Origine: 'Manuel'}];
    const m = new Magasin(modele);
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const roster = container.querySelector('.roster-card') as HTMLElement;
    roster.click();
    await tick();

    expect(container.textContent).not.toContain('Affecté(e)');
    expect(container.querySelector('.roster-card__detail')).toBeNull();
  });

  it('désaffecte et déverrouille via « Aucun » dans le menu déroulant (le bandeau ne le fait plus)', async () => {
    const modele = construireModeleUnBesoin();
    modele.places = [{...modele.places[0]!, Benevole: 1, Origine: 'Manuel'}];
    const m = new Magasin(modele);
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const select = container.querySelector('.roster-card__indicatif') as HTMLSelectElement;
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await tick();

    const place = m.places.find((p) => p.id === 1);
    expect(place?.Benevole).toBeNull();
    // Contrairement au « vider » du tableau, la place ne doit pas rester
    // verrouillée-vide : sinon ni un glisser-déposer ni l'algorithme ne
    // pourraient plus jamais la reprendre (piège signalé par le coordinateur).
    expect(place?.Verrouillee).toBe(false);
  });

  it("affiche « non affecté(e) » pour un bénévole libre aujourd'hui, sans bouton Désaffecter", async () => {
    const m = new Magasin(construireModeleUnBesoin());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const roster = container.querySelector('.roster-card') as HTMLElement;
    roster.click();
    await tick();

    expect(container.textContent).toContain("Non affecté(e) aujourd'hui");
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Désaffecter')).toBe(false);
  });
});

describe('montrerAffectation — point 1 de la nuit (2026-09-24 4h24) : pourquoi un bénévole non affecté ne l\'est pas', () => {
  it("dit qu'aucun indicatif n'est encore ouvert quand toutes les places du jour sont déjà pourvues ou verrouillées", async () => {
    const modele = construireModeleUnBesoin();
    modele.benevoles.push({
      id: 2, Nom: 'Bao', Contact: '', Equipe: 1, Competences: [],
      Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
    });
    modele.disponibilites.push({Benevole: 2, Quart_heure: 0, Statut: 'Disponible', Artiste: null});
    modele.places = [{...modele.places[0]!, Benevole: 1, Verrouillee: true, Origine: 'Manuel'}];
    const m = new Magasin(modele);
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const cartes = Array.from(container.querySelectorAll('.roster-card'));
    const carteBao = cartes.find((c) => c.textContent?.includes('Bao')) as HTMLElement;
    carteBao.click();
    await tick();

    expect(container.textContent).toContain('aucun indicatif encore ouvert');
  });

  it("nomme la compétence manquante quand c'est la seule raison qui bloque le bénévole sur les indicatifs encore ouverts", async () => {
    const modele = construireModeleUnBesoin();
    modele.missions[0]!.Competences_requises = ['Premiers secours'];
    const m = new Magasin(modele);
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const roster = container.querySelector('.roster-card') as HTMLElement;
    roster.click();
    await tick();

    expect(container.textContent).toContain('compétence manquante');
  });
});

describe("montrerAffectation — l'algorithme ne recalcule que le jour affiché (2026-09-24, confirmé par Antoine)", () => {
  it("remplit la place vide du jour affiché mais laisse intacte une place Manuelle non verrouillée d'un autre jour", async () => {
    const m = new Magasin(construireModeleDeuxJours());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const bouton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Lancer l'algorithme") as HTMLButtonElement;
    bouton.click();
    await tick();

    const placeJour1 = m.places.find((p) => p.id === 1)!;
    const placeJour2 = m.places.find((p) => p.id === 2)!;
    expect(placeJour1.Benevole).toBe(1);
    expect(placeJour1.Origine).toBe('Algorithme');
    // La place du jour 2 n'est jamais entrée dans le périmètre du calcul :
    // même bénévole, mais son origine « Manuel » n'a pas dû être écrasée.
    expect(placeJour2.Benevole).toBe(1);
    expect(placeJour2.Origine).toBe('Manuel');
    expect(placeJour2.Verrouillee).toBe(false);
  });
});

describe("montrerAffectation — le dépôt qui couvre entièrement un besoin ne le fait pas disparaître (2026-09-24)", () => {
  it("garde la carte du besoin et la place remplie visibles juste après le dépôt, au lieu de basculer sur « rien à traiter »", async () => {
    const m = new Magasin(construireModeleUnBesoin());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const roster = container.querySelector('.roster-card')!;
    const slot = container.querySelector('.place-slot--vide')!;
    simulerDepotBenevole(roster, slot, 1);
    await tick();

    expect(container.textContent).not.toContain('Rien à traiter ce jour');
    const slotApres = container.querySelector('.place-slot');
    expect(slotApres?.classList.contains('place-slot--occupee')).toBe(true);
    expect(slotApres?.textContent).toContain('Alix');
  });
});

describe('montrerAffectation — point 4 (candidats bloqués sur place prioritaire)', () => {
  it("propose Alix (non affectée ce jour, contrainte molle « voir un artiste »), pas Bao (déjà affectée ce jour ailleurs)", () => {
    const m = new Magasin(construireModele());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    const candidats = Array.from(container.querySelectorAll('.candidat__nom')).map((n) => n.textContent);
    expect(candidats).toContain('Alix');
    expect(candidats).not.toContain('Bao');
    expect(container.textContent).toContain('veut voir un artiste sur ce créneau');
  });
});

describe('montrerAffectation — point 5 (filtre roster « non affectés seulement »)', () => {
  it('masque Bao (déjà affectée ce jour) une fois la case cochée, garde Alix', () => {
    const m = new Magasin(construireModele());
    const container = document.createElement('div');
    montrerAffectation(container, m);

    expect(Array.from(container.querySelectorAll('.roster-card__nom')).map((n) => n.textContent)).toEqual(['Alix', 'Bao']);

    const checkbox = Array.from(container.querySelectorAll('input[type=checkbox]'))
      .find((i) => i.parentElement?.textContent?.includes('Non affectés seulement')) as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(Array.from(container.querySelectorAll('.roster-card__nom')).map((n) => n.textContent)).toEqual(['Alix']);
  });
});
