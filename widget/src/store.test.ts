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
    repointerBesoins: nonBranchee('repointerBesoins'),
    creerBesoin: nonBranchee('creerBesoin'),
    creerGroupe: nonBranchee('creerGroupe'),
    positionnerGroupe: nonBranchee('positionnerGroupe'),
    definirPlaces: nonBranchee('definirPlaces'),
    deplacerPosition: nonBranchee('deplacerPosition'),
    ajouterPosition: nonBranchee('ajouterPosition'),
    modifierPlaces: nonBranchee('modifierPlaces'),
    supprimerPosition: nonBranchee('supprimerPosition'),
    definirAbsence: nonBranchee('definirAbsence'),
    valeursColonneBrute: nonBranchee('valeursColonneBrute'),
    colonnesTable: nonBranchee('colonnesTable'),
    tablesDocument: nonBranchee('tablesDocument'),
    definirParametre: nonBranchee('definirParametre'),
    remplacerDisponibilites: nonBranchee('remplacerDisponibilites'),
    peuplerBenevoles: nonBranchee('peuplerBenevoles'),
    creerAffinites: nonBranchee('creerAffinites'),
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

describe('Magasin.supprimerPosition', () => {
  it('en mode connecté, appelle le pont puis retire la position localement', async () => {
    const m = new Magasin(normaliser());
    const groupeId = await m.creerGroupeSurBesoin(m.besoins[0]!.id);
    const position = m.positionsGroupe.find((p) => p.Groupe === groupeId)!;
    const appels: string[] = [];
    m.brancherEcriture(ecritureDeTest({
      supprimerPosition: async (positionId) => { appels.push(`supprimerPosition(${positionId})`); },
    }));

    await m.supprimerPosition(position.id);

    expect(appels).toEqual([`supprimerPosition(${position.id})`]);
    expect(m.positionsGroupe.find((p) => p.id === position.id)).toBeUndefined();
  });

  it('ne touche jamais le Groupe ni ses Places : le binôme et ses bénévoles déjà affectés restent', async () => {
    const m = new Magasin(normaliser());
    const groupeId = await m.creerGroupeSurBesoin(m.besoins[0]!.id);
    const position = m.positionsGroupe.find((p) => p.Groupe === groupeId)!;
    const placesAvant = m.places.filter((p) => p.Groupe === groupeId);
    m.brancherEcriture(ecritureDeTest({supprimerPosition: async () => {}}));

    await m.supprimerPosition(position.id);

    expect(m.groupes.find((g) => g.id === groupeId)).toBeDefined();
    expect(m.places.filter((p) => p.Groupe === groupeId)).toEqual(placesAvant);
  });

  it('en mode connecté, si le pont échoue, la position reste', async () => {
    const m = new Magasin(normaliser());
    const groupeId = await m.creerGroupeSurBesoin(m.besoins[0]!.id);
    const position = m.positionsGroupe.find((p) => p.Groupe === groupeId)!;
    m.brancherEcriture(ecritureDeTest({supprimerPosition: async () => { throw new Error('document indisponible'); }}));

    const resultat = await m.supprimerPosition(position.id);

    expect(resultat).toEqual({ok: false, raison: expect.stringContaining("Échec de l'écriture")});
    expect(m.positionsGroupe.find((p) => p.id === position.id)).toBeDefined();
  });

  it('ne fait rien pour une position inconnue (le pont n’est pas appelé)', async () => {
    const m = new Magasin(normaliser());
    let appele = false;
    m.brancherEcriture(ecritureDeTest({supprimerPosition: async () => { appele = true; }}));

    const resultat = await m.supprimerPosition(-1);

    expect(appele).toBe(false);
    expect(resultat).toEqual({ok: false, raison: expect.any(String)});
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
    const avantMacros = m.macroCreneaux;
    const avantSous = m.sousCreneaux;

    const resultat = await m.supprimerMacroCreneau(1);

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

  it("forcé, retire aussi les besoins et positions de groupe des sous-créneaux emportés ; missions et groupes/places restent (retour d'Antoine du 2026-09-23)", async () => {
    const {m, macroId} = modeleUnMacro();
    await m.redecouperSousCreneaux(macroId, 60);
    const sousCreneauId = m.sousCreneaux[0]!.id;
    const besoinId = await m.creerBesoin(1, sousCreneauId);
    const groupeId = await m.creerGroupeSurBesoin(besoinId);

    const resultat = await m.supprimerMacroCreneau(macroId, true);

    expect(resultat).toEqual({ok: true});
    expect(m.macroCreneaux).toHaveLength(0);
    expect(m.sousCreneaux).toHaveLength(0);
    expect(m.besoins).toHaveLength(0);
    expect(m.positionsGroupe).toHaveLength(0);
    // Le groupe (l'indicatif) et son roster de places restent : seule la
    // position qui le rattachait à ce besoin a disparu, il redevient libre.
    expect(m.groupes.map((g) => g.id)).toContain(groupeId);
    expect(m.places.filter((p) => p.Groupe === groupeId)).toHaveLength(2);
  });

  it('forcé mais sans rien à cascader (aucun besoin) se comporte comme la suppression simple', async () => {
    const {m, macroId} = modeleUnMacro();
    await m.redecouperSousCreneaux(macroId, 60);

    const resultat = await m.supprimerMacroCreneau(macroId, true);

    expect(resultat).toEqual({ok: true});
    expect(m.macroCreneaux).toHaveLength(0);
    expect(m.sousCreneaux).toHaveLength(0);
  });

  it('forcé en mode connecté, transmet positions, besoins, sous-créneaux et macro en un seul appel du pont', async () => {
    const {m, macroId} = modeleUnMacro();
    await m.redecouperSousCreneaux(macroId, 60);
    const sousCreneauId = m.sousCreneaux[0]!.id;
    const besoinId = await m.creerBesoin(1, sousCreneauId);
    const groupeId = await m.creerGroupeSurBesoin(besoinId);
    const positionId = m.positionsGroupe.find((p) => p.Groupe === groupeId)!.id;
    const idsSous = m.sousCreneaux.map((s) => s.id).sort((a, b) => a - b);
    const appels: string[] = [];
    m.brancherEcriture(ecritureDeTest({
      supprimerMacroCreneau: async (macroCreneauId, sousCreneauIds, besoinIds, positionIds) => {
        appels.push(JSON.stringify([
          macroCreneauId, [...sousCreneauIds].sort((a, b) => a - b), besoinIds, positionIds,
        ]));
      },
    }));

    const resultat = await m.supprimerMacroCreneau(macroId, true);

    expect(resultat).toEqual({ok: true});
    expect(appels).toEqual([JSON.stringify([macroId, idsSous, [besoinId], [positionId]])]);
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

describe('Magasin.copierCreneauxJour', () => {
  const JOUR1_DEBUT = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
  const JOUR1_FIN = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12});
  const COMMUN_FIN = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11});
  const JOUR2_DEBUT = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 10});
  const JOUR2_FIN = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 18, heures: 12});
  const JOUR3_DEBUT = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 19, heures: 10});
  const JOUR3_FIN = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 19, heures: 12});
  const DUREE_COMMUN = COMMUN_FIN - JOUR1_DEBUT; // 1h, décalage nul depuis le début du macro-créneau

  /** Deux jours (macro-créneaux 1 et 2) ; le jour source a un commun
   *  (10h-11h) partagé par deux missions, chacune avec son besoin dessus, et
   *  un indicatif déjà positionné sur celui de la première — de quoi éprouver
   *  la déduplication du commun ET la copie de l'indicatif en un seul jeu de
   *  données. `sousCreneauxCibleExtra` seed en plus des sous-créneaux déjà
   *  présents sur le jour cible, pour éprouver la réutilisation d'une copie
   *  déjà là (grille commune ou copie antérieure) sans reconstruire tout le
   *  modèle à la main. */
  function modeleDeuxJours(sousCreneauxCibleExtra: Modele['sousCreneaux'] = []): {
    m: Magasin; macroSource: Id; macroCible: Id; macroVide: Id;
    mission1: Id; mission2: Id; communSourceId: Id; besoin1: Id; besoin2: Id; groupeId: Id;
  } {
    const m = new Magasin({
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      lieux: [], benevoles: [], artistes: [],
      missions: [
        {id: 1, Nom: 'Buvette', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
        {id: 2, Nom: 'Sécurité', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
      ],
      macroCreneaux: [
        {id: 1, Nom: 'Vendredi', Debut: JOUR1_DEBUT, Fin: JOUR1_FIN},
        {id: 2, Nom: 'Samedi', Debut: JOUR2_DEBUT, Fin: JOUR2_FIN},
        {id: 3, Nom: 'Dimanche', Debut: JOUR3_DEBUT, Fin: JOUR3_FIN},
      ],
      sousCreneaux: [
        {id: 10, Macro_creneau: 1, Mission: null, Libelle: '10h-11h', Debut: JOUR1_DEBUT, Fin: COMMUN_FIN},
        ...sousCreneauxCibleExtra,
      ],
      besoins: [
        {id: 100, Mission: 1, Sous_creneau: 10, Effectif_min: 1, Effectif_max: 2, Taille_groupe: 2},
        {id: 101, Mission: 2, Sous_creneau: 10, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      ],
      groupes: [{id: 500, Code: 'A1', Taille: 2, Equipe: 1, Notes: ''}],
      positionsGroupe: [{id: 900, Groupe: 500, Besoin: 100}],
      places: [
        {id: 700, Groupe: 500, Rang: 1, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
        {id: 701, Groupe: 500, Rang: 2, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0},
      ],
      disponibilites: [], souhaitsMissions: [], affinites: [],
    });
    return {
      m, macroSource: 1, macroCible: 2, macroVide: 3,
      mission1: 1, mission2: 2, communSourceId: 10, besoin1: 100, besoin2: 101, groupeId: 500,
    };
  }

  it('refuse de copier un jour sur lui-même', async () => {
    const {m, macroSource} = modeleDeuxJours();
    const resultat = await m.copierCreneauxJour(macroSource, macroSource);
    expect(resultat).toEqual({ok: false, raison: 'Le jour source et le jour cible sont identiques.'});
  });

  it("signale qu'il n'y a rien à copier si le jour source n'a aucun besoin construit", async () => {
    const {m, macroVide, macroCible} = modeleDeuxJours();
    const resultat = await m.copierCreneauxJour(macroVide, macroCible);
    expect(resultat.ok).toBe(false);
  });

  it('déduplique un commun partagé par deux missions : une seule copie, avec Mission conservé à null', async () => {
    const {m, macroSource, macroCible} = modeleDeuxJours();

    const resultat = await m.copierCreneauxJour(macroSource, macroCible);

    expect(resultat).toEqual({ok: true, sousCreneauxCrees: 1, besoinsCrees: 2, indicatifsRepositionnes: 1});
    const copies = m.sousCreneaux.filter((s) => s.Macro_creneau === macroCible);
    expect(copies).toHaveLength(1);
    expect(copies[0]!.Mission).toBeNull();
  });

  it('place la copie au même horaire relatif au début du macro-créneau cible', async () => {
    const {m, macroSource, macroCible} = modeleDeuxJours();
    const macroSourceObj = m.macroCreneaux.find((ma) => ma.id === macroSource)!;
    const macroCibleObj = m.macroCreneaux.find((ma) => ma.id === macroCible)!;
    const source = m.sousCreneaux.find((s) => s.id === 10)!;

    await m.copierCreneauxJour(macroSource, macroCible);

    const copie = m.sousCreneaux.find((s) => s.Macro_creneau === macroCible)!;
    expect(copie.Debut).toBe(macroCibleObj.Debut + (source.Debut - macroSourceObj.Debut));
    expect(copie.Fin).toBe(macroCibleObj.Debut + (source.Fin - macroSourceObj.Debut));
  });

  it('crée un besoin par mission copiée, avec les mêmes effectifs, rattaché à la copie du sous-créneau', async () => {
    const {m, macroSource, macroCible, mission1, mission2} = modeleDeuxJours();

    await m.copierCreneauxJour(macroSource, macroCible);

    const copie = m.sousCreneaux.find((s) => s.Macro_creneau === macroCible)!;
    const b1 = m.besoins.find((b) => b.Mission === mission1 && b.Sous_creneau === copie.id)!;
    const b2 = m.besoins.find((b) => b.Mission === mission2 && b.Sous_creneau === copie.id)!;
    expect(b1).toMatchObject({Effectif_min: 1, Effectif_max: 2, Taille_groupe: 2});
    expect(b2).toMatchObject({Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1});
  });

  it('repositionne un indicatif déjà positionné sur le besoin copié, même Groupe — aucun nouveau créé', async () => {
    const {m, macroSource, macroCible, mission1, groupeId} = modeleDeuxJours();
    const nbGroupesAvant = m.groupes.length;
    const nbPlacesAvant = m.places.length;

    await m.copierCreneauxJour(macroSource, macroCible);

    expect(m.groupes).toHaveLength(nbGroupesAvant); // jamais un nouveau Groupe
    expect(m.places).toHaveLength(nbPlacesAvant); // ni de nouvelles places : le Groupe suit tel quel
    const copie = m.sousCreneaux.find((s) => s.Macro_creneau === macroCible)!;
    const besoinCopie = m.besoins.find((b) => b.Mission === mission1 && b.Sous_creneau === copie.id)!;
    const position = m.positionsGroupe.find((p) => p.Besoin === besoinCopie.id);
    expect(position?.Groupe).toBe(groupeId);
  });

  it('rejouée, ne crée aucun doublon (ni sous-créneau, ni besoin, ni position)', async () => {
    const {m, macroSource, macroCible} = modeleDeuxJours();
    await m.copierCreneauxJour(macroSource, macroCible);
    const nbSousAvant = m.sousCreneaux.length;
    const nbBesoinsAvant = m.besoins.length;
    const nbPositionsAvant = m.positionsGroupe.length;

    const resultat = await m.copierCreneauxJour(macroSource, macroCible);

    expect(resultat).toEqual({ok: true, sousCreneauxCrees: 0, besoinsCrees: 0, indicatifsRepositionnes: 0});
    expect(m.sousCreneaux).toHaveLength(nbSousAvant);
    expect(m.besoins).toHaveLength(nbBesoinsAvant);
    expect(m.positionsGroupe).toHaveLength(nbPositionsAvant);
  });

  it('réutilise un sous-créneau déjà présent au même horaire sur le jour cible plutôt que d’en recréer un', async () => {
    // Un jour cible qui a déjà, par avance (grille commune ou copie antérieure),
    // un commun exactement au même horaire relatif que celui du jour source.
    const {m, macroSource, macroCible} = modeleDeuxJours([
      {id: 777, Macro_creneau: 2, Mission: null, Libelle: 'déjà là', Debut: JOUR2_DEBUT, Fin: JOUR2_DEBUT + DUREE_COMMUN},
    ]);

    const resultat = await m.copierCreneauxJour(macroSource, macroCible);

    expect(resultat).toEqual({ok: true, sousCreneauxCrees: 0, besoinsCrees: 2, indicatifsRepositionnes: 1});
    expect(m.sousCreneaux.filter((s) => s.Macro_creneau === macroCible)).toHaveLength(1);
    expect(m.besoins.some((b) => b.Sous_creneau === 777)).toBe(true);
  });

  it('en mode connecté, crée le sous-créneau dédupliqué via remplacerSousCreneaux puis les besoins et positions via le pont', async () => {
    const {m, macroSource, macroCible, mission1, mission2, groupeId} = modeleDeuxJours();
    const creations: {missionId: Id | null; debut: number; fin: number}[] = [];
    const besoinsCrees: {missionId: Id; sousCreneauId: Id}[] = [];
    const positions: {groupeId: Id; besoinId: Id}[] = [];
    let prochainSousCreneauId = 900;
    let prochainBesoinId = 950;
    let prochainPositionId = 990;
    m.brancherEcriture(ecritureDeTest({
      remplacerSousCreneaux: async (idsASupprimer, nouveaux) => {
        expect(idsASupprimer).toEqual([]);
        creations.push(...nouveaux.map((n) => ({missionId: n.missionId, debut: n.debut, fin: n.fin})));
        return nouveaux.map(() => prochainSousCreneauId++);
      },
      creerBesoin: async (besoin) => {
        besoinsCrees.push({missionId: besoin.missionId, sousCreneauId: besoin.sousCreneauId});
        return prochainBesoinId++;
      },
      ajouterPosition: async (g, besoinId) => {
        positions.push({groupeId: g, besoinId});
        return prochainPositionId++;
      },
    }));

    const resultat = await m.copierCreneauxJour(macroSource, macroCible);

    expect(resultat).toEqual({ok: true, sousCreneauxCrees: 1, besoinsCrees: 2, indicatifsRepositionnes: 1});
    expect(creations).toEqual([{missionId: null, debut: JOUR2_DEBUT, fin: JOUR2_DEBUT + DUREE_COMMUN}]);
    expect(besoinsCrees).toEqual([
      {missionId: mission1, sousCreneauId: 900},
      {missionId: mission2, sousCreneauId: 900},
    ]);
    expect(positions).toEqual([{groupeId, besoinId: 950}]);
  });

  it("en mode connecté, si la création d'un besoin échoue, ce qui a déjà été copié avant reste (rien perdu, rien en double au prochain essai)", async () => {
    const {m, macroSource, macroCible, mission1, mission2} = modeleDeuxJours();
    m.brancherEcriture(ecritureDeTest({
      remplacerSousCreneaux: async (_ids, nouveaux) => nouveaux.map((_, i) => 900 + i),
      creerBesoin: async (besoin) => {
        if (besoin.missionId === mission1) { return 950; }
        throw new Error('document indisponible');
      },
      ajouterPosition: async () => 1000, // l'indicatif de mission1 se repositionne sans souci
    }));

    const resultat = await m.copierCreneauxJour(macroSource, macroCible);

    expect(resultat.ok).toBe(false);
    if (resultat.ok) { throw new Error('devrait avoir échoué'); }
    expect(resultat.raison).toContain('Sécurité');
    const copie = m.sousCreneaux.find((s) => s.Macro_creneau === macroCible)!;
    expect(copie).toBeDefined(); // le sous-créneau dédupliqué reste, même après l'échec du besoin
    expect(m.besoins.some((b) => b.Mission === mission1 && b.Sous_creneau === copie.id)).toBe(true);
    expect(m.besoins.some((b) => b.Mission === mission2 && b.Sous_creneau === copie.id)).toBe(false);
  });

  it("en mode connecté, si le repositionnement d'un indicatif échoue, le sous-créneau et le besoin déjà créés restent", async () => {
    const {m, macroSource, macroCible, mission1} = modeleDeuxJours();
    m.brancherEcriture(ecritureDeTest({
      remplacerSousCreneaux: async (_ids, nouveaux) => nouveaux.map((_, i) => 900 + i),
      creerBesoin: async () => 950,
      ajouterPosition: async () => { throw new Error('document indisponible'); },
    }));

    const resultat = await m.copierCreneauxJour(macroSource, macroCible);

    expect(resultat.ok).toBe(false);
    if (resultat.ok) { throw new Error('devrait avoir échoué'); }
    expect(resultat.raison).toContain('Buvette');
    const copie = m.sousCreneaux.find((s) => s.Macro_creneau === macroCible)!;
    expect(copie).toBeDefined();
    expect(m.besoins.some((b) => b.Mission === mission1 && b.Sous_creneau === copie.id)).toBe(true);
    expect(m.positionsGroupe.some((p) => p.Besoin !== 100 && p.Besoin !== 101)).toBe(false); // aucune position sur une copie
  });

  it('notifie les abonnés au moins une fois quand quelque chose a été copié', async () => {
    const {m, macroSource, macroCible} = modeleDeuxJours();
    let notifications = 0;
    m.subscribe(() => { notifications += 1; });

    await m.copierCreneauxJour(macroSource, macroCible);

    expect(notifications).toBeGreaterThan(0);
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
    const {m, missionId, c1, c2} = await modeleDeuxCreneauxPropres();
    const c1Avant = m.sousCreneaux.find((s) => s.id === c1)!;
    const [debutC1Avant, finC1Avant] = [c1Avant.Debut, c1Avant.Fin];

    const resultat = await m.deplacerCreneauxMission(c1, missionId, 900); // +15 min

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

    await m.deplacerCreneauxMission(c1DeMission, missionId, 900);

    expect(m.sousCreneaux.find((s) => s.id === cAutre)!.Debut).toBe(debutAutre);
  });

  it("en mode connecté, transmet tous les patches en un seul appel du pont, avec les nouveaux horaires", async () => {
    const {m, missionId, c1, c2} = await modeleDeuxCreneauxPropres();
    const appels: {id: Id; debut: number; fin: number}[] = [];
    m.brancherEcriture(ecritureDeTest({
      modifierSousCreneaux: async (patches) => { appels.push(...patches.map((p) => ({id: p.id, debut: p.debut, fin: p.fin}))); },
    }));

    await m.deplacerCreneauxMission(c1, missionId, 900);

    expect(appels.map((p) => p.id).sort((a, b) => a - b)).toEqual([c1, c2].sort((a, b) => a - b));
  });

  it("en mode connecté, si le pont échoue, rien ne bouge localement", async () => {
    const {m, missionId, c1} = await modeleDeuxCreneauxPropres();
    const avant = m.sousCreneaux.find((s) => s.id === c1)!.Debut;
    m.brancherEcriture(ecritureDeTest({modifierSousCreneaux: async () => { throw new Error('document indisponible'); }}));

    const resultat = await m.deplacerCreneauxMission(c1, missionId, 900);

    expect(resultat.ok).toBe(false);
    expect(m.sousCreneaux.find((s) => s.id === c1)!.Debut).toBe(avant);
  });
});

describe('Magasin.deplacerCreneauxMission — conversion depuis un commun (retour d\'Antoine du 2026-09-23)', () => {
  /** Une journée avec deux communs (10h-11h, 11h-12h) que deux missions
   *  voient encore toutes les deux — chacune avec un besoin sur le premier
   *  commun, pour vérifier que seul celui de la mission qui glisse suit. */
  async function modeleJourAvecCommunsEtBesoins(): Promise<{
    m: Magasin; mission1: Id; mission2: Id; c1: Id; c2: Id; b1: Id; b2: Id;
  }> {
    const c1Debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const c1Fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11});
    const c2Fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12});
    const m = new Magasin({
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      lieux: [], benevoles: [], artistes: [],
      missions: [
        {id: 1, Nom: 'Buvette', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
        {id: 2, Nom: 'Sécurité', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: []},
      ],
      macroCreneaux: [{id: 1, Nom: 'Journée', Debut: c1Debut, Fin: c2Fin}],
      sousCreneaux: [
        {id: 1, Macro_creneau: 1, Mission: null, Libelle: '10h-11h', Debut: c1Debut, Fin: c1Fin},
        {id: 2, Macro_creneau: 1, Mission: null, Libelle: '11h-12h', Debut: c1Fin, Fin: c2Fin},
      ],
      besoins: [
        {id: 1, Mission: 1, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
        {id: 2, Mission: 2, Sous_creneau: 1, Effectif_min: 1, Effectif_max: 1, Taille_groupe: 1},
      ],
      groupes: [], positionsGroupe: [], places: [],
      disponibilites: [], souhaitsMissions: [], affinites: [],
    });
    return {m, mission1: 1, mission2: 2, c1: 1, c2: 2, b1: 1, b2: 2};
  }

  it('rend le commun tiré propre à la mission qui glisse, puis le déplace, sans toucher l\'original', async () => {
    const {m, mission1, c1} = await modeleJourAvecCommunsEtBesoins();

    const resultat = await m.deplacerCreneauxMission(c1, mission1, 900); // +15 min

    expect(resultat.ok).toBe(true);
    const original = m.sousCreneaux.find((s) => s.id === c1)!;
    expect(original.Mission).toBeNull(); // le commun d'origine n'a pas bougé, ni changé de mission
    expect(original.Debut).toBe(epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10}));
    const copie = m.sousCreneaux.find((s) => s.Mission === mission1)!;
    expect(copie.id).not.toBe(c1); // nouvel id, jamais le même que le commun
    expect(copie.Debut).toBe(epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10}) + 900);
  });

  it('matérialise aussi les autres communs du même jour (§6.2 : tout ou rien par mission par jour)', async () => {
    const {m, mission1, c1, c2} = await modeleJourAvecCommunsEtBesoins();
    const c2Avant = m.sousCreneaux.find((s) => s.id === c2)!;

    await m.deplacerCreneauxMission(c1, mission1, 900);

    // Sans ça, mission1 perdrait toute visibilité sur c2 dès qu'elle a un
    // seul créneau propre ce jour-là (sousCreneauxApplicables ne mélange
    // jamais communs et propres pour une même mission).
    const propresDeMission1 = m.sousCreneaux.filter((s) => s.Mission === mission1);
    expect(propresDeMission1).toHaveLength(2);
    // c2 est aussi dans « la suite qui suit » c1 pour cette mission (même
    // règle que pour deux créneaux déjà propres, voir le describe
    // `Magasin.deplacerCreneauxMission` plus haut) : sa copie glisse avec.
    const copieDeC2 = propresDeMission1.find((s) => s.Debut === c2Avant.Debut + 900)!;
    expect(copieDeC2).toBeDefined();
    expect(copieDeC2.Fin).toBe(c2Avant.Fin + 900);
    expect(m.sousCreneaux.find((s) => s.id === c2)!.Mission).toBeNull(); // le commun d'origine reste commun, inchangé
  });

  it('repointe le besoin de la mission qui glisse vers la copie, sans toucher le commun ni les autres missions', async () => {
    const {m, mission1, mission2, c1, b1, b2} = await modeleJourAvecCommunsEtBesoins();

    await m.deplacerCreneauxMission(c1, mission1, 900);

    const copie = m.sousCreneaux.find((s) => s.Mission === mission1)!;
    expect(m.besoins.find((b) => b.id === b1)!.Sous_creneau).toBe(copie.id);
    expect(m.besoins.find((b) => b.id === b2)!.Sous_creneau).toBe(c1); // besoin de mission2 : inchangé
    expect(m.besoins.find((b) => b.Mission === mission2 && b.Sous_creneau === copie.id)).toBeUndefined();
  });

  it('un créneau déjà propre à la mission ne matérialise rien de plus', async () => {
    const {m, mission1, c1} = await modeleJourAvecCommunsEtBesoins();
    await m.deplacerCreneauxMission(c1, mission1, 900); // première conversion
    const nombreAvant = m.sousCreneaux.length;

    const copie = m.sousCreneaux.find((s) => s.Mission === mission1)!;
    const resultat = await m.deplacerCreneauxMission(copie.id, mission1, 900); // déjà propre

    expect(resultat.ok).toBe(true);
    expect(m.sousCreneaux).toHaveLength(nombreAvant); // aucune nouvelle matérialisation
  });

  it("en mode connecté, crée les copies puis repointe les besoins via le pont", async () => {
    const {m, mission1, b1} = await modeleJourAvecCommunsEtBesoins();
    const creations: {missionId: Id | null}[] = [];
    const repointages: {id: Id; sousCreneauId: Id}[] = [];
    let prochainIdReel = 100;
    m.brancherEcriture(ecritureDeTest({
      remplacerSousCreneaux: async (_idsASupprimer, nouveaux) => {
        creations.push(...nouveaux.map((n) => ({missionId: n.missionId})));
        return nouveaux.map(() => prochainIdReel++);
      },
      repointerBesoins: async (patches) => { repointages.push(...patches); },
      modifierSousCreneaux: async () => {},
    }));

    const resultat = await m.deplacerCreneauxMission(1, mission1, 900);

    expect(resultat.ok).toBe(true);
    expect(creations).toHaveLength(2); // les deux communs du jour, pas seulement celui glissé
    expect(creations.every((c) => c.missionId === mission1)).toBe(true); // jamais null : chacune est propre à mission1
    expect(repointages.map((p) => p.id)).toEqual([b1]);
  });

  it("en mode connecté, si la création des copies échoue, rien ne change localement", async () => {
    const {m, mission1, c1} = await modeleJourAvecCommunsEtBesoins();
    m.brancherEcriture(ecritureDeTest({
      remplacerSousCreneaux: async () => { throw new Error('document indisponible'); },
    }));

    const resultat = await m.deplacerCreneauxMission(c1, mission1, 900);

    expect(resultat.ok).toBe(false);
    expect(m.sousCreneaux.filter((s) => s.Mission === mission1)).toHaveLength(0);
  });
});

