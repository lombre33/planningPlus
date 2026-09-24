/**
 * Vue Disponibilités : garde-fou de non-régression sur le comportement
 * d'origine (filtre équipe, recherche, légende, états vides, infobulle,
 * résumé) en plus des nouveaux usages ajoutés le 2026-09-23 (panneau de
 * réglages d'import avec menu déroulant sur les colonnes réelles, repli en
 * champ texte, mode édition au clic, choix d'un artiste précis). Les
 * onglets de jour propres à cette vue ont été retirés le même jour au
 * profit du filtre global par macro-créneau (`m.macroCreneauSelectionne`,
 * monté par `app.ts` au-dessus de la vue) — voir le test dédié.
 */
import {beforeEach, describe, expect, it} from 'vitest';
import type {EcritureGrist} from '../store';
import {CLE_TABLE_BENEVOLES, type ColonneTable} from '../logic/parametres-benevoles';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {epochDepuisHeureLocale} from '../temps';
import {montrerDisponibilites} from './disponibilites';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [], presences: [],
  };
}

const VENDREDI = {annee: 2026, mois: 7, jour: 17};

function modeleDeTest(): Modele {
  const debut = epochDepuisHeureLocale({...VENDREDI, heures: 10});
  const fin = epochDepuisHeureLocale({...VENDREDI, heures: 10, minutes: 30});
  return {
    ...modeleVide(),
    equipes: [{id: 1, Nom: 'Bar', Couleur: '#2E7D32', Referent: null, Notes: ''}],
    benevoles: [
      {id: 1, Nom: 'Alice', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      {id: 2, Nom: 'Bob', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
    ],
    // Ne joue que sur le premier quart d'heure du macro-créneau de test (10h00–10h15),
    // pas sur le second (10h15–10h30) : sert à distinguer un quart avec/sans artiste.
    artistes: [{id: 1, Nom: 'Marée Haute', Lieu: 1, Debut: debut, Fin: debut + 900}],
    macroCreneaux: [{id: 1, Nom: 'Vendredi matin', Debut: debut, Fin: fin}],
    // Alice ET Bob disponibles ce jour-là : la vue ne montre plus, depuis le
    // 2026-09-24, que les bénévoles ayant une vraie disponibilité le jour
    // affiché (hors mode édition) — sans ça, la plupart des tests de ce
    // fichier devraient chacun fournir leur propre disponibilité pour rien.
    disponibilites: [
      {Benevole: 1, Quart_heure: debut, Statut: 'Disponible', Artiste: null},
      {Benevole: 2, Quart_heure: debut, Statut: 'Disponible', Artiste: null},
    ],
  };
}

function attendreMicrotaches(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const ecritureMuette: EcritureGrist = {
  creerEquipe: async () => 1,
  creerMission: async () => 1,
  creerMacroCreneau: async () => 1,
  modifierMacroCreneau: async () => {},
  supprimerMacroCreneau: async () => {},
  creerArtiste: async () => 1,
  modifierArtiste: async () => {},
  remplacerSousCreneaux: async () => [],
  modifierSousCreneaux: async () => {},
  repointerBesoins: async () => {},
  creerBesoin: async () => 1,
  creerGroupe: async () => 1,
  positionnerGroupe: async () => {},
  definirPlaces: async () => {},
  deplacerPosition: async () => {},
  ajouterPosition: async () => 1,
  modifierPlaces: async () => {},
  supprimerPosition: async () => {},
  definirAbsence: async () => {},
  valeursColonneBrute: async () => new Map(),
  colonnesTable: async () => [],
  tablesDocument: async () => [],
  definirParametre: async () => {},
  remplacerDisponibilites: async () => {},
  peuplerBenevoles: async () => ({benevoles: [], crees: 0, actualises: 0}),
  creerAffinites: async () => [],
  definirPresence: async () => 1,
};

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  return () => container.remove();
});

describe('comportement d’origine (consultation), inchangé', () => {
  it('document neuf sans macro-créneau : ne lève pas, affiche l’état vide dédié', () => {
    const m = new Magasin(modeleVide());
    expect(() => montrerDisponibilites(container, m)).not.toThrow();
    expect(container.textContent).toContain('Aucun macro-créneau');
  });

  it("ne plante pas quand un bénévole porte une référence d'équipe orpheline (même défaut qu'Affectation, Jour J, Missions et Indicatifs, corrigé le 2026-09-24) : pastille neutre plutôt qu'une exception", () => {
    const modele = modeleDeTest();
    modele.benevoles[0]!.Equipe = 99; // Alice — aucune équipe 99 dans ce modèle
    const m = new Magasin(modele);
    expect(() => montrerDisponibilites(container, m)).not.toThrow();
    expect(container.textContent).toContain('Alice');
    expect(container.querySelector('.dot')).toHaveProperty('style.background', 'var(--text-faint)');
  });

  it("sans sélection globale, affiche le premier jour (retombe sur `m.macroCreneauSelectionne` nul)", () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    expect(container.querySelector('.dispos-table')).not.toBeNull();
    expect(container.textContent).toContain('Alice');
  });

  it('se scope au jour du macro-créneau sélectionné globalement (`m.selectionnerMacroCreneau`), pas ses propres onglets', () => {
    const debutSamedi = epochDepuisHeureLocale({...VENDREDI, jour: VENDREDI.jour + 1, heures: 10});
    const modele = modeleDeTest();
    modele.macroCreneaux.push({id: 2, Nom: 'Samedi matin', Debut: debutSamedi, Fin: debutSamedi + 1800});
    modele.disponibilites.push({Benevole: 1, Quart_heure: debutSamedi, Statut: 'Disponible', Artiste: null});
    const m = new Magasin(modele);
    m.selectionnerMacroCreneau(2);
    montrerDisponibilites(container, m);

    // Aucun onglet de jour propre à cette vue : le filtre est désormais
    // global (bandeau monté par `app.ts`, hors de ce conteneur).
    expect(container.querySelector('.dispos-jour-tab')).toBeNull();
    // La grille affiche le créneau du samedi (sélectionné), pas celui du
    // vendredi par défaut.
    expect(container.querySelector('th[title="Samedi matin"]')).not.toBeNull();
  });

  it("change de jour affiché quand `m.selectionnerMacroCreneau` change en cours de vie de la vue (bandeau global, changement d'onglet)", () => {
    const debutSamedi = epochDepuisHeureLocale({...VENDREDI, jour: VENDREDI.jour + 1, heures: 10});
    const modele = modeleDeTest();
    modele.macroCreneaux.push({id: 2, Nom: 'Samedi matin', Debut: debutSamedi, Fin: debutSamedi + 1800});
    modele.disponibilites.push({Benevole: 1, Quart_heure: debutSamedi, Statut: 'Disponible', Artiste: null});
    const m = new Magasin(modele);
    montrerDisponibilites(container, m);
    expect(container.querySelector('th[title="Vendredi matin"]')).not.toBeNull();

    // Simule le bandeau global (app.ts) changeant la sélection pendant que
    // la vue est montée — pas un remontage, le même mécanisme qu'un retour
    // sur cet onglet après être passé par Missions ou Artistes : la
    // sélection vit dans le magasin, pas dans l'état local de la vue.
    m.selectionnerMacroCreneau(2);
    expect(container.querySelector('th[title="Samedi matin"]')).not.toBeNull();
    expect(container.querySelector('th[title="Vendredi matin"]')).toBeNull();
  });

  it('macro-créneau sélectionné sans aucune disponibilité déclarée : la grille reste utilisable (tout indisponible), pas de plantage', () => {
    const debutSamedi = epochDepuisHeureLocale({...VENDREDI, jour: VENDREDI.jour + 1, heures: 10});
    const modele = modeleDeTest();
    modele.macroCreneaux.push({id: 2, Nom: 'Samedi matin', Debut: debutSamedi, Fin: debutSamedi + 1800});
    const m = new Magasin(modele);
    m.selectionnerMacroCreneau(2); // aucune ligne dans `disponibilites` pour ce macro-créneau
    expect(() => montrerDisponibilites(container, m)).not.toThrow();
    expect(container.querySelectorAll('.dispos-cellule--indisponible').length).toBeGreaterThan(0);
  });

  it('le filtre équipe restreint les lignes affichées', () => {
    const modele = modeleDeTest();
    modele.equipes.push({id: 2, Nom: 'Sécurité', Couleur: '#333', Referent: null, Notes: ''});
    modele.benevoles.push({
      id: 3, Nom: 'Chloé', Contact: '', Equipe: 2, Competences: [],
      Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
    });
    modele.disponibilites.push({
      Benevole: 3, Quart_heure: epochDepuisHeureLocale({...VENDREDI, heures: 10}), Statut: 'Disponible', Artiste: null,
    });
    const m = new Magasin(modele);
    montrerDisponibilites(container, m);
    expect(container.querySelectorAll('.dispos-table__benevole')).toHaveLength(3);

    const select = container.querySelector('select[aria-label="Filtrer par équipe"]') as HTMLSelectElement;
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    const lignes = container.querySelectorAll('.dispos-table__benevole');
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.textContent).toContain('Chloé');
  });

  it('la recherche filtre par nom, insensible à la casse', () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    const recherche = container.querySelector('input[type="search"]') as HTMLInputElement;
    recherche.value = 'bob';
    recherche.dispatchEvent(new Event('input'));
    const lignes = container.querySelectorAll('.dispos-table__benevole');
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.textContent).toContain('Bob');
  });

  it('recherche sans correspondance : état vide dédié', () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    const recherche = container.querySelector('input[type="search"]') as HTMLInputElement;
    recherche.value = 'introuvable';
    recherche.dispatchEvent(new Event('input'));
    expect(container.textContent).toContain('Aucun bénévole ne correspond à ce filtre.');
  });

  it('affiche la légende à quatre entrées (disponible / artiste / indisponible / contrainte)', () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    expect(container.querySelectorAll('.dispos-legende__item')).toHaveLength(4);
  });

  it('infobulle de cellule au format "nom · heure · détail"', () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    const premiereCellule = container.querySelector('td.dispos-cellule') as HTMLTableCellElement;
    expect(premiereCellule.title).toMatch(/^Alice · \d{2}:\d{2} · (disponible|indisponible)$/);
  });

  it('hors mode édition, les cellules ne sont pas cliquables', () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    const cellule = container.querySelector('td.dispos-cellule') as HTMLTableCellElement;
    expect(cellule.style.cursor).not.toBe('pointer');
  });

  it('résumé en pied de tableau avec le nombre de bénévoles affichés', () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    expect(container.textContent).toContain('2 bénévoles affichés');
  });
});

