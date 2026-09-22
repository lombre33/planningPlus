/**
 * Création du schéma manquant : un document connecté qui n'a pas encore les
 * tables PlanningPlus les reçoit du widget lui-même, à partir de la même
 * source de vérité que `dev/seed/schema.mjs` (`./schema`, un simple
 * ré-export) — plutôt que l'écran qui se contentait de les nommer. Décision
 * d'Antoine du 2026-09-22, qui renverse celle du même matin (voir
 * `dev/README.md`, « Document modèle »).
 *
 * Portée strictement les tables PlanningPlus (`./schema`, `TABLES`) :
 * jamais une table étrangère déjà présente dans le document où ce widget
 * est posé — cette fonction ne reçoit que des identifiants canoniques déjà
 * filtrés par l'appelant (`main.ts`, comparaison avec `TABLES_REQUISES`).
 *
 * Portée aujourd'hui limitée aux tables absentes : une table déjà présente,
 * quelle que soit sa forme, n'est jamais recréée ni modifiée par ce module.
 * La réparation d'un schéma qui a dérivé (recréation avec perte de lignes,
 * à annoncer à l'écran) est un chantier distinct, non couvert ici.
 */

import type {UserAction} from './ecriture';
import {REFERENCES_DIFFEREES, TABLES} from './schema';

/**
 * Deux tables du schéma dont l'identifiant canonique ne correspond pas à
 * l'identifiant que `resoudreIdsTables` (`./tables`) sait reconnaître : la
 * résolution compare par le *libellé* normalisé (« Positions de groupe »),
 * jamais par l'identifiant de schéma lui-même — la même divergence déjà
 * constatée empiriquement sur le document produit par
 * `dev/seed/seed.mjs` (voir `./tables`, en-tête), où poser le titre de la
 * table lui fait reprendre un identifiant dérivé de ce titre. Ce widget ne
 * pose pas de titre (portée volontairement réduite, voir l'en-tête de ce
 * fichier) : on demande directement l'identifiant qui normalise vers le
 * libellé attendu, pour arriver au même résultat sans cette étape.
 */
const IDENTIFIANT_DEMANDE: Record<string, string> = {
  Positions_groupe: 'Positions_de_groupe',
  Souhaits_missions: 'Souhaits_de_mission',
};

interface ColonneSchema {
  id: string;
  type: string;
  libelle?: string;
  description?: string;
  choix?: readonly string[];
  formule?: string;
}

/** Traduit une colonne du schéma vers la forme attendue par l'action `AddColumn`/`AddTable`
 *  (même correspondance que `dev/seed/seed.mjs`, `definitionColonne`). */
function actionColonne(colonne: ColonneSchema): Record<string, unknown> {
  const action: Record<string, unknown> = {
    id: colonne.id,
    type: colonne.type,
    isFormula: Boolean(colonne.formule),
    formula: colonne.formule ?? '',
    label: colonne.libelle ?? colonne.id,
  };
  if (colonne.description) { action.description = colonne.description; }
  if (colonne.choix) { action.widgetOptions = JSON.stringify({choices: colonne.choix, choiceOptions: {}}); }
  return action;
}

/**
 * Construit les actions de création des tables canoniques absentes
 * (`tablesManquantes`), colonnes comprises — chaque `AddTable` porte déjà
 * toutes ses colonnes, ce qui évite les colonnes par défaut (« A », « B »,
 * « C ») que Grist ajoute à une table créée vide (constaté sur l'outil
 * natif `DocSchemaImportTool`, qui suit la même forme).
 *
 * Rendu en deux temps distincts plutôt qu'un seul, comme
 * `Magasin.redecouperSousCreneaux` : `tables` doit être envoyé et confirmé
 * avant `referencesDifferees`, parce qu'une colonne différée peut viser une
 * table qui vient tout juste d'être créée dans le même lot.
 */
export function actionsCreerTablesManquantes(tablesManquantes: readonly string[]): {
  tables: UserAction[];
  referencesDifferees: UserAction[];
} {
  const manquantes = new Set(tablesManquantes);
  const tables: UserAction[] = TABLES
    .filter((table) => manquantes.has(table.id))
    .map((table) => ['AddTable', IDENTIFIANT_DEMANDE[table.id] ?? table.id, table.colonnes.map(actionColonne)]);
  const referencesDifferees: UserAction[] = REFERENCES_DIFFEREES
    .filter((r) => manquantes.has(r.table))
    .map((r) => ['AddColumn', IDENTIFIANT_DEMANDE[r.table] ?? r.table, r.colonne.id, actionColonne(r.colonne)]);
  return {tables, referencesDifferees};
}
