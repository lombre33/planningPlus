/**
 * Calculs communs aux deux vues de consultation en lecture seule :
 * « Disponibilités » (bénévoles × quart d'heure, cahier des charges §8.10)
 * et « Terrain » (qui est où maintenant, §8.9, proche de la vue tension
 * §8.3 pour la partie effectifs). Rien ici ne mute le magasin.
 *
 * Réutilise `couvertureBesoin` de `logic/derive.js` pour que la définition
 * du sous-effectif reste unique dans tout le widget (§7.4).
 */

import {couvertureBesoin, regrouperParJour} from './derive.js';
import {epochDebutJourFestival, HEURE_COUPURE_JOUR_FESTIVAL, libelleJourCourt, PAS_SECONDES} from '../temps.js';

export {cleJourFestival} from '../temps.js';

/** Les quarts d'heure d'une plage [debut, fin[ (borne haute exclue). Exportée
 *  pour `logic/import-disponibilites.js`, qui en a besoin pour étaler une
 *  réponse macro-créneau ou un passage d'artiste sur ses quarts d'heure. */
export function quartsEntre(debut, fin) {
  const quarts = [];
  for (let t = debut; t < fin; t += PAS_SECONDES) { quarts.push(t); }
  return quarts;
}

/** Un quart d'heure est-il l'heure pleine ? Le décalage horaire local n'entre
 *  pas en jeu : les changements d'heure d'Europe/Paris tombent eux-mêmes sur
 *  une heure pleine, donc la minute UTC suffit. */
export function estHeurePleine(epoch) {
  return new Date(epoch * 1000).getUTCMinutes() === 0;
}

// --- Jour de festival (cahier des charges §6.2) -----------------------------
//
// Le regroupement par jour de festival (bascule à heure de coupure
// paramétrable, pas à minuit civil) est défini une seule fois, dans
// `logic/derive.js` (`regrouperParJour`) et `temps.js` (`cleJourFestival`),
// et réutilisé aussi bien par l'Agenda/la grille Missions que par les deux
// vues de ce module — pour ne jamais avoir deux définitions du jour de
// festival qui divergent silencieusement. Seul le libellé court diffère ici
// (« ven. 17/07 » plutôt que « Vendredi 17 juillet »), pour tenir dans un
// onglet.

export const HEURE_COUPURE_PAR_DEFAUT = HEURE_COUPURE_JOUR_FESTIVAL;

/** Regroupe les macro-créneaux par jour de festival, avec un libellé court
 *  adapté aux onglets (variante d'affichage de `regrouperParJour`). */
export function regrouperParJourCourt(
  macroCreneaux, heureCoupure = HEURE_COUPURE_JOUR_FESTIVAL,
) {
  return regrouperParJour(macroCreneaux, heureCoupure).map((jour) => ({
    ...jour,
    libelle: libelleJourCourt(epochDebutJourFestival(jour.macros[0].Debut, heureCoupure)),
  }));
}

/** Découpe un jour en blocs (un par macro-créneau), chacun avec ses quarts
 *  d'heure. Un festival dont les macro-créneaux d'un même jour ne se
 *  touchent pas (ex. journée / soirée) donne plusieurs blocs. */
export function blocsDuJour(jour) {
  return jour.macros.map((macro) => ({macro, quarts: quartsEntre(macro.Debut, macro.Fin)}));
}

// --- Vue Disponibilités ----------------------------------------------------

/** Index bénévole → quart d'heure → disponibilité, pour des lectures O(1)
 *  répétées sur toute une grille (70 bénévoles × plusieurs dizaines de
 *  colonnes). */
export function indexerDisponibilitesParBenevole(
  disponibilites,
) {
  const index = new Map();
  for (const d of disponibilites) {
    let parQuart = index.get(d.Benevole);
    if (!parQuart) { parQuart = new Map(); index.set(d.Benevole, parQuart); }
    parQuart.set(d.Quart_heure, d);
  }
  return index;
}

/** Statut d'un bénévole sur un quart d'heure. L'absence de ligne vaut
 *  indisponible : on n'affecte jamais quelqu'un par défaut (§6.4). */
export function statutCellule(
  index, benevoleId, quartHeure,
) {
  const d = index.get(benevoleId)?.get(quartHeure);
  if (!d) { return {statut: 'Indisponible', artisteId: null}; }
  if (d.Statut === 'Artiste') { return {statut: 'Artiste', artisteId: d.Artiste}; }
  return {statut: d.Statut === 'Disponible' ? 'Disponible' : 'Indisponible', artisteId: null};
}

/**
 * Contraintes déclarées d'un bénévole autres que ses disponibilités : refus
 * ou réticence sur une mission (§7.2, objectif 3 « Missions souhaitées »).
 * Motivé par l'étape « voir les dispos et contraintes » qui précède le
 * lancement de l'algorithme — tout ce qui va peser sur la répartition doit
 * être visible ici, pas seulement la grille dispo/indispo/artiste.
 *
 * Les affinités entre bénévoles (table `Affinites`) n'entrent volontairement
 * pas ici : le moteur les pondère dans le code, mais ce n'est pas un objectif
 * décidé avec Antoine (absent du §7.2, qui confie déjà la stabilité des
 * binômes aux indicatifs, §6.3) — l'afficher comme une contrainte réelle
 * induirait en erreur sur cet écran de vérification pré-algorithme. Question
 * posée à Antoine par le fil Algorithme d'affectation ; à revoir selon sa
 * réponse.
 */
