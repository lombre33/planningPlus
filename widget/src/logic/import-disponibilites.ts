/**
 * Conversion des réponses brutes d'un bénévole (collectées par Antoine dans
 * son propre document Grist, hors du modèle PlanningPlus — cahier des
 * charges §10, « formulaire amont » hors périmètre v1, mais l'import de ce
 * qu'il contient déjà ne l'est pas) vers des lignes `Disponibilite`
 * (§6.4) prêtes à écrire.
 *
 * Deux entrées, alimentées séparément par la vue qui orchestre l'import (le
 * mappage colonne Grist → macro-créneau, et la lecture des colonnes brutes,
 * ne vivent pas ici) :
 *  - la réponse d'un bénévole pour un macro-créneau entier (point B) ;
 *  - la liste des artistes qu'il veut voir (point A), reliée à leurs
 *    horaires déjà saisis dans le panel Artistes.
 *
 * Les libellés qui distinguent « tout le créneau » et « pas disponible du
 * tout » sont un paramètre (`LibellesReponseMacroCreneau`), pas une
 * constante : Antoine veut pouvoir les corriger depuis le widget sans
 * dépendre d'un nouveau push. Toute autre valeur (y compris vide) est
 * traitée comme une réponse partielle, saisie à la main quart d'heure par
 * quart d'heure ailleurs.
 */

import type {Artiste, Benevole, Disponibilite, Epoch, Id, MacroCreneau} from '../domain/types';
import {quartsEntre} from './dispos-terrain';

export interface LibellesReponseMacroCreneau {
  /** Valeurs (comparées après normalisation) qui valent "disponible sur tout
   *  le macro-créneau". */
  toutLeCreneau: string[];
  /** Valeurs qui valent "indisponible sur tout le macro-créneau". */
  pasDisponibleDuTout: string[];
}

export const LIBELLES_REPONSE_PAR_DEFAUT: LibellesReponseMacroCreneau = {
  toutLeCreneau: ['Tout le créneau'],
  pasDisponibleDuTout: ['Pas disponible du tout'],
};

export type StatutReponseMacroCreneau = 'Disponible' | 'Indisponible' | 'Manuelle';

/** Normalisation tolérante (espaces, casse, accents) pour comparer une
 *  réponse brute aux libellés configurés : une réponse tapée à la main dans
 *  un formulaire amont varie facilement d'un espace ou d'une majuscule. */
