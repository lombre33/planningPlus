/**
 * Tout ce qui se calcule à partir du `Modele` plutôt que de s'y stocker :
 * couverture d'un besoin, classement de candidats pour une place, anomalies,
 * trajectoire d'un indicatif. Aucune fonction ici ne mute le magasin.
 */

import type {
  Besoin, Groupe, Id, MacroCreneau, Place, SousCreneau, StatutDisponibilite,
} from '../domain/types';
import {cleJour, libelleJourLong, PAS_SECONDES} from '../temps';
import type {Magasin} from '../store';

// --- Index -------------------------------------------------------------

export function indexer(m: Magasin) {
  return {
    equipe: new Map(m.equipes.map((e) => [e.id, e])),
    lieu: new Map(m.lieux.map((l) => [l.id, l])),
    benevole: new Map(m.benevoles.map((b) => [b.id, b])),
    mission: new Map(m.missions.map((mi) => [mi.id, mi])),
    artiste: new Map(m.artistes.map((a) => [a.id, a])),
    macroCreneau: new Map(m.macroCreneaux.map((mc) => [mc.id, mc])),
    sousCreneau: new Map(m.sousCreneaux.map((s) => [s.id, s])),
    besoin: new Map(m.besoins.map((b) => [b.id, b])),
    groupe: new Map(m.groupes.map((g) => [g.id, g])),
  };
}
export type Index = ReturnType<typeof indexer>;

// --- Jours -------------------------------------------------------------

export interface Jour {
  cle: string;
  libelle: string;
  macros: MacroCreneau[];
}

/** Regroupe les macro-créneaux par jour civil (heure locale) de leur début.
 *  Une soirée qui franchit minuit reste rattachée à son jour de début. */
export function regrouperParJour(macroCreneaux: MacroCreneau[]): Jour[] {
  const parCle = new Map<string, MacroCreneau[]>();
  for (const macro of macroCreneaux) {
    const cle = cleJour(macro.Debut);
    const liste = parCle.get(cle) ?? [];
    liste.push(macro);
    parCle.set(cle, liste);
  }
  return [...parCle.entries()]
    .map(([cle, macros]) => ({
      cle, libelle: libelleJourLong(macros[0]!.Debut),
      macros: macros.sort((a, b) => a.Debut - b.Debut),
    }))
    .sort((a, b) => a.macros[0]!.Debut - b.macros[0]!.Debut);
}

// --- Créneaux et couverture ----------------------------------------------

export function quartsDuSousCreneau(sc: SousCreneau): number[] {
  const quarts: number[] = [];
  for (let t = sc.Debut; t < sc.Fin; t += PAS_SECONDES) { quarts.push(t); }
  return quarts;
}

/** Les positions d'un groupe, triées par heure de début du sous-créneau. */
export function positionsDuGroupe(m: Magasin, ix: Index, groupeId: Id) {
  return m.positionsGroupe
    .filter((p) => p.Groupe === groupeId)
    .map((p) => {
      const besoin = ix.besoin.get(p.Besoin)!;
      const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau)!;
      return {position: p, besoin, sousCreneau};
    })
    .sort((a, b) => a.sousCreneau.Debut - b.sousCreneau.Debut);
}

export function quartsCouvertsParGroupe(m: Magasin, ix: Index, groupeId: Id): Set<number> {
  const quarts = new Set<number>();
  for (const {sousCreneau} of positionsDuGroupe(m, ix, groupeId)) {
    for (const q of quartsDuSousCreneau(sousCreneau)) { quarts.add(q); }
  }
  return quarts;
}

export function missionsCouvertesParGroupe(m: Magasin, ix: Index, groupeId: Id): Id[] {
  return [...new Set(positionsDuGroupe(m, ix, groupeId).map((p) => p.besoin.Mission))];
}

export function placesDuGroupe(m: Magasin, groupeId: Id): Place[] {
  return m.places.filter((p) => p.Groupe === groupeId).sort((a, b) => a.Rang - b.Rang);
}

