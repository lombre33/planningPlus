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

import type {Artiste, Disponibilite, Epoch, Id, MacroCreneau} from '../domain/types';
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
 * la colonne brute peut contenir des noms pas encore créés côté Artistes).
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
