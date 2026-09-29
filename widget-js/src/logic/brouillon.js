/**
 * Brouillon de la table d'affectation (maquette B, validée par Antoine le
 * 2026-09-29) : on y empile des scénarios ou un lancement de l'algorithme,
 * on voit l'effet sur les compteurs, puis « Appliquer au planning » écrit
 * tout d'un coup. Rien n'est écrit dans Grist avant.
 *
 * Le brouillon ne garde que les places qu'il change (`modifs`, par id de
 * place), jamais une copie du document : tout le reste (appel,
 * disponibilités, indicatifs) se lit toujours dans le magasin réel, donc
 * reste à jour pendant qu'un brouillon attend. `bases` retient la valeur
 * réelle de chaque place au moment où le brouillon l'a touchée : si le réel
 * a bougé depuis, cette place est refusée à l'application plutôt
 * qu'écrasée (le magasin n'est jamais resynchronisé avec Grist en cours de
 * session, voir la dette `m.places`).
 */

import {versDonneesPlanning} from '../moteur/adaptateur-magasin.js';
import {calculerAffectation} from '../moteur/index.js';

const CHAMPS = ['Benevole', 'Origine', 'Verrouillee'];

export function creerBrouillon() {
  return {modifs: new Map(), bases: new Map(), pile: []};
}

const valeurDe = (place) => ({Benevole: place.Benevole ?? null, Origine: place.Origine, Verrouillee: place.Verrouillee, Score: place.Score});
const memes = (a, b) => CHAMPS.every((c) => a[c] === b[c]);

/**
 * Le planning tel que le brouillon le montre : mêmes tableaux que le
 * magasin réel (lus, jamais modifiés), sauf `places`, recopiées une à une
 * pour qu'aucune écriture de simulation ne touche une place réelle. Se lit
 * comme un `Magasin` (mêmes noms de champs) par `logic/derive.js`,
 * `logic/journee.js` et le moteur.
 */
export function planningDuBrouillon(m, brouillon) {
  const donnees = {};
  for (const cle of Object.keys(m.data)) { donnees[cle] = m.data[cle]; }
  donnees.places = m.places.map((p) => ({...p, ...(brouillon.modifs.get(p.id) ?? {})}));
  return donnees;
}

function sauver(brouillon) {
  brouillon.pile.push({modifs: new Map(brouillon.modifs), bases: new Map(brouillon.bases)});
}

function modifier(m, brouillon, placeId, valeur) {
  const reelle = m.places.find((p) => p.id === placeId);
  if (!reelle) { return; }
  if (!brouillon.bases.has(placeId)) { brouillon.bases.set(placeId, valeurDe(reelle)); }
  if (memes(valeur, valeurDe(reelle))) {
    brouillon.modifs.delete(placeId);
    brouillon.bases.delete(placeId);
  } else {
    brouillon.modifs.set(placeId, valeur);
  }
}

/**
 * Ajoute un scénario (liste de mouvements `{benevoleId, de, vers}`) : c'est
 * une correction à la main, donc chaque place qu'il pourvoit est verrouillée
 * (origine Manuel), comme `Magasin.assignerPlace` — l'algorithme ne la
 * reprendra pas sans déverrouillage explicite.
 */
export function ajouterScenario(m, brouillon, mouvements) {
  sauver(brouillon);
  const arrivees = new Set(mouvements.filter((mv) => mv.vers != null).map((mv) => mv.vers));
  for (const mv of mouvements) {
    if (mv.de != null && !arrivees.has(mv.de)) {
      modifier(m, brouillon, mv.de, {Benevole: null, Origine: 'Manuel', Verrouillee: true, Score: 0});
    }
  }
  for (const mv of mouvements) {
    if (mv.vers != null) {
      modifier(m, brouillon, mv.vers, {Benevole: mv.benevoleId, Origine: 'Manuel', Verrouillee: true, Score: 1});
    }
  }
}

/** Retire la personne d'une place, dans le brouillon : la place reste vide et
 *  verrouillée, exactement comme « Vider » ailleurs dans le widget. */
export function retirerDeLaPlace(m, brouillon, placeId) {
  sauver(brouillon);
  modifier(m, brouillon, placeId, {Benevole: null, Origine: 'Manuel', Verrouillee: true, Score: 0});
}

