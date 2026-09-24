/**
 * Noms complets lus depuis la table externe d'Antoine (§ demande du
 * 2026-09-24 : il refuse de relancer l'import, lecture seule à
 * l'affichage). Couvre la fonction pure (jointure par `Id_source`, repli
 * par `Nom` protégé contre les homonymes) et l'assemblage async minimal.
 */
import {describe, expect, it} from 'vitest';
import type {Benevole, Modele} from '../domain/types';
import type {EcritureGrist} from '../store';
import {Magasin} from '../store';
import {CLE_COLONNE_NOM_BENEVOLES, CLE_TABLE_BENEVOLES} from './parametres-benevoles';
import {nomsCompletsDepuisSource, nomsCompletsParBenevole} from './noms-complets';

function benevole(id: number, nom: string, idSource: number | null): Benevole {
  return {
    id, Nom: nom, Contact: '', Equipe: 1, Competences: [], Quota_heures_min: 0, Quota_heures_max: 99,
    Statut: 'Actif', Notes: '', Id_source: idSource,
  };
}

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

describe('nomsCompletsParBenevole', () => {
  it('joint par Id_source en priorité, jamais par le nom quand Id_source est connu', () => {
    const benevoles = [benevole(1, 'Marie', 10)];
    const nomComplet = new Map([[10, 'Marie Dupont']]);
    const resultat = nomsCompletsParBenevole(benevoles, nomComplet, null);
    expect(resultat.get(1)).toBe('Marie Dupont');
  });

  it("sans Id_source, se rabat sur une correspondance de Nom — seulement si elle est unique", () => {
    const benevoles = [benevole(1, 'Marie', null)];
    const nomComplet = new Map([[10, 'Marie Dupont']]);
    const nomSource = new Map([[10, 'Marie']]);
    const resultat = nomsCompletsParBenevole(benevoles, nomComplet, nomSource);
    expect(resultat.get(1)).toBe('Marie Dupont');
  });

  it('ne devine jamais entre deux homonymes : aucune correspondance retenue si le Nom apparaît deux fois côté source', () => {
    const benevoles = [benevole(1, 'Marie', null)];
    const nomComplet = new Map([[10, 'Marie Dupont'], [11, 'Marie Curie']]);
    const nomSource = new Map([[10, 'Marie'], [11, 'Marie']]);
    const resultat = nomsCompletsParBenevole(benevoles, nomComplet, nomSource);
    expect(resultat.has(1)).toBe(false);
  });

  it('sans repli disponible (nomParLigneSource null) et sans Id_source, ne trouve rien — jamais une erreur', () => {
    const benevoles = [benevole(1, 'Marie', null)];
    const resultat = nomsCompletsParBenevole(benevoles, new Map([[10, 'Marie Dupont']]), null);
    expect(resultat.size).toBe(0);
  });

  it('Id_source présent mais absent de la table source (ligne supprimée côté Antoine) : bénévole omis du résultat', () => {
    const benevoles = [benevole(1, 'Marie', 999)];
    const resultat = nomsCompletsParBenevole(benevoles, new Map([[10, 'Marie Dupont']]), null);
    expect(resultat.has(1)).toBe(false);
  });
});

describe('nomsCompletsDepuisSource', () => {
  it('sans table de bénévoles désignée, ne lit rien (Map vide)', async () => {
    const m = new Magasin({...modeleVide(), benevoles: [benevole(1, 'Marie', 10)]});
    m.brancherEcriture(ecritureMuette);
    const resultat = await nomsCompletsDepuisSource(m);
    expect(resultat.size).toBe(0);
  });

  it("trouve la colonne par un nom normalisé (« Nom prénom », avec espace et accent) et joint par Id_source", async () => {
    const m = new Magasin(
      {...modeleVide(), benevoles: [benevole(1, 'Marie', 10)]},
      [{cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'}],
    );
    m.brancherEcriture({
      ...ecritureMuette,
      colonnesTable: async (tableId) => (tableId === 'INFOS_BENEVOLES'
        ? [{colId: 'Nom', label: 'Nom', type: 'Text'}, {colId: 'Nom_pr_nom', label: 'Nom prénom', type: 'Text'}]
        : []),
      valeursColonneBrute: async (tableId, colId) => (tableId === 'INFOS_BENEVOLES' && colId === 'Nom_pr_nom'
        ? new Map([[10, 'Marie Dupont']])
        : new Map()),
    });
    const resultat = await nomsCompletsDepuisSource(m);
    expect(resultat.get(1)).toBe('Marie Dupont');
  });

  it("sans colonne « nom complet » sur la table désignée, ne lit rien de plus", async () => {
    const m = new Magasin(
      {...modeleVide(), benevoles: [benevole(1, 'Marie', 10)]},
      [{cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'}],
    );
    m.brancherEcriture({
      ...ecritureMuette,
      colonnesTable: async () => [{colId: 'Nom', label: 'Nom', type: 'Text'}],
    });
    const resultat = await nomsCompletsDepuisSource(m);
    expect(resultat.size).toBe(0);
  });

  it("ne lit la colonne de repli (colonne du nom déjà utilisée au peuplement) que si au moins un bénévole n'a pas d'Id_source", async () => {
    const appelsColonnes: string[] = [];
    const m = new Magasin(
      {...modeleVide(), benevoles: [benevole(1, 'Marie', 10)]},
      [{cle: CLE_TABLE_BENEVOLES, valeur: 'INFOS_BENEVOLES'}, {cle: CLE_COLONNE_NOM_BENEVOLES, valeur: 'Nom'}],
    );
    m.brancherEcriture({
      ...ecritureMuette,
      colonnesTable: async () => [{colId: 'Nom_prenom', label: 'Nom_prenom', type: 'Text'}],
      valeursColonneBrute: async (_tableId, colId) => {
        appelsColonnes.push(colId);
        return colId === 'Nom_prenom' ? new Map([[10, 'Marie Dupont']]) : new Map();
      },
    });
    await nomsCompletsDepuisSource(m);
    expect(appelsColonnes).toEqual(['Nom_prenom']);
  });
});
