import {describe, expect, it} from 'vitest';
import type {Id} from './domain/types';
import {normaliser} from './donnees/normaliser';
import {type EcritureGrist, Magasin} from './store';
import {epochDepuisHeureLocale} from './temps';

/** Une écriture Grist de test qui rejette tout par défaut (chaque méthode
 *  doit être explicitement fournie pour un test qui l'exerce) — évite
 *  qu'un test sur une méthode du pont en exerce une autre sans s'en rendre
 *  compte. */
function ecritureDeTest(partielle: Partial<EcritureGrist> = {}): EcritureGrist {
  const nonBranchee = (nom: string) => async () => { throw new Error(`${nom} non fourni par ce double de test`); };
  return {
    creerMission: nonBranchee('creerMission'),
    creerMacroCreneau: nonBranchee('creerMacroCreneau'),
    modifierMacroCreneau: nonBranchee('modifierMacroCreneau'),
    remplacerSousCreneaux: nonBranchee('remplacerSousCreneaux'),
    creerBesoin: nonBranchee('creerBesoin'),
    creerGroupe: nonBranchee('creerGroupe'),
    positionnerGroupe: nonBranchee('positionnerGroupe'),
    definirPlaces: nonBranchee('definirPlaces'),
    deplacerPosition: nonBranchee('deplacerPosition'),
    ajouterPosition: nonBranchee('ajouterPosition'),
    ...partielle,
  };
}

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
  it('crée un indicatif de taille 2, ses places vides et sa position sur le besoin visé', async () => {
    const m = new Magasin(normaliser());
    const besoin = m.besoins[0]!;
    const nbGroupesAvant = m.groupes.length;
    const nbPlacesAvant = m.places.length;

    const groupeId = await m.creerGroupeSurBesoin(besoin.id);

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

  it("reprend l'équipe de la mission du besoin", async () => {
    const m = new Magasin(normaliser());
    const besoin = m.besoins[0]!;
    const mission = m.missions.find((mi) => mi.id === besoin.Mission)!;

    const groupeId = await m.creerGroupeSurBesoin(besoin.id);
    const groupe = m.groupes.find((g) => g.id === groupeId)!;

    expect(groupe.Equipe).toBe(mission.Equipe);
  });

  it('renvoie -1 sans rien créer pour un besoin inconnu', async () => {
    const m = new Magasin(normaliser());
    const nbGroupesAvant = m.groupes.length;

    const groupeId = await m.creerGroupeSurBesoin(-1);

    expect(groupeId).toBe(-1);
    expect(m.groupes).toHaveLength(nbGroupesAvant);
  });

  it('notifie les abonnés du magasin', async () => {
    const m = new Magasin(normaliser());
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    await m.creerGroupeSurBesoin(m.besoins[0]!.id);

    expect(notifications).toBe(1);
  });

  it('en mode connecté, enchaîne creerGroupe, positionnerGroupe puis definirPlaces, dans cet ordre, et utilise les ids réels rendus', async () => {
    const m = new Magasin(normaliser());
    const besoin = m.besoins[0]!;
    const appels: string[] = [];
    m.brancherEcriture(ecritureDeTest({
      creerGroupe: async (groupe) => { appels.push(`creerGroupe(${groupe.code},${groupe.taille},${groupe.equipeId})`); return 501; },
      positionnerGroupe: async (groupeId, besoinId) => { appels.push(`positionnerGroupe(${groupeId},${besoinId})`); },
      definirPlaces: async (groupeId, taille) => { appels.push(`definirPlaces(${groupeId},${taille})`); },
    }));

    const groupeId = await m.creerGroupeSurBesoin(besoin.id);

    expect(groupeId).toBe(501);
    expect(m.groupes.find((g) => g.id === 501)).toBeDefined();
    expect(m.places.filter((p) => p.Groupe === 501)).toHaveLength(2);
    expect(appels).toEqual([
      `creerGroupe(${m.groupes.find((g) => g.id === 501)!.Code},2,${m.groupes.find((g) => g.id === 501)!.Equipe})`,
      `positionnerGroupe(501,${besoin.id})`,
      `definirPlaces(501,2)`,
    ]);
  });

  it('en mode connecté, si creerGroupe échoue, rien n’est créé localement (aucun groupe, aucune place, aucune position)', async () => {
    const m = new Magasin(normaliser());
    const besoin = m.besoins[0]!;
    const nbGroupesAvant = m.groupes.length;
    const nbPlacesAvant = m.places.length;
    const nbPositionsAvant = m.positionsGroupe.length;
    m.brancherEcriture(ecritureDeTest({creerGroupe: async () => { throw new Error('document indisponible'); }}));

    await expect(m.creerGroupeSurBesoin(besoin.id)).rejects.toThrow('document indisponible');

    expect(m.groupes).toHaveLength(nbGroupesAvant);
    expect(m.places).toHaveLength(nbPlacesAvant);
    expect(m.positionsGroupe).toHaveLength(nbPositionsAvant);
  });
});