function normaliser(valeur: string): string {
  return valeur.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Classe une réponse brute de macro-créneau selon les libellés configurés.
 *  Une réponse absente, vide, ou qui ne correspond à aucun des deux libellés
 *  connus est toujours "Manuelle" — jamais devinée. */
export function classerReponseMacroCreneau(
  reponse: string | null | undefined, libelles: LibellesReponseMacroCreneau = LIBELLES_REPONSE_PAR_DEFAUT,
): StatutReponseMacroCreneau {
  if (reponse == null || reponse.trim() === '') { return 'Manuelle'; }
  const normalisee = normaliser(reponse);
  if (libelles.toutLeCreneau.some((l) => normaliser(l) === normalisee)) { return 'Disponible'; }
  if (libelles.pasDisponibleDuTout.some((l) => normaliser(l) === normalisee)) { return 'Indisponible'; }
  return 'Manuelle';
}

export interface ResultatImportMacroCreneau {
  statut: StatutReponseMacroCreneau;
  /** Une ligne par quart d'heure du macro-créneau si le statut est
   *  "Disponible" ou "Indisponible", vide si "Manuelle" (rien à déduire :
   *  la saisie quart d'heure par quart d'heure se fait ailleurs, à la main). */
  disponibilites: Disponibilite[];
}

/** Étale la réponse d'un bénévole pour un macro-créneau sur tous ses quarts
 *  d'heure (§6.4 : une ligne par bénévole et par quart d'heure). */
export function disponibilitesDepuisReponseMacroCreneau(
  benevoleId: Id, macro: Pick<MacroCreneau, 'Debut' | 'Fin'>, reponse: string | null | undefined,
  libelles: LibellesReponseMacroCreneau = LIBELLES_REPONSE_PAR_DEFAUT,
): ResultatImportMacroCreneau {
  const statut = classerReponseMacroCreneau(reponse, libelles);
  if (statut === 'Manuelle') { return {statut, disponibilites: []}; }
  const disponibilites = quartsEntre(macro.Debut, macro.Fin).map((quart): Disponibilite => ({
    Benevole: benevoleId, Quart_heure: quart, Statut: statut, Artiste: null,
  }));
  return {statut, disponibilites};
}

/**
 * Convertit la liste des noms d'artistes qu'un bénévole veut voir (colonne
 * à choix multiple, valeurs en texte) en lignes `Disponibilite` sur les
 * quarts d'heure de leurs passages déjà saisis (panel Artistes). Un nom qui
 * ne correspond à aucun artiste connu est ignoré (pas d'erreur bloquante :
 * la colonne brute peut contenir des noms pas encore créés côté Artistes) —
 * voir `nomsArtistesNonReconnus` pour signaler ces noms plutôt que les
 * laisser disparaître en silence.
 *
 * Ces lignes priment sur une disponibilité "tout le créneau" au même quart
 * d'heure — voir `fusionnerDisponibilites`, qui applique cette priorité.
 */
export function disponibilitesDepuisSouhaitsArtistes(
  benevoleId: Id, nomsSouhaites: readonly string[], artistes: readonly Artiste[],
): Disponibilite[] {
  const voulus = new Set(nomsSouhaites.map(normaliser));
  const passages = artistes.filter((a) => voulus.has(normaliser(a.Nom)));
  return passages.flatMap((a) => quartsEntre(a.Debut, a.Fin).map((quart): Disponibilite => ({
    Benevole: benevoleId, Quart_heure: quart, Statut: 'Artiste', Artiste: a.id,
  })));
}

/** Noms de `nomsSouhaites` qui ne correspondent à aucun artiste connu, selon
 *  la même comparaison normalisée que `disponibilitesDepuisSouhaitsArtistes`
 *  — pour signaler à Antoine une faute de frappe ou un artiste pas encore
 *  saisi côté vue Artistes, plutôt qu'un souhait qui disparaît en silence. */
export function nomsArtistesNonReconnus(nomsSouhaites: readonly string[], artistes: readonly Artiste[]): string[] {
  const connus = new Set(artistes.map((a) => normaliser(a.Nom)));
  return nomsSouhaites.filter((n) => n.trim() !== '' && !connus.has(normaliser(n)));
}

/**
 * Convertit la valeur brute d'une colonne "artistes souhaités" en liste de
 * noms. Chez Antoine, c'est une colonne Texte contenant une liste séparée
 * par des virgules (export de formulaire amont — ex. "SHOW Vibration
 * Urbaines - Jeudi, BONNE NUIT - Vendredi"), jamais une vraie `ChoiceList`
 * Grist native ; prend quand même en charge cette dernière (`['L', ...]`)
 * si la colonne choisie en est une. Valeur absente, vide, ou d'un type
 * inattendu : aucun souhait, jamais une erreur.
 */
export function nomsSouhaitesDepuisValeurBrute(valeur: unknown): string[] {
  if (Array.isArray(valeur) && valeur[0] === 'L') { return valeur.slice(1).map(String); }
  if (typeof valeur === 'string') {
    return valeur.split(',').map((n) => n.trim()).filter((n) => n !== '');
  }
  return [];
}

export interface ResultatBinomeSouhaite {
  /** Id du bénévole visé (`Affinite.Benevole_B`), si son nom a été reconnu. */
  benevoleBId: Id | null;
  /** Nom importé, brut, seulement s'il ne correspond à aucun bénévole connu
   *  — pour le signaler à Antoine plutôt que le laisser disparaître en
   *  silence (faute de frappe, ou binôme pas encore importé lui-même). */
  nomNonReconnu: string | null;
}

/**
 * Résout la valeur brute de la colonne "binôme souhaité" (colonne Texte
 * chez Antoine, le nom exact du bénévole visé) en id de bénévole, par la
 * même comparaison normalisée que les souhaits d'artiste. Ne construit pas
 * l'`Affinite` elle-même (ordre des deux bénévoles, table cible) : ça reste
 * du ressort de l'appelant, qui connaît le bénévole A.
 */
export function resoudreBinomeSouhaite(valeurBrute: unknown, benevoles: readonly Benevole[]): ResultatBinomeSouhaite {
  const nom = typeof valeurBrute === 'string' ? valeurBrute.trim() : '';
  if (nom === '') { return {benevoleBId: null, nomNonReconnu: null}; }
  const cible = normaliser(nom);
  const trouve = benevoles.find((b) => normaliser(b.Nom) === cible);
  return trouve ? {benevoleBId: trouve.id, nomNonReconnu: null} : {benevoleBId: null, nomNonReconnu: nom};
}

/**
 * Fusionne une base (réponse macro-créneau) et des surcharges (souhaits
 * d'artiste) sur le même bénévole : à quart d'heure égal, la surcharge
 * l'emporte toujours — vouloir voir un artiste reste visible même si la
 * réponse macro-créneau dit seulement "disponible".
 */
export function fusionnerDisponibilites(base: readonly Disponibilite[], surcharges: readonly Disponibilite[]): Disponibilite[] {
  const parQuart = new Map<Epoch, Disponibilite>();
  for (const d of base) { parQuart.set(d.Quart_heure, d); }
  for (const d of surcharges) { parQuart.set(d.Quart_heure, d); }
  return [...parQuart.values()].sort((a, b) => a.Quart_heure - b.Quart_heure);
}

export interface ImportDisponibilitesBenevole {
  /** Toutes les lignes déduites automatiquement (macro-créneaux "Disponible"
   *  / "Indisponible" + souhaits d'artiste), prêtes à écrire telles quelles. */
  disponibilites: Disponibilite[];
  /** Les macro-créneaux dont la réponse brute n'a pas été reconnue : rien
   *  n'a été déduit pour eux, la saisie reste à faire à la main (point 1B,
   *  interface dédiée). */
  macroCreneauxAManuel: Id[];
}

/**
 * Combine, pour un seul bénévole, l'ensemble de ses réponses macro-créneau
 * et ses souhaits d'artiste en un seul jeu de lignes `Disponibilite` — ce
 * que la vue d'import a besoin d'écrire en une fois. Ordonne les entrées
 * par bénévole plutôt que par macro-créneau : c'est aussi la maille
 * attendue par `Magasin` pour remplacer une plage à la fois (§6.4, une
 * ligne par bénévole et par quart d'heure).
 */
export function disponibilitesBenevolePourFestival(
  benevoleId: Id,
  reponsesParMacroCreneau: ReadonlyMap<Id, {macro: Pick<MacroCreneau, 'Debut' | 'Fin'>; reponse: string | null | undefined}>,
  nomsArtistesSouhaites: readonly string[],
  artistes: readonly Artiste[],
  libelles: LibellesReponseMacroCreneau = LIBELLES_REPONSE_PAR_DEFAUT,
): ImportDisponibilitesBenevole {
  const base: Disponibilite[] = [];
  const macroCreneauxAManuel: Id[] = [];
  for (const [macroCreneauId, {macro, reponse}] of reponsesParMacroCreneau) {
    const resultat = disponibilitesDepuisReponseMacroCreneau(benevoleId, macro, reponse, libelles);
    if (resultat.statut === 'Manuelle') { macroCreneauxAManuel.push(macroCreneauId); continue; }
    base.push(...resultat.disponibilites);
  }
  const surcharges = disponibilitesDepuisSouhaitsArtistes(benevoleId, nomsArtistesSouhaites, artistes);
  return {disponibilites: fusionnerDisponibilites(base, surcharges), macroCreneauxAManuel};
}
