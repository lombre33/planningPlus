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

import type {LigneBrute} from './brut';
import {colonnesDeTable} from './colonnes';
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

/**
 * Ajoute à une table Bénévoles déjà existante une colonne du schéma
 * (`./schema`, `TABLES`) qui lui manque encore — jamais la recréer, jamais
 * toucher une colonne déjà présente. Contrairement au reste de ce fichier
 * (limité aux tables absentes, voir l'en-tête), cette fonction modifie une
 * table déjà là : cas apparu le 2026-09-23 avec `Id_source` (peuplement
 * des bénévoles depuis la table d'Antoine, §6.4), posée après coup sur un
 * schéma dont `Benevoles` existait déjà chez lui. Reste dans la portée
 * « une table à nous, jamais une table étrangère » de tout ce module :
 * `tableIdReel` est toujours notre propre table Bénévoles, jamais celle
 * qu'Antoine désigne comme source.
 */
export function actionsAjouterColonneManquante(
  idTableSchema: string, idColonne: string, lignesTables: readonly LigneBrute[], lignesColonnes: readonly LigneBrute[],
  tableIdReel: string,
): UserAction[] {
  const dejaPresente = colonnesDeTable(lignesTables, lignesColonnes, tableIdReel).some((c) => c.colId === idColonne);
  if (dejaPresente) { return []; }
  const table = TABLES.find((t) => t.id === idTableSchema);
  const colonne = table?.colonnes.find((c) => c.id === idColonne);
  if (!colonne) { return []; }
  return [['AddColumn', tableIdReel, idColonne, actionColonne(colonne)]];
}

/**
 * Construit les actions qui rendent les tables tout juste créées
 * (`tablesTraitees`) lisibles nativement dans Grist, comme le fait déjà
 * `dev/seed/seed.mjs` (`reglerAffichageReferences` + `reglerLibellesTables`) :
 * un titre de table sur sa vue brute, et pour chaque colonne de référence qui
 * porte un `visibleCol`, une formule d'affichage qui montre ce libellé plutôt
 * que l'identifiant de ligne. Demandé par le coordinateur le 2026-09-22 pour
 * qu'un document créé par le widget se lise comme un document importé.
 *
 * Pure comme le reste de ce fichier, mais a besoin en entrée des lignes de
 * `_grist_Tables` et `_grist_Tables_column` du document (l'appelant les lit
 * via `docApi.fetchTable`, ce module ne parle jamais lui-même à l'API) : ces
 * deux tables de métadonnées portent les identifiants de ligne réels
 * (`rawViewSectionRef`, `id` de colonne) dont `UpdateRecord`/`ModifyColumn`/
 * `SetDisplayFormula` ont besoin, que `resolution` (identifiant canonique →
 * identifiant réel de table, rendu par `lireDocument`) ne porte pas.
 *
 * Ne touche que les tables de `tablesTraitees` : une table déjà présente
 * avant cet appel garde son affichage tel quel, jamais réécrit.
 */
export function actionsReglerAffichage(
  tablesTraitees: readonly string[],
  resolution: Readonly<Record<string, string>>,
  lignesTables: readonly LigneBrute[],
  lignesColonnes: readonly LigneBrute[],
): UserAction[] {
  const traitees = new Set(tablesTraitees);
  const rowIdTableParReel = new Map(lignesTables.map((t) => [t.tableId as string, t.id]));
  const rawViewSectionParReel = new Map(lignesTables.map((t) => [t.tableId as string, t.rawViewSectionRef as number]));
  const rowIdColonne = new Map(lignesColonnes.map((c) => [`${c.parentId}.${c.colId}`, c.id]));

  const actions: UserAction[] = [];

  for (const table of TABLES) {
    if (!traitees.has(table.id)) { continue; }
    const idReel = resolution[table.id];
    const rawViewSection = idReel ? rawViewSectionParReel.get(idReel) : undefined;
    if (!rawViewSection) { continue; }
    actions.push(['UpdateRecord', '_grist_Views_section', rawViewSection, {
      title: table.libelle ?? table.id,
      description: table.description ?? '',
    }]);
  }

  const colonnesDesTablesTraitees = [
    ...TABLES.filter((t) => traitees.has(t.id)).flatMap((t) => t.colonnes.map((c) => ({table: t.id, colonne: c}))),
    ...REFERENCES_DIFFEREES.filter((r) => traitees.has(r.table)).map((r) => ({table: r.table, colonne: r.colonne})),
  ];
  for (const {table, colonne} of colonnesDesTablesTraitees) {
    if (!colonne.visibleCol) { continue; }
    const idReelTable = resolution[table];
    const idReelCible = resolution[colonne.type.split(':')[1] ?? ''];
    const rowIdTable = idReelTable ? rowIdTableParReel.get(idReelTable) : undefined;
    const refColonneCible = idReelCible ? rowIdColonne.get(`${rowIdTableParReel.get(idReelCible)}.${colonne.visibleCol}`) : undefined;
    const refColonne = rowIdTable ? rowIdColonne.get(`${rowIdTable}.${colonne.id}`) : undefined;
    if (!rowIdTable || !refColonneCible || !refColonne) { continue; }
    actions.push(['ModifyColumn', idReelTable, colonne.id, {visibleCol: refColonneCible}]);
    actions.push(['SetDisplayFormula', idReelTable, null, refColonne, `$${colonne.id}.${colonne.visibleCol}`]);
  }

  return actions;
}
