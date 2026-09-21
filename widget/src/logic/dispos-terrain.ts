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
import {type Couverture, type Index, type Jour, couvertureBesoin} from './derive';
import type {Magasin} from '../store';
import {PAS_SECONDES, TIMEZONE} from '../temps';

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
// Concept purement visuel, jamais stocké : un jour de festival bascule à une
// heure de coupure paramétrable (6h par défaut), pas à minuit civil, pour
// qu'une soirée qui franchit minuit (22h–2h) reste un seul jour d'affichage.
// `logic/derive.ts` (`regrouperParJour`, utilisé par l'Agenda) groupe encore
// par jour calendaire à minuit ; les deux vues de ce module ont besoin de la
// coupure à heure paramétrable, donc la logique vit ici plutôt que d'être
// dupliquée dans chaque vue. À unifier avec l'Agenda si le fil Maquette
// interactive souhaite la reprendre à son compte.

export const HEURE_COUPURE_PAR_DEFAUT = 6;

function composantsLocaux(epoch: Epoch, fuseau: string): {annee: number; mois: number; jour: number; heure: number} {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  });
  const parties = Object.fromEntries(
    format.formatToParts(new Date(epoch * 1000)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    annee: Number(parties.year), mois: Number(parties.month), jour: Number(parties.day),
    heure: Number(parties.hour) % 24,
  };
}

/** Clé du jour de festival auquel appartient cet instant (heure locale). */
export function cleJourFestival(epoch: Epoch, heureCoupure = HEURE_COUPURE_PAR_DEFAUT, fuseau = TIMEZONE): string {
  const c = composantsLocaux(epoch, fuseau);
  const decale = c.heure < heureCoupure ? c.jour - 1 : c.jour;
  // Date.UTC normalise les débordements (jour 0 → dernier jour du mois précédent).
  return new Date(Date.UTC(c.annee, c.mois - 1, decale)).toISOString().slice(0, 10);
}

/** Libellé court (« ven. 17/07 ») du jour de festival d'un instant. */
export function libelleJourFestival(epoch: Epoch, heureCoupure = HEURE_COUPURE_PAR_DEFAUT, fuseau = TIMEZONE): string {
  const [an, mo, jo] = cleJourFestival(epoch, heureCoupure, fuseau).split('-').map(Number);
  const midiUtc = new Date(Date.UTC(an!, mo! - 1, jo!, 12));
  return new Intl.DateTimeFormat('fr-FR', {timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit'}).format(midiUtc);
}

/** Regroupe les macro-créneaux par jour de festival plutôt que par jour
 *  calendaire (variante de `regrouperParJour` de `logic/derive.ts`, avec
 *  heure de coupure). Un macro-créneau qui franchit la coupure reste entier,
 *  rattaché au jour de festival de son début. */
export function regrouperParJourFestival(
  macroCreneaux: MacroCreneau[], heureCoupure = HEURE_COUPURE_PAR_DEFAUT,
): Jour[] {
  const parCle = new Map<string, MacroCreneau[]>();
  for (const macro of macroCreneaux) {
    const cle = cleJourFestival(macro.Debut, heureCoupure);
    const liste = parCle.get(cle) ?? [];
    liste.push(macro);
    parCle.set(cle, liste);
  }
  return [...parCle.entries()]
    .map(([cle, macros]) => ({
      cle, libelle: libelleJourFestival(macros[0]!.Debut, heureCoupure),
      macros: macros.sort((a, b) => a.Debut - b.Debut),
    }))
    .sort((a, b) => a.macros[0]!.Debut - b.macros[0]!.Debut);
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
