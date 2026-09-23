import {describe, expect, it} from 'vitest';
import {normaliser} from '../donnees/normaliser';
import {versDonneesPlanning} from '../moteur/adaptateur-magasin';
import {Magasin} from '../store';
import {lancerAlgorithme} from './moteur-pont';

describe('versDonneesPlanning', () => {
  it('convertit chaque table du Magasin vers le vocabulaire du moteur, sans perte de volumétrie', () => {
    const m = new Magasin(normaliser());
    const donnees = versDonneesPlanning(m);

    expect(donnees.benevoles).toHaveLength(m.benevoles.length);
    expect(donnees.missions).toHaveLength(m.missions.length);
    expect(donnees.sousCreneaux).toHaveLength(m.sousCreneaux.length);
    expect(donnees.besoins).toHaveLength(m.besoins.length);
    expect(donnees.groupes).toHaveLength(m.groupes.length);
    expect(donnees.positionsGroupe).toHaveLength(m.positionsGroupe.length);
    expect(donnees.places).toHaveLength(m.places.length);
    expect(donnees.disponibilites).toHaveLength(m.disponibilites.length);
    expect(donnees.souhaitsMissions).toHaveLength(m.souhaitsMissions.length);
    // Priorité 3 d'Antoine (2026-09-23, binôme souhaité) : câblé pour de vrai
    // depuis `moteur/adaptateur-magasin.ts`, plus jamais vide par principe.
    expect(donnees.affinites).toHaveLength(m.affinites.length);

    const benevole = m.benevoles[0]!;
    const converti = donnees.benevoles.find((b) => b.id === benevole.id)!;
    expect(converti.nom).toBe(benevole.Nom);
    expect(converti.equipeId).toBe(benevole.Equipe);
    expect(converti.statut).toBe(benevole.Statut);
  });
});

describe('lancerAlgorithme', () => {
  it('remplit des places et les écrit dans le Magasin réel (notifie les abonnés)', async () => {
    const m = new Magasin(normaliser());
    let notifications = 0;
    m.subscribe(() => { notifications++; });

    const resume = await lancerAlgorithme(m);

    expect(resume.echecEcriture).toBeUndefined();
    expect(notifications).toBeGreaterThan(0);
    expect(resume.placesTraitees).toBeGreaterThan(0);
    expect(resume.placesRemplies).toBeGreaterThan(0);
    expect(resume.placesRemplies).toBeLessThanOrEqual(resume.placesTraitees);

    const placeAffectee = m.places.find((p) => p.Benevole != null)!;
    expect(placeAffectee.Origine).toBe('Algorithme');
    expect(placeAffectee.Verrouillee).toBe(false);
  });

  it("ne touche jamais une place déjà verrouillée manuellement", async () => {
    const m = new Magasin(normaliser());
    const place = m.places.find((p) => p.Benevole != null) ?? m.places[0]!;
    await m.assignerPlace(place.id, m.benevoles[0]!.id, 'Manuel');
    const benevoleVerrouille = place.Benevole;
    expect(place.Verrouillee).toBe(true);

    await lancerAlgorithme(m);

    const placeApres = m.places.find((p) => p.id === place.id)!;
    expect(placeApres.Benevole).toBe(benevoleVerrouille);
    expect(placeApres.Verrouillee).toBe(true);
  });

  it('est déterministe : deux lancements sur le même état de départ donnent le même résultat', async () => {
    const m1 = new Magasin(normaliser());
    const m2 = new Magasin(normaliser());
    const r1 = await lancerAlgorithme(m1);
    const r2 = await lancerAlgorithme(m2);
    expect(r1.placesRemplies).toBe(r2.placesRemplies);
    expect(m1.places.map((p) => p.Benevole)).toEqual(m2.places.map((p) => p.Benevole));
  });
});
