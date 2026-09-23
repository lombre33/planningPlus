/**
 * Vue Disponibilités : garde-fou de non-régression sur le comportement
 * d'origine (onglets jour, filtre équipe, recherche, légende, états vides,
 * infobulle, résumé) en plus des nouveaux usages ajoutés le 2026-09-23
 * (panneau de réglages d'import avec menu déroulant sur les colonnes
 * réelles, repli en champ texte, mode édition au clic).
 */
import {beforeEach, describe, expect, it} from 'vitest';
import type {EcritureGrist} from '../store';
import type {ColonneTable} from '../logic/parametres-benevoles';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {epochDepuisHeureLocale} from '../temps';
import {montrerDisponibilites} from './disponibilites';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [],
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
    disponibilites: [
      {Benevole: 1, Quart_heure: debut, Statut: 'Disponible', Artiste: null},
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
  definirParametre: async () => {},
  remplacerDisponibilites: async () => {},
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

  it('affiche un onglet par jour de festival, sélectionné via aria-selected', () => {
    const m = new Magasin(modeleDeTest());
    montrerDisponibilites(container, m);
    const onglets = container.querySelectorAll('.dispos-jour-tab');
    expect(onglets.length).toBeGreaterThan(0);
    expect(onglets[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('le filtre équipe restreint les lignes affichées', () => {
    const modele = modeleDeTest();
    modele.equipes.push({id: 2, Nom: 'Sécurité', Couleur: '#333', Referent: null, Notes: ''});
    modele.benevoles.push({
      id: 3, Nom: 'Chloé', Contact: '', Equipe: 2, Competences: [],
      Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
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

  it('propose un menu déroulant sur les colonnes réelles de la table Bénévoles une fois lues', async () => {
    const colonnes: ColonneTable[] = [
      {colId: 'Souhaits_artistes', label: 'Souhaits artistes', type: 'ChoiceList'},
      {colId: 'Dispo_vendredi', label: 'Dispo vendredi', type: 'Text'},
    ];
    const m = new Magasin(modeleDeTest());
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

  it('repli en champ texte si la lecture des colonnes échoue, avec un message explicite', async () => {
    const m = new Magasin(modeleDeTest());
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
    const m = new Magasin(modeleDeTest());
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

  it("l'import refuse de partir si aucune colonne n'est associée", async () => {
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
    expect(container.textContent).toContain('Associe au moins une colonne ci-dessus avant d\'importer.');
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