export interface Couverture {
  besoin: Besoin;
  groupesPositionnes: {groupe: Groupe; places: Place[]}[];
  places: number;   // total de places ouvertes (somme des tailles des groupes positionnés)
  pourvues: number; // places avec un bénévole
  statut: 'ok' | 'partiel' | 'sous';
}

export function couvertureBesoin(m: Magasin, ix: Index, besoinId: Id): Couverture {
  const besoin = ix.besoin.get(besoinId)!;
  const positions = m.positionsGroupe.filter((p) => p.Besoin === besoinId);
  const groupesPositionnes = positions.map((p) => {
    const groupe = ix.groupe.get(p.Groupe)!;
    return {groupe, places: placesDuGroupe(m, groupe.id)};
  });
  const places = groupesPositionnes.reduce((n, g) => n + g.groupe.Taille, 0);
  const pourvues = groupesPositionnes.reduce((n, g) => n + g.places.filter((pl) => pl.Benevole != null).length, 0);
  const statut: Couverture['statut'] = pourvues < besoin.Effectif_min ? 'sous'
    : pourvues < places ? 'partiel' : 'ok';
  return {besoin, groupesPositionnes, places, pourvues, statut};
}

/** Heures distinctes couvertes par les places actuellement tenues par un
 *  bénévole, tous groupes confondus. */
export function heuresAffectees(m: Magasin, ix: Index, benevoleId: Id): number {
  const quarts = new Set<number>();
  for (const place of m.places) {
    if (place.Benevole !== benevoleId) { continue; }
    for (const q of quartsCouvertsParGroupe(m, ix, place.Groupe)) { quarts.add(q); }
  }
  return quarts.size * (PAS_SECONDES / 3600);
}

/** Occupation actuelle d'un bénévole : l'ensemble des quarts d'heure où il
 *  tient déjà une place ailleurs (tous groupes confondus). */
function occupationBenevoles(m: Magasin, ix: Index): Map<Id, Set<number>> {
  const occ = new Map<Id, Set<number>>();
  for (const place of m.places) {
    if (place.Benevole == null) { continue; }
    const set = occ.get(place.Benevole) ?? new Set<number>();
    for (const q of quartsCouvertsParGroupe(m, ix, place.Groupe)) { set.add(q); }
    occ.set(place.Benevole, set);
  }
  return occ;
}

function statutQuart(m: Magasin, benevoleId: Id, quart: number): StatutDisponibilite | 'Non renseigné' {
  const d = m.disponibilites.find((d) => d.Benevole === benevoleId && d.Quart_heure === quart);
  return d ? d.Statut : 'Non renseigné';
}

// --- Classement des candidats ---------------------------------------------

export interface Candidat {
  benevoleId: Id;
  nom: string;
  equipeNom: string;
  score: number;
  tags: {texte: string; sens: 'plus' | 'moins'}[];
}

/**
 * Classe les bénévoles pouvant occuper une place du groupe `groupeId`.
 * Affecter quelqu'un ici vaut pour toutes les positions du groupe (§6.3) :
 * le classement tient donc compte de *tous* les quarts d'heure et de
 * *toutes* les missions que le groupe couvre, pas seulement du besoin
 * affiché.
 *
 * Contraintes dures (jamais proposées) : statut actif, compétences
 * requises détenues, jamais de refus explicite sur une mission couverte,
 * aucune indisponibilité déclarée, aucun chevauchement avec une autre place
 * déjà tenue. Le reste (souhait, équipe, artiste souhaité, quota) pondère
 * le score et s'affiche en motif.
 */