export function contraintesBenevole(m, ix, benevoleId) {
  const nomsMissions = (preference) => m.souhaitsMissions
    .filter((s) => s.Benevole === benevoleId && s.Preference === preference)
    .map((s) => ix.mission.get(s.Mission)?.Nom ?? '?');
  return {
    missionsRefusees: nomsMissions('Refuse'),
    missionsReticentes: nomsMissions('Réticent'),
  };
}

/** Gravité à afficher (le refus bloque l'algorithme, la réticence ne fait que
 *  pondérer le score : voir `moteur/eligibilite.js`). `null` si aucune
 *  contrainte déclarée. */
export function graviteContraintes(c) {
  if (c.missionsRefusees.length > 0) { return 'danger'; }
  if (c.missionsReticentes.length > 0) { return 'warn'; }
  return null;
}

/** Résumé textuel des contraintes, pour l'infobulle. `null` si aucune. */
export function libelleContraintes(c) {
  const parties = [];
  if (c.missionsRefusees.length > 0) { parties.push(`Refuse : ${c.missionsRefusees.join(', ')}`); }
  if (c.missionsReticentes.length > 0) { parties.push(`Réticent·e pour : ${c.missionsReticentes.join(', ')}`); }
  return parties.length > 0 ? parties.join(' · ') : null;
}

// --- Vue Terrain -------------------------------------------------------------

function quartDeInstant(instant) {
  return Math.floor(instant / PAS_SECONDES) * PAS_SECONDES;
}

/** Les sous-créneaux actifs à un instant donné (bornes demi-ouvertes,
 *  comme partout ailleurs dans le widget). */
export function sousCreneauxActifs(m, instant) {
  return m.sousCreneaux.filter((s) => instant >= s.Debut && instant < s.Fin);
}

/** Les besoins dont le sous-créneau est actif à cet instant. */
export function besoinsActifs(m, instant) {
  const idsActifs = new Set(sousCreneauxActifs(m, instant).map((s) => s.id));
  return m.besoins.filter((b) => idsActifs.has(b.Sous_creneau));
}

/**
 * Où est chaque bénévole affecté à cet instant : un indicatif est positionné
 * à l'avance sur un besoin (§6.3), donc « où est-il » se lit en suivant
 * places → groupe → position active maintenant → besoin → mission/lieu.
 */
export function affectationsAInstant(m, ix, instant) {
  const idsBesoinsActifs = new Set(besoinsActifs(m, instant).map((b) => b.id));

  const benevolesParGroupe = new Map();
  for (const place of m.places) {
    if (place.Benevole == null) { continue; }
    const liste = benevolesParGroupe.get(place.Groupe);
    if (liste) { liste.push(place.Benevole); } else { benevolesParGroupe.set(place.Groupe, [place.Benevole]); }
  }

  const resultat = new Map();
  for (const position of m.positionsGroupe) {
    if (!idsBesoinsActifs.has(position.Besoin)) { continue; }
    const benevoles = benevolesParGroupe.get(position.Groupe);
    if (!benevoles) { continue; }
    const besoin = ix.besoin.get(position.Besoin);
    const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau);
    const mission = ix.mission.get(besoin.Mission);
    const lieu = ix.lieu.get(mission.Lieu) ?? null;
    const groupe = ix.groupe.get(position.Groupe);
    for (const benevoleId of benevoles) {
      resultat.set(benevoleId, {mission, lieu, sousCreneau, groupeCode: groupe.Code});
    }
  }
  return resultat;
}

/** Effectifs attendus vs pourvus, pour chaque besoin actif à cet instant. */
export function couvertureAInstant(m, ix, instant) {
  return besoinsActifs(m, instant).map((besoin) => ({
    besoin,
    mission: ix.mission.get(besoin.Mission),
    sousCreneau: ix.sousCreneau.get(besoin.Sous_creneau),
    couverture: couvertureBesoin(m, ix, besoin.id),
  }));
}

/**
 * Statut d'un bénévole à un instant donné : en poste (avec l'affectation),
 * sinon ce que dit sa disponibilité déclarée. Comme partout ailleurs (§6.4),
 * l'absence de ligne dans `Disponibilites` vaut indisponible : tous les
 * quarts d'heure proposés par cette vue viennent d'un macro-créneau réel
 * (voir `blocsDuJour`), donc une ligne manquante n'est jamais un simple
 * « pas de donnée », toujours une indisponibilité de fait.
 */
export function statutBenevoleAInstant(
  ix,
  disponibilitesDuQuart,
  affectations,
  benevoleId,
  statutBenevole,
) {
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
export function indexerDisponibilitesDuQuart(m, instant) {
  const quart = quartDeInstant(instant);
  const index = new Map();
  for (const d of m.disponibilites) {
    if (d.Quart_heure === quart) { index.set(d.Benevole, d); }
  }
  return index;
}