describe('filtre par jour restreint aux bénévoles vraiment disponibles (nouveau, 2026-09-24)', () => {
  it("cache, hors mode édition, un bénévole sans aucune disponibilité déclarée ce jour-là (retour d'Antoine : « on voit quand même tous les bénévoles »)", () => {
    const modele = modeleDeTest();
    modele.benevoles.push({
      id: 3, Nom: 'Chloé', Contact: '', Equipe: 1, Competences: [],
      Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
    });
    const m = new Magasin(modele);
    montrerDisponibilites(container, m);
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
    expect(container.textContent).not.toContain('Chloé');
  });

  it("un souhait « voir un artiste » seul ne suffit pas à compter comme disponible (même prédicat que le roster Affectation)", () => {
    const modele = modeleDeTest();
    const debut = epochDepuisHeureLocale({...VENDREDI, heures: 10});
    modele.benevoles.push({
      id: 3, Nom: 'Chloé', Contact: '', Equipe: 1, Competences: [],
      Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
    });
    modele.disponibilites.push({Benevole: 3, Quart_heure: debut, Statut: 'Artiste', Artiste: 1});
    const m = new Magasin(modele);
    montrerDisponibilites(container, m);
    expect(container.textContent).not.toContain('Chloé');
  });

  it('en mode édition, le bénévole sans disponibilité ce jour-là reste visible (pour pouvoir la saisir)', () => {
    const modele = modeleDeTest();
    modele.benevoles.push({
      id: 3, Nom: 'Chloé', Contact: '', Equipe: 1, Competences: [],
      Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
    });
    const m = new Magasin(modele);
    montrerDisponibilites(container, m);
    expect(container.textContent).not.toContain('Chloé');

    const case_ = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    case_.checked = true;
    case_.dispatchEvent(new Event('change'));

    expect(container.textContent).toContain('Chloé');
  });
});

