import {describe, expect, it} from 'vitest';
import type {Id, Modele} from './domain/types';
import {normaliser} from './donnees/normaliser';
import {type EcritureGrist, Magasin, SuppressionApresCreationEchouee} from './store';
import {epochDepuisHeureLocale} from './temps';

/** Une écriture Grist de test qui rejette tout par défaut (chaque méthode
 *  doit être explicitement fournie pour un test qui l'exerce) — évite
 *  qu'un test sur une méthode du pont en exerce une autre sans s'en rendre
 *  compte. */
function ecritureDeTest(partielle: Partial<EcritureGrist> = {}): EcritureGrist {
  const nonBranchee = (nom: string) => async () => { throw new Error(`${nom} non fourni par ce double de test`); };
  return {
    creerEquipe: nonBranchee('creerEquipe'),
    creerMission: nonBranchee('creerMission'),
    creerMacroCreneau: nonBranchee('creerMacroCreneau'),
    modifierMacroCreneau: nonBranchee('modifierMacroCreneau'),
    supprimerMacroCreneau: nonBranchee('supprimerMacroCreneau'),
    creerArtiste: nonBranchee('creerArtiste'),
    modifierArtiste: nonBranchee('modifierArtiste'),
    remplacerSousCreneaux: nonBranchee('remplacerSousCreneaux'),
    modifierSousCreneaux: nonBranchee('modifierSousCreneaux'),
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

/** Un document réduit à un seul besoin, pour tester la nomenclature des
 *  codes de binôme sans dépendre du contenu du jeu de démonstration.
 *  `codesGroupesExistants` seed `m.groupes` pour éprouver la reprise sur un
 *  document déjà peuplé. */
function modeleUnBesoin(codesGroupesExistants: readonly string[] = []): Modele {
  return {
    equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
    lieux: [], benevoles: [], artistes: [],
    missions: [{
      id: 1, Nom: 'Buvette', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: [],
    }],
    macroCreneaux: [{id: 1, Nom: 'Vendredi', Debut: 1_700_000_000, Fin: 1_700_030_000}],
    sousCreneaux: [{
      id: 1, Macro_creneau: 1, Mission: null, Libelle: '10h-11h', Debut: 1_700_000_000, Fin: 1_700_003_600,
    }],
    besoins: [{id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 2, Effectif_max: 2, Taille_groupe: 2}],
    groupes: codesGroupesExistants.map((code, i) => ({id: 100 + i, Code: code, Taille: 2, Equipe: 1, Notes: ''})),
    positionsGroupe: [], places: [],
    disponibilites: [], souhaitsMissions: [], affinites: [],
  };
}

describe('Magasin.creerGroupeSurBesoin — nomenclature des binômes (A1 à Z1, puis A2 à Z2, …)', () => {
  it("attribue A1 au premier indicatif d'un document sans aucun groupe (demande d'Antoine du 2026-09-22)", async () => {
    const m = new Magasin(modeleUnBesoin());
    const groupeId = await m.creerGroupeSurBesoin(1);
    expect(m.groupes.find((g) => g.id === groupeId)!.Code).toBe('A1');
  });

  it('reprend après les codes déjà présents, sans en réattribuer un — reprise sur un document déjà peuplé', async () => {
    const m = new Magasin(modeleUnBesoin(['C1', 'A1', 'B1']));
    const groupeId = await m.creerGroupeSurBesoin(1);
    expect(m.groupes.find((g) => g.id === groupeId)!.Code).toBe('D1');
  });

  it('passe à A2 une fois A1 à Z1 tous pris', async () => {
    const alphabet = Array.from({length: 26}, (_, i) => `${String.fromCharCode(65 + i)}1`);
    const m = new Magasin(modeleUnBesoin(alphabet));
    const groupeId = await m.creerGroupeSurBesoin(1);
    expect(m.groupes.find((g) => g.id === groupeId)!.Code).toBe('A2');
  });

  it("ignore un code hérité de l'ancien format (ex. « BA01 »), qui ne bloque aucun code de la nouvelle séquence", async () => {
    const m = new Magasin(modeleUnBesoin(['BA01']));
    const groupeId = await m.creerGroupeSurBesoin(1);
    expect(m.groupes.find((g) => g.id === groupeId)!.Code).toBe('A1');
  });
});

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
    expect(groupe.Code).toMatch(/^[A-Z][1-9]\d*$/);

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
  it("crée le besoin seul, sans aucun indicatif dessus (revirement d'Antoine du 2026-09-22 : plus de binôme par défaut)", async () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);
    const nbBesoinsAvant = m.besoins.length;
    const nbGroupesAvant = m.groupes.length;
    const nbPositionsAvant = m.positionsGroupe.length;
    const nbPlacesAvant = m.places.length;

    const besoinId = await m.creerBesoin(missionId, sousCreneauId);

    expect(m.besoins).toHaveLength(nbBesoinsAvant + 1);
    const besoin = m.besoins.find((b) => b.id === besoinId)!;
    expect(besoin.Mission).toBe(missionId);
    expect(besoin.Sous_creneau).toBe(sousCreneauId);
    expect(besoin.Taille_groupe).toBe(2);
    expect(besoin.Effectif_min).toBe(2);
    expect(besoin.Effectif_max).toBe(2);

    expect(m.groupes).toHaveLength(nbGroupesAvant);
    expect(m.positionsGroupe).toHaveLength(nbPositionsAvant);
    expect(m.places).toHaveLength(nbPlacesAvant);
  });

  it('respecte une taille de binôme et un minimum personnalisés, gardés sur le besoin pour un futur indicatif', async () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);

    const besoinId = await m.creerBesoin(missionId, sousCreneauId, {tailleGroupe: 3, effectifMin: 3});

    const besoin = m.besoins.find((b) => b.id === besoinId)!;
    expect(besoin.Taille_groupe).toBe(3);
    expect(besoin.Effectif_min).toBe(3);
    expect(besoin.Effectif_max).toBe(3);
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

  it('en mode connecté, attend l’id du besoin rendu par le pont et n’appelle aucun pont de binôme (plus de création automatique)', async () => {
    const m = new Magasin(normaliser());
    const {missionId, sousCreneauId} = paireLibre(m);
    const nbGroupesAvant = m.groupes.length;
    const appels: string[] = [];
    m.brancherEcriture(ecritureDeTest({
      creerBesoin: async (besoin) => {
        appels.push(`creerBesoin(${besoin.missionId},${besoin.sousCreneauId},${besoin.effectifMin},${besoin.effectifMax},${besoin.tailleGroupe})`);
        return 701;
      },
      creerGroupe: async () => { throw new Error('ne devrait plus être appelé par creerBesoin'); },
    }));

    const besoinId = await m.creerBesoin(missionId, sousCreneauId);

    expect(besoinId).toBe(701);
    expect(m.besoins.find((b) => b.id === 701)).toBeDefined();
    expect(m.groupes).toHaveLength(nbGroupesAvant);
    expect(appels).toEqual([`creerBesoin(${missionId},${sousCreneauId},2,2,2)`]);
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
    if (!resultat.ok) { expect(resultat.raison).toMatch(/déjà positionnées/); }
    expect(m.sousCreneaux).toBe(avant);
  });

  it('refuse et ne change rien si un sous-créneau est propre à une mission (sans besoin)', async () => {
    const debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12});
    const m = new Magasin({
      equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
      macroCreneaux: [{id: 1, Nom: 'Journée', Debut: debut, Fin: fin}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: 1, Libelle: '10h-11h', Debut: debut, Fin: debut + 3600}],
      besoins: [], groupes: [], positionsGroupe: [], places: [],
      disponibilites: [], souhaitsMissions: [], affinites: [],
    });
    const avant = m.sousCreneaux;

    const resultat = await m.redecouperSousCreneaux(1, 60);

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) { expect(resultat.raison).toMatch(/déjà positionnées/); }
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

  it("en mode connecté, si la suppression échoue après une création réussie côté pont, ajoute les nouveaux sans retirer les anciens (le document a réellement les deux) et le dit", async () => {
    const {m, macroId} = modeleUnMacro();
    m.brancherEcriture(ecritureDeTest({
      remplacerSousCreneaux: async (_idsASupprimer, nouveaux) => {
        throw new SuppressionApresCreationEchouee(nouveaux.map((_, i) => 701 + i));
      },
    }));

    const resultat = await m.redecouperSousCreneaux(macroId, 60);

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.raison).toMatch(/bien été créés/);
      expect(resultat.raison).not.toMatch(/annulé/);
    }
    const ids = m.sousCreneaux.map((s) => s.id).sort((a, b) => a - b);
    expect(ids).toEqual([701, 702]);
  });
});

