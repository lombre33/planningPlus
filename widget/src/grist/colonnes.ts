/**
 * Liste les colonnes d'une table du document, à partir des tables système
 * Grist `_grist_Tables`/`_grist_Tables_column` — même source que
 * `actionsReglerAffichage` (`creation.ts`), qui les lit déjà pour un usage
 * interne étroit (réglage de l'affichage des références). Ici pour un usage
 * différent : proposer à l'écran les colonnes qu'Antoine a lui-même
 * ajoutées à une de ses tables (souhaits d'artistes, réponses de
 * disponibilité par macro-créneau, §6.4), jamais les nôtres.
 *
 * Pure : prend les lignes déjà zippées (`zipperTable`), ne fait aucun appel
 * réseau elle-même — au même niveau que `actionsReglerAffichage`, pour
 * rester testable sans docApi.
 */

import type {LigneBrute} from './brut';

export interface ColonneTable {
  colId: string;
  label: string;
  /** Type Grist brut (ex. "Text", "Choice", "ChoiceList", "Ref:Benevoles",
   *  "Numeric"…) — jamais interprété ici, au filtrage de l'appelant. */
  type: string;
}

/**
 * Les colonnes de la table dont l'identifiant réel est `tableIdReel`
 * (`_grist_Tables.tableId`), déduites de `_grist_Tables_column` par
 * correspondance sur `parentId` (référence à la ligne de `_grist_Tables`,
 * jamais sur `tableId` directement — ce sont deux identifiants différents,
 * voir `actionsReglerAffichage`). Tableau vide si `tableIdReel` ne
 * correspond à aucune table connue du document.
 */
export function colonnesDeTable(
  lignesTables: readonly LigneBrute[], lignesColonnes: readonly LigneBrute[], tableIdReel: string,
): ColonneTable[] {
  const table = lignesTables.find((t) => t.tableId === tableIdReel);
  if (!table) { return []; }
  return lignesColonnes
    .filter((c) => c.parentId === table.id)
    .map((c): ColonneTable => ({
      colId: String(c.colId),
      label: String(c.label ?? c.colId),
      type: String(c.type ?? ''),
    }));
}
