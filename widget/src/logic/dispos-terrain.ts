/**
 * Calculs communs aux deux vues de consultation en lecture seule :
 * « Disponibilités » (bénévoles × quart d'heure, cahier des charges §8.10)
 * et « Terrain » (qui est où maintenant, §8.9, proche de la vue tension
 * §8.3 pour la partie effectifs). Rien ici ne mute le magasin.
 *
 * Réutilise `couvertureBesoin` de `logic/derive.ts` pour que la définition
 * du sous-effectif reste unique dans tout le widget (§7.4).
 */

import type {
  Besoin, Disponibilite, Epoch, Id, Lieu, MacroCreneau, Mission, SousCreneau,
} from '../domain/types';
import {type Couverture, type Index, type Jour, couvertureBesoin, regrouperParJour} from './derive';
import type {Magasin} from '../store';
import {epochDebutJourFestival, HEURE_COUPURE_JOUR_FESTIVAL, libelleJourCourt, PAS_SECONDES} from '../temps';

export {cleJourFestival} from '../temps';

function quartsEntre(debut: Epoch, fin: Epoch): Epoch[] {
  const quarts: Epoch[] = [];
  for (let t = debut; t < fin; t += PAS_SECONDES) { quarts.push(t); }
  return quarts;
}

/** Un quart d'heure est-il l'heure pleine ? Le décalage horaire local n'entre
 *  pas en jeu : les changements d'heure d'Europe/Paris tombent eux-mêmes sur
 *  une heure pleine, donc la minute UTC suffit. */
export function estHeurePleine(epoch: Epoch): boolean {
  return new Date(epoch * 1000).getUTCMinutes() === 0;
}

// --- Jour de festival (cahier des charges §6.2) -----------------------------
//
// Le regroupement par jour de festival (bascule à heure de coupure
// paramétrable, pas à minuit civil) est défini une seule fois, dans
// `logic/derive.ts` (`regrouperParJour`) et `temps.ts` (`cleJourFestival`),
// et réutilisé aussi bien par l'Agenda/la grille Missions que par les deux
// vues de ce module — pour ne jamais avoir deux définitions du jour de
// festival qui divergent silencieusement. Seul le libellé court diffère ici
// (« ven. 17/07 » plutôt que « Vendredi 17 juillet »), pour tenir dans un
// onglet.

export const HEURE_COUPURE_PAR_DEFAUT = HEURE_COUPURE_JOUR_FESTIVAL;

/** Regroupe les macro-créneaux par jour de festival, avec un libellé court
 *  adapté aux onglets (variante d'affichage de `regrouperParJour`). */
export function regrouperParJourFestival(
  macroCreneaux: MacroCreneau[], heureCoupure = HEURE_COUPURE_JOUR_FESTIVAL,
): Jour[] {
  return regrouperParJour(macroCreneaux, heureCoupure).map((jour) => ({
    ...jour,
    libelle: libelleJourCourt(epochDebutJourFestival(jour.macros[0]!.Debut, heureCoupure)),
  }));
}

export interface BlocMacro {
  macro: MacroCreneau;
  quarts: Epoch[];
}

/** Découpe un jour en blocs (un par macro-créneau), chacun avec ses quarts
 *  d'heure. Un festival dont les macro-créneaux d'un même jour ne se
 *  touchent pas (ex. journée / soirée) donne plusieurs blocs. */
export function blocsDuJour(jour: Jour): BlocMacro[] {
  return jour.macros.map((macro) => ({macro, quarts: quartsEntre(macro.Debut, macro.Fin)}));
}

// --- Vue Disponibilités ----------------------------------------------------

/** Index bénévole → quart d'heure → disponibilité, pour des lectures O(1)
 *  répétées sur toute une grille (70 bénévoles × plusieurs dizaines de
 *  colonnes). */
export function indexerDisponibilitesParBenevole(
  disponibilites: Disponibilite[],
): Map<Id, Map<Epoch, Disponibilite>> {
  const index = new Map<Id, Map<Epoch, Disponibilite>>();
  for (const d of disponibilites) {
    let parQuart = index.get(d.Benevole);
    if (!parQuart) { parQuart = new Map(); index.set(d.Benevole, parQuart); }
    parQuart.set(d.Quart_heure, d);
  }
  return index;
}

export interface StatutCellule {
  statut: 'Disponible' | 'Indisponible' | 'Artiste';
  artisteId: Id | null;
}

/** Statut d'un bénévole sur un quart d'heure. L'absence de ligne vaut
 *  indisponible : on n'affecte jamais quelqu'un par défaut (§6.4). */
export function statutCellule(
  index: Map<Id, Map<Epoch, Disponibilite>>, benevoleId: Id, quartHeure: Epoch,
): StatutCellule {
  const d = index.get(benevoleId)?.get(quartHeure);
  if (!d) { return {statut: 'Indisponible', artisteId: null}; }
  if (d.Statut === 'Artiste') { return {statut: 'Artiste', artisteId: d.Artiste}; }
  return {statut: d.Statut === 'Disponible' ? 'Disponible' : 'Indisponible', artisteId: null};
}

// --- Vue Terrain -------------------------------------------------------------

function quartDeInstant(instant: Epoch): Epoch {
  return Math.floor(instant / PAS_SECONDES) * PAS_SECONDES;
}