describe('Magasin.supprimerMacroCreneau', () => {
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

  it('retire le macro-créneau et ses sous-créneaux', async () => {
    const {m, macroId} = modeleUnMacro();
    await m.redecouperSousCreneaux(macroId, 60);
    expect(m.sousCreneaux).toHaveLength(2);

    const resultat = await m.supprimerMacroCreneau(macroId);

    expect(resultat).toEqual({ok: true});
    expect(m.macroCreneaux).toHaveLength(0);
    expect(m.sousCreneaux).toHaveLength(0);
  });

  it('refuse et ne change rien si un sous-créneau porte déjà une mission (Besoin)', async () => {
    const {m, macroId} = modeleUnMacro();
    await m.redecouperSousCreneaux(macroId, 60);
    const sousCreneauId = m.sousCreneaux[0]!.id;
    await m.creerBesoin(1, sousCreneauId);
    const avantMacros = m.macroCreneaux;
    const avantSous = m.sousCreneaux;

    const resultat = await m.supprimerMacroCreneau(macroId);

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) { expect(resultat.raison).toMatch(/déjà positionnées/); }
    expect(m.macroCreneaux).toBe(avantMacros);
    expect(m.sousCreneaux).toBe(avantSous);
  });

  it('renvoie une erreur pour un macro-créneau introuvable', async () => {
    const {m} = modeleUnMacro();

    const resultat = await m.supprimerMacroCreneau(999);

    expect(resultat.ok).toBe(false);
  });

  it('notifie les abonnés une seule fois en cas de succès', async () => {
    const {m, macroId} = modeleUnMacro();
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    await m.supprimerMacroCreneau(macroId);

    expect(notifications).toBe(1);
  });

  it("en mode connecté, transmet le macro-créneau et ses sous-créneaux en un seul appel du pont", async () => {
    const {m, macroId} = modeleUnMacro();
    await m.redecouperSousCreneaux(macroId, 60);
    const idsSous = m.sousCreneaux.map((s) => s.id).sort((a, b) => a - b);
    const appels: string[] = [];
    m.brancherEcriture(ecritureDeTest({
      supprimerMacroCreneau: async (macroCreneauId, sousCreneauIds) => {
        appels.push(`supprimerMacroCreneau(${macroCreneauId},${JSON.stringify([...sousCreneauIds].sort((a, b) => a - b))})`);
      },
    }));

    const resultat = await m.supprimerMacroCreneau(macroId);

    expect(resultat).toEqual({ok: true});
    expect(appels).toEqual([`supprimerMacroCreneau(${macroId},${JSON.stringify(idsSous)})`]);
  });

  it("en mode connecté, si le pont échoue, rien n'est retiré localement", async () => {
    const {m, macroId} = modeleUnMacro();
    await m.redecouperSousCreneaux(macroId, 60);
    const avantMacros = m.macroCreneaux;
    const avantSous = m.sousCreneaux;
    m.brancherEcriture(ecritureDeTest({supprimerMacroCreneau: async () => { throw new Error('document indisponible'); }}));

    const resultat = await m.supprimerMacroCreneau(macroId);

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) { expect(resultat.raison).toMatch(/Échec de l.écriture/); }
    expect(m.macroCreneaux).toBe(avantMacros);
    expect(m.sousCreneaux).toBe(avantSous);
  });
});

