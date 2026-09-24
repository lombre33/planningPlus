/**
 * Données dérivées pour les deux vues imprimables demandées par Antoine le
 * 2026-09-23 (roster des bénévoles et plannings par équipe, tous deux au
 * quart d'heure, lecture seule, pensés pour être distribués sur papier).
 *
 * Rien ici ne mute le magasin. Volontairement séparé de `logic/derive.ts`
 * (propriété du fil Intégration pendant que ce fil construit les deux vues
 * imprimables) : ce module n'appelle que ce qui y est déjà exporté.
 */

import type {Disponibilite, Epoch, Id} from '../domain/types';
import {
  type Index, placesDuGroupe, positionsDuGroupe, quartsDuSousCreneau,
} from './derive';
import type {Magasin} from '../store';

export interface AffectationQuart {
  missionNom: string;
  groupeCode: string;
}

/**
 * Pour chaque bénévole tenant une place, ce à quoi il est affecté à chaque
 * quart d'heure du jour affiché (mission + indicatif) : place → groupe →
 * positions → besoins → sous-créneaux, le même chemin que `feuilleBenevole`
 * dans `logic/derive.ts`, mais indexé par quart d'heure pour un accès O(1)
 * répété sur toute une grille plutôt qu'une liste chronologique. Un groupe
 * orphelin (référence cassée, même défaut déjà corrigé ailleurs le
 * 2026-09-23) est ignoré plutôt que de faire planter toute la grille.
 */
export function affectationsQuartParBenevole(
  m: Magasin, ix: Index, quartsDuJour: ReadonlySet<Epoch>,
): Map<Id, Map<Epoch, AffectationQuart>> {
  const resultat = new Map<Id, Map<Epoch, AffectationQuart>>();
  for (const place of m.places) {
    if (place.Benevole == null) { continue; }
    const groupe = ix.groupe.get(place.Groupe);
    if (!groupe) { continue; }
    for (const {besoin, sousCreneau} of positionsDuGroupe(m, ix, groupe.id)) {
      const mission = ix.mission.get(besoin.Mission);
      if (!mission) { continue; }
      for (const quart of quartsDuSousCreneau(sousCreneau)) {
        if (!quartsDuJour.has(quart)) { continue; }
        let parQuart = resultat.get(place.Benevole);
        if (!parQuart) { parQuart = new Map(); resultat.set(place.Benevole, parQuart); }
        parQuart.set(quart, {missionNom: mission.Nom, groupeCode: groupe.Code});
      }
    }
  }
  return resultat;
}

/**
 * L'indicatif (code du groupe) qu'un bénévole tient ce jour-là, ou `null`
 * s'il n'en tient aucun. Au plus un seul : l'exclusivité par jour (§7.1,
 * demande d'Antoine du 2026-09-23, commit `7fc0b30`) empêche qu'un bénévole
 * tienne deux groupes actifs sur le même macro-créneau — la première entrée
 * suffit donc, jamais un vrai choix à faire entre plusieurs.
 */
export function indicatifDuJour(
  affectationsBenevole: Map<Epoch, AffectationQuart> | undefined,
): string | null {
  if (!affectationsBenevole || affectationsBenevole.size === 0) { return null; }
  return [...affectationsBenevole.values()][0]!.groupeCode;
}

/**
 * Bénévoles ayant au moins un quart d'heure déclaré disponible (« Disponible »
 * ou « Artiste » — vouloir voir un artiste reste une disponibilité de fait,
 * cf. `moteur/eligibilite.ts` : seule « Indisponible » bloque) ce jour-là.
 * Une disponibilité même partielle suffit — demande explicite d'Antoine :
 * « y compris sur des créneaux réduits ». Une absence totale de ligne vaut
 * indisponible partout, comme ailleurs dans le widget (§6.4).
 */
export function benevolesDisponiblesCeJour<B extends {id: Id}>(
  benevoles: readonly B[], indexDispos: Map<Id, Map<Epoch, Disponibilite>>, quartsDuJour: readonly Epoch[],
): B[] {
  return benevoles.filter((b) => {
    const parQuart = indexDispos.get(b.id);
    if (!parQuart) { return false; }
    return quartsDuJour.some((q) => {
      const d = parQuart.get(q);
      return d !== undefined && d.Statut !== 'Indisponible';
    });
  });
}

