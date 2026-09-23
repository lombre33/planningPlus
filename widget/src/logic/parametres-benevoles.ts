/**
 * Contrat pur pour l'écran d'association « colonne Grist ↔ macro-créneau »
 * et les libellés de réponse (§6.4, demande d'Antoine du 2026-09-23) :
 * noms des clés `Parametres` (Cle/Valeur, déjà utilisée pour les poids de
 * l'algorithme — `grist/parametres.ts`), et filtrage des colonnes
 * proposées à l'association. Ne dépend ni de `Magasin` ni de Grist : ce
 * fichier fixe juste la forme attendue, pour que la vue et les couches
 * store/grist (posées par Intégration et Connexion Grist) s'accordent
 * sans ambiguïté.
 *
 * Colonnes propres à Antoine, jamais les nôtres : on ne lit ici QUE des
 * identifiants et des types, jamais de contenu, et on ne modifie ni ne
 * supprime aucune colonne (règle absolue posée par le coordinateur,
 * 2026-09-23).
 */

import type {Id} from '../domain/types';

/** Une colonne de la table Bénévoles côté Grist, telle que rendue par la
 *  future `colonnesDeTable` (grist/, Connexion Grist). Définie ici pour
 *  que ce fichier n'ait pas de dépendance dans l'autre sens. */
export interface ColonneTable {
  colId: string;
  label: string;
  /** Type Grist brut (ex. "Text", "Choice", "ChoiceList", "Ref:Equipes"…). */
  type: string;
}

/** Une table quelconque du document, telle que rendue par la future
 *  `tablesDuDocument` (grist/, Connexion Grist) — même raison d'être ici
 *  que `ColonneTable` juste au-dessus. */
export interface TableDocument {
  tableId: string;
}

/** Clé `Parametres` pour la table où vivent réellement les bénévoles
 *  d'Antoine (2026-09-23, après coup : `TABLE_BENEVOLES` en dur dans la vue
 *  visait notre propre table, jamais vérifié sur son document réel — ses
 *  bénévoles peuvent vivre dans une table à lui, de nom quelconque). Tant
 *  qu'elle n'est pas choisie, l'écran propose les colonnes de tout le
 *  document plutôt qu'une liste vide. */
export const CLE_TABLE_BENEVOLES = 'benevoles.table_benevoles';

/** Clé `Parametres` pour la colonne "souhaits d'artistes" (choix multiple,
 *  table Bénévoles). */
export const CLE_COLONNE_SOUHAITS_ARTISTES = 'benevoles.colonne_souhaits_artistes';

/** Clés `Parametres` pour peupler notre table Bénévoles depuis la table
 *  externe d'Antoine (§6.4, demande du 2026-09-23) : la colonne du nom
 *  complet (obligatoire pour peupler) et celle du téléphone (facultative,
 *  `Contact` reste vide si non choisie). */
export const CLE_COLONNE_NOM_BENEVOLES = 'benevoles.colonne_nom';
export const CLE_COLONNE_CONTACT_BENEVOLES = 'benevoles.colonne_contact';

/** Clé `Parametres` pour la colonne de réponse d'un macro-créneau donné
 *  (une colonne par macro-créneau, confirmé par Antoine le 2026-09-23). */
export function cleColonneReponseMacroCreneau(macroCreneauId: Id): string {
  return `benevoles.colonne_reponse_macro.${macroCreneauId}`;
}

/** Clés `Parametres` pour les libellés reconnus (modifiables dans le
 *  widget, jamais en dur — demande explicite d'Antoine). */
export const CLE_LIBELLE_TOUT_LE_CRENEAU = 'benevoles.libelle_tout_le_creneau';
export const CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT = 'benevoles.libelle_pas_disponible_du_tout';

/** Colonnes du modèle Bénévoles déjà connues du widget (§6) : jamais
 *  proposées à l'association, ce sont les nôtres, pas les siennes. Tenu à
 *  jour manuellement en miroir de `Benevole` (domain/types.ts) — pas
 *  d'introspection automatique possible sur un type TypeScript à
 *  l'exécution. */
export const COLONNES_BENEVOLES_CONNUES: ReadonlySet<string> = new Set([
  'id', 'Nom', 'Contact', 'Equipe', 'Competences', 'Quota_heures_min', 'Quota_heures_max', 'Statut', 'Notes',
  'Id_source',
]);

/** Types Grist dont le contenu peut raisonnablement être une réponse texte
 *  ou une liste de noms — exclut Numeric/Date/Bool/Ref/RefList, qui ne
 *  peuvent pas porter ce qu'Antoine y a mis. */
const TYPES_COLONNE_ELIGIBLES: ReadonlySet<string> = new Set(['Text', 'Choice', 'ChoiceList']);

/** Les colonnes de Bénévoles à proposer dans l'écran d'association :
 *  d'un type plausible, et pas déjà une colonne connue du widget. */
export function colonnesEligibles(colonnes: readonly ColonneTable[]): ColonneTable[] {
  return colonnes.filter((c) => TYPES_COLONNE_ELIGIBLES.has(c.type) && !COLONNES_BENEVOLES_CONNUES.has(c.colId));
}

/** Même filtre de type que `colonnesEligibles`, mais sans exclure les
 *  colonnes qui portent un nom déjà connu chez nous (`Nom`, `Contact`…) :
 *  cette exclusion n'a de sens que pour proposer les colonnes qu'Antoine a
 *  ajoutées à NOTRE propre table Bénévoles, jamais pour choisir le nom/
 *  téléphone dans SA table à lui, où une colonne nommée « Nom » est
 *  précisément celle qu'on cherche (peuplement, §6.4). */
export function colonnesEligiblesTableExterne(colonnes: readonly ColonneTable[]): ColonneTable[] {
  return colonnes.filter((c) => TYPES_COLONNE_ELIGIBLES.has(c.type));
}
