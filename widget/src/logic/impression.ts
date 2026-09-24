/**
 * Données dérivées pour les deux vues imprimables demandées par Antoine le
 * 2026-09-23 (roster des bénévoles et plannings par équipe, tous deux au
 * quart d'heure, lecture seule, pensés pour être distribués sur papier).
 *
 * Rien ici ne mute le magasin. Volontairement séparé de `logic/derive.ts`
 * (propriété du fil Intégration pendant que ce fil construit les deux vues
 * imprimables) : ce module n'appelle que ce qui y est déjà exporté.
 */

import type {Epoch, Id} from '../domain/types';
import {
  type Index, placesDuGroupe, positionsDuGroupe, quartsDuSousCreneau,
} from './derive';
import {peutVoirArtiste, quartsDIntervalle} from '../moteur';
import {PAS_SECONDES} from '../temps';
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
 * Une entrée par indicatif (groupe) positionné sur le besoin — jamais une
 * par bénévole : un binôme aux deux places pourvues est UNE entrée avec deux
 * noms, pas deux entrées. `benevoleNoms` vide veut dire « indicatif posé, mais
 * personne dessus pour l'instant » — un cas désormais représenté plutôt
 * qu'omis (retour d'Antoine, 2026-09-24 : « affiche toujours l'indicatif même
 * si aucun bénévole n'est affecté dessus »).
 */
export interface EntreeAffectationMission {
  groupeCode: string;
  benevoleNoms: string[];
}

export interface AffectationMissionQuart {
  entrees: EntreeAffectationMission[];
}

/**
 * Pour chaque mission ayant au moins un indicatif positionné ce jour-là, ce
 * qui tient chaque quart d'heure (une entrée par indicatif, avec les noms de
 * ses occupants actuels, vide si aucun). Plusieurs indicatifs peuvent couvrir
 * le même besoin à la fois (plusieurs groupes positionnés dessus, ex. 3
 * binômes sur une même mission) : toutes les entrées sont conservées, pas
 * seulement la première. Un besoin sans AUCUN indicatif positionné n'apparaît
 * pas (rien à afficher) — mais un indicatif positionné et vide apparaît bel
 * et bien, avec son seul code.
 *
 * `nomsComplets` (optionnel, `logic/noms-complets.ts`) substitue le nom
 * complet d'un bénévole au `Nom` du modèle quand on le connaît — jointure
 * par identifiant, jamais par chaîne de caractères, pour ne jamais confondre
 * deux bénévoles qui partageraient le même `Nom` (demande d'Antoine du
 * 2026-09-24, § noms complets).
 */