export function classerCandidats(
  m: Magasin, ix: Index, groupeId: Id, options: {exclure?: Id} = {},
): Candidat[] {
  const groupe = ix.groupe.get(groupeId)!;
  const quarts = [...quartsCouvertsParGroupe(m, ix, groupeId)];
  const missions = missionsCouvertesParGroupe(m, ix, groupeId).map((id) => ix.mission.get(id)!);
  const competencesRequises = [...new Set(missions.flatMap((mi) => mi.Competences_requises))];
  const occupation = occupationBenevoles(m, ix);

  const resultats: Candidat[] = [];
  for (const benevole of m.benevoles) {
    if (options.exclure != null && benevole.id === options.exclure) { continue; }
    if (benevole.Statut !== 'Actif') { continue; }
    if (competencesRequises.some((c) => !benevole.Competences.includes(c))) { continue; }
    const refuse = missions.some((mi) => m.souhaitsMissions.some(
      (s) => s.Benevole === benevole.id && s.Mission === mi.id && s.Preference === 'Refuse',
    ));
    if (refuse) { continue; }
    const occupe = occupation.get(benevole.id);
    if (occupe && quarts.some((q) => occupe.has(q))) { continue; }
    const indisponible = quarts.some((q) => statutQuart(m, benevole.id, q) === 'Indisponible');
    if (indisponible) { continue; }

    const tags: Candidat['tags'] = [];
    let score = 0.5;

    const equipe = ix.equipe.get(benevole.Equipe)!;
    if (benevole.Equipe === groupe.Equipe) {
      tags.push({texte: `équipe ${equipe.Nom}`, sens: 'plus'});
      score += 0.15;
    } else {
      tags.push({texte: `hors équipe (${equipe.Nom})`, sens: 'moins'});
      score -= 0.1;
    }

    const meilleurSouhait = missions.reduce<string | null>((meilleur, mi) => {
      const s = m.souhaitsMissions.find((s) => s.Benevole === benevole.id && s.Mission === mi.id);
      if (!s) { return meilleur; }
      const rang = ['Refuse', 'Réticent', 'Neutre', 'Intéressé', 'Souhaite fortement'].indexOf(s.Preference);
      const rangMeilleur = meilleur ? ['Refuse', 'Réticent', 'Neutre', 'Intéressé', 'Souhaite fortement'].indexOf(meilleur) : -1;
      return rang > rangMeilleur ? s.Preference : meilleur;
    }, null);
    if (meilleurSouhait === 'Souhaite fortement') { tags.push({texte: 'souhaite fortement', sens: 'plus'}); score += 0.35; }
    else if (meilleurSouhait === 'Intéressé') { tags.push({texte: 'intéressé', sens: 'plus'}); score += 0.15; }
    else if (meilleurSouhait === 'Réticent') { tags.push({texte: 'réticent', sens: 'moins'}); score -= 0.15; }

    const conflitArtiste = quarts.some((q) => statutQuart(m, benevole.id, q) === 'Artiste');
    if (conflitArtiste) {
      tags.push({texte: 'veut voir un artiste sur ce créneau', sens: 'moins'});
      score -= 0.3;
    }

    const heuresDeja = heuresAffectees(m, ix, benevole.id);
    const heuresGroupe = quarts.length * (PAS_SECONDES / 3600);
    if (heuresDeja + heuresGroupe > benevole.Quota_heures_max) {
      tags.push({texte: `dépasse son quota (${benevole.Quota_heures_max} h)`, sens: 'moins'});
      score -= 0.2;
    } else if (heuresDeja + heuresGroupe < benevole.Quota_heures_min) {
      tags.push({texte: 'sous son quota minimum', sens: 'plus'});
      score += 0.05;
    }

    resultats.push({benevoleId: benevole.id, nom: benevole.Nom, equipeNom: equipe.Nom, score, tags});
  }

  return resultats.sort((a, b) => b.score - a.score).slice(0, 8);
}

// --- Anomalies -------------------------------------------------------------

export type Anomalie =
  | {type: 'sous-effectif'; gravite: 'danger'; besoin: Besoin; missionNom: string; sousCreneauLibelle: string; manque: number}
  | {type: 'sur-effectif'; gravite: 'warn'; besoin: Besoin; missionNom: string; sousCreneauLibelle: string; surplus: number}
  | {type: 'souhait-refuse'; gravite: 'danger'; place: Place; benevoleNom: string; missionNom: string; groupeCode: string}
  | {type: 'indisponibilite'; gravite: 'danger'; place: Place; benevoleNom: string; groupeCode: string; sousCreneauLibelle: string}
  | {type: 'conflit-artiste'; gravite: 'warn'; place: Place; benevoleNom: string; artisteNom: string; groupeCode: string}
  | {type: 'hors-quota'; gravite: 'warn'; benevoleId: Id; benevoleNom: string; heures: number; quotaMax: number};

