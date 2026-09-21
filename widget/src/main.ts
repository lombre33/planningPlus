/**
 * Point d'entrée du widget.
 *
 * `public/vendor/grist-plugin-api.js` définit `window.grist` de façon
 * inconditionnelle, même hors d'un document Grist : on ne peut donc pas
 * distinguer une vraie connexion d'une absence de connexion sans tenter un
 * appel et le borner dans le temps (sans host Grist en face, un appel
 * resterait sinon en attente indéfinie, aucune réponse n'arrivant jamais au
 * `postMessage`). Selon le résultat :
 *
 * - connecté : sonde le document et affiche le nombre de lignes par table
 *   (la lecture métier réelle — agenda, missions, anomalies… — reste à
 *   brancher une fois la maquette validée, cf. `dev/README.md`) ;
 * - non connecté (aperçu, démonstration, tests) : monte la maquette
 *   interactive sur le jeu de données figé (`donnees/festival.json`).
 */

import './style.css';
import {demarrerApp} from './app';
import {normaliser} from './donnees/normaliser';
import {Magasin} from './store';

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

const DELAI_CONNEXION_MS = 1500;

function demarrerDemo(racine: HTMLElement): void {
  const magasin = new Magasin(normaliser());
  demarrerApp(racine, magasin, 'Démonstration — jeu de données figé');
}

function afficherResume(racine: HTMLElement, resume: ResumeTable[]): void {
  racine.textContent = '';

  const titre = document.createElement('h1');
  titre.textContent = 'PlanningPlus — document connecté';
  racine.append(titre);

  const tableau = document.createElement('table');
  const enTete = tableau.insertRow();
  for (const libelle of ['Table', 'Lignes']) {
    const cellule = document.createElement('th');
    cellule.textContent = libelle;
    enTete.append(cellule);
  }
  for (const {tableId, lignes} of resume) {
    const ligne = tableau.insertRow();
    ligne.insertCell().textContent = tableId;
    ligne.insertCell().textContent = String(lignes);
  }
  racine.append(tableau);

  const note = document.createElement('p');
  note.textContent = 'Les vues métier (agenda, missions, anomalies, indicatifs, jour J) restent à brancher sur ce document réel ; en attendant, ouvrez ce widget hors de Grist pour la démonstration interactive.';
  racine.append(note);
}

async function demarrer(): Promise<void> {
  const racine = document.getElementById('app');
  if (!racine) { return; }

  if (typeof window.grist === 'undefined') {
    demarrerDemo(racine);
    return;
  }

  window.grist.ready({requiredAccess: 'full'});
  try {
    const idsDeTables = await Promise.race([
      window.grist.docApi.listTables(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DELAI_CONNEXION_MS)),
    ]);
    if (idsDeTables == null) {
      demarrerDemo(racine);
      return;
    }
    const comptes: Record<string, number> = {};
    for (const tableId of idsDeTables) {
      const donnees = await window.grist.docApi.fetchTable(tableId);
      comptes[tableId] = compterLignes(donnees);
    }
    afficherResume(racine, construireResume(comptes));
  } catch {
    demarrerDemo(racine);
  }
}

void demarrer();
