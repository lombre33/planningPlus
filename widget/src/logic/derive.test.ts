import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {
  feuilleBenevole, indexer, indicatifsDeLEquipe, ligneArtistes, lignesGroupeesParArtiste, regrouperParJourFestival,
} from './derive';
import {epochDepuisHeureLocale} from '../temps';
import {Magasin} from '../store';

/**
 * Petit festival de test : deux équipes, deux indicatifs, un artiste
 * convoité par deux bénévoles (dont un déjà affecté en même temps), un
 * bénévole sans aucune affectation. Volontairement minimal mais couvrant
 * les cas limites des trois vues (place vacante, chevauchement, aucune
 * étape, artiste sans demande).
 */
function modeleDeTest(): Modele {
  return {
    equipes: [
      {id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''},
      {id: 2, Nom: 'Accueil', Couleur: '#0a0', Referent: null, Notes: ''},
    ],
    lieux: [
      {id: 1, Nom: 'Grande scène', Description: ''},
      {id: 2, Nom: 'Entrée', Description: ''},
    ],
    benevoles: [
      {
        id: 1, Nom: 'Alice', Contact: '', Equipe: 1, Competences: [],
        Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
      },
      {
        id: 2, Nom: 'Bilal', Contact: '', Equipe: 1, Competences: [],
        Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
      },
      {
        id: 3, Nom: 'Chloé', Contact: '', Equipe: 2, Competences: [],
        Quota_heures_min: 0, Quota_heures_max: 40, Statut: 'Actif', Notes: '',
      },
    ],
    missions: [
      {id: 1, Nom: 'Bar principal', Description: '', Lieu: 1, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
      {id: 2, Nom: 'Contrôle accès', Description: '', Lieu: 2, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
    ],
    artistes: [
      // Fenêtre alignée sur le quart d'heure (900 s) occupé par Alice via sa
      // seconde position (sous-créneau 2, 900-1800) : q=900 doit y tomber.
      {id: 1, Nom: 'Nuit Blanche', Lieu: 1, Debut: 900, Fin: 1800},
      {id: 2, Nom: 'Sans public', Lieu: 1, Debut: 5000, Fin: 6000},
    ],
    macroCreneaux: [{id: 1, Nom: 'Samedi', Debut: 0, Fin: 10000}],
    sousCreneaux: [
      {id: 1, Macro_creneau: 1, Mission: null, Libelle: '14h00–15h30', Debut: 0, Fin: 900},
      {id: 2, Macro_creneau: 1, Mission: null, Libelle: '15h30–17h00', Debut: 900, Fin: 1800},
    ],
    besoins: [
      {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 2, Effectif_max: 3, Taille_groupe: 2},
      {id: 2, Mission: 2, Sous_creneau: 2, Effectif_min: 2, Effectif_max: 2, Taille_groupe: 2},
    ],
    groupes: [
      {id: 1, Code: 'BA01', Taille: 2, Equipe: 1, Notes: ''},
      {id: 2, Code: 'AC01', Taille: 2, Equipe: 2, Notes: ''},
    ],
    positionsGroupe: [
      {id: 1, Groupe: 1, Besoin: 1},
      {id: 2, Groupe: 1, Besoin: 2}, // BA01 tourne du bar vers le contrôle d'accès
    ],
    places: [
      {id: 1, Groupe: 1, Rang: 1, Benevole: 1, Origine: 'Algorithme', Verrouillee: false, Score: 1},
      {id: 2, Groupe: 1, Rang: 2, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0},
      {id: 3, Groupe: 2, Rang: 1, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0},
      {id: 4, Groupe: 2, Rang: 2, Benevole: null, Origine: 'Algorithme', Verrouillee: false, Score: 0},
    ],
    disponibilites: [
      // Alice veut voir « Nuit Blanche » (1000-2000), et tient une place sur
      // le sous-créneau 900-1800 : chevauchement partiel -> conflit.
      {Benevole: 1, Quart_heure: 900, Statut: 'Artiste', Artiste: 1},
      {Benevole: 3, Quart_heure: 1000, Statut: 'Artiste', Artiste: 1}, // Chloé : demande sans conflit (aucune place)
    ],
    souhaitsMissions: [],
    affinites: [],
  };
}

describe('feuilleBenevole', () => {
  it('assemble les étapes de tous les indicatifs du bénévole, triées chronologiquement', () => {
    const m = new Magasin(modeleDeTest());
    const ix = indexer(m);
    const feuille = feuilleBenevole(m, ix, 1);

    expect(feuille).not.toBeNull();
    expect(feuille!.equipeNom).toBe('Bars');
    expect(feuille!.etapes.map((e) => e.missionNom)).toEqual(['Bar principal', 'Contrôle accès']);
    expect(feuille!.etapes[0]!.coequipiers).toEqual([]); // rang 2 non pourvu
    expect(feuille!.totalHeures).toBeCloseTo(1800 / 3600);
  });

  it('rend une feuille vide pour un bénévole sans aucune affectation', () => {
    const m = new Magasin(modeleDeTest());
    const ix = indexer(m);
    const feuille = feuilleBenevole(m, ix, 3); // Chloé : aucune place

    expect(feuille!.etapes).toEqual([]);
    expect(feuille!.totalHeures).toBe(0);
  });

  it('renvoie null pour un identifiant de bénévole inconnu', () => {
    const m = new Magasin(modeleDeTest());
    const ix = indexer(m);
    expect(feuilleBenevole(m, ix, 999)).toBeNull();
  });

  it('signale un chevauchement avec l’étape précédente', () => {
    const modele = modeleDeTest();
    // Rapproche les deux sous-créneaux pour qu'ils se chevauchent réellement.
    modele.sousCreneaux[1]!.Debut = 400;
    modele.sousCreneaux[1]!.Fin = 1300;
    const m = new Magasin(modele);
    const ix = indexer(m);
    const feuille = feuilleBenevole(m, ix, 1);

    expect(feuille!.etapes[0]!.chevaucheLaPrecedente).toBe(false);
    expect(feuille!.etapes[1]!.chevaucheLaPrecedente).toBe(true);
  });
});

describe('indicatifsDeLEquipe', () => {
  it('liste les indicatifs de l’équipe avec roster et trajectoire', () => {
    const m = new Magasin(modeleDeTest());
    const ix = indexer(m);
    const indicatifs = indicatifsDeLEquipe(m, ix, 1);

    expect(indicatifs).toHaveLength(1);
    const [ba01] = indicatifs;
    expect(ba01!.groupe.Code).toBe('BA01');
    expect(ba01!.membres).toEqual([
      {rang: 1, nom: 'Alice'},
      {rang: 2, nom: null}, // place vacante : à signaler par la cheffe d'équipe
    ]);
    expect(ba01!.positions.map((p) => p.missionNom)).toEqual(['Bar principal', 'Contrôle accès']);
  });

  it('calcule la couverture sur l’ensemble des indicatifs positionnés, pas seulement celui affiché', () => {
    const m = new Magasin(modeleDeTest());
    const ix = indexer(m);
    const [ba01] = indicatifsDeLEquipe(m, ix, 1);
    // Besoin 1 : effectif min 2, une seule place pourvue (Alice) -> sous-effectif.
    expect(ba01!.positions[0]!.couverture.statut).toBe('sous');
  });

  it('rend un tableau vide pour une équipe sans indicatif', () => {
    const modele = modeleDeTest();
    modele.equipes.push({id: 3, Nom: 'Sans indicatif', Couleur: '#000', Referent: null, Notes: ''});
    const m = new Magasin(modele);
    const ix = indexer(m);
    expect(indicatifsDeLEquipe(m, ix, 3)).toEqual([]);
  });
});

describe('ligneArtistes', () => {
  it('compte la demande et les conflits par artiste', () => {
    const m = new Magasin(modeleDeTest());
    const ix = indexer(m);
    const lignes = ligneArtistes(m, ix);

    expect(lignes).toHaveLength(2);
    const nuitBlanche = lignes.find((l) => l.artiste.Nom === 'Nuit Blanche')!;
    expect(nuitBlanche.demande).toBe(2); // Alice et Chloé
    expect(nuitBlanche.conflits).toBe(1); // seule Alice tient une place qui chevauche

    const sansPublic = lignes.find((l) => l.artiste.Nom === 'Sans public')!;
    expect(sansPublic.demande).toBe(0);
    expect(sansPublic.conflits).toBe(0);
  });

  it('trie les artistes par heure de passage', () => {
    const m = new Magasin(modeleDeTest());
    const ix = indexer(m);
    const lignes = ligneArtistes(m, ix);
    expect(lignes.map((l) => l.artiste.Nom)).toEqual(['Nuit Blanche', 'Sans public']);
  });
});

describe('lignesGroupeesParArtiste', () => {
  it("regroupe les passages d'un même artiste sous une seule ligne (§8.8, demande Antoine 2026-09-22)", () => {
    const modele = modeleDeTest();
    // « Nuit Blanche » joue une seconde fois, plus tard : même nom, ligne
    // Artistes distincte (un passage = une ligne, §6), pas un artiste séparé.
    modele.artistes.push({id: 3, Nom: 'Nuit Blanche', Lieu: 1, Debut: 5000, Fin: 6000});
    const m = new Magasin(modele);
    const ix = indexer(m);
    const groupes = lignesGroupeesParArtiste(m, ix);

    expect(groupes).toHaveLength(2); // « Nuit Blanche » (2 passages) + « Sans public »
    const nuitBlanche = groupes.find((g) => g.nom === 'Nuit Blanche')!;
    expect(nuitBlanche.passages).toHaveLength(2);
    expect(nuitBlanche.passages.map((p) => p.artiste.id)).toEqual([1, 3]); // triés par heure

    const sansPublic = groupes.find((g) => g.nom === 'Sans public')!;
    expect(sansPublic.passages).toHaveLength(1);
  });

  it('un artiste sans aucun passage ne produit aucune ligne (rien à regrouper)', () => {
    const m = new Magasin({...modeleDeTest(), artistes: []});
    const ix = indexer(m);
    expect(lignesGroupeesParArtiste(m, ix)).toEqual([]);
  });
});

describe('regrouperParJourFestival', () => {
  it("garde une soirée qui franchit minuit dans un seul jour de festival (§6.2)", () => {
    // Vendredi 22h et samedi 1h30 (même nuit) contre samedi 8h (déjà un
    // nouveau jour de festival, après la coupure de 6h du matin).
    const vendredi22h = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 22});
    const samedi1h30 = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 1, minutes: 30});
    const samedi8h = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 8});

    const groupes = regrouperParJourFestival(
      [vendredi22h, samedi1h30, samedi8h], (e) => e,
    );

    expect(groupes).toHaveLength(2);
    expect(groupes[0]!.items).toEqual([vendredi22h, samedi1h30]);
    expect(groupes[0]!.libelle).toMatch(/vendredi/i);
    expect(groupes[1]!.items).toEqual([samedi8h]);
    expect(groupes[1]!.libelle).toMatch(/samedi/i);
  });

  it('respecte une heure de coupure personnalisée', () => {
    const samedi3h = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 3});
    // Avec une coupure à 2h, 3h du matin appartient déjà au nouveau jour.
    const groupes = regrouperParJourFestival([samedi3h], (e) => e, 2);
    expect(groupes[0]!.libelle).toMatch(/samedi/i);
  });

  it('trie les groupes chronologiquement, indépendamment de l’ordre d’entrée', () => {
    const jour1 = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const jour2 = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 10});
    const groupes = regrouperParJourFestival([jour2, jour1], (e) => e);
    expect(groupes.map((g) => g.items[0])).toEqual([jour1, jour2]);
  });
});