describe('panneau de réglages d’import (nouveau, 2026-09-23)', () => {
  it('fermé par défaut ; le bouton l’ouvre et le referme', () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    expect(container.querySelector('.card')).toBeNull();

    const bouton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement;
    bouton.click();
    expect(container.querySelector('.card')).not.toBeNull();
    expect(container.textContent).toContain("Associe les colonnes que tu as toi-même ajoutées");

    const boutonFermer = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Fermer les réglages') as HTMLButtonElement;
    boutonFermer.click();
    expect(container.querySelector('.card')).toBeNull();
  });

  it("propose un menu déroulant sur les tables du document, avant même qu'aucune ne soit choisie (bug réel signalé par Antoine le 2026-09-23 : le sélecteur visait une table en dur jamais vérifiée)", async () => {
    const m = new Magasin(modeleDeTest());
    m.brancherEcriture({
      ...ecritureMuette,
      tablesDocument: async () => [{tableId: 'Benevoles_festival_2026'}, {tableId: 'Equipes'}],
    });
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    const menu = container.querySelector('select[aria-label="Table où sont tes bénévoles"]') as HTMLSelectElement;
    expect(menu).not.toBeNull();
    const libellesOptions = Array.from(menu.querySelectorAll('option')).map((o) => o.textContent);
    expect(libellesOptions).toContain('Benevoles_festival_2026');
    expect(libellesOptions).toContain('Equipes');
  });

  it('choisir une table l’enregistre via définirParametre', async () => {
    const appels: {cle: string; valeur: string}[] = [];
    const m = new Magasin(modeleDeTest());
    m.brancherEcriture({
      ...ecritureMuette,
      tablesDocument: async () => [{tableId: 'Benevoles_festival_2026'}],
      definirParametre: async (cle, valeur) => { appels.push({cle, valeur}); },
    });
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    const menu = container.querySelector('select[aria-label="Table où sont tes bénévoles"]') as HTMLSelectElement;
    menu.value = 'Benevoles_festival_2026';
    menu.dispatchEvent(new Event('change'));
    await attendreMicrotaches();

    expect(appels).toContainEqual({cle: 'benevoles.table_benevoles', valeur: 'Benevoles_festival_2026'});
  });

  it("tant qu'aucune table n'est choisie, le menu de colonnes propose celles de tout le document, jamais une liste vide (demande explicite d'Antoine)", async () => {
    const m = new Magasin(modeleDeTest());
    m.brancherEcriture({
      ...ecritureMuette,
      tablesDocument: async () => [{tableId: 'Benevoles'}, {tableId: 'Equipes'}],
      colonnesTable: async (tableId: string) => tableId === 'Benevoles'
        ? [{colId: 'Souhaits_artistes', label: 'Souhaits artistes', type: 'ChoiceList'}]
        : [{colId: 'Nom_equipe', label: 'Nom équipe', type: 'Text'}],
    });
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();
    await attendreMicrotaches();

    const menu = container.querySelector('select[aria-label="Colonne des souhaits d\'artistes"]');
    expect(menu).not.toBeNull();
    const libellesOptions = Array.from(menu!.querySelectorAll('option')).map((o) => o.textContent);
    expect(libellesOptions).toContain('Benevoles · Souhaits artistes (Souhaits_artistes)');
    expect(libellesOptions).toContain('Equipes · Nom équipe (Nom_equipe)');
  });

  it('choisir une colonne dans le repli "tout le document" enregistre la table ET la colonne, jamais l’une sans l’autre', async () => {
    const appels: {cle: string; valeur: string}[] = [];
    const m = new Magasin(modeleDeTest());
    m.brancherEcriture({
      ...ecritureMuette,
      tablesDocument: async () => [{tableId: 'Benevoles_festival_2026'}],
      colonnesTable: async () => [{colId: 'Souhaits_artistes', label: 'Souhaits artistes', type: 'ChoiceList'}],
      definirParametre: async (cle, valeur) => { appels.push({cle, valeur}); },
    });
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();
    await attendreMicrotaches();

    const menu = container.querySelector('select[aria-label="Colonne des souhaits d\'artistes"]') as HTMLSelectElement;
    const option = Array.from(menu.querySelectorAll('option'))
      .find((o) => o.textContent === 'Benevoles_festival_2026 · Souhaits artistes (Souhaits_artistes)') as HTMLOptionElement;
    menu.value = option.value;
    menu.dispatchEvent(new Event('change'));
    await attendreMicrotaches();

    expect(appels).toContainEqual({cle: 'benevoles.table_benevoles', valeur: 'Benevoles_festival_2026'});
    expect(appels).toContainEqual({cle: 'benevoles.colonne_souhaits_artistes', valeur: 'Souhaits_artistes'});
  });

  it('une fois la table choisie, propose un menu déroulant sur les colonnes réelles de cette table', async () => {
    const colonnes: ColonneTable[] = [
      {colId: 'Souhaits_artistes', label: 'Souhaits artistes', type: 'ChoiceList'},
      {colId: 'Dispo_vendredi', label: 'Dispo vendredi', type: 'Text'},
    ];
    const m = new Magasin(modeleDeTest(), [{cle: CLE_TABLE_BENEVOLES, valeur: 'Benevoles'}]);
    m.brancherEcriture({...ecritureMuette, colonnesTable: async () => colonnes});
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    const menu = container.querySelector('select[aria-label="Colonne des souhaits d\'artistes"]');
    expect(menu).not.toBeNull();
    expect(menu?.tagName).toBe('SELECT');
    const libellesOptions = Array.from(menu!.querySelectorAll('option')).map((o) => o.textContent);
    expect(libellesOptions).toContain('Dispo vendredi (Dispo_vendredi)');
  });

  it("aucune colonne éligible (table choisie et lue mais sans colonne texte/choix ajoutée par Antoine) : le dit, plutôt qu'un menu vide sans explication", async () => {
    const m = new Magasin(modeleDeTest(), [{cle: CLE_TABLE_BENEVOLES, valeur: 'Benevoles'}]);
    m.brancherEcriture({
      ...ecritureMuette,
      colonnesTable: async () => [{colId: 'Quota_heures_max', label: 'Quota heures max', type: 'Numeric'}],
    });
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    expect(container.textContent).toContain('Aucune colonne de ta table Bénévoles ne peut être associée ici');
    const menu = container.querySelector('select[aria-label="Colonne des souhaits d\'artistes"]');
    expect(menu).not.toBeNull(); // le menu reste affiché (avec seulement « — aucune — »), pas de repli forcé
  });

  it('repli en champ texte si la lecture des colonnes de la table choisie échoue, avec un message explicite', async () => {
    const m = new Magasin(modeleDeTest(), [{cle: CLE_TABLE_BENEVOLES, valeur: 'Benevoles'}]);
    m.brancherEcriture({...ecritureMuette, colonnesTable: async () => { throw new Error('document indisponible'); }});
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    expect(container.querySelector('select[aria-label="Colonne des souhaits d\'artistes"]')).toBeNull();
    const champTexte = container.querySelector('input[aria-label="Colonne des souhaits d\'artistes"]') as HTMLInputElement;
    expect(champTexte).not.toBeNull();
    expect(container.textContent).toContain('Impossible de lire la liste de tes colonnes');
  });

  it('les valeurs déjà enregistrées apparaissent réellement dans les champs (pas seulement en attribut inerte)', async () => {
    const m = new Magasin(modeleDeTest(), [
      {cle: CLE_TABLE_BENEVOLES, valeur: 'Benevoles'},
      {cle: 'benevoles.colonne_souhaits_artistes', valeur: 'Souhaits_deja_enregistres'},
      {cle: 'benevoles.libelle_tout_le_creneau', valeur: 'Toute la journée'},
    ]);
    m.brancherEcriture({
      ...ecritureMuette,
      colonnesTable: async () => { throw new Error('document indisponible'); }, // force le repli texte
    });
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    const champColonne = container.querySelector('input[aria-label="Colonne des souhaits d\'artistes"]') as HTMLInputElement;
    expect(champColonne.value).toBe('Souhaits_deja_enregistres');
    const champLibelle = Array.from(container.querySelectorAll('input[type="text"]'))
      .find((el) => (el as HTMLInputElement).value === 'Toute la journée') as HTMLInputElement | undefined;
    expect(champLibelle).not.toBeUndefined();
  });

  it('un choix de colonne est enregistré via définirParametre', async () => {
    const colonnes: ColonneTable[] = [{colId: 'Dispo_vendredi', label: 'Dispo vendredi', type: 'Text'}];
    const appels: {cle: string; valeur: string}[] = [];
    const m = new Magasin(modeleDeTest(), [{cle: CLE_TABLE_BENEVOLES, valeur: 'Benevoles'}]);
    m.brancherEcriture({
      ...ecritureMuette,
      colonnesTable: async () => colonnes,
      definirParametre: async (cle, valeur) => { appels.push({cle, valeur}); },
    });
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    const menu = container.querySelector('select[aria-label="Colonne de réponse pour Vendredi matin"]') as HTMLSelectElement;
    menu.value = 'Dispo_vendredi';
    menu.dispatchEvent(new Event('change'));
    await attendreMicrotaches();

    expect(appels).toContainEqual({cle: 'benevoles.colonne_reponse_macro.1', valeur: 'Dispo_vendredi'});
  });

  it("un échec d'enregistrement d'un choix de colonne se voit à l'écran, plutôt que de disparaître en silence (table Parametres absente, document déconnecté…)", async () => {
    const colonnes: ColonneTable[] = [{colId: 'Dispo_vendredi', label: 'Dispo vendredi', type: 'Text'}];
    const m = new Magasin(modeleDeTest(), [{cle: CLE_TABLE_BENEVOLES, valeur: 'Benevoles'}]);
    m.brancherEcriture({
      ...ecritureMuette,
      colonnesTable: async () => colonnes,
      definirParametre: async () => { throw new Error('table Parametres absente de ce document'); },
    });
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    const menu = container.querySelector('select[aria-label="Colonne de réponse pour Vendredi matin"]') as HTMLSelectElement;
    menu.value = 'Dispo_vendredi';
    menu.dispatchEvent(new Event('change'));
    await attendreMicrotaches();

    expect(container.textContent).toContain("Échec de l'enregistrement de ce réglage");
  });

  it("l'import refuse de partir si aucune table de bénévoles n'est choisie", async () => {
    const m = new Magasin(modeleDeTest());
    let appele = false;
    m.brancherEcriture({...ecritureMuette, valeursColonneBrute: async () => { appele = true; return new Map(); }});
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Importer les disponibilités') as HTMLButtonElement).click();
    await attendreMicrotaches();

    expect(appele).toBe(false);
    expect(container.textContent).toContain('Choisis la table où sont tes bénévoles ci-dessus avant d\'importer.');
  });

  it("l'import refuse de partir si une table est choisie mais aucune colonne n'est associée", async () => {
    const m = new Magasin(modeleDeTest(), [{cle: CLE_TABLE_BENEVOLES, valeur: 'Benevoles'}]);
    let appele = false;
    m.brancherEcriture({...ecritureMuette, valeursColonneBrute: async () => { appele = true; return new Map(); }});
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Importer les disponibilités') as HTMLButtonElement).click();
    await attendreMicrotaches();

    expect(appele).toBe(false);
    expect(container.textContent).toContain('Associe au moins une colonne ci-dessus avant d\'importer.');
  });
});