export function affectationsQuartParMission(
  m: Magasin, ix: Index, quartsDuJour: ReadonlySet<Epoch>,
  nomsComplets?: ReadonlyMap<Id, string>,
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
      const benevoleNoms: string[] = [];
      for (const place of placesDuGroupe(m, groupe.id)) {
        if (place.Benevole == null) { continue; }
        const benevole = ix.benevole.get(place.Benevole);
        // Référence cassée (`m.places` est une photo prise à l'ouverture du
        // document, jamais resynchronisée — un bénévole supprimé pendant que
        // le widget est ouvert laisse une place qui pointe vers un id
        // disparu) : montrer un repère plutôt que d'omettre silencieusement
        // l'occupation, ce qui ferait croire l'indicatif libre alors qu'il
        // est pourvu.
        benevoleNoms.push(benevole ? (nomsComplets?.get(benevole.id) ?? benevole.Nom) : 'Bénévole introuvable');
      }
      entrees.push({groupeCode: groupe.Code, benevoleNoms});
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

/**
 * Pour chaque bénévole, les quarts d'heure où il pourrait aller voir un
 * artiste qu'il a lui-même déclaré vouloir voir (`Disponibilite.Statut ===
 * 'Artiste'`, même lecture que le panneau « Artistes à voir » d'Indicatifs
 * — `souhaitePar`, `views/indicatifs.ts` — mais ici par bénévole et non par
 * binôme), en réutilisant tel quel `peutVoirArtiste` (`moteur/temps.ts`,
 * propriété du fil Algorithme, jamais réécrit ici) : au moins
 * `SEUIL_MINUTES_VOIR_ARTISTE` minutes libres pendant son passage, ou le
 * passage entier s'il est plus court. Seuls les quarts effectivement
 * libres du passage sont retenus (un quart déjà occupé par une mission
 * reste tel quel, même si le passage est par ailleurs vu) ; la valeur est
 * le nom de l'artiste, à afficher dans la cellule quand la place le permet.
 */
export function creneauxVoirArtisteParBenevole(
  m: Magasin, ix: Index, quartsDuJour: ReadonlySet<Epoch>,
  affectations: Map<Id, Map<Epoch, AffectationQuart>>,
): Map<Id, Map<Epoch, string>> {
  const resultat = new Map<Id, Map<Epoch, string>>();
  for (const benevole of m.benevoles) {
    const artistesSouhaites = new Set(
      m.disponibilites
        .filter((d) => d.Benevole === benevole.id && d.Statut === 'Artiste' && d.Artiste != null)
        .map((d) => d.Artiste!),
    );
    if (artistesSouhaites.size === 0) { continue; }
    const occupes = new Set(affectations.get(benevole.id)?.keys() ?? []);
    for (const artisteId of artistesSouhaites) {
      const artiste = ix.artiste.get(artisteId);
      if (!artiste) { continue; }
      if (!peutVoirArtiste(artiste.Debut, artiste.Fin, occupes, PAS_SECONDES)) { continue; }
      for (const quart of quartsDIntervalle(artiste.Debut, artiste.Fin, PAS_SECONDES)) {
        if (!quartsDuJour.has(quart) || occupes.has(quart)) { continue; }
        let parQuart = resultat.get(benevole.id);
        if (!parQuart) { parQuart = new Map(); resultat.set(benevole.id, parQuart); }
        if (!parQuart.has(quart)) { parQuart.set(quart, artiste.Nom); }
      }
    }
  }
  return resultat;
}

/**
 * Pour chaque bénévole, les quarts d'heure AFFECTÉS (une mission) qui
 * l'empêchent d'avoir au moins 30 minutes libres pendant le passage d'un
 * artiste qu'il a lui-même déclaré vouloir voir — le complément du violet
 * de `creneauxVoirArtisteParBenevole` (retour d'Antoine, 2026-09-24) : ne
 * compte que pour un artiste demandé par ce bénévole précis, jamais tous
 * les bénévoles, et ne retient que des quarts réellement affectés, jamais
 * un trou du planning — cette vue reste en lecture seule, elle informe et
 * n'empêche rien (précision du coordinateur), l'arbitrage manuel reste
 * valide même signalé.
 */
export function creneauxConflitArtisteParBenevole(
  m: Magasin, ix: Index, quartsDuJour: ReadonlySet<Epoch>,
  affectations: Map<Id, Map<Epoch, AffectationQuart>>,
): Map<Id, Map<Epoch, string>> {
  const resultat = new Map<Id, Map<Epoch, string>>();
  for (const benevole of m.benevoles) {
    const artistesSouhaites = new Set(
      m.disponibilites
        .filter((d) => d.Benevole === benevole.id && d.Statut === 'Artiste' && d.Artiste != null)
        .map((d) => d.Artiste!),
    );
    if (artistesSouhaites.size === 0) { continue; }
    const occupes = new Set(affectations.get(benevole.id)?.keys() ?? []);
    for (const artisteId of artistesSouhaites) {
      const artiste = ix.artiste.get(artisteId);
      if (!artiste) { continue; }
      if (peutVoirArtiste(artiste.Debut, artiste.Fin, occupes, PAS_SECONDES)) { continue; }
      for (const quart of quartsDIntervalle(artiste.Debut, artiste.Fin, PAS_SECONDES)) {
        if (!quartsDuJour.has(quart) || !occupes.has(quart)) { continue; }
        let parQuart = resultat.get(benevole.id);
        if (!parQuart) { parQuart = new Map(); resultat.set(benevole.id, parQuart); }
        if (!parQuart.has(quart)) { parQuart.set(quart, artiste.Nom); }
      }
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
