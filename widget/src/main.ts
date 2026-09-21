/**
 * Sonde de connexion.
 *
 * Ce widget ne porte encore aucune des vues métier du cahier des charges —
 * celles-ci viendront après validation de la maquette. Son seul rôle
 * aujourd'hui est de prouver que la chaîne fonctionne de bout en bout :
 * chargé comme custom widget dans un document Grist, il en lit les tables et
 * affiche leur nombre de lignes. Sert de base à l'environnement de test.
 */

/** Une table du document, telle que résumée pour l'affichage. */
export interface ResumeTable {
  tableId: string;
  lignes: number;
}

/** Trie les tables par identifiant, pour un affichage stable et lisible. */
export function construireResume(comptes: Record<string, number>): ResumeTable[] {
  return Object.entries(comptes)
    .map(([tableId, lignes]) => ({tableId, lignes}))
    .sort((a, b) => a.tableId.localeCompare(b.tableId, 'fr'));
}

/** Nombre de lignes d'une table, à partir du résultat de `fetchTable`. */
function compterLignes(donnees: Record<string, unknown[]>): number {
  const colonne = donnees['id'];
  return Array.isArray(colonne) ? colonne.length : 0;
}

function afficherMessage(texte: string): void {
  const racine = document.getElementById('app');
  if (!racine) { return; }
  racine.textContent = texte;
}

function afficherResume(resume: ResumeTable[]): void {
  const racine = document.getElementById('app');
  if (!racine) { return; }
  racine.textContent = '';

  const titre = document.createElement('h1');
  titre.textContent = 'PlanningPlus — document connecté';
  racine.appendChild(titre);

  const tableau = document.createElement('table');
  const enTete = tableau.insertRow();
  for (const libelle of ['Table', 'Lignes']) {
    const cellule = document.createElement('th');
    cellule.textContent = libelle;
    enTete.appendChild(cellule);
  }
  for (const {tableId, lignes} of resume) {
    const ligne = tableau.insertRow();
    ligne.insertCell().textContent = tableId;
    ligne.insertCell().textContent = String(lignes);
  }
  racine.appendChild(tableau);
}

async function demarrer(): Promise<void> {
  if (typeof window.grist === 'undefined') {
    afficherMessage(
      "Ce widget doit être ouvert depuis un document Grist : window.grist n'est pas disponible.",
    );
    return;
  }

  window.grist.ready({requiredAccess: 'full'});

  try {
    const idsDeTables = await window.grist.docApi.listTables();
    const comptes: Record<string, number> = {};
    for (const tableId of idsDeTables) {
      const donnees = await window.grist.docApi.fetchTable(tableId);
      comptes[tableId] = compterLignes(donnees);
    }
    afficherResume(construireResume(comptes));
  } catch (erreur) {
    afficherMessage(`Échec de lecture du document : ${(erreur as Error).message}`);
  }
}

void demarrer();