describe('Magasin.creerSousCreneauMission', () => {
  function modeleUneMission(): {m: Magasin; macroId: Id; missionId: Id} {
    const debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12});
    const m = new Magasin({
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      lieux: [], benevoles: [], artistes: [],
      missions: [{
        id: 1, Nom: 'Buvette', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: [],
      }],
      macroCreneaux: [{id: 1, Nom: 'Journée', Debut: debut, Fin: fin}],
      sousCreneaux: [], besoins: [], groupes: [], positionsGroupe: [], places: [],
      disponibilites: [], souhaitsMissions: [], affinites: [],
    });
    return {m, macroId: 1, missionId: 1};
  }

  it("sans écrivain branché (mode démo), génère un id local et l'ajoute au référentiel, rattaché à la mission", async () => {
    const {m, macroId, missionId} = modeleUneMission();

    const id = await m.creerSousCreneauMission(macroId, missionId, {libelle: '19h-20h30', debut: 1000, fin: 6400});

    const sc = m.sousCreneaux.find((s) => s.id === id);
    expect(sc).toBeDefined();
    expect(sc!.Mission).toBe(missionId);
    expect(sc!.Macro_creneau).toBe(macroId);
    expect(sc!.Debut).toBe(1000);
    expect(sc!.Fin).toBe(6400);
  });

  it("laisse intacts les sous-créneaux et besoins déjà posés — n'en retire ni n'en remplace aucun", async () => {
    const {m, macroId, missionId} = modeleUneMission();
    await m.redecouperSousCreneaux(macroId, 60);
    const nbAvant = m.sousCreneaux.length;
    const besoinId = await m.creerBesoin(missionId, m.sousCreneaux[0]!.id);

    await m.creerSousCreneauMission(macroId, missionId, {libelle: '19h-20h', debut: 1000, fin: 4600});

    expect(m.sousCreneaux).toHaveLength(nbAvant + 1);
    expect(m.besoins.some((b) => b.id === besoinId)).toBe(true);
  });

  it("en mode connecté, attend l'id réel avant d'insérer localement, via remplacerSousCreneaux([], …)", async () => {
    const {m, macroId, missionId} = modeleUneMission();
    const appels: string[] = [];
    m.brancherEcriture(ecritureDeTest({
      remplacerSousCreneaux: async (idsASupprimer, nouveaux) => {
        appels.push(`remplacerSousCreneaux(${JSON.stringify(idsASupprimer)},${JSON.stringify(nouveaux)})`);
        return [801];
      },
    }));

    const id = await m.creerSousCreneauMission(macroId, missionId, {libelle: '19h-20h', debut: 1000, fin: 4600});

    expect(id).toBe(801);
    expect(appels).toEqual([
      `remplacerSousCreneaux([],${JSON.stringify([{macroCreneauId: macroId, missionId, libelle: '19h-20h', debut: 1000, fin: 4600}])})`,
    ]);
    expect(m.sousCreneaux.find((s) => s.id === 801)?.Mission).toBe(missionId);
  });

  it("en mode connecté, si le pont échoue, aucun sous-créneau n'est ajouté localement", async () => {
    const {m, macroId, missionId} = modeleUneMission();
    const avant = m.sousCreneaux;
    m.brancherEcriture(ecritureDeTest({remplacerSousCreneaux: async () => { throw new Error('document indisponible'); }}));

    await expect(m.creerSousCreneauMission(macroId, missionId, {libelle: '19h-20h', debut: 1000, fin: 4600}))
      .rejects.toThrow('document indisponible');
    expect(m.sousCreneaux).toBe(avant);
  });

  it('notifie les abonnés une seule fois', async () => {
    const {m, macroId, missionId} = modeleUneMission();
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    await m.creerSousCreneauMission(macroId, missionId, {libelle: '19h-20h', debut: 1000, fin: 4600});

    expect(notifications).toBe(1);
  });
});