describe('Magasin.redimensionnerCreneauMission', () => {
  async function modeleUnCreneauPropre(): Promise<{m: Magasin; missionId: Id; sousCreneauId: Id; debut: number; fin: number}> {
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
    return {m, missionId: 1, sousCreneauId, debut: propreDebut, fin: propreFin};
  }

  it('allonge depuis la fin (bord droit tiré) sans toucher le début', async () => {
    const {m, missionId, sousCreneauId, debut} = await modeleUnCreneauPropre();

    const resultat = await m.redimensionnerCreneauMission(sousCreneauId, missionId, false, 900);

    expect(resultat).toEqual({ok: true});
    const sc = m.sousCreneaux.find((s) => s.id === sousCreneauId)!;
    expect(sc.Debut).toBe(debut);
    expect(sc.Fin).toBe(debut + 3600 + 900);
    expect(sc.id).toBe(sousCreneauId);
  });

  it('raccourcit depuis le début (bord gauche tiré) sans toucher la fin', async () => {
    const {m, missionId, sousCreneauId, fin} = await modeleUnCreneauPropre();

    const resultat = await m.redimensionnerCreneauMission(sousCreneauId, missionId, true, 900);

    expect(resultat).toEqual({ok: true});
    const sc = m.sousCreneaux.find((s) => s.id === sousCreneauId)!;
    expect(sc.Fin).toBe(fin);
  });

  it("refuse de descendre sous un quart d'heure et ne change rien", async () => {
    const {m, missionId, sousCreneauId, debut, fin} = await modeleUnCreneauPropre();

    const resultat = await m.redimensionnerCreneauMission(sousCreneauId, missionId, true, 3600 - 600); // ne laisserait que 10 min

    expect(resultat.ok).toBe(false);
    const sc = m.sousCreneaux.find((s) => s.id === sousCreneauId)!;
    expect(sc.Debut).toBe(debut);
    expect(sc.Fin).toBe(fin);
  });

  it('en mode connecté, si le pont échoue, rien ne change localement', async () => {
    const {m, missionId, sousCreneauId, debut, fin} = await modeleUnCreneauPropre();
    m.brancherEcriture(ecritureDeTest({modifierSousCreneaux: async () => { throw new Error('document indisponible'); }}));

    const resultat = await m.redimensionnerCreneauMission(sousCreneauId, missionId, false, 900);

    expect(resultat.ok).toBe(false);
    const sc = m.sousCreneaux.find((s) => s.id === sousCreneauId)!;
    expect(sc.Debut).toBe(debut);
    expect(sc.Fin).toBe(fin);
  });
});

