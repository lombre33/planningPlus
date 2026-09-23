import {describe, expect, it} from 'vitest';
import {idsReelsDeTest, LIBELLE_PAR_TABLE, resoudreIdsTables} from './tables';

describe('resoudreIdsTables', () => {
  it('résout un identifiant réel identique à l\'identifiant de schéma', () => {
    expect(resoudreIdsTables(['Groupes', 'Places'])).toMatchObject({Groupes: 'Groupes', Places: 'Places'});
  });

  it('résout un identifiant réel dérivé du titre, différent du schéma (Positions_groupe -> Positions_de_groupe)', () => {
    expect(resoudreIdsTables(['Positions_de_groupe'])).toEqual({Positions_groupe: 'Positions_de_groupe'});
  });

  it('résout Souhaits_missions -> Souhaits_de_mission, vu empiriquement sur le document de test', () => {
    expect(resoudreIdsTables(['Souhaits_de_mission'])).toEqual({Souhaits_missions: 'Souhaits_de_mission'});
  });

  it('tolère les accents de l\'identifiant réel (Équipes vs Equipes)', () => {
    expect(resoudreIdsTables(['Equipes'])).toEqual({Equipes: 'Equipes'});
  });

  it('omet une table canonique absente du document plutôt que de lever', () => {
    expect(resoudreIdsTables(['Groupes'])).toEqual({Groupes: 'Groupes'});
  });

  it('ignore une table réelle qui ne correspond à aucune table canonique', () => {
    expect(resoudreIdsTables(['Table1', 'Groupes'])).toEqual({Groupes: 'Groupes'});
  });

  it('une table étrangère qui normalise comme la nôtre ne la remplace jamais : l\'identifiant de schéma exact gagne toujours (régression corrigée le 2026-09-23, prouvée sur instance réelle)', () => {
    // "Bene_voles" est un identifiant réel que Grist n'a pas jugé assez
    // proche de "Benevoles" pour le suffixer à la création, mais qui
    // normalise identiquement (ponctuation retirée) — vérifié empiriquement
    // sur une vraie instance Grist ce soir.
    expect(resoudreIdsTables(['Benevoles', 'Bene_voles'])).toMatchObject({Benevoles: 'Benevoles'});
    // Et dans l'autre ordre, pour prouver que ce n'est plus « le dernier
    // rencontré gagne » (le défaut avant correctif).
    expect(resoudreIdsTables(['Bene_voles', 'Benevoles'])).toMatchObject({Benevoles: 'Benevoles'});
  });

  it('sans identifiant de schéma exact, deux candidats qui normalisent pareil restent tous deux ignorés plutôt que d\'en deviner un', () => {
    // Ni "Bene_voles" ni "Bene-voles" n'est l'identifiant de schéma exact
    // ("Benevoles") : aucun ne doit gagner par hasard.
    expect(resoudreIdsTables(['Bene_voles', 'Bene-voles'])).not.toHaveProperty('Benevoles');
  });
});

describe('idsReelsDeTest', () => {
  it('résout, une fois passé à resoudreIdsTables, toutes les tables canoniques (document complet)', () => {
    expect(resoudreIdsTables(idsReelsDeTest())).toEqual(
      Object.fromEntries(Object.keys(LIBELLE_PAR_TABLE).map((c) => [c, expect.any(String)])),
    );
  });

  it('résout précisément les tables dont le libellé a fait dériver un identifiant différent du schéma', () => {
    const resolues = resoudreIdsTables(idsReelsDeTest());
    expect(resolues.Positions_groupe).toBe(LIBELLE_PAR_TABLE.Positions_groupe);
    expect(resolues.Souhaits_missions).toBe(LIBELLE_PAR_TABLE.Souhaits_missions);
  });

  it('omet une table canonique du résultat, pour simuler un document à qui elle manque', () => {
    const idsReels = idsReelsDeTest(['Macro_creneaux']);
    expect(idsReels).not.toContain(LIBELLE_PAR_TABLE.Macro_creneaux);
    expect(resoudreIdsTables(idsReels)).not.toHaveProperty('Macro_creneaux');
    expect(resoudreIdsTables(idsReels)).toHaveProperty('Equipes');
  });
});