describe('Magasin.deplacerCreneauxMission', () => {
  async function modeleDeuxCreneauxPropres(): Promise<{m: Magasin; macroId: Id; missionId: Id; c1: Id; c2: Id}> {
    const {m, macroId, missionId} = (() => {
      const debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
      const fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 14});
      const magasin = new Magasin({
        equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
        lieux: [], benevoles: [], artistes: [],
        missions: [{
          id: 1, Nom: 'Buvette', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: [],
        }],
        macroCreneaux: [{id: 1, Nom: 'Journée', Debut: debut, Fin: fin}],
        sousCreneaux: [], besoins: [], groupes: [], positionsGroupe: [], places: [],
        disponibilites: [], souhaitsMissions: [], affinites: [],
      });
      return {m: magasin, macroId: 1, missionId: 1};
    })();
    const c1 = await m.creerSousCreneauMission(macroId, missionId, {
      libelle: '10h-11h', debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10}),
      fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11}),
    });
    const c2 = await m.creerSousCreneauMission(macroId, missionId, {
      libelle: '11h-12h', debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11}),
      fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12}),
    });
    return {m, macroId, missionId, c1, c2};
  }

  it("pousse le créneau tiré et ceux qui le suivent dans le temps (même mission), en place", async () => {
    const {m, c1, c2} = await modeleDeuxCreneauxPropres();
    const c1Avant = m.sousCreneaux.find((s) => s.id === c1)!;
    const [debutC1Avant, finC1Avant] = [c1Avant.Debut, c1Avant.Fin];

    const resultat = await m.deplacerCreneauxMission(c1, 900); // +15 min

    expect(resultat).toEqual({ok: true});
    const nc1 = m.sousCreneaux.find((s) => s.id === c1)!;
    const nc2 = m.sousCreneaux.find((s) => s.id === c2)!;
    expect(nc1.Debut).toBe(debutC1Avant + 900);
    expect(nc1.Fin).toBe(finC1Avant + 900);
    expect(nc2.Debut).toBe(debutC1Avant + 3600 + 900);
    expect(nc1.id).toBe(c1);
    expect(nc2.id).toBe(c2); // même id : jamais supprimé-recréé
  });

  it("ne pousse pas un sous-créneau commun d'une autre mission", async () => {
    const {m, macroId, missionId} = await modeleDeuxCreneauxPropres();
    const autreMissionId = await m.creerMission({
      Nom: 'Sécurité', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: [],
    });
    const debutAutre = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const finAutre = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11});
    const cAutre = await m.creerSousCreneauMission(macroId, autreMissionId, {libelle: '10h-11h', debut: debutAutre, fin: finAutre});
    const c1DeMission = m.sousCreneaux.find((s) => s.Mission === missionId)!.id;

    await m.deplacerCreneauxMission(c1DeMission, 900);

    expect(m.sousCreneaux.find((s) => s.id === cAutre)!.Debut).toBe(debutAutre);
  });

  it('refuse un sous-créneau commun', async () => {
    const debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12});
    const m = new Magasin({
      equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
      macroCreneaux: [{id: 1, Nom: 'Journée', Debut: debut, Fin: fin}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: '10h-12h', Debut: debut, Fin: fin}],
      besoins: [], groupes: [], positionsGroupe: [], places: [],
      disponibilites: [], souhaitsMissions: [], affinites: [],
    });

    const resultat = await m.deplacerCreneauxMission(1, 900);

    expect(resultat.ok).toBe(false);
  });

  it("en mode connecté, transmet tous les patches en un seul appel du pont, avec les nouveaux horaires", async () => {
    const {m, c1, c2} = await modeleDeuxCreneauxPropres();
    const appels: {id: Id; debut: number; fin: number}[] = [];
    m.brancherEcriture(ecritureDeTest({
      modifierSousCreneaux: async (patches) => { appels.push(...patches.map((p) => ({id: p.id, debut: p.debut, fin: p.fin}))); },
    }));

    await m.deplacerCreneauxMission(c1, 900);

    expect(appels.map((p) => p.id).sort((a, b) => a - b)).toEqual([c1, c2].sort((a, b) => a - b));
  });

  it("en mode connecté, si le pont échoue, rien ne bouge localement", async () => {
    const {m, c1} = await modeleDeuxCreneauxPropres();
    const avant = m.sousCreneaux.find((s) => s.id === c1)!.Debut;
    m.brancherEcriture(ecritureDeTest({modifierSousCreneaux: async () => { throw new Error('document indisponible'); }}));

    const resultat = await m.deplacerCreneauxMission(c1, 900);

    expect(resultat.ok).toBe(false);
    expect(m.sousCreneaux.find((s) => s.id === c1)!.Debut).toBe(avant);
  });
});

