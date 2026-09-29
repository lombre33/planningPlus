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

import {quartsEntre} from './dispos-terrain.js';

export const LIBELLES_REPONSE_PAR_DEFAUT = {
  toutLeCreneau: ['Tout le créneau'],
  pasDisponibleDuTout: ['Pas disponible du tout'],
};

/** Normalisation tolérante (espaces, casse, accents) pour comparer une
 *  réponse brute aux libellés configurés : une réponse tapée à la main dans
 *  un formulaire amont varie facilement d'un espace ou d'une majuscule. */
function normaliser(valeur) {
  return valeur.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Classe une réponse brute de macro-créneau selon les libellés configurés.
 *  Une réponse absente, vide, ou qui ne correspond à aucun des deux libellés
 *  connus est toujours "Manuelle" — jamais devinée. */
export function classerReponseMacroCreneau(
  reponse, libelles = LIBELLES_REPONSE_PAR_DEFAUT,
) {
  if (reponse == null || reponse.trim() === '') { return 'Manuelle'; }
  const normalisee = normaliser(reponse);
  if (libelles.toutLeCreneau.some((l) => normaliser(l) === normalisee)) { return 'Disponible'; }
  if (libelles.pasDisponibleDuTout.some((l) => normaliser(l) === normalisee)) { return 'Indisponible'; }
  return 'Manuelle';
}

/** Étale la réponse d'un bénévole pour un macro-créneau sur tous ses quarts
 *  d'heure (§6.4 : une ligne par bénévole et par quart d'heure). */
export function disponibilitesDepuisReponseMacroCreneau(
  benevoleId, macro, reponse,
  libelles = LIBELLES_REPONSE_PAR_DEFAUT,
) {
  const statut = classerReponseMacroCreneau(reponse, libelles);
  if (statut === 'Manuelle') { return {statut, disponibilites: []}; }
  const disponibilites = quartsEntre(macro.Debut, macro.Fin).map((quart) => ({
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
  benevoleId, nomsSouhaites, artistes,
) {
  const voulus = new Set(nomsSouhaites.map(normaliser));
  const passages = artistes.filter((a) => voulus.has(normaliser(a.Nom)));
  return passages.flatMap((a) => quartsEntre(a.Debut, a.Fin).map((quart) => ({
    Benevole: benevoleId, Quart_heure: quart, Statut: 'Artiste', Artiste: a.id,
  })));
}

/** Noms de `nomsSouhaites` qui ne correspondent à aucun artiste connu, selon
 *  la même comparaison normalisée que `disponibilitesDepuisSouhaitsArtistes`
 *  — pour signaler à Antoine une faute de frappe ou un artiste pas encore
 *  saisi côté vue Artistes, plutôt qu'un souhait qui disparaît en silence. */
export function nomsArtistesNonReconnus(nomsSouhaites, artistes) {
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
export function nomsSouhaitesDepuisValeurBrute(valeur) {
  if (Array.isArray(valeur) && valeur[0] === 'L') { return valeur.slice(1).map(String); }
  if (typeof valeur === 'string') {
    return valeur.split(',').map((n) => n.trim()).filter((n) => n !== '');
  }
  return [];
}

/**
 * Résout la valeur brute de la colonne "binôme souhaité" (colonne Texte
 * chez Antoine, le nom exact du bénévole visé) en id de bénévole, par la
 * même comparaison normalisée que les souhaits d'artiste. Ne construit pas
 * l'`Affinite` elle-même (ordre des deux bénévoles, table cible) : ça reste
 * du ressort de l'appelant, qui connaît le bénévole A.
 */
export function resoudreBinomeSouhaite(valeurBrute, benevoles) {
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
export function fusionnerDisponibilites(base, surcharges) {
  const parQuart = new Map();
  for (const d of base) { parQuart.set(d.Quart_heure, d); }
  for (const d of surcharges) { parQuart.set(d.Quart_heure, d); }
  return [...parQuart.values()].sort((a, b) => a.Quart_heure - b.Quart_heure);
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
  benevoleId,
  reponsesParMacroCreneau,
  nomsArtistesSouhaites,
  artistes,
  libelles = LIBELLES_REPONSE_PAR_DEFAUT,
) {
  const base = [];
  const macroCreneauxAManuel = [];
  for (const [macroCreneauId, {macro, reponse}] of reponsesParMacroCreneau) {
    const resultat = disponibilitesDepuisReponseMacroCreneau(benevoleId, macro, reponse, libelles);
    if (resultat.statut === 'Manuelle') { macroCreneauxAManuel.push(macroCreneauId); continue; }
    base.push(...resultat.disponibilites);
  }
  const surcharges = disponibilitesDepuisSouhaitsArtistes(benevoleId, nomsArtistesSouhaites, artistes);
  return {disponibilites: fusionnerDisponibilites(base, surcharges), macroCreneauxAManuel};
}
