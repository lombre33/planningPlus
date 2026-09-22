import {describe, expect, it} from 'vitest';
import {cleJourFestival, epochJourFestivalEtHeure} from './temps';

/**
 * `epochJourFestivalEtHeure` répare le décalage d'un jour constaté par
 * Antoine le 2026-09-22 : un début saisi « jeudi 00h30 » se calculait
 * littéralement jeudi 00h30, un instant que `cleJourFestival` (heure de
 * coupure 6h) range dans le jour de festival mercredi. Chaque test qui
 * vérifie `cleJourFestival(résultat) === jourISO` reproduit exactement ce
 * qu'Antoine constatait à l'écran : le jour affiché doit correspondre au
 * jour saisi.
 */
describe('epochJourFestivalEtHeure', () => {
  it("une heure avant la coupure (00h30) bascule sur le jour suivant — le bug d'Antoine, corrigé", () => {
    const jeudi = '2026-07-16';
    const resultat = epochJourFestivalEtHeure(jeudi, '00:30');
    expect(resultat).not.toBeNull();
    expect(cleJourFestival(resultat!)).toBe(jeudi);
  });

  it("une heure après la coupure (14h00) reste sur le jour saisi, sans décalage", () => {
    const jeudi = '2026-07-16';
    const resultat = epochJourFestivalEtHeure(jeudi, '14:00');
    expect(cleJourFestival(resultat!)).toBe(jeudi);
  });

  it("une heure pile à la coupure (06h00) reste sur le jour saisi (la coupure elle-même n'est pas « avant »)", () => {
    const jeudi = '2026-07-16';
    const resultat = epochJourFestivalEtHeure(jeudi, '06:00');
    expect(cleJourFestival(resultat!)).toBe(jeudi);
  });

  it("apresMinuitForce force le jour suivant même au-delà de la coupure (nuit blanche finissant à 10h)", () => {
    const jeudi = '2026-07-16';
    const sansForcage = epochJourFestivalEtHeure(jeudi, '10:00');
    const avecForcage = epochJourFestivalEtHeure(jeudi, '10:00', true);
    expect(cleJourFestival(sansForcage!)).toBe(jeudi);
    expect(cleJourFestival(avecForcage!)).not.toBe(jeudi);
    expect(avecForcage).toBeGreaterThan(sansForcage!);
    expect(Math.round((avecForcage! - sansForcage!) / 3600)).toBe(24);
  });

  it('apresMinuitForce sur une heure déjà avant la coupure ne double pas le décalage', () => {
    const jeudi = '2026-07-16';
    const sansForcage = epochJourFestivalEtHeure(jeudi, '00:30');
    const avecForcage = epochJourFestivalEtHeure(jeudi, '00:30', true);
    expect(avecForcage).toBe(sansForcage);
  });

  it('respecte une heure de coupure personnalisée', () => {
    const jeudi = '2026-07-16';
    // Coupure à 8h : 7h est avant, 9h est après.
    expect(cleJourFestival(epochJourFestivalEtHeure(jeudi, '07:00', false, 8)!, 8)).toBe(jeudi);
    expect(cleJourFestival(epochJourFestivalEtHeure(jeudi, '09:00', false, 8)!, 8)).toBe(jeudi);
  });

  it('franchit un changement de mois sans erreur (31 juillet → 1er août)', () => {
    const jour = '2026-07-31';
    const resultat = epochJourFestivalEtHeure(jour, '01:00');
    expect(cleJourFestival(resultat!)).toBe(jour);
  });

  it("franchit un changement d'année sans erreur (31 décembre → 1er janvier)", () => {
    const jour = '2026-12-31';
    const resultat = epochJourFestivalEtHeure(jour, '01:00');
    expect(cleJourFestival(resultat!)).toBe(jour);
  });

  it('renvoie null pour une heure invalide, sans lever', () => {
    expect(epochJourFestivalEtHeure('2026-07-16', 'pas une heure')).toBeNull();
  });
});
