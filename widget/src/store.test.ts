import {describe, expect, it} from 'vitest';
import type {Id} from './domain/types';
import {normaliser} from './donnees/normaliser';
import {Magasin} from './store';
import {epochDepuisHeureLocale} from './temps';

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

describe('Magasin.creerMission', () => {
  function missionDeTest(m: Magasin) {
    return {
      Nom: 'Nouvelle mission de test', Description: '', Lieu: m.lieux[0]!.id,
      Equipe: m.equipes[0]!.id, Priorite: 'Normale' as const, Competences_requises: [],
    };
  }

  it("sans écrivain branché (mode démo), génère un id local et l'ajoute au référentiel", async () => {
    const m = new Magasin(normaliser());
    const nbMissionsAvant = m.missions.length;

    const id = await m.creerMission(missionDeTest(m));

    expect(m.missions).toHaveLength(nbMissionsAvant + 1);
    const mission = m.missions.find((mi) => mi.id === id)!;
    expect(mission.Nom).toBe('Nouvelle mission de test');
  });

  it("avec une écriture branchée (mode connecté), attend l'id qu'elle rend avant d'insérer localement", async () => {
    const m = new Magasin(normaliser());
    const appels: unknown[] = [];
    m.brancherEcriture({
      creerMission: async (patch) => {
        appels.push(patch);
        return 999;
      },
    });

    const id = await m.creerMission(missionDeTest(m));

    expect(id).toBe(999);
    expect(appels).toHaveLength(1);
    expect(m.missions.find((mi) => mi.id === 999)?.Nom).toBe('Nouvelle mission de test');
  });

  it("ne crée rien localement si l'écriture branchée échoue", async () => {
    const m = new Magasin(normaliser());
    const nbMissionsAvant = m.missions.length;
    m.brancherEcriture({creerMission: async () => { throw new Error('document indisponible'); }});

    await expect(m.creerMission(missionDeTest(m))).rejects.toThrow('document indisponible');
    expect(m.missions).toHaveLength(nbMissionsAvant);
  });

  it('notifie les abonnés une seule fois', async () => {
    const m = new Magasin(normaliser());
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    await m.creerMission(missionDeTest(m));

    expect(notifications).toBe(1);
  });
});

describe('Magasin.redecouperSousCreneaux', () => {
  function modeleUnMacro(): {m: Magasin; macroId: Id; debut: number; fin: number} {
    const debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12});
    const m = new Magasin({
      equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
      macroCreneaux: [{id: 1, Nom: 'Journée', Debut: debut, Fin: fin}],
      sousCreneaux: [], besoins: [], groupes: [], positionsGroupe: [], places: [],
      disponibilites: [], souhaitsMissions: [], affinites: [],
    });
    return {m, macroId: 1, debut, fin};
  }

  it('découpe toute la plage du macro-créneau par pas de la durée demandée', () => {
    const {m, macroId, debut, fin} = modeleUnMacro();

    const resultat = m.redecouperSousCreneaux(macroId, 60);

    expect(resultat).toEqual({ok: true});
    expect(m.sousCreneaux).toHaveLength(2);
    const [premier, second] = [...m.sousCreneaux].sort((a, b) => a.Debut - b.Debut);
    expect(premier!.Debut).toBe(debut);
    expect(premier!.Fin).toBe(debut + 3600);
    expect(second!.Debut).toBe(debut + 3600);
    expect(second!.Fin).toBe(fin);
  });

  it('remplace les sous-créneaux existants plutôt que de les cumuler', () => {
    const {m, macroId} = modeleUnMacro();
    m.redecouperSousCreneaux(macroId, 60);
    expect(m.sousCreneaux).toHaveLength(2);

    m.redecouperSousCreneaux(macroId, 120);

    expect(m.sousCreneaux).toHaveLength(1);
  });

  it('refuse et ne change rien si un sous-créneau porte déjà une mission (Besoin)', () => {
    const {m, macroId} = modeleUnMacro();
    m.redecouperSousCreneaux(macroId, 60);
    const sousCreneauId = m.sousCreneaux[0]!.id;
    m.creerBesoin(1, sousCreneauId);
    const avant = m.sousCreneaux;

    const resultat = m.redecouperSousCreneaux(macroId, 120);

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) { expect(resultat.raison).toMatch(/déjà rattachées/); }
    expect(m.sousCreneaux).toBe(avant);
  });

  it('renvoie une erreur pour un macro-créneau introuvable', () => {
    const {m} = modeleUnMacro();

    const resultat = m.redecouperSousCreneaux(999, 60);

    expect(resultat.ok).toBe(false);
  });

  it('notifie les abonnés une seule fois en cas de succès', () => {
    const {m, macroId} = modeleUnMacro();
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    m.redecouperSousCreneaux(macroId, 60);

    expect(notifications).toBe(1);
  });
});
