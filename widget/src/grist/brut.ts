/**
 * Format brut des tables Grist (colonnaire, tel que renvoyé par
 * `docApi.fetchTable`) et sa conversion en lignes — le point commun entre
 * `lecture.ts` (vers `DonneesPlanning`, le modèle du moteur) et `modele.ts`
 * (vers `Modele`, le modèle complet de l'UI), qui décodent tous deux les
 * mêmes tables brutes vers des formes différentes.
 */

/** Table telle que renvoyée par `docApi.fetchTable` : colonnaire, `id` inclus. */
export type TableBrute = Record<string, unknown[]>;

/** L'ensemble des tables d'un document, indexées par identifiant de table. */
export type DocumentBrut = Record<string, TableBrute>;

/** Une ligne « dézippée » : les valeurs d'une même rangée, par nom de colonne. */
export type LigneBrute = Record<string, unknown> & {id: number};

/** Convertit une table colonnaire en tableau de lignes. Pure, sans effet de bord. */
export function zipperTable(table: TableBrute | undefined): LigneBrute[] {
  if (!table) { return []; }
  const ids = table.id;
  if (!Array.isArray(ids)) { return []; }
  return ids.map((id, i) => {
    const ligne: Record<string, unknown> = {id};
    for (const colonne of Object.keys(table)) {
      if (colonne === 'id') { continue; }
      ligne[colonne] = table[colonne]?.[i];
    }
    return ligne as LigneBrute;
  });
}