describe('Magasin.creerBesoin', () => {
  it('crée le besoin avec un binôme de taille 2 par défaut, positionné dessus (§6.3)', async () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);
    const nbBesoinsAvant = m.besoins.length;
    const nbGroupesAvant = m.groupes.length;

    const besoinId = await m.creerBesoin(missionId, sousCreneauId);

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

  it('respecte une taille de binôme et un minimum personnalisés', async () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);

    const besoinId = await m.creerBesoin(missionId, sousCreneauId, {tailleGroupe: 3, effectifMin: 3});

    const besoin = m.besoins.find((b) => b.id === besoinId)!;
    expect(besoin.Taille_groupe).toBe(3);
    expect(besoin.Effectif_min).toBe(3);
    expect(besoin.Effectif_max).toBe(3);
    const position = m.positionsGroupe.find((p) => p.Besoin === besoinId)!;
    const groupe = m.groupes.find((g) => g.id === position.Groupe)!;
    expect(groupe.Taille).toBe(3);
  });

  it("relève Effectif_max au minimum demandé s'il dépasse la taille du binôme", async () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);

    const besoinId = await m.creerBesoin(missionId, sousCreneauId, {tailleGroupe: 2, effectifMin: 4});

    const besoin = m.besoins.find((b) => b.id === besoinId)!;
    expect(besoin.Effectif_min).toBe(4);
    expect(besoin.Effectif_max).toBe(4);
  });

  it('notifie les abonnés une seule fois', async () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    await m.creerBesoin(missionId, sousCreneauId);

    expect(notifications).toBe(1);
  });

  it('en mode connecté, attend l’id du besoin rendu par le pont, puis enchaîne le pont du binôme avec cet id', async () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);
    const mission = m.missions.find((mi) => mi.id === missionId)!;
    const appels: string[] = [];
    m.brancherEcriture(ecritureDeTest({
      creerBesoin: async (besoin) => {
        appels.push(`creerBesoin(${besoin.missionId},${besoin.sousCreneauId},${besoin.effectifMin},${besoin.effectifMax},${besoin.tailleGroupe})`);
        return 701;
      },
      creerGroupe: async (groupe) => {
        appels.push(`creerGroupe(${groupe.taille},${groupe.equipeId})`);
        return 702;
      },
      positionnerGroupe: async (groupeId, besoinId) => { appels.push(`positionnerGroupe(${groupeId},${besoinId})`); },
      definirPlaces: async (groupeId, taille) => { appels.push(`definirPlaces(${groupeId},${taille})`); },
    }));

    const besoinId = await m.creerBesoin(missionId, sousCreneauId);

    expect(besoinId).toBe(701);
    expect(m.besoins.find((b) => b.id === 701)).toBeDefined();
    expect(m.groupes.find((g) => g.id === 702)).toBeDefined();
    expect(m.places.filter((p) => p.Groupe === 702)).toHaveLength(2);
    expect(appels).toEqual([
      `creerBesoin(${missionId},${sousCreneauId},2,2,2)`,
      `creerGroupe(2,${mission.Equipe})`,
      `positionnerGroupe(702,701)`,
      `definirPlaces(702,2)`,
    ]);
  });

  it('en mode connecté, si creerBesoin échoue, rien n’est créé localement (aucun besoin, aucun groupe)', async () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);
    const nbBesoinsAvant = m.besoins.length;
    const nbGroupesAvant = m.groupes.length;
    m.brancherEcriture(ecritureDeTest({creerBesoin: async () => { throw new Error('document indisponible'); }}));

    await expect(m.creerBesoin(missionId, sousCreneauId)).rejects.toThrow('document indisponible');

    expect(m.besoins).toHaveLength(nbBesoinsAvant);
    expect(m.groupes).toHaveLength(nbGroupesAvant);
  });

  it('en mode connecté, si le pont du binôme échoue après la création du besoin, le besoin reste créé localement (Grist l’a déjà, aucun retrait compensatoire)', async () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);
    const nbGroupesAvant = m.groupes.length;
    m.brancherEcriture(ecritureDeTest({
      creerBesoin: async () => 701,
      creerGroupe: async () => { throw new Error('document indisponible'); },
    }));

    await expect(m.creerBesoin(missionId, sousCreneauId)).rejects.toThrow('document indisponible');

    expect(m.besoins.find((b) => b.id === 701)).toBeDefined();
    expect(m.groupes).toHaveLength(nbGroupesAvant);
  });
});

