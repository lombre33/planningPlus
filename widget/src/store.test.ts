import {describe, expect, it} from 'vitest';
import type {Id} from './domain/types';
import {normaliser} from './donnees/normaliser';
import {Magasin} from './store';

/** Une paire mission/sous-créneau sans besoin existant, pour tester la
 *  création sans dépendre de la position exacte des données de démo. */
function paireLibre(m: Magasin): {missionId: Id; sousCreneauId: Id} {
  for (const mission of m.missions) {
    for (const sc of m.sousCreneaux) {
      if (!m.besoins.some((b) => b.Mission === mission.id && b.Sous_creneau === sc.id)) {
        return {missionId: mission.id, sousCreneauId: sc.id};
      }
    }
  }
  throw new Error('aucune paire mission/sous-créneau libre dans le jeu de données de test');
}

describe('Magasin.creerGroupeSurBesoin', () => {
  it('crée un indicatif de taille 2, ses places vides et sa position sur le besoin visé', () => {
    const m = new Magasin(normaliser());
    const besoin = m.besoins[0]!;
    const nbGroupesAvant = m.groupes.length;
    const nbPlacesAvant = m.places.length;

    const groupeId = m.creerGroupeSurBesoin(besoin.id);

    expect(groupeId).not.toBe(-1);
    expect(m.groupes).toHaveLength(nbGroupesAvant + 1);
    expect(m.places).toHaveLength(nbPlacesAvant + 2);

    const groupe = m.groupes.find((g) => g.id === groupeId)!;
    expect(groupe.Taille).toBe(2);
    expect(groupe.Code).toMatch(/^[A-ZÀ-ÖØ-Þ]{2}\d{2}$/);

    const places = m.places.filter((p) => p.Groupe === groupeId).sort((a, b) => a.Rang - b.Rang);
    expect(places.map((p) => p.Rang)).toEqual([1, 2]);
    expect(places.every((p) => p.Benevole === null)).toBe(true);

    const position = m.positionsGroupe.find((p) => p.Groupe === groupeId);
    expect(position?.Besoin).toBe(besoin.id);
  });

  it("reprend l'équipe de la mission du besoin", () => {
    const m = new Magasin(normaliser());
    const besoin = m.besoins[0]!;
    const mission = m.missions.find((mi) => mi.id === besoin.Mission)!;

    const groupeId = m.creerGroupeSurBesoin(besoin.id);
    const groupe = m.groupes.find((g) => g.id === groupeId)!;

    expect(groupe.Equipe).toBe(mission.Equipe);
  });

  it('renvoie -1 sans rien créer pour un besoin inconnu', () => {
    const m = new Magasin(normaliser());
    const nbGroupesAvant = m.groupes.length;

    const groupeId = m.creerGroupeSurBesoin(-1);

    expect(groupeId).toBe(-1);
    expect(m.groupes).toHaveLength(nbGroupesAvant);
  });

  it('notifie les abonnés du magasin', () => {
    const m = new Magasin(normaliser());
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    m.creerGroupeSurBesoin(m.besoins[0]!.id);

    expect(notifications).toBe(1);
  });
});

describe('Magasin.creerBesoin', () => {
  it('crée le besoin avec un binôme de taille 2 par défaut, positionné dessus (§6.3)', () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);
    const nbBesoinsAvant = m.besoins.length;
    const nbGroupesAvant = m.groupes.length;

    const besoinId = m.creerBesoin(missionId, sousCreneauId);

    expect(m.besoins).toHaveLength(nbBesoinsAvant + 1);
    const besoin = m.besoins.find((b) => b.id === besoinId)!;
    expect(besoin.Mission).toBe(missionId);
    expect(besoin.Sous_creneau).toBe(sousCreneauId);
    expect(besoin.Taille_groupe).toBe(2);
    expect(besoin.Effectif_min).toBe(2);
    expect(besoin.Effectif_max).toBe(2);

    expect(m.groupes).toHaveLength(nbGroupesAvant + 1);
    const position = m.positionsGroupe.find((p) => p.Besoin === besoinId)!;
    expect(position).toBeDefined();
    const groupe = m.groupes.find((g) => g.id === position.Groupe)!;
    expect(groupe.Taille).toBe(2);
    const places = m.places.filter((p) => p.Groupe === groupe.id);
    expect(places).toHaveLength(2);
    expect(places.every((p) => p.Benevole === null)).toBe(true);
  });

  it('respecte une taille de binôme et un minimum personnalisés', () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);

    const besoinId = m.creerBesoin(missionId, sousCreneauId, {tailleGroupe: 3, effectifMin: 3});

    const besoin = m.besoins.find((b) => b.id === besoinId)!;
    expect(besoin.Taille_groupe).toBe(3);
    expect(besoin.Effectif_min).toBe(3);
    expect(besoin.Effectif_max).toBe(3);
    const position = m.positionsGroupe.find((p) => p.Besoin === besoinId)!;
    const groupe = m.groupes.find((g) => g.id === position.Groupe)!;
    expect(groupe.Taille).toBe(3);
  });

  it("relève Effectif_max au minimum demandé s'il dépasse la taille du binôme", () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);

    const besoinId = m.creerBesoin(missionId, sousCreneauId, {tailleGroupe: 2, effectifMin: 4});

    const besoin = m.besoins.find((b) => b.id === besoinId)!;
    expect(besoin.Effectif_min).toBe(4);
    expect(besoin.Effectif_max).toBe(4);
  });

  it('notifie les abonnés une seule fois', () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    m.creerBesoin(missionId, sousCreneauId);

    expect(notifications).toBe(1);
  });
});