export function calculerAnomalies(m: Magasin, ix: Index): Anomalie[] {
  const anomalies: Anomalie[] = [];

  for (const besoin of m.besoins) {
    const c = couvertureBesoin(m, ix, besoin.id);
    if (c.statut === 'sous') {
      anomalies.push({
        type: 'sous-effectif', gravite: 'danger', besoin,
        missionNom: ix.mission.get(besoin.Mission)!.Nom,
        sousCreneauLibelle: ix.sousCreneau.get(besoin.Sous_creneau)!.Libelle,
        manque: besoin.Effectif_min - c.pourvues,
      });
    } else if (c.pourvues > besoin.Effectif_max) {
      anomalies.push({
        type: 'sur-effectif', gravite: 'warn', besoin,
        missionNom: ix.mission.get(besoin.Mission)!.Nom,
        sousCreneauLibelle: ix.sousCreneau.get(besoin.Sous_creneau)!.Libelle,
        surplus: c.pourvues - besoin.Effectif_max,
      });
    }
  }

  for (const place of m.places) {
    if (place.Benevole == null) { continue; }
    const benevole = ix.benevole.get(place.Benevole)!;
    const groupe = ix.groupe.get(place.Groupe)!;
    const missions = missionsCouvertesParGroupe(m, ix, groupe.id).map((id) => ix.mission.get(id)!);
    const quarts = [...quartsCouvertsParGroupe(m, ix, groupe.id)];

    const refus = missions.find((mi) => m.souhaitsMissions.some(
      (s) => s.Benevole === benevole.id && s.Mission === mi.id && s.Preference === 'Refuse',
    ));
    if (refus) {
      anomalies.push({
        type: 'souhait-refuse', gravite: 'danger', place,
        benevoleNom: benevole.Nom, missionNom: refus.Nom, groupeCode: groupe.Code,
      });
    }

    const quartIndispo = quarts.find((q) => statutQuart(m, benevole.id, q) === 'Indisponible');
    if (quartIndispo !== undefined) {
      const sc = positionsDuGroupe(m, ix, groupe.id).find(
        (p) => quartsDuSousCreneau(p.sousCreneau).includes(quartIndispo),
      )?.sousCreneau;
      anomalies.push({
        type: 'indisponibilite', gravite: 'danger', place,
        benevoleNom: benevole.Nom, groupeCode: groupe.Code,
        sousCreneauLibelle: sc?.Libelle ?? '',
      });
    }

    const quartArtiste = quarts.find((q) => statutQuart(m, benevole.id, q) === 'Artiste');
    if (quartArtiste !== undefined) {
      const dispo = m.disponibilites.find((d) => d.Benevole === benevole.id && d.Quart_heure === quartArtiste);
      const nomArtiste = dispo?.Artiste != null ? ix.artiste.get(dispo.Artiste)?.Nom : undefined;
      anomalies.push({
        type: 'conflit-artiste', gravite: 'warn', place,
        benevoleNom: benevole.Nom, artisteNom: nomArtiste ?? 'un artiste souhaité', groupeCode: groupe.Code,
      });
    }
  }

  for (const benevole of m.benevoles) {
    const heures = heuresAffectees(m, ix, benevole.id);
    if (heures > benevole.Quota_heures_max) {
      anomalies.push({
        type: 'hors-quota', gravite: 'warn', benevoleId: benevole.id,
        benevoleNom: benevole.Nom, heures, quotaMax: benevole.Quota_heures_max,
      });
    }
  }

  return anomalies.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === 'danger' ? -1 : 1));
}

// --- Jour J : remplacement et permutations ----------------------------------

/** Les places actuellement tenues par un bénévole, avec leur groupe et un
 *  aperçu de ce qu'elles couvrent. */