describe('Magasin.redimensionnerCreneauMission', () => {
  async function modeleUnCreneauPropre(): Promise<{m: Magasin; sousCreneauId: Id; debut: number; fin: number}> {
    const debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12});
    const m = new Magasin({
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      lieux: [], benevoles: [], artistes: [],
      missions: [{
        id: 1, Nom: 'Buvette', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: [],
      }],
      macroCreneaux: [{id: 1, Nom: 'Journée', Debut: debut, Fin: fin}],
      sousCreneaux: [], besoins: [], groupes: [], positionsGroupe: [], places: [],
      disponibilites: [], souhaitsMissions: [], affinites: [],
    });
    const propreDebut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const propreFin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11});
    const sousCreneauId = await m.creerSousCreneauMission(1, 1, {libelle: '10h-11h', debut: propreDebut, fin: propreFin});
    return {m, sousCreneauId, debut: propreDebut, fin: propreFin};
  }

  it('allonge depuis la fin (bord droit tiré) sans toucher le début', async () => {
    const {m, sousCreneauId, debut} = await modeleUnCreneauPropre();

    const resultat = await m.redimensionnerCreneauMission(sousCreneauId, false, 900);

    expect(resultat).toEqual({ok: true});
    const sc = m.sousCreneaux.find((s) => s.id === sousCreneauId)!;
    expect(sc.Debut).toBe(debut);
    expect(sc.Fin).toBe(debut + 3600 + 900);
    expect(sc.id).toBe(sousCreneauId);
  });

  it('raccourcit depuis le début (bord gauche tiré) sans toucher la fin', async () => {
    const {m, sousCreneauId, fin} = await modeleUnCreneauPropre();

    const resultat = await m.redimensionnerCreneauMission(sousCreneauId, true, 900);

    expect(resultat).toEqual({ok: true});
    const sc = m.sousCreneaux.find((s) => s.id === sousCreneauId)!;
    expect(sc.Fin).toBe(fin);
  });

  it("refuse de descendre sous un quart d'heure et ne change rien", async () => {
    const {m, sousCreneauId, debut, fin} = await modeleUnCreneauPropre();

    const resultat = await m.redimensionnerCreneauMission(sousCreneauId, true, 3600 - 600); // ne laisserait que 10 min

    expect(resultat.ok).toBe(false);
    const sc = m.sousCreneaux.find((s) => s.id === sousCreneauId)!;
    expect(sc.Debut).toBe(debut);
    expect(sc.Fin).toBe(fin);
  });

  it('en mode connecté, si le pont échoue, rien ne change localement', async () => {
    const {m, sousCreneauId, debut, fin} = await modeleUnCreneauPropre();
    m.brancherEcriture(ecritureDeTest({modifierSousCreneaux: async () => { throw new Error('document indisponible'); }}));

    const resultat = await m.redimensionnerCreneauMission(sousCreneauId, false, 900);

    expect(resultat.ok).toBe(false);
    const sc = m.sousCreneaux.find((s) => s.id === sousCreneauId)!;
    expect(sc.Debut).toBe(debut);
    expect(sc.Fin).toBe(fin);
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

describe('Magasin.enregistrerArtiste', () => {
  function artisteDeTest(lieuId: Id) {
    return {
      Nom: 'DJ Set',
      Lieu: lieuId,
      Debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 21}),
      Fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 23}),
    };
  }

  it("sans écrivain branché (mode démo), génère un id local et l'ajoute au référentiel", async () => {
    const m = new Magasin(normaliser());
    const lieuId = m.lieux[0]!.id;
    const nbAvant = m.artistes.length;

    const id = await m.enregistrerArtiste(artisteDeTest(lieuId));

    expect(m.artistes).toHaveLength(nbAvant + 1);
    expect(m.artistes.find((a) => a.id === id)?.Nom).toBe('DJ Set');
  });

  it("à la création, avec une écriture branchée, attend l'id qu'elle rend avant d'insérer localement", async () => {
    const m = new Magasin(normaliser());
    const lieuId = m.lieux[0]!.id;
    const appels: unknown[] = [];
    m.brancherEcriture(ecritureDeTest({
      creerArtiste: async (artiste) => { appels.push(artiste); return 999; },
    }));

    const id = await m.enregistrerArtiste(artisteDeTest(lieuId));

    expect(id).toBe(999);
    expect(appels).toEqual([{nom: 'DJ Set', lieuId, debut: artisteDeTest(lieuId).Debut, fin: artisteDeTest(lieuId).Fin}]);
    expect(m.artistes.find((a) => a.id === 999)?.Nom).toBe('DJ Set');
  });

  it('sans lieu (0 côté domaine), passe null au pont plutôt que 0', async () => {
    const m = new Magasin(normaliser());
    const appels: unknown[] = [];
    m.brancherEcriture(ecritureDeTest({
      creerArtiste: async (artiste) => { appels.push(artiste); return 999; },
    }));

    await m.enregistrerArtiste(artisteDeTest(0));

    expect((appels[0] as {lieuId: Id | null}).lieuId).toBeNull();
  });

  it("ne crée rien localement si l'écriture branchée échoue à la création", async () => {
    const m = new Magasin(normaliser());
    const lieuId = m.lieux[0]!.id;
    const nbAvant = m.artistes.length;
    m.brancherEcriture(ecritureDeTest({creerArtiste: async () => { throw new Error('document indisponible'); }}));

    await expect(m.enregistrerArtiste(artisteDeTest(lieuId))).rejects.toThrow('document indisponible');
    expect(m.artistes).toHaveLength(nbAvant);
  });

  it("à la modification, avec une écriture branchée, attend la confirmation avant de modifier localement", async () => {
    const m = new Magasin(normaliser());
    const lieuId = m.lieux[0]!.id;
    const artisteId = (await m.enregistrerArtiste(artisteDeTest(lieuId)));
    const appels: unknown[] = [];
    m.brancherEcriture(ecritureDeTest({
      modifierArtiste: async (id, artiste) => { appels.push({id, artiste}); },
    }));

    const patch = {...artisteDeTest(lieuId), Nom: 'Fanfare', id: artisteId};
    const id = await m.enregistrerArtiste(patch);

    expect(id).toBe(artisteId);
    expect(appels).toEqual([{id: artisteId, artiste: {nom: 'Fanfare', lieuId, debut: patch.Debut, fin: patch.Fin}}]);
    expect(m.artistes.find((a) => a.id === artisteId)?.Nom).toBe('Fanfare');
  });

  it("ne modifie rien localement si l'écriture branchée échoue à la modification", async () => {
    const m = new Magasin(normaliser());
    const lieuId = m.lieux[0]!.id;
    const artisteId = await m.enregistrerArtiste(artisteDeTest(lieuId));
    const avant = m.artistes.find((a) => a.id === artisteId)!;
    m.brancherEcriture(ecritureDeTest({modifierArtiste: async () => { throw new Error('document indisponible'); }}));

    await expect(m.enregistrerArtiste({...artisteDeTest(lieuId), Nom: 'Fanfare', id: artisteId}))
      .rejects.toThrow('document indisponible');
    expect(m.artistes.find((a) => a.id === artisteId)).toEqual(avant);
  });

  it('notifie les abonnés une seule fois', async () => {
    const m = new Magasin(normaliser());
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    await m.enregistrerArtiste(artisteDeTest(m.lieux[0]!.id));

    expect(notifications).toBe(1);
  });
});
