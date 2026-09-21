/**
 * Écriture : construit les actions utilisateur Grist (`UserAction`, le seul
 * langage que `docApi.applyUserActions` comprenne) à partir d'objets du
 * domaine, puis les envoie.
 *
 * Portée (voir le fil qui a confié cette couche, et §5.4 du cahier des
 * charges) : ce que le widget doit pouvoir écrire aujourd'hui — un groupe et
 * ses positions, le roster (`Places`) qui va avec, des disponibilités, le
 * verrouillage d'une place, et les deux réglages qui ont valeur d'audit
 * (paramètres d'algorithme, heure de coupure). Tout le reste (bénévoles,
 * missions, structure temporelle, ...) reste saisi nativement dans Grist —
 * ce module ne les écrit jamais.
 *
 * Chaque `actionsXxx` est une fonction pure qui rend un tableau d'actions ;
 * `appliquerActions` est le seul point qui parle réellement à
 * `docApi.applyUserActions`. Cette séparation permet de tester les
 * constructeurs d'actions sans document Grist réel (`ecriture.test.ts`) tout
 * en les rejouant, inchangés, contre une vraie instance (`dev/`).
 */

import type {Id, OriginePlace, ParametresAlgorithme} from '../moteur/types';
import {encoderListe, encoderRef} from './valeurs';
import {clesEtValeursParametresAlgorithme, CLE_HEURE_COUPURE, type LigneParametre} from './parametres';

/** Une action utilisateur Grist : `[nom, ...arguments]`. Volontairement peu typé, à l'image de l'API. */
export type UserAction = [string, ...unknown[]];

export interface DocApiEcriture {
  applyUserActions(actions: UserAction[]): Promise<{retValues?: unknown[]} | unknown[] | void>;
}

/**
 * Traduit l'identifiant de table (schéma canonique, en position 1 de chaque
 * action) vers l'identifiant réel du document, via la résolution rendue par
 * `lireDocument` (voir `./tables`). Une table sans résolution connue part
 * inchangée : ce n'est pas à cette fonction de décider si c'est une erreur.
 */
function traduireIdsTables(actions: readonly UserAction[], resolution: Record<string, string>): UserAction[] {
  return actions.map(([nom, tableId, ...reste]) => (
    [nom, typeof tableId === 'string' ? (resolution[tableId] ?? tableId) : tableId, ...reste]
  ));
}

/**
 * Envoie des actions et rend leurs `retValues` (une entrée par action, dans
 * l'ordre de `actions`). Piège vérifié empiriquement : le retValue d'un
 * `AddRecord` est directement le nouvel id (un nombre), mais celui d'un
 * `BulkAddRecord` est le *tableau* des ids créés — passer ce tableau tel
 * quel comme id de ligne à une action suivante échoue côté sandbox Python
 * (`TypeError: unhashable type: 'list'`) plutôt que de le signaler
 * clairement. `actionsDefinirPlaces`/`actionsPositionnerGroupe`/
 * `actionsEcrireDisponibilites` rendent toutes une seule action
 * `BulkAddRecord` : leur résultat est donc `[ [id1, id2, ...] ]`, à déplier
 * avant usage (voir `scripts/verifier-integration.ts`).
 *
 * `resolution` (canonique → identifiant réel, rendue par `lireDocument`) est
 * fortement recommandée : sans elle, les actions ciblent l'identifiant de
 * schéma tel quel, qui peut ne plus correspondre à rien si Grist a dérivé
 * l'identifiant réel d'une table de son titre (`./tables`, constaté sur
 * `Positions_groupe`/`Souhaits_missions`) — l'écriture échoue alors côté
 * serveur plutôt que silencieusement.
 */
export async function appliquerActions(
  docApi: DocApiEcriture,
  actions: UserAction[],
  resolution: Record<string, string> = {},
): Promise<unknown[]> {
  if (actions.length === 0) { return []; }
  const resultat = await docApi.applyUserActions(traduireIdsTables(actions, resolution));
  if (Array.isArray(resultat)) { return resultat; }
  return (resultat as {retValues?: unknown[]} | undefined)?.retValues ?? [];
}

// --- Groupe, positions, roster --------------------------------------------

export interface NouveauGroupe {
  code: string;
  taille: number;
  equipeId: Id | null;
  notes?: string;
}

/** Crée un groupe (indicatif). `retValues[0]` de l'action est son nouvel id. */
export function actionsCreerGroupe(groupe: NouveauGroupe): UserAction[] {
  return [[
    'AddRecord', 'Groupes', null, {
      Code: groupe.code,
      Taille: groupe.taille,
      Equipe: encoderRef(groupe.equipeId),
      Notes: groupe.notes ?? '',
    },
  ]];
}