/** Les sous-créneaux actifs à un instant donné (bornes demi-ouvertes,
 *  comme partout ailleurs dans le widget). */
export function sousCreneauxActifs(m: Magasin, instant: Epoch): SousCreneau[] {
  return m.sousCreneaux.filter((s) => instant >= s.Debut && instant < s.Fin);
}

/** Les besoins dont le sous-créneau est actif à cet instant. */
export function besoinsActifs(m: Magasin, instant: Epoch): Besoin[] {
  const idsActifs = new Set(sousCreneauxActifs(m, instant).map((s) => s.id));
  return m.besoins.filter((b) => idsActifs.has(b.Sous_creneau));
}

export interface AffectationInstant {
  mission: Mission;
  lieu: Lieu | null;
  sousCreneau: SousCreneau;
  groupeCode: string;
}

/**
 * Où est chaque bénévole affecté à cet instant : un indicatif est positionné
 * à l'avance sur un besoin (§6.3), donc « où est-il » se lit en suivant
 * places → groupe → position active maintenant → besoin → mission/lieu.
 */
export function affectationsAInstant(m: Magasin, ix: Index, instant: Epoch): Map<Id, AffectationInstant> {
  const idsBesoinsActifs = new Set(besoinsActifs(m, instant).map((b) => b.id));

  const benevolesParGroupe = new Map<Id, Id[]>();
  for (const place of m.places) {
    if (place.Benevole == null) { continue; }
    const liste = benevolesParGroupe.get(place.Groupe);
    if (liste) { liste.push(place.Benevole); } else { benevolesParGroupe.set(place.Groupe, [place.Benevole]); }
  }

  const resultat = new Map<Id, AffectationInstant>();
  for (const position of m.positionsGroupe) {
    if (!idsBesoinsActifs.has(position.Besoin)) { continue; }
    const benevoles = benevolesParGroupe.get(position.Groupe);
    if (!benevoles) { continue; }
    const besoin = ix.besoin.get(position.Besoin)!;
    const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau)!;
    const mission = ix.mission.get(besoin.Mission)!;
    const lieu = ix.lieu.get(mission.Lieu) ?? null;
    const groupe = ix.groupe.get(position.Groupe)!;
    for (const benevoleId of benevoles) {
      resultat.set(benevoleId, {mission, lieu, sousCreneau, groupeCode: groupe.Code});
    }
  }
  return resultat;
}

export interface CouvertureInstant {
  besoin: Besoin;
  mission: Mission;
  sousCreneau: SousCreneau;
  couverture: Couverture;
}

/** Effectifs attendus vs pourvus, pour chaque besoin actif à cet instant. */
export function couvertureAInstant(m: Magasin, ix: Index, instant: Epoch): CouvertureInstant[] {
  return besoinsActifs(m, instant).map((besoin) => ({
    besoin,
    mission: ix.mission.get(besoin.Mission)!,
    sousCreneau: ix.sousCreneau.get(besoin.Sous_creneau)!,
    couverture: couvertureBesoin(m, ix, besoin.id),
  }));
}

export type StatutBenevoleInstant =
  | {etat: 'absent'}
  | {etat: 'en-poste'; affectation: AffectationInstant}
  | {etat: 'disponible'}
  | {etat: 'veut-voir-artiste'; artisteNom: string | null}
  | {etat: 'indisponible'};

/**
 * Statut d'un bénévole à un instant donné : en poste (avec l'affectation),
 * sinon ce que dit sa disponibilité déclarée. Comme partout ailleurs (§6.4),
 * l'absence de ligne dans `Disponibilites` vaut indisponible : tous les
 * quarts d'heure proposés par cette vue viennent d'un macro-créneau réel
 * (voir `blocsDuJour`), donc une ligne manquante n'est jamais un simple
 * « pas de donnée », toujours une indisponibilité de fait.
 */
export function statutBenevoleAInstant(
  ix: Index,
  disponibilitesDuQuart: Map<Id, Disponibilite>,
  affectations: Map<Id, AffectationInstant>,
  benevoleId: Id,
  statutBenevole: 'Actif' | 'Absent',
): StatutBenevoleInstant {
  if (statutBenevole === 'Absent') { return {etat: 'absent'}; }
  const affectation = affectations.get(benevoleId);
  if (affectation) { return {etat: 'en-poste', affectation}; }
  const dispo = disponibilitesDuQuart.get(benevoleId);
  if (!dispo || dispo.Statut === 'Indisponible') { return {etat: 'indisponible'}; }
  if (dispo.Statut === 'Artiste') {
    return {etat: 'veut-voir-artiste', artisteNom: dispo.Artiste != null ? ix.artiste.get(dispo.Artiste)?.Nom ?? null : null};
  }
  return {etat: 'disponible'};
}

/** Index des disponibilités pour un seul quart d'heure (celui qui contient
 *  `instant`), en un seul passage plutôt qu'une recherche par bénévole. */
export function indexerDisponibilitesDuQuart(m: Magasin, instant: Epoch): Map<Id, Disponibilite> {
  const quart = quartDeInstant(instant);
  const index = new Map<Id, Disponibilite>();
  for (const d of m.disponibilites) {
    if (d.Quart_heure === quart) { index.set(d.Benevole, d); }
  }
  return index;
}