export interface EntreeAffectationMission {
  benevoleNom: string;
  groupeCode: string;
}

export interface AffectationMissionQuart {
  entrees: EntreeAffectationMission[];
}

/**
 * Pour chaque mission ayant au moins un besoin pourvu ce jour-là, qui la
 * tient à chaque quart d'heure (nom du bénévole + indicatif). Plusieurs
 * indicatifs — ou plusieurs bénévoles d'un même indicatif — peuvent couvrir
 * le même besoin à la fois (`Taille_groupe`/`Effectif_min` > 1, ou plusieurs
 * groupes positionnés dessus) : toutes les entrées sont conservées, pas
 * seulement la première. Un besoin sans aucune place pourvue n'apparaît pas
 * (rien à afficher) — une case vide se lit comme « non couverte », pas comme
 * une absence de calcul.
 */
export function affectationsQuartParMission(
  m: Magasin, ix: Index, quartsDuJour: ReadonlySet<Epoch>,
): Map<Id, Map<Epoch, AffectationMissionQuart>> {
  const resultat = new Map<Id, Map<Epoch, AffectationMissionQuart>>();
  for (const besoin of m.besoins) {
    const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau);
    if (!sousCreneau) { continue; }
    const quartsBesoin = quartsDuSousCreneau(sousCreneau).filter((q) => quartsDuJour.has(q));
    if (quartsBesoin.length === 0) { continue; }

    const entrees: EntreeAffectationMission[] = [];
    for (const position of m.positionsGroupe) {
      if (position.Besoin !== besoin.id) { continue; }
      const groupe = ix.groupe.get(position.Groupe);
      if (!groupe) { continue; }
      for (const place of placesDuGroupe(m, groupe.id)) {
        if (place.Benevole == null) { continue; }
        const benevole = ix.benevole.get(place.Benevole);
        if (!benevole) { continue; }
        entrees.push({benevoleNom: benevole.Nom, groupeCode: groupe.Code});
      }
    }
    if (entrees.length === 0) { continue; }

    let parQuart = resultat.get(besoin.Mission);
    if (!parQuart) { parQuart = new Map(); resultat.set(besoin.Mission, parQuart); }
    for (const q of quartsBesoin) {
      // Deux besoins différents (rare, chevauchement §7.4) pourraient
      // couvrir le même quart pour la même mission : fusionner plutôt
      // qu'écraser, pour ne jamais faire disparaître une affectation réelle.
      const existant = parQuart.get(q);
      parQuart.set(q, {entrees: existant ? [...existant.entrees, ...entrees] : entrees});
    }
  }
  return resultat;
}

export interface SegmentLigne<T> {
  quarts: Epoch[];
  valeur: T;
}

/**
 * Regroupe une suite de quarts d'heure (typiquement les quarts d'un seul
 * bloc/macro-créneau — jamais appelé sur plusieurs blocs à la fois, pour ne
 * jamais fusionner à travers une limite de macro-créneau) en segments
 * contigus de même valeur. Sert à poser un seul <td colspan> par bloc
 * plutôt qu'une cellule par quart d'heure, pour que le nom d'une mission
 * s'écrive en travers de tout son créneau (demande d'Antoine du
 * 2026-09-23) plutôt que d'être répété colonne par colonne.
 */
export function segmenterQuarts<T>(
  quarts: readonly Epoch[], valeurDe: (q: Epoch) => T, cleDe: (v: T) => string,
): SegmentLigne<T>[] {
  const segments: SegmentLigne<T>[] = [];
  for (const q of quarts) {
    const valeur = valeurDe(q);
    const dernier = segments[segments.length - 1];
    if (dernier && cleDe(dernier.valeur) === cleDe(valeur)) {
      dernier.quarts.push(q);
    } else {
      segments.push({quarts: [q], valeur});
    }
  }
  return segments;
}
