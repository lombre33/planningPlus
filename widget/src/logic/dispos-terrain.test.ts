import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {cleJourFestival} from '../temps';
import {indexer, regrouperParJour} from './derive';
import {
  affectationsAInstant, besoinsActifs, blocsDuJour, contraintesBenevole, couvertureAInstant, estHeurePleine,
  graviteContraintes, indexerDisponibilitesDuQuart, indexerDisponibilitesParBenevole, libelleContraintes,
  sousCreneauxActifs, statutBenevoleAInstant, statutCellule,
} from './dispos-terrain';
import {Magasin} from '../store';

/**
 * Petit festival d'un seul macro-créneau (10h00–10h30, deux quarts d'heure),
 * avec un unique indicatif (« G1 », un binôme réduit à une place pour
 * simplifier) positionné successivement sur les deux sous-créneaux — le cas
 * §6.3 qui motive ces deux vues : c'est la mission qui tourne, pas la
 * personne.
 */
function creerModeleDeTest(): Modele {
  return {
    equipes: [{id: 1, Nom: 'Bar', Couleur: '#2E7D32', Referent: null, Notes: ''}],
    lieux: [{id: 1, Nom: 'Scène A', Description: ''}],
    benevoles: [
      {id: 1, Nom: 'Alice', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      {id: 2, Nom: 'Bob', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: ''},
      {id: 3, Nom: 'Chloé', Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Absent', Notes: ''},
    ],
    missions: [{id: 1, Nom: 'Bar central', Description: '', Lieu: 1, Equipe: 1, Priorite: 'Normale', Competences_requises: []}],
    artistes: [{id: 1, Nom: 'Marée Haute', Lieu: 1, Debut: 0, Fin: 1800}],
    macroCreneaux: [{id: 1, Nom: 'Journée test', Debut: 0, Fin: 1800}],
    sousCreneaux: [
      {id: 1, Macro_creneau: 1, Mission: null, Libelle: '10:00–10:15', Debut: 0, Fin: 900},
      {id: 2, Macro_creneau: 1, Mission: null, Libelle: '10:15–10:30', Debut: 900, Fin: 1800},
    ],
    besoins: [
      {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 2, Taille_groupe: 1},
      {id: 2, Mission: 1, Sous_creneau: 2, Effectif_min: 1, Effectif_max: 2, Taille_groupe: 1},
    ],
    groupes: [{id: 1, Code: 'G1', Taille: 1, Equipe: 1, Notes: ''}],
    positionsGroupe: [
      {id: 1, Groupe: 1, Besoin: 1},
      {id: 2, Groupe: 1, Besoin: 2},
    ],
    places: [{id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Algorithme', Verrouillee: false, Score: 1}],
    disponibilites: [
      {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 900, Statut: 'Artiste', Artiste: 1},
      // Bob n'a aucune ligne au quart 0 : vaut indisponible (§6.4).
      {Benevole: 2, Quart_heure: 900, Statut: 'Disponible', Artiste: null},
    ],
    // Contraintes (§6) pour les tests de `contraintesBenevole` : Bob refuse
    // la seule mission du fixture, Alice et Bob s'évitent, Bob et Chloé
    // doivent être rapprochés.
    souhaitsMissions: [{id: 1, Benevole: 2, Mission: 1, Preference: 'Refuse'}],
    affinites: [
      {id: 1, Benevole_A: 1, Benevole_B: 2, Type: 'Éviter'},
      {id: 2, Benevole_A: 2, Benevole_B: 3, Type: 'Ensemble'},
    ],
  };
}

describe('estHeurePleine', () => {
  it("est vrai à l'heure pleine, faux sinon", () => {
    expect(estHeurePleine(0)).toBe(true);
    expect(estHeurePleine(900)).toBe(false);
    expect(estHeurePleine(3600)).toBe(true);
  });
});

describe('cleJourFestival', () => {
  it('rattache une heure avant la coupure au jour précédent', () => {
    // 2026-07-18T02:00:00Z, coupure 6h : appartient au jour de festival du 17.
    const epoch = Date.UTC(2026, 6, 18, 2, 0, 0) / 1000;
    expect(cleJourFestival(epoch, 6, 'UTC')).toBe('2026-07-17');
  });

  it('rattache une heure après la coupure au jour courant', () => {
    const epoch = Date.UTC(2026, 6, 18, 22, 0, 0) / 1000;
    expect(cleJourFestival(epoch, 6, 'UTC')).toBe('2026-07-18');
  });
});

describe('regrouperParJour (jour de festival, logic/derive.ts)', () => {
  it('regroupe sous le même jour de festival une soirée et la matinée qui la suit avant la coupure', () => {
    const soiree = {id: 1, Nom: 'Soirée', Debut: Date.UTC(2026, 6, 17, 20, 0, 0) / 1000, Fin: Date.UTC(2026, 6, 18, 0, 0, 0) / 1000};
    // 04:00 locale (Europe/Paris, UTC+2 en juillet) le lendemain matin : avant la coupure de 6h, donc même jour de festival.
    const apresMinuit = {id: 2, Nom: 'Fin de nuit', Debut: Date.UTC(2026, 6, 18, 2, 0, 0) / 1000, Fin: Date.UTC(2026, 6, 18, 3, 0, 0) / 1000};
    const jours = regrouperParJour([soiree, apresMinuit]);
    expect(jours).toHaveLength(1);
    expect(jours[0]!.macros.map((m) => m.id)).toEqual([1, 2]);
  });
});

describe('blocsDuJour', () => {
  it('découpe un macro-créneau en quarts d’heure de 15 minutes', () => {
    const jour = {cle: 'x', libelle: 'x', macros: creerModeleDeTest().macroCreneaux};
    const blocs = blocsDuJour(jour);
    expect(blocs).toHaveLength(1);
    expect(blocs[0]!.quarts).toEqual([0, 900]);
  });
});

describe('statutCellule', () => {
  it('vaut indisponible en l’absence de ligne (§6.4)', () => {
    const modele = creerModeleDeTest();
    const index = indexerDisponibilitesParBenevole(modele.disponibilites);
    expect(statutCellule(index, 2, 0)).toEqual({statut: 'Indisponible', artisteId: null});
  });

  it('rapporte le statut déclaré et l’artiste souhaité', () => {
    const modele = creerModeleDeTest();
    const index = indexerDisponibilitesParBenevole(modele.disponibilites);
    expect(statutCellule(index, 1, 0)).toEqual({statut: 'Disponible', artisteId: null});
    expect(statutCellule(index, 1, 900)).toEqual({statut: 'Artiste', artisteId: 1});
  });
});

describe('sousCreneauxActifs / besoinsActifs', () => {
  it('sélectionne le sous-créneau et le besoin actifs à cet instant (bornes demi-ouvertes)', () => {
    const modele = creerModeleDeTest();
    const m = new Magasin(modele);
    expect(sousCreneauxActifs(m, 450).map((s) => s.id)).toEqual([1]);
    expect(sousCreneauxActifs(m, 900).map((s) => s.id)).toEqual([2]);
    expect(besoinsActifs(m, 450).map((b) => b.id)).toEqual([1]);
  });
});

describe('affectationsAInstant', () => {
  it("suit l'indicatif d'un sous-créneau à l'autre (§6.3 : la mission tourne, pas la personne)", () => {
    const modele = creerModeleDeTest();
    const m = new Magasin(modele);
    const ix = indexer(m);

    const aPremierQuart = affectationsAInstant(m, ix, 450);
    expect(aPremierQuart.get(1)).toMatchObject({groupeCode: 'G1'});
    expect(aPremierQuart.get(1)?.sousCreneau.id).toBe(1);

    const aSecondQuart = affectationsAInstant(m, ix, 1350);
    expect(aSecondQuart.get(1)?.sousCreneau.id).toBe(2);
  });

  it('ne place pas un bénévole non affecté', () => {
    const modele = creerModeleDeTest();
    const m = new Magasin(modele);
    const ix = indexer(m);
    expect(affectationsAInstant(m, ix, 450).has(2)).toBe(false);
  });
});

describe('couvertureAInstant', () => {
  it('rapporte les places pourvues face au minimum du besoin actif', () => {
    const modele = creerModeleDeTest();
    const m = new Magasin(modele);
    const ix = indexer(m);
    const couvertures = couvertureAInstant(m, ix, 450);
    expect(couvertures).toHaveLength(1);
    expect(couvertures[0]).toMatchObject({couverture: {pourvues: 1, statut: 'ok'}});
  });
});

describe('statutBenevoleAInstant', () => {
  it('priorise « en poste » sur la disponibilité déclarée', () => {
    const modele = creerModeleDeTest();
    const m = new Magasin(modele);
    const ix = indexer(m);
    const affectations = affectationsAInstant(m, ix, 450);
    const dispoDuQuart = indexerDisponibilitesDuQuart(m, 450);
    const statut = statutBenevoleAInstant(ix, dispoDuQuart, affectations, 1, 'Actif');
    expect(statut.etat).toBe('en-poste');
  });

  it('vaut indisponible sans ligne déclarée, jamais un état à part (§6.4)', () => {
    const modele = creerModeleDeTest();
    const m = new Magasin(modele);
    const ix = indexer(m);
    const affectations = affectationsAInstant(m, ix, 450);
    const dispoDuQuart = indexerDisponibilitesDuQuart(m, 450);
    expect(statutBenevoleAInstant(ix, dispoDuQuart, affectations, 2, 'Actif')).toEqual({etat: 'indisponible'});
  });

  it('rapporte le souhait « veut voir un artiste » avec son nom', () => {
    const modele = creerModeleDeTest();
    const m = new Magasin(modele);
    const ix = indexer(m);
    const dispoDuQuart = indexerDisponibilitesDuQuart(m, 1350);
    // Alice occupe la place sur ce second quart dans le fixture ; on teste ici
    // la détection de l'artiste indépendamment de toute affectation, avec une
    // map vide (aucun bénévole en poste).
    expect(statutBenevoleAInstant(ix, dispoDuQuart, new Map(), 1, 'Actif'))
      .toEqual({etat: 'veut-voir-artiste', artisteNom: 'Marée Haute'});
  });

  it('un bénévole absent reste absent même s’il tenait une place', () => {
    const modele = creerModeleDeTest();
    modele.places[0]!.Benevole = 3; // Chloé, marquée Absent dans le fixture
    const m = new Magasin(modele);
    const ix = indexer(m);
    const affectations = affectationsAInstant(m, ix, 450);
    const dispoDuQuart = indexerDisponibilitesDuQuart(m, 450);
    expect(statutBenevoleAInstant(ix, dispoDuQuart, affectations, 3, 'Absent')).toEqual({etat: 'absent'});
  });
});

describe('contraintesBenevole', () => {
  it('rapporte le refus de mission (gravité la plus forte, bloquante pour le moteur)', () => {
    const modele = creerModeleDeTest();
    const m = new Magasin(modele);
    const ix = indexer(m);
    const c = contraintesBenevole(m, ix, 2); // Bob
    expect(c.missionsRefusees).toEqual(['Bar central']);
    expect(c.affinitesEviter).toEqual(['Alice']);
    expect(c.affinitesEnsemble).toEqual(['Chloé']);
    expect(graviteContraintes(c)).toBe('danger');
    expect(libelleContraintes(c)).toBe('Refuse : Bar central · À éviter avec : Alice · À rapprocher de : Chloé');
  });

  it('une affinité à éviter, sans refus, vaut une gravité intermédiaire', () => {
    const modele = creerModeleDeTest();
    const m = new Magasin(modele);
    const ix = indexer(m);
    const c = contraintesBenevole(m, ix, 1); // Alice
    expect(c.missionsRefusees).toEqual([]);
    expect(c.affinitesEviter).toEqual(['Bob']);
    expect(graviteContraintes(c)).toBe('warn');
  });

  it('une affinité à rapprocher seule vaut une gravité informative', () => {
    const modele = creerModeleDeTest();
    const m = new Magasin(modele);
    const ix = indexer(m);
    const c = contraintesBenevole(m, ix, 3); // Chloé
    expect(c.affinitesEnsemble).toEqual(['Bob']);
    expect(graviteContraintes(c)).toBe('neutral');
  });

  it('aucune contrainte déclarée : pas de gravité, pas de libellé', () => {
    const modele = creerModeleDeTest();
    modele.souhaitsMissions = [];
    modele.affinites = [];
    const m = new Magasin(modele);
    const ix = indexer(m);
    const c = contraintesBenevole(m, ix, 1);
    expect(graviteContraintes(c)).toBeNull();
    expect(libelleContraintes(c)).toBeNull();
  });
});