describe('Magasin.deplacerPosition', () => {
  it('en mode connecté, appelle le pont puis met à jour la position localement', async () => {
    const m = new Magasin(normaliser());
    const groupeId = await m.creerGroupeSurBesoin(m.besoins[0]!.id);
    const position = m.positionsGroupe.find((p) => p.Groupe === groupeId)!;
    const autreBesoin = m.besoins[1]!;
    const appels: string[] = [];
    m.brancherEcriture(ecritureDeTest({
      deplacerPosition: async (positionId, nouveauBesoinId) => { appels.push(`deplacerPosition(${positionId},${nouveauBesoinId})`); },
    }));

    await m.deplacerPosition(position.id, autreBesoin.id);

    expect(appels).toEqual([`deplacerPosition(${position.id},${autreBesoin.id})`]);
    expect(m.positionsGroupe.find((p) => p.id === position.id)?.Besoin).toBe(autreBesoin.id);
  });

  it('en mode connecté, si le pont échoue, la position garde son besoin d’origine', async () => {
    const m = new Magasin(normaliser());
    const groupeId = await m.creerGroupeSurBesoin(m.besoins[0]!.id);
    const position = m.positionsGroupe.find((p) => p.Groupe === groupeId)!;
    const besoinOrigine = position.Besoin;
    m.brancherEcriture(ecritureDeTest({deplacerPosition: async () => { throw new Error('document indisponible'); }}));

    await expect(m.deplacerPosition(position.id, m.besoins[1]!.id)).rejects.toThrow('document indisponible');

    expect(m.positionsGroupe.find((p) => p.id === position.id)?.Besoin).toBe(besoinOrigine);
  });

  it('ne fait rien pour une position inconnue (le pont n’est pas appelé)', async () => {
    const m = new Magasin(normaliser());
    let appele = false;
    m.brancherEcriture(ecritureDeTest({deplacerPosition: async () => { appele = true; }}));

    await m.deplacerPosition(-1, m.besoins[0]!.id);

    expect(appele).toBe(false);
  });
});