/** Positionne un groupe déjà créé sur un ou plusieurs besoins (§6.3). */
export function actionsPositionnerGroupe(groupeId: Id, besoinIds: readonly Id[]): UserAction[] {
  if (besoinIds.length === 0) { return []; }
  return [[
    'BulkAddRecord', 'Positions_groupe', besoinIds.map(() => null),
    {
      Groupe: besoinIds.map(() => groupeId),
      Besoin: [...besoinIds],
    },
  ]];
}

export interface NouvellePlace {
  rang: number;
  benevoleId: Id | null;
  origine: OriginePlace;
  verrouillee: boolean;
  score: number | null;
}

/** Crée le roster (`Places`) d'un groupe déjà créé, un rang à la fois. */
export function actionsDefinirPlaces(groupeId: Id, places: readonly NouvellePlace[]): UserAction[] {
  if (places.length === 0) { return []; }
  return [[
    'BulkAddRecord', 'Places', places.map(() => null),
    {
      Groupe: places.map(() => groupeId),
      Rang: places.map((p) => p.rang),
      Benevole: places.map((p) => encoderRef(p.benevoleId)),
      Origine: places.map((p) => p.origine),
      Verrouillee: places.map((p) => p.verrouillee),
      Score: places.map((p) => p.score),
    },
  ]];
}

/** Verrouille ou déverrouille une place existante (§7.1, règle 4). */
export function actionsVerrouillerPlace(placeId: Id, verrouillee: boolean): UserAction[] {
  return [['UpdateRecord', 'Places', placeId, {Verrouillee: verrouillee}]];
}

// --- Disponibilités ---------------------------------------------------------

export interface NouvelleDisponibilite {
  benevoleId: Id;
  quartHeure: number;
  statut: 'Disponible' | 'Indisponible' | 'Artiste';
  artisteId: Id | null;
}

/** Écrit des disponibilités (une ligne par bénévole et par quart d'heure, §6.4). */
export function actionsEcrireDisponibilites(disponibilites: readonly NouvelleDisponibilite[]): UserAction[] {
  if (disponibilites.length === 0) { return []; }
  return [[
    'BulkAddRecord', 'Disponibilites', disponibilites.map(() => null),
    {
      Benevole: disponibilites.map((d) => d.benevoleId),
      Quart_heure: disponibilites.map((d) => d.quartHeure),
      Statut: disponibilites.map((d) => d.statut),
      Artiste: disponibilites.map((d) => encoderRef(d.artisteId)),
    },
  ]];
}

// --- Compétences (ChoiceList) : exemple d'utilisation d'`encoderListe` -----

/** Met à jour les compétences d'un bénévole (colonne `ChoiceList`). */
export function actionsDefinirCompetencesBenevole(benevoleId: Id, competences: readonly string[]): UserAction[] {
  return [['UpdateRecord', 'Benevoles', benevoleId, {Competences: encoderListe(competences)}]];
}

// --- Paramètres (§5.4, §7.2) -------------------------------------------------

/**
 * Construit les actions d'un « upsert » sur `Parametres` : `UpdateRecord`
 * pour les clés déjà présentes, `AddRecord` pour les nouvelles. Sans cette
 * distinction, rejouer l'écriture dupliquerait les lignes au lieu de les
 * remplacer.
 */
function upsertParametres(
  clesEtValeurs: readonly [string, string][],
  lignesExistantes: readonly (LigneParametre & {id: Id})[],
): UserAction[] {
  const idParCle = new Map(lignesExistantes.map((l) => [l.cle, l.id]));
  const actions: UserAction[] = [];
  for (const [cle, valeur] of clesEtValeurs) {
    const idExistant = idParCle.get(cle);
    if (idExistant !== undefined) {
      actions.push(['UpdateRecord', 'Parametres', idExistant, {Valeur: valeur}]);
    } else {
      actions.push(['AddRecord', 'Parametres', null, {Cle: cle, Valeur: valeur}]);
    }
  }
  return actions;
}

/** Enregistre `ParametresAlgorithme` dans `Parametres` (upsert, une ligne par poids). */
export function actionsEnregistrerParametresAlgorithme(
  parametres: ParametresAlgorithme,
  lignesExistantes: readonly (LigneParametre & {id: Id})[],
): UserAction[] {
  return upsertParametres(clesEtValeursParametresAlgorithme(parametres), lignesExistantes);
}

/** Enregistre l'heure de coupure du jour de festival (§3, §6.2) dans `Parametres`. */
export function actionsEnregistrerHeureCoupure(
  heure: number,
  lignesExistantes: readonly (LigneParametre & {id: Id})[],
): UserAction[] {
  return upsertParametres([[CLE_HEURE_COUPURE, String(heure)]], lignesExistantes);
}