export function placesDuBenevole(m: Magasin, ix: Index, benevoleId: Id) {
  return m.places
    .filter((p) => p.Benevole === benevoleId)
    .map((place) => {
      const groupe = ix.groupe.get(place.Groupe)!;
      const positions = positionsDuGroupe(m, ix, groupe.id);
      return {place, groupe, positions};
    });
}

export interface EtapePermutation {
  benevoleId: Id;
  benevoleNom: string;
  place: Place;
  groupeCode: string;
  depuisMissionNom: string | null; // null = candidat frais, ne quitte aucune autre place
  versMissionNom: string;
}

/**
 * Cherche une permutation à un cran pour repourvoir `placeVacanteId` quand
 * aucun candidat direct propre n'existe : déplace un bénévole déjà affecté
 * ailleurs — sur un besoin qui resterait couvert sans lui — vers la place
 * vacante, puis cherche un candidat frais pour la place qu'il libère à son
 * tour (§7.3 : permutations autorisées dans le périmètre touché, avec
 * aperçu avant validation). Ne modifie rien : c'est à l'appelant de valider.
 */
export function proposerPermutation(m: Magasin, ix: Index, placeVacanteId: Id): EtapePermutation[] | null {
  const placeVacante = m.places.find((p) => p.id === placeVacanteId);
  if (!placeVacante) { return null; }
  const groupeCible = ix.groupe.get(placeVacante.Groupe)!;
  const missionCible = missionsCouvertesParGroupe(m, ix, groupeCible.id)
    .map((id) => ix.mission.get(id)!)[0];

  const directs = classerCandidats(m, ix, groupeCible.id);
  const meilleurDirect = directs[0];
  const direct = meilleurDirect && !meilleurDirect.tags.some((t) => t.sens === 'moins');
  if (direct) { return null; } // un remplaçant propre existe déjà, inutile de permuter

  for (const donneur of m.places) {
    if (donneur.Benevole == null || donneur.Verrouillee || donneur.id === placeVacanteId) { continue; }
    const groupeDonneur = ix.groupe.get(donneur.Groupe)!;
    if (groupeDonneur.id === groupeCible.id) { continue; }

    // Le groupe donneur ne doit pas tomber sous le minimum une fois ce
    // bénévole retiré : on vérifie chacun de ses besoins positionnés.
    const resteAuDessusDuMinimum = positionsDuGroupe(m, ix, groupeDonneur.id).every(({besoin}) => {
      const c = couvertureBesoin(m, ix, besoin.id);
      return c.pourvues - 1 >= besoin.Effectif_min;
    });
    if (!resteAuDessusDuMinimum) { continue; }

    // Le donneur doit lui-même être un candidat propre (sans motif négatif)
    // pour la place cible, sans quoi la permutation ne résout rien.
    const evalCible = classerCandidats(m, ix, groupeCible.id).find((c) => c.benevoleId === donneur.Benevole);
    if (!evalCible || evalCible.tags.some((t) => t.sens === 'moins')) { continue; }

    const candidatsPourDonneur = classerCandidats(m, ix, groupeDonneur.id, {exclure: donneur.Benevole});
    if (candidatsPourDonneur.length === 0) { continue; }
    const remplacant = candidatsPourDonneur[0]!;

    const benevoleDonneur = ix.benevole.get(donneur.Benevole)!;
    const missionDonneur = missionsCouvertesParGroupe(m, ix, groupeDonneur.id).map((id) => ix.mission.get(id)!)[0];

    return [
      {
        benevoleId: benevoleDonneur.id, benevoleNom: benevoleDonneur.Nom, place: placeVacante,
        groupeCode: groupeCible.Code,
        depuisMissionNom: missionDonneur?.Nom ?? groupeDonneur.Code,
        versMissionNom: missionCible?.Nom ?? groupeCible.Code,
      },
      {
        benevoleId: remplacant.benevoleId, benevoleNom: remplacant.nom, place: donneur,
        groupeCode: groupeDonneur.Code,
        depuisMissionNom: null,
        versMissionNom: missionDonneur?.Nom ?? groupeDonneur.Code,
      },
    ];
  }
  return null;
}