describe('Magasin.ajouterPosition', () => {
  it('en mode connecté, attend l’id rendu par le pont avant d’ajouter la position localement', async () => {
    const m = new Magasin(normaliser());
    const groupeId = await m.creerGroupeSurBesoin(m.besoins[0]!.id);
    const autreBesoin = m.besoins[1]!;
    const appels: string[] = [];
    m.brancherEcriture(ecritureDeTest({
      ajouterPosition: async (g, besoinId) => { appels.push(`ajouterPosition(${g},${besoinId})`); return 801; },
    }));

    const positionId = await m.ajouterPosition(groupeId, autreBesoin.id);

    expect(positionId).toBe(801);
    expect(appels).toEqual([`ajouterPosition(${groupeId},${autreBesoin.id})`]);
    expect(m.positionsGroupe.find((p) => p.id === 801)).toEqual({id: 801, Groupe: groupeId, Besoin: autreBesoin.id});
  });

  it('en mode connecté, si le pont échoue, aucune position n’est ajoutée localement', async () => {
    const m = new Magasin(normaliser());
    const groupeId = await m.creerGroupeSurBesoin(m.besoins[0]!.id);
    const nbPositionsAvant = m.positionsGroupe.length;
    m.brancherEcriture(ecritureDeTest({ajouterPosition: async () => { throw new Error('document indisponible'); }}));

    await expect(m.ajouterPosition(groupeId, m.besoins[1]!.id)).rejects.toThrow('document indisponible');

    expect(m.positionsGroupe).toHaveLength(nbPositionsAvant);
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
    m.brancherEcriture(ecritureDeTest({
      creerMission: async (patch) => {
        appels.push(patch);
        return 999;
      },
    }));

    const id = await m.creerMission(missionDeTest(m));

    expect(id).toBe(999);
    expect(appels).toHaveLength(1);
    expect(m.missions.find((mi) => mi.id === 999)?.Nom).toBe('Nouvelle mission de test');
  });

  it("ne crée rien localement si l'écriture branchée échoue", async () => {
    const m = new Magasin(normaliser());
    const nbMissionsAvant = m.missions.length;
    m.brancherEcriture(ecritureDeTest({creerMission: async () => { throw new Error('document indisponible'); }}));

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

  it('découpe toute la plage du macro-créneau par pas de la durée demandée', async () => {
    const {m, macroId, debut, fin} = modeleUnMacro();

    const resultat = await m.redecouperSousCreneaux(macroId, 60);

    expect(resultat).toEqual({ok: true});
    expect(m.sousCreneaux).toHaveLength(2);
    const [premier, second] = [...m.sousCreneaux].sort((a, b) => a.Debut - b.Debut);
    expect(premier!.Debut).toBe(debut);
    expect(premier!.Fin).toBe(debut + 3600);
    expect(second!.Debut).toBe(debut + 3600);
    expect(second!.Fin).toBe(fin);
  });

  it('remplace les sous-créneaux existants plutôt que de les cumuler', async () => {
    const {m, macroId} = modeleUnMacro();
    await m.redecouperSousCreneaux(macroId, 60);
    expect(m.sousCreneaux).toHaveLength(2);

    await m.redecouperSousCreneaux(macroId, 120);

    expect(m.sousCreneaux).toHaveLength(1);
  });

  it('refuse et ne change rien si un sous-créneau porte déjà une mission (Besoin)', async () => {
    const {m, macroId} = modeleUnMacro();
    await m.redecouperSousCreneaux(macroId, 60);
    const sousCreneauId = m.sousCreneaux[0]!.id;
    await m.creerBesoin(1, sousCreneauId);
    const avant = m.sousCreneaux;

    const resultat = await m.redecouperSousCreneaux(macroId, 120);

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) { expect(resultat.raison).toMatch(/déjà rattachées/); }
    expect(m.sousCreneaux).toBe(avant);
  });

  it('renvoie une erreur pour un macro-créneau introuvable', async () => {
    const {m} = modeleUnMacro();

    const resultat = await m.redecouperSousCreneaux(999, 60);

    expect(resultat.ok).toBe(false);
  });

  it('notifie les abonnés une seule fois en cas de succès', async () => {
    const {m, macroId} = modeleUnMacro();
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    await m.redecouperSousCreneaux(macroId, 60);

    expect(notifications).toBe(1);
  });

  it("en mode connecté, attend les ids réels avant d'insérer localement, en deux allers-retours liés", async () => {
    const {m, macroId} = modeleUnMacro();
    const appels: string[] = [];
    m.brancherEcriture(ecritureDeTest({
      remplacerSousCreneaux: async (idsASupprimer, nouveaux) => {
        appels.push(`remplacerSousCreneaux(${JSON.stringify(idsASupprimer)},${nouveaux.length})`);
        return nouveaux.map((_, i) => 701 + i);
      },
    }));

    const resultat = await m.redecouperSousCreneaux(macroId, 60);

    expect(resultat).toEqual({ok: true});
    expect(appels).toEqual(['remplacerSousCreneaux([],2)']);
    const ids = m.sousCreneaux.map((s) => s.id).sort((a, b) => a - b);
    expect(ids).toEqual([701, 702]);
  });

  it("en mode connecté, si le pont échoue, aucun sous-créneau n'est modifié localement", async () => {
    const {m, macroId} = modeleUnMacro();
    const avant = m.sousCreneaux;
    m.brancherEcriture(ecritureDeTest({remplacerSousCreneaux: async () => { throw new Error('document indisponible'); }}));

    const resultat = await m.redecouperSousCreneaux(macroId, 60);

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) { expect(resultat.raison).toMatch(/Échec de l.écriture/); }
    expect(m.sousCreneaux).toBe(avant);
  });
});

