import {describe, expect, it} from 'vitest';
import {
  CLE_COLONNE_CONTACT_BENEVOLES, CLE_COLONNE_NOM_BENEVOLES, CLE_COLONNE_SOUHAITS_ARTISTES,
  CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT, CLE_LIBELLE_TOUT_LE_CRENEAU,
  cleColonneReponseMacroCreneau, colonnesEligibles, colonnesEligiblesTableExterne, type ColonneTable,
  COLONNES_BENEVOLES_CONNUES,
} from './parametres-benevoles';

describe('cleColonneReponseMacroCreneau', () => {
  it('produit une clé distincte par macro-créneau', () => {
    expect(cleColonneReponseMacroCreneau(1)).toBe('benevoles.colonne_reponse_macro.1');
    expect(cleColonneReponseMacroCreneau(2)).toBe('benevoles.colonne_reponse_macro.2');
    expect(cleColonneReponseMacroCreneau(1)).not.toBe(cleColonneReponseMacroCreneau(2));
  });
});

describe('clés fixes', () => {
  it('sont stables (contrat consommé par le store et la vue)', () => {
    expect(CLE_COLONNE_SOUHAITS_ARTISTES).toBe('benevoles.colonne_souhaits_artistes');
    expect(CLE_LIBELLE_TOUT_LE_CRENEAU).toBe('benevoles.libelle_tout_le_creneau');
    expect(CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT).toBe('benevoles.libelle_pas_disponible_du_tout');
  });
});

describe('colonnesEligibles', () => {
  const colonnes: ColonneTable[] = [
    {colId: 'Nom', label: 'Nom', type: 'Text'}, // connue du widget, jamais proposée
    {colId: 'Souhaits_artistes', label: 'Souhaits artistes', type: 'ChoiceList'},
    {colId: 'Dispo_vendredi_soir', label: 'Dispo vendredi soir', type: 'Text'},
    {colId: 'Dispo_samedi', label: 'Dispo samedi', type: 'Choice'},
    {colId: 'Age', label: 'Âge', type: 'Numeric'}, // type non éligible
    {colId: 'Referent', label: 'Référent', type: 'Ref:Benevoles'}, // type non éligible
  ];

  it('exclut les colonnes déjà connues du widget', () => {
    const resultat = colonnesEligibles(colonnes);
    expect(resultat.some((c) => c.colId === 'Nom')).toBe(false);
  });

  it('exclut les types qui ne peuvent pas porter une réponse texte/choix', () => {
    const resultat = colonnesEligibles(colonnes);
    expect(resultat.some((c) => c.colId === 'Age')).toBe(false);
    expect(resultat.some((c) => c.colId === 'Referent')).toBe(false);
  });

  it('garde les colonnes Text/Choice/ChoiceList inconnues', () => {
    const resultat = colonnesEligibles(colonnes).map((c) => c.colId);
    expect(resultat).toEqual(['Souhaits_artistes', 'Dispo_vendredi_soir', 'Dispo_samedi']);
  });

  it('la liste des colonnes connues couvre bien tout Benevole (domain/types.ts)', () => {
    expect(COLONNES_BENEVOLES_CONNUES.has('Nom')).toBe(true);
    expect(COLONNES_BENEVOLES_CONNUES.has('Quota_heures_max')).toBe(true);
  });
});

describe('colonnesEligiblesTableExterne', () => {
  const colonnes: ColonneTable[] = [
    {colId: 'Nom', label: 'Nom', type: 'Text'}, // colonne de la table externe d'Antoine, jamais exclue ici
    {colId: 'Telephone', label: 'Téléphone', type: 'Text'},
    {colId: 'Age', label: 'Âge', type: 'Numeric'}, // type non éligible
    {colId: 'Equipe_preferee', label: 'Équipe préférée', type: 'Ref:Equipes'}, // type non éligible
  ];

  it("ne exclut pas les colonnes portant un nom déjà connu chez nous, contrairement à colonnesEligibles", () => {
    const resultat = colonnesEligiblesTableExterne(colonnes).map((c) => c.colId);
    expect(resultat).toContain('Nom');
    expect(colonnesEligibles(colonnes).some((c) => c.colId === 'Nom')).toBe(false);
  });

  it('exclut quand même les types qui ne peuvent pas porter un nom/téléphone', () => {
    const resultat = colonnesEligiblesTableExterne(colonnes).map((c) => c.colId);
    expect(resultat).toEqual(['Nom', 'Telephone']);
  });
});

describe('clés de peuplement des bénévoles', () => {
  it('sont stables (contrat consommé par le store et la vue)', () => {
    expect(CLE_COLONNE_NOM_BENEVOLES).toBe('benevoles.colonne_nom');
    expect(CLE_COLONNE_CONTACT_BENEVOLES).toBe('benevoles.colonne_contact');
  });
});