describe('Magasin.redimensionnerCreneauMission — conversion depuis un commun', () => {
  it('rend le commun tiré propre à la mission, puis le redimensionne', async () => {
    const debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12});
    const m = new Magasin({
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      lieux: [], benevoles: [], artistes: [],
      missions: [{
        id: 1, Nom: 'Buvette', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: [],
      }],
      macroCreneaux: [{id: 1, Nom: 'Journée', Debut: debut, Fin: fin}],
      sousCreneaux: [{id: 1, Macro_creneau: 1, Mission: null, Libelle: '10h-12h', Debut: debut, Fin: fin}],
      besoins: [], groupes: [], positionsGroupe: [], places: [],
      disponibilites: [], souhaitsMissions: [], affinites: [],
    });

    const resultat = await m.redimensionnerCreneauMission(1, 1, false, 900);

    expect(resultat.ok).toBe(true);
    expect(m.sousCreneaux.find((s) => s.id === 1)!.Mission).toBeNull(); // le commun d'origine, inchangé
    const copie = m.sousCreneaux.find((s) => s.Mission === 1)!;
    expect(copie.id).not.toBe(1);
    expect(copie.Debut).toBe(debut);
    expect(copie.Fin).toBe(fin + 900);
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

describe('Magasin.parametre', () => {
  it('rend la valeur des réglages passés au constructeur', () => {
    const m = new Magasin(normaliser(), [{cle: 'heure_coupure_jour', valeur: '6'}]);
    expect(m.parametre('heure_coupure_jour')).toBe('6');
  });

  it('rend undefined pour une clé absente — au clone/à l\'appelant de décider du défaut', () => {
    const m = new Magasin(normaliser());
    expect(m.parametre('inconnue')).toBeUndefined();
  });

  it('cloner() emporte les réglages déjà connus', () => {
    const m = new Magasin(normaliser(), [{cle: 'x', valeur: '1'}]);
    expect(m.cloner().parametre('x')).toBe('1');
  });
});

describe('Magasin.valeursColonneBrute', () => {
  it('sans écrivain branché (mode démo, clone), rend une Map vide', async () => {
    const m = new Magasin(normaliser());
    expect(await m.valeursColonneBrute('UneTable', 'UneColonne')).toEqual(new Map());
  });

  it('avec une écriture branchée, transmet tableId/colId tels quels et rend son résultat', async () => {
    const appels: unknown[] = [];
    const m = new Magasin(normaliser());
    m.brancherEcriture(ecritureDeTest({
      valeursColonneBrute: async (tableId, colId) => {
        appels.push({tableId, colId});
        return new Map([[1, 'a'], [2, 'b']]);
      },
    }));

    const valeurs = await m.valeursColonneBrute('Souhaits_artistes', 'Reponse');

    expect(appels).toEqual([{tableId: 'Souhaits_artistes', colId: 'Reponse'}]);
    expect(valeurs).toEqual(new Map([[1, 'a'], [2, 'b']]));
  });
});

describe('Magasin.colonnesTable', () => {
  it('sans écrivain branché (mode démo, clone), rend un tableau vide', async () => {
    const m = new Magasin(normaliser());
    expect(await m.colonnesTable('Benevoles')).toEqual([]);
  });

  it('avec une écriture branchée, transmet tableId tel quel et rend son résultat', async () => {
    const appels: unknown[] = [];
    const m = new Magasin(normaliser());
    m.brancherEcriture(ecritureDeTest({
      colonnesTable: async (tableId) => {
        appels.push({tableId});
        return [{colId: 'Reponse', label: 'Réponse', type: 'Text'}];
      },
    }));

    const colonnes = await m.colonnesTable('Benevoles');

    expect(appels).toEqual([{tableId: 'Benevoles'}]);
    expect(colonnes).toEqual([{colId: 'Reponse', label: 'Réponse', type: 'Text'}]);
  });
});

describe('Magasin.definirParametre', () => {
  it('sans écrivain branché (mode démo), enregistre la valeur localement', async () => {
    const m = new Magasin(normaliser());
    await m.definirParametre('x', '1');
    expect(m.parametre('x')).toBe('1');
  });

  it('avec une écriture branchée, transmet clé/valeur telles quelles puis les applique localement', async () => {
    const appels: unknown[] = [];
    const m = new Magasin(normaliser());
    m.brancherEcriture(ecritureDeTest({
      definirParametre: async (cle, valeur) => { appels.push({cle, valeur}); },
    }));

    await m.definirParametre('heure_coupure_jour', '7');

    expect(appels).toEqual([{cle: 'heure_coupure_jour', valeur: '7'}]);
    expect(m.parametre('heure_coupure_jour')).toBe('7');
  });

  it("sur échec de l'écriture, ne modifie pas le réglage local", async () => {
    const m = new Magasin(normaliser(), [{cle: 'x', valeur: 'avant'}]);
    m.brancherEcriture(ecritureDeTest({
      definirParametre: async () => { throw new Error('document indisponible'); },
    }));

    await expect(m.definirParametre('x', 'après')).rejects.toThrow('document indisponible');
    expect(m.parametre('x')).toBe('avant');
  });
});

describe('Magasin.remplacerDisponibilites', () => {
  function dispo(
    benevoleId: number, quartHeure: number, statut: 'Disponible' | 'Indisponible' | 'Artiste' = 'Disponible',
  ) {
    return {Benevole: benevoleId, Quart_heure: quartHeure, Statut: statut, Artiste: null};
  }

  it('sans écrivain branché (mode démo), remplace uniquement les lignes du bénévole sur la plage donnée', async () => {
    const m = new Magasin({
      ...normaliser(),
      disponibilites: [dispo(1, 100), dispo(1, 200), dispo(2, 100)],
    });

    await m.remplacerDisponibilites(1, 100, 200, [dispo(1, 100, 'Indisponible')]);

    expect(m.disponibilites).toEqual([dispo(1, 200), dispo(2, 100), dispo(1, 100, 'Indisponible')]);
  });

  it('avec une écriture branchée, transmet les arguments tels quels puis applique le même remplacement localement', async () => {
    const appels: unknown[] = [];
    const m = new Magasin({...normaliser(), disponibilites: [dispo(1, 100)]});
    m.brancherEcriture(ecritureDeTest({
      remplacerDisponibilites: async (benevoleId, debut, fin, nouvelles) => {
        appels.push({benevoleId, debut, fin, nouvelles});
      },
    }));

    await m.remplacerDisponibilites(1, 100, 200, [dispo(1, 100, 'Artiste')]);

    expect(appels).toEqual([{benevoleId: 1, debut: 100, fin: 200, nouvelles: [dispo(1, 100, 'Artiste')]}]);
    expect(m.disponibilites).toEqual([dispo(1, 100, 'Artiste')]);
  });

  it("sur échec de l'écriture, ne modifie pas les disponibilités locales", async () => {
    const m = new Magasin({...normaliser(), disponibilites: [dispo(1, 100)]});
    m.brancherEcriture(ecritureDeTest({
      remplacerDisponibilites: async () => { throw new Error('document indisponible'); },
    }));

    await expect(m.remplacerDisponibilites(1, 100, 200, [dispo(1, 100, 'Indisponible')]))
      .rejects.toThrow('document indisponible');
    expect(m.disponibilites).toEqual([dispo(1, 100)]);
  });
});

describe('Magasin.reinitialiserAffectations', () => {
  function place(partiel: Partial<{id: Id; Benevole: Id | null; Origine: 'Manuel' | 'Algorithme'; Verrouillee: boolean; Score: number}>) {
    return {id: 1, Groupe: 1, Rang: 1, Benevole: null, Origine: 'Manuel' as const, Verrouillee: false, Score: 0, ...partiel};
  }

  it('vide et déverrouille chaque place affectée ou verrouillée, y compris une place verrouillée déjà vide (demande d’Antoine, 2026-09-23)', async () => {
    const m = new Magasin({
      ...normaliser(),
      places: [
        place({id: 1, Benevole: 10, Origine: 'Algorithme', Verrouillee: false, Score: 0.8}), // à vider
        place({id: 2, Benevole: null, Origine: 'Manuel', Verrouillee: true, Score: 0}), // verrouillée vide : sinon ignorée pour toujours par le solveur
        place({id: 3, Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0}), // déjà à l'état cible
      ],
    });

    const resultat = await m.reinitialiserAffectations();

    expect(resultat).toEqual({ok: true});
    expect(m.places).toEqual([
      place({id: 1}), place({id: 2}), place({id: 3}),
    ]);
  });

  it("en mode connecté, n'écrit que les places qui ont réellement changé", async () => {
    const appels: unknown[] = [];
    const m = new Magasin({
      ...normaliser(),
      places: [
        place({id: 1, Benevole: 10}),
        place({id: 2, Verrouillee: true}),
        place({id: 3}), // déjà vide et déverrouillée : pas de patch attendu
      ],
    });
    m.brancherEcriture(ecritureDeTest({
      modifierPlaces: async (patches) => { appels.push(...patches); },
    }));

    await m.reinitialiserAffectations();

    expect(appels).toEqual([
      {id: 1, benevoleId: null, origine: 'Manuel', verrouillee: false, score: 0},
      {id: 2, benevoleId: null, origine: 'Manuel', verrouillee: false, score: 0},
    ]);
  });

  it("sur échec de l'écriture, ne modifie aucune place localement", async () => {
    const m = new Magasin({...normaliser(), places: [place({id: 1, Benevole: 10})]});
    m.brancherEcriture(ecritureDeTest({modifierPlaces: async () => { throw new Error('document indisponible'); }}));

    const resultat = await m.reinitialiserAffectations();

    expect(resultat).toEqual({ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."});
    expect(m.places).toEqual([place({id: 1, Benevole: 10})]);
  });

  it("ne fait rien (et n'appelle pas le pont) si tout est déjà vide et déverrouillé", async () => {
    let appele = false;
    const m = new Magasin({...normaliser(), places: [place({id: 1})]});
    m.brancherEcriture(ecritureDeTest({modifierPlaces: async () => { appele = true; }}));

    const resultat = await m.reinitialiserAffectations();

    expect(resultat).toEqual({ok: true});
    expect(appele).toBe(false);
  });
});