describe('Magasin.enregistrerMacroCreneau', () => {
  function macroDeTest() {
    return {
      Nom: 'Nouvelle journée',
      Debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 9}),
      Fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 17}),
    };
  }

  it("sans écrivain branché (mode démo), génère un id local et l'ajoute au référentiel", async () => {
    const m = new Magasin(normaliser());
    const nbAvant = m.macroCreneaux.length;

    const id = await m.enregistrerMacroCreneau(macroDeTest());

    expect(m.macroCreneaux).toHaveLength(nbAvant + 1);
    expect(m.macroCreneaux.find((mc) => mc.id === id)?.Nom).toBe('Nouvelle journée');
  });

  it("à la création, avec une écriture branchée, attend l'id qu'elle rend avant d'insérer localement", async () => {
    const m = new Magasin(normaliser());
    const appels: unknown[] = [];
    m.brancherEcriture(ecritureDeTest({
      creerMacroCreneau: async (macro) => { appels.push(macro); return 999; },
    }));

    const id = await m.enregistrerMacroCreneau(macroDeTest());

    expect(id).toBe(999);
    expect(appels).toHaveLength(1);
    expect(m.macroCreneaux.find((mc) => mc.id === 999)?.Nom).toBe('Nouvelle journée');
  });

  it("ne crée rien localement si l'écriture branchée échoue à la création", async () => {
    const m = new Magasin(normaliser());
    const nbAvant = m.macroCreneaux.length;
    m.brancherEcriture(ecritureDeTest({creerMacroCreneau: async () => { throw new Error('document indisponible'); }}));

    await expect(m.enregistrerMacroCreneau(macroDeTest())).rejects.toThrow('document indisponible');
    expect(m.macroCreneaux).toHaveLength(nbAvant);
  });

  it("à la modification, avec une écriture branchée, attend la confirmation avant de modifier localement", async () => {
    const m = new Magasin(normaliser());
    const macroId = m.macroCreneaux[0]!.id;
    const appels: unknown[] = [];
    m.brancherEcriture(ecritureDeTest({
      modifierMacroCreneau: async (id, macro) => { appels.push({id, macro}); },
    }));

    const patch = {...macroDeTest(), id: macroId};
    const id = await m.enregistrerMacroCreneau(patch);

    expect(id).toBe(macroId);
    const attendu = macroDeTest();
    expect(appels).toEqual([{id: macroId, macro: {nom: attendu.Nom, debut: attendu.Debut, fin: attendu.Fin}}]);
    expect(m.macroCreneaux.find((mc) => mc.id === macroId)?.Nom).toBe('Nouvelle journée');
  });

  it("ne modifie rien localement si l'écriture branchée échoue à la modification", async () => {
    const m = new Magasin(normaliser());
    const macroId = m.macroCreneaux[0]!.id;
    const avant = m.macroCreneaux.find((mc) => mc.id === macroId)!;
    m.brancherEcriture(ecritureDeTest({modifierMacroCreneau: async () => { throw new Error('document indisponible'); }}));

    await expect(m.enregistrerMacroCreneau({...macroDeTest(), id: macroId})).rejects.toThrow('document indisponible');
    expect(m.macroCreneaux.find((mc) => mc.id === macroId)).toEqual(avant);
  });

  it('notifie les abonnés une seule fois', async () => {
    const m = new Magasin(normaliser());
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    await m.enregistrerMacroCreneau(macroDeTest());

    expect(notifications).toBe(1);
  });
});
