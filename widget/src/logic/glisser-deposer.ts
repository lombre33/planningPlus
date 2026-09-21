/**
 * Glisser-déposer d'un bénévole sur une place : la logique de vérification
 * et d'aperçu, séparée de la vue (`views/affectation.ts`) pour rester
 * testable sans DOM.
 *
 * Principe qui guide les deux fonctions de vérification et d'aperçu : un
 * geste manuel peut forcer à peu près n'importe quel cas « impossible » pour
 * l'algorithme (souhait refusé, indisponibilité — cf. le message de cadrage
 * initial d'Antoine : « on laisse l'utilisateur corriger et surtout traiter
 * les cas particuliers/impossibles »), du moment que la conséquence reste
 * visible comme anomalie (§7.4). Les deux seuls gestes bloqués sont ceux
 * qu'aucune anomalie ne peut représenter et qui laisseraient un état non
 * audité : affecter deux fois la même personne sur des créneaux qui se
 * chevauchent (impossible physiquement), et toucher une place verrouillée
 * (§7.1, contrainte dure n°4 — elle ne se contourne qu'en déverrouillant
 * explicitement, jamais par un simple dépôt).
 */

import type {Id} from '../domain/types';
import {type Anomalie, type Index, calculerAnomalies, indexer, quartsCouvertsParGroupe} from './derive';
import type {Magasin} from '../store';

export interface RefusDepot {
  ok: false;
  motif: string;
}

export interface DepotAutorise {
  ok: true;
}

export type VerdictDepot = DepotAutorise | RefusDepot;

/** Les quarts d'heure déjà tenus par un bénévole, hors les places listées
 *  dans `placesIgnorees` (pour vérifier un déplacement sans qu'une place se
 *  bloque elle-même). */
function quartsOccupesAilleurs(m: Magasin, ix: Index, benevoleId: Id, placesIgnorees: Id[]): Set<number> {
  const quarts = new Set<number>();
  for (const place of m.places) {
    if (place.Benevole !== benevoleId || placesIgnorees.includes(place.id)) { continue; }
    for (const q of quartsCouvertsParGroupe(m, ix, place.Groupe)) { quarts.add(q); }
  }
  return quarts;
}

/**
 * Vérifie qu'un bénévole peut être déposé sur `placeId`. Contrairement à
 * `classerCandidats` (qui *propose* les meilleurs choix), ceci *autorise*
 * un dépôt manuel dès lors qu'il reste auditable : voir l'en-tête du
 * fichier pour les deux seuls refus.
 */
export function verifierDepot(
  m: Magasin, benevoleId: Id, placeId: Id, placesIgnoreesPourChevauchement: Id[] = [],
): VerdictDepot {
  const ix = indexer(m);
  const place = m.places.find((p) => p.id === placeId);
  if (!place) { return {ok: false, motif: 'Place introuvable.'}; }
  if (place.Verrouillee) {
    return {ok: false, motif: 'Place verrouillée : déverrouillez-la avant de la modifier.'};
  }
  const quartsCible = quartsCouvertsParGroupe(m, ix, place.Groupe);
  const occupes = quartsOccupesAilleurs(m, ix, benevoleId, [placeId, ...placesIgnoreesPourChevauchement]);
  const chevauche = [...quartsCible].some((q) => occupes.has(q));
  if (chevauche) {
    return {ok: false, motif: 'Ce bénévole est déjà affecté sur un créneau qui chevauche celui-ci.'};
  }
  return {ok: true};
}

/** Clé stable pour comparer une anomalie avant/après sans dépendre de
 *  l'identité des objets : l'avant et l'après viennent de deux magasins
 *  différents (l'un cloné), leurs objets ne sont donc jamais `===`. */
function cleAnomalie(a: Anomalie): string {
  switch (a.type) {
    case 'sous-effectif': return `sous-effectif:${a.besoin.id}`;
    case 'sur-effectif': return `sur-effectif:${a.besoin.id}`;
    case 'souhait-refuse': return `souhait-refuse:${a.place.id}`;
    case 'indisponibilite': return `indisponibilite:${a.place.id}`;
    case 'conflit-artiste': return `conflit-artiste:${a.place.id}`;
    case 'hors-quota': return `hors-quota:${a.benevoleId}`;
  }
}

export interface DiffAnomalies {
  avant: Anomalie[];
  apres: Anomalie[];
  creees: Anomalie[];
  resolues: Anomalie[];
}

function diffier(avant: Anomalie[], apres: Anomalie[]): DiffAnomalies {
  const clesAvant = new Set(avant.map(cleAnomalie));
  const clesApres = new Set(apres.map(cleAnomalie));
  return {
    avant,
    apres,
    creees: apres.filter((a) => !clesAvant.has(cleAnomalie(a))),
    resolues: avant.filter((a) => !clesApres.has(cleAnomalie(a))),
  };
}

/** Simule une affectation (ou un vidage si `benevoleId` vaut `null`) sur un
 *  clone du magasin, sans toucher à l'état réel, et retourne les anomalies
 *  avant/après — « voir immédiatement ce que ça casse ou ce que ça répare »
 *  (retour d'Antoine sur la maquette). */
export function apercuAffectation(m: Magasin, placeId: Id, benevoleId: Id | null): DiffAnomalies {
  const avant = calculerAnomalies(m, indexer(m));
  const clone = m.cloner();
  clone.assignerPlace(placeId, benevoleId, 'Manuel');
  const apres = calculerAnomalies(clone, indexer(clone));
  return diffier(avant, apres);
}

/** Simule l'échange des occupants de deux places (glisser l'occupant d'une
 *  place sur une autre place déjà occupée). */
export function apercuEchange(m: Magasin, placeSourceId: Id, placeCibleId: Id): DiffAnomalies {
  const source = m.places.find((p) => p.id === placeSourceId);
  const cible = m.places.find((p) => p.id === placeCibleId);
  const avant = calculerAnomalies(m, indexer(m));
  const clone = m.cloner();
  clone.assignerPlace(placeSourceId, cible?.Benevole ?? null, 'Manuel');
  clone.assignerPlace(placeCibleId, source?.Benevole ?? null, 'Manuel');
  const apres = calculerAnomalies(clone, indexer(clone));
  return diffier(avant, apres);
}