describe('peuplement des bénévoles depuis la table source (nouveau, 2026-09-23, §6.4)', () => {
  it("n'apparaît pas tant qu'aucune table n'est choisie", () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    expect(container.querySelector('select[aria-label="Colonne du nom prénom"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Peupler mes bénévoles')).toBe(false);
  });

  it("une fois la table choisie, propose les colonnes Nom/Téléphone SANS exclure une colonne nommée « Nom », contrairement aux autres menus", async () => {
    const colonnes: ColonneTable[] = [
      {colId: 'Nom', label: 'Nom', type: 'Text'},
      {colId: 'Telephone', label: 'Téléphone', type: 'Text'},
    ];
    const m = new Magasin(modeleDeTest(), [{cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'}]);
    m.brancherEcriture({...ecritureMuette, colonnesTable: async () => colonnes});
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();

    const menuNom = container.querySelector('select[aria-label="Colonne du nom prénom"]');
    expect(menuNom).not.toBeNull();
    const optionsNom = Array.from(menuNom!.querySelectorAll('option')).map((o) => o.textContent);
    expect(optionsNom).toContain('Nom (Nom)');

    const menuTelephone = container.querySelector('select[aria-label="Colonne du téléphone"]');
    expect(menuTelephone).not.toBeNull();
    const optionsTelephone = Array.from(menuTelephone!.querySelectorAll('option')).map((o) => o.textContent);
    expect(optionsTelephone).toContain('Téléphone (Telephone)');
  });

  it("le bouton refuse de partir si la colonne du nom n'est pas choisie", async () => {
    const m = new Magasin(modeleDeTest(), [{cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'}]);
    let appele = false;
    m.brancherEcriture({...ecritureMuette, peuplerBenevoles: async () => { appele = true; return {benevoles: [], crees: 0, actualises: 0}; }});
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();
    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Peupler mes bénévoles') as HTMLButtonElement).click();
    await attendreMicrotaches();

    expect(appele).toBe(false);
    expect(container.textContent).toContain('Choisis la table et la colonne du nom ci-dessus avant de peupler tes bénévoles.');
  });

  it("le bouton refuse de partir si aucune équipe n'existe (chaque bénévole importé doit en avoir une)", async () => {
    const modele = modeleDeTest();
    modele.equipes = [];
    modele.benevoles = [];
    const m = new Magasin(modele, [
      {cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'},
      {cle: 'benevoles.colonne_nom', valeur: 'Nom'},
    ]);
    let appele = false;
    m.brancherEcriture({...ecritureMuette, peuplerBenevoles: async () => { appele = true; return {benevoles: [], crees: 0, actualises: 0}; }});
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();
    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Peupler mes bénévoles') as HTMLButtonElement).click();
    await attendreMicrotaches();

    expect(appele).toBe(false);
    expect(container.textContent).toContain("Crée d'abord une équipe");
  });

  it('appelle m.peuplerBenevoles avec la table, la colonne du nom et celle du téléphone (optionnelle) puis affiche le résultat', async () => {
    const appels: {table: string; colNom: string; colContact: string | null}[] = [];
    const m = new Magasin(modeleDeTest(), [
      {cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'},
      {cle: 'benevoles.colonne_nom', valeur: 'Nom'},
      {cle: 'benevoles.colonne_contact', valeur: 'Telephone'},
    ]);
    m.brancherEcriture({
      ...ecritureMuette,
      peuplerBenevoles: async (table, colNom, colContact) => {
        appels.push({table, colNom, colContact});
        return {benevoles: m.benevoles, crees: 3, actualises: 1};
      },
    });
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();
    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Peupler mes bénévoles') as HTMLButtonElement).click();
    await attendreMicrotaches();

    expect(appels).toEqual([{table: 'INFOS_BENEVOLES', colNom: 'Nom', colContact: 'Telephone'}]);
    expect(container.textContent).toContain('3 bénévoles créés, 1 actualisé.');
  });

  it('téléphone non choisi : appelle m.peuplerBenevoles avec colContact = null', async () => {
    const appels: (string | null)[] = [];
    const m = new Magasin(modeleDeTest(), [
      {cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'},
      {cle: 'benevoles.colonne_nom', valeur: 'Nom'},
    ]);
    m.brancherEcriture({
      ...ecritureMuette,
      peuplerBenevoles: async (_table, _colNom, colContact) => { appels.push(colContact); return {benevoles: [], crees: 0, actualises: 0}; },
    });
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();
    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Peupler mes bénévoles') as HTMLButtonElement).click();
    await attendreMicrotaches();

    expect(appels).toEqual([null]);
  });

  it("rien créé ni actualisé : le dit clairement plutôt qu'un message ambigu", async () => {
    const m = new Magasin(modeleDeTest(), [
      {cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'},
      {cle: 'benevoles.colonne_nom', valeur: 'Nom'},
    ]);
    m.brancherEcriture({...ecritureMuette, peuplerBenevoles: async () => ({benevoles: [], crees: 0, actualises: 0})});
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();
    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Peupler mes bénévoles') as HTMLButtonElement).click();
    await attendreMicrotaches();

    expect(container.textContent).toContain('Rien à peupler : aucune ligne avec un nom dans la colonne choisie.');
  });

  it("un échec du peuplement se voit à l'écran, plutôt que de disparaître en silence", async () => {
    const m = new Magasin(modeleDeTest(), [
      {cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'},
      {cle: 'benevoles.colonne_nom', valeur: 'Nom'},
    ]);
    m.brancherEcriture({...ecritureMuette, peuplerBenevoles: async () => { throw new Error('document indisponible'); }});
    montrerDisponibilites(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === "Réglages d'import") as HTMLButtonElement).click();
    await attendreMicrotaches();
    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Peupler mes bénévoles') as HTMLButtonElement).click();
    await attendreMicrotaches();

    expect(container.textContent).toContain('Échec du peuplement');
  });
});

describe('mode édition (nouveau, 2026-09-23)', () => {
  it('active le curseur et l’écoute de clic sur les cellules une fois coché', () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    const case_ = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    case_.checked = true;
    case_.dispatchEvent(new Event('change'));

    const cellule = container.querySelector('td.dispos-cellule') as HTMLTableCellElement;
    expect(cellule.style.cursor).toBe('pointer');
    expect(cellule.title).toContain('cliquer pour basculer');
  });

  it('un clic sur une cellule en mode édition appelle remplacerDisponibilites avec le bénévole et le macro-créneau visés', async () => {
    const appels: {benevoleId: number; debut: number; fin: number}[] = [];
    const m = new Magasin(modeleDeTest());
    m.brancherEcriture({
      ...ecritureMuette,
      remplacerDisponibilites: async (benevoleId, debut, fin) => { appels.push({benevoleId: benevoleId as number, debut, fin}); },
    });
    montrerDisponibilites(container, m);

    const case_ = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    case_.checked = true;
    case_.dispatchEvent(new Event('change'));

    const cellule = container.querySelector('td.dispos-cellule') as HTMLTableCellElement;
    cellule.click();
    await attendreMicrotaches();

    expect(appels).toHaveLength(1);
    expect(appels[0]?.benevoleId).toBe(1);
  });

  it('un clic en mode édition conserve la position de défilement de la grille (retour d’Antoine, 2026-09-23 19h47)', async () => {
    const m = new Magasin(modeleDeTest());
    m.brancherEcriture({...ecritureMuette, remplacerDisponibilites: async () => {}});
    montrerDisponibilites(container, m);

    const case_ = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    case_.checked = true;
    case_.dispatchEvent(new Event('change'));

    const defilement = container.querySelector('.dispos-scroll') as HTMLElement;
    defilement.scrollTop = 123;
    defilement.scrollLeft = 45;

    const cellule = container.querySelector('td.dispos-cellule') as HTMLTableCellElement;
    cellule.click();
    await attendreMicrotaches();

    const nouveauDefilement = container.querySelector('.dispos-scroll') as HTMLElement;
    expect(nouveauDefilement.scrollTop).toBe(123);
    expect(nouveauDefilement.scrollLeft).toBe(45);
  });

  it('« Choisir un artiste au clic » reste désactivée tant que le mode édition ne l’est pas', () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    const cases = container.querySelectorAll('input[type="checkbox"]');
    expect((cases[1] as HTMLInputElement).disabled).toBe(true);
  });

  it("un clic sur une cellule dont le quart d'heure ne porte aucun artiste ne bascule rien et le dit", async () => {
    const appels: unknown[] = [];
    const m = new Magasin(modeleDeTest());
    m.brancherEcriture({...ecritureMuette, remplacerDisponibilites: async () => { appels.push(1); }});
    montrerDisponibilites(container, m);

    const cases = container.querySelectorAll('input[type="checkbox"]');
    (cases[0] as HTMLInputElement).checked = true;
    (cases[0] as HTMLInputElement).dispatchEvent(new Event('change'));
    const casesApresRafraichissement = container.querySelectorAll('input[type="checkbox"]');
    (casesApresRafraichissement[1] as HTMLInputElement).checked = true;
    (casesApresRafraichissement[1] as HTMLInputElement).dispatchEvent(new Event('change'));

    const cellule = container.querySelectorAll('td.dispos-cellule')[1] as HTMLTableCellElement; // 2e quart : hors passage de Marée Haute
    cellule.click();
    await attendreMicrotaches();

    expect(appels).toHaveLength(0);
    expect(container.textContent).toContain("Aucun artiste ne joue à ce quart d'heure.");
  });

  it("un clic sur une cellule dont le quart d'heure porte un artiste l'assigne (Statut Artiste)", async () => {
    const appels: {statut: string; artiste: number | null}[] = [];
    const m = new Magasin(modeleDeTest());
    m.brancherEcriture({
      ...ecritureMuette,
      remplacerDisponibilites: async (_benevoleId, _debut, _fin, nouvelles) => {
        for (const d of nouvelles) { appels.push({statut: d.Statut, artiste: d.Artiste}); }
      },
    });
    montrerDisponibilites(container, m);

    const cases = container.querySelectorAll('input[type="checkbox"]');
    (cases[0] as HTMLInputElement).checked = true;
    (cases[0] as HTMLInputElement).dispatchEvent(new Event('change'));
    const casesApresRafraichissement = container.querySelectorAll('input[type="checkbox"]');
    (casesApresRafraichissement[1] as HTMLInputElement).checked = true;
    (casesApresRafraichissement[1] as HTMLInputElement).dispatchEvent(new Event('change'));

    // Le premier quart d'heure du macro-créneau de test est aussi le début
    // du passage de « Marée Haute » (fixture) : un artiste y joue bien.
    const cellule = container.querySelector('td.dispos-cellule') as HTMLTableCellElement;
    expect(cellule.title).toContain('cliquer pour choisir un artiste');
    cellule.click();
    await attendreMicrotaches();

    expect(appels.some((a) => a.statut === 'Artiste' && a.artiste === 1)).toBe(true);
  });
});