/** Déverrouille une place que le brouillon a verrouillée (scénario, retrait) :
 *  une place verrouillée dans le planning réel se déverrouille, elle, tout
 *  de suite dans le réel (`Magasin.basculerVerrouillage`). */
export function deverrouillerDansBrouillon(m, brouillon, placeId) {
  const modif = brouillon.modifs.get(placeId);
  if (!modif) { return false; }
  sauver(brouillon);
  modifier(m, brouillon, placeId, {...modif, Verrouillee: false});
  return true;
}

/**
 * Relance l'algorithme sur le brouillon, pour les macro-créneaux du jour :
 * mêmes règles et même périmètre que « Lancer l'algorithme » (un jour à la
 * fois, places verrouillées jamais touchées, propositions jamais
 * verrouillées), mais ses propositions vont dans le brouillon au lieu d'être
 * écrites. Renvoie le nombre de places dont l'occupant change.
 */
export function relancerAlgorithme(m, brouillon, macroCreneauIds) {
  const planning = planningDuBrouillon(m, brouillon);
  const {propositions} = calculerAffectation(versDonneesPlanning(planning), {perimetre: {macroCreneauIds}});
  // Une proposition qui ne change pas l'occupant (une place « Manuel »
  // déverrouillée que l'algorithme garde telle quelle) n'entre pas dans le
  // brouillon : elle ne changerait que l'origine, invisible à l'écran.
  const avant = new Map(planning.places.map((p) => [p.id, p.Benevole ?? null]));
  const changees = propositions.filter((p) => (p.benevoleIdApres ?? null) !== avant.get(p.placeId));
  if (changees.length === 0) { return 0; }
  sauver(brouillon);
  for (const p of changees) {
    modifier(m, brouillon, p.placeId, {
      Benevole: p.benevoleIdApres ?? null, Origine: p.origineApres, Verrouillee: p.verrouilleeApres, Score: p.score ?? 0,
    });
  }
  return changees.length;
}

export function annulerDernier(brouillon) {
  const precedent = brouillon.pile.pop();
  if (!precedent) { return; }
  brouillon.modifs = precedent.modifs;
  brouillon.bases = precedent.bases;
}

export function toutAnnuler(brouillon) {
  brouillon.modifs = new Map();
  brouillon.bases = new Map();
  brouillon.pile = [];
}

/** Places dont l'occupant diffère du planning réel (ce que la table marque « changé »). */
export function placesChangees(m, brouillon) {
  const ids = [];
  for (const [placeId, modif] of brouillon.modifs) {
    const reelle = m.places.find((p) => p.id === placeId);
    if (reelle && (reelle.Benevole ?? null) !== modif.Benevole) { ids.push(placeId); }
  }
  return ids;
}

export function estVide(m, brouillon) {
  for (const [placeId, modif] of brouillon.modifs) {
    const reelle = m.places.find((p) => p.id === placeId);
    if (reelle && !memes(modif, valeurDe(reelle))) { return false; }
  }
  return true;
}

/**
 * Écrit le brouillon dans le planning réel, en un seul aller-retour Grist.
 * Une place que le planning réel a changée depuis que le brouillon l'a
 * touchée n'est pas écrite : `refusees` la nomme, pour le dire à l'écran.
 */
export async function appliquerBrouillon(m, brouillon) {
  const patches = [];
  const refusees = [];
  for (const [placeId, modif] of brouillon.modifs) {
    const reelle = m.places.find((p) => p.id === placeId);
    if (!reelle) { refusees.push(placeId); continue; }
    const base = brouillon.bases.get(placeId);
    if (base && !memes(base, valeurDe(reelle))) { refusees.push(placeId); continue; }
    if (memes(modif, valeurDe(reelle))) { continue; }
    patches.push({
      id: placeId, benevoleId: modif.Benevole, origine: modif.Origine, verrouillee: modif.Verrouillee, score: modif.Score ?? 0,
    });
  }
  const resultat = await m.appliquerPlaces(patches);
  if (!resultat.ok) { return {ok: false, raison: resultat.raison, ecrites: 0, refusees}; }
  toutAnnuler(brouillon);
  return {ok: true, ecrites: patches.length, refusees};
}
