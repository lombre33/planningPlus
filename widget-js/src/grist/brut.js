/**
 * Format brut des tables Grist (colonnaire, tel que renvoyé par
 * `docApi.fetchTable`) et sa conversion en lignes — le point commun entre
 * `lecture.js` (vers `DonneesPlanning`, le modèle du moteur) et `modele.js`
 * (vers `Modele`, le modèle complet de l'UI), qui décodent tous deux les
 * mêmes tables brutes vers des formes différentes.
 */

/** Convertit une table colonnaire en tableau de lignes. Pure, sans effet de bord. */
export function zipperTable(table) {
  if (!table) { return []; }
  const ids = table.id;
  if (!Array.isArray(ids)) { return []; }
  return ids.map((id, i) => {
    const ligne = {id};
    for (const colonne of Object.keys(table)) {
      if (colonne === 'id') { continue; }
      ligne[colonne] = table[colonne]?.[i];
    }
    return ligne;
  });
}
