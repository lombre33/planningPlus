#!/usr/bin/env node
/**
 * (Re)construit le document Grist de test de PlanningPlus.
 *
 * Le script est rejouable : il recrée le document de zéro à chaque exécution,
 * schéma compris. C'est voulu — le modèle de données bougera tant que le
 * cahier des charges n'est pas arrêté, et un document de test doit pouvoir
 * être jeté.
 *
 * Utilisation :
 *   node dev/seed/seed.mjs --url=http://localhost:8484 --cle=<clé d'API>
 *
 * Les paramètres peuvent aussi venir de `dev/.env` ou de l'environnement,
 * sous les noms GRIST_URL et GRIST_API_KEY.
 */

import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {ClientGrist} from './grist-api.mjs';
import {genererFestival} from './generate.mjs';
import {TABLES, REFERENCES_DIFFEREES, TIMEZONE} from './schema.mjs';

const RACINE_DEV = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- Configuration -------------------------------------------------------

/** Lit `dev/.env` s'il existe. Format `CLE=valeur`, une par ligne. */
function lireFichierEnv() {
  try {
    const contenu = readFileSync(resolve(RACINE_DEV, '.env'), 'utf8');
    return Object.fromEntries(
      contenu.split('\n')
        .map((ligne) => ligne.trim())
        .filter((ligne) => ligne && !ligne.startsWith('#'))
        .map((ligne) => {
          const separateur = ligne.indexOf('=');
          return [ligne.slice(0, separateur), ligne.slice(separateur + 1).replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}

/** Lit les options `--cle=valeur` de la ligne de commande. */
function lireArguments(argv) {
  return Object.fromEntries(
    argv.filter((a) => a.startsWith('--')).map((a) => {
      const separateur = a.indexOf('=');
      return separateur === -1
        ? [a.slice(2), 'true']
        : [a.slice(2, separateur), a.slice(separateur + 1)];
    }),
  );
}

const args = lireArguments(process.argv.slice(2));
const env = {...lireFichierEnv(), ...process.env};

const config = {
  url: args.url ?? env.GRIST_URL ?? 'http://localhost:8484',
  cleApi: args.cle ?? env.GRIST_API_KEY ?? '',
  nomDoc: args.nom ?? env.GRIST_DOC_NAME ?? 'PlanningPlus — festival de test',
  nomWorkspace: args.workspace ?? env.GRIST_WORKSPACE ?? 'PlanningPlus',
  nbJours: Number(args.jours ?? 3),
  nbBenevoles: Number(args.benevoles ?? 120),
  graine: Number(args.graine ?? 20260717),
};

if (!config.cleApi) {
  console.error(
    'Clé d\'API manquante. Passez --cle=<clé>, ou renseignez GRIST_API_KEY dans dev/.env.\n'
    + 'La clé se récupère dans Grist : menu du profil → Profile Settings → API Key.',
  );
  process.exit(1);
}

// --- Construction du document -------------------------------------------

const client = new ClientGrist(config.url, config.cleApi);

/** Identifiants Grist des tables et colonnes, indexés par identifiant lisible. */
class Metadonnees {
  constructor(tables, colonnes) {
    this.refTable = new Map(tables.map((t) => [t.fields.tableId, t.id]));
    this.refColonne = new Map(colonnes.map((c) => [
      `${this.tableIdDepuisRef(tables, c.fields.parentId)}.${c.fields.colId}`, c.id,
    ]));
    this.rawViewSection = new Map(tables.map((t) => [t.fields.tableId, t.fields.rawViewSectionRef]));
  }

  tableIdDepuisRef(tables, ref) {
    return tables.find((t) => t.id === ref)?.fields.tableId;
  }
}

async function lireMetadonnees(idDoc) {
  const [tables, colonnes] = await Promise.all([
    client.lireEnregistrements(idDoc, '_grist_Tables'),
    client.lireEnregistrements(idDoc, '_grist_Tables_column'),
  ]);
  return new Metadonnees(tables.records, colonnes.records);
}

/** Traduit une colonne du schéma en définition de colonne pour l'API Grist. */
function definitionColonne(colonne) {
  const fields = {
    label: colonne.libelle ?? colonne.id,
    type: colonne.type,
    isFormula: false,
    formula: '',
  };
  if (colonne.description) { fields.description = colonne.description; }
  if (colonne.choix) {
    fields.widgetOptions = JSON.stringify({choices: colonne.choix, choiceOptions: {}});
  }
  return {id: colonne.id, fields};
}

/** Crée les tables et leurs colonnes, hors références différées. */
async function creerTables(idDoc) {
  for (const table of TABLES) {
    await client.requete('POST', `/api/docs/${idDoc}/tables`, {
      tables: [{
        id: table.id,
        columns: table.colonnes.map(definitionColonne),
      }],
    });
    console.log(`  table ${table.id} créée (${table.colonnes.length} colonnes)`);
  }
  for (const differee of REFERENCES_DIFFEREES) {
    await client.requete('POST', `/api/docs/${idDoc}/tables/${differee.table}/columns`, {
      columns: [definitionColonne(differee.colonne)],
    });
    console.log(`  colonne ${differee.table}.${differee.colonne.id} ajoutée`);
  }
}

/**
 * Grist crée toute nouvelle table avec une colonne texte « A », « B », « C »
 * dont on n'a pas l'usage : on les retire une fois nos colonnes en place.
 */
async function retirerColonnesParDefaut(idDoc) {
  const meta = await lireMetadonnees(idDoc);
  const actions = [];
  const attendues = new Map(TABLES.map((t) => [
    t.id,
    new Set([...t.colonnes, ...REFERENCES_DIFFEREES.filter((r) => r.table === t.id).map((r) => r.colonne)]
      .map((c) => c.id)),
  ]));
  const colonnes = (await client.lireEnregistrements(idDoc, '_grist_Tables_column')).records;
  const tables = (await client.lireEnregistrements(idDoc, '_grist_Tables')).records;
  for (const colonne of colonnes) {
    const tableId = tables.find((t) => t.id === colonne.fields.parentId)?.fields.tableId;
    if (!attendues.has(tableId)) { continue; }
    if (colonne.fields.colId.startsWith('gristHelper_')) { continue; }
    if (!attendues.get(tableId).has(colonne.fields.colId)) {
      actions.push(['RemoveColumn', tableId, colonne.fields.colId]);
    }
  }
  if (actions.length > 0) {
    await client.appliquerActions(idDoc, actions);
    console.log(`  ${actions.length} colonne(s) par défaut retirée(s)`);
  }
  void meta;
}

/**
 * Rend les colonnes de référence lisibles dans les vues natives : chacune
 * affiche un libellé plutôt qu'un identifiant de ligne. C'est la contrainte
 * de lisibilité du projet, appliquée au niveau du document.
 */
async function reglerAffichageReferences(idDoc) {
  const meta = await lireMetadonnees(idDoc);
  const actions = [];
  const toutes = [
    ...TABLES.flatMap((t) => t.colonnes.map((c) => ({table: t.id, colonne: c}))),
    ...REFERENCES_DIFFEREES.map((r) => ({table: r.table, colonne: r.colonne})),
  ];
  for (const {table, colonne} of toutes) {
    if (!colonne.visibleCol) { continue; }
    const tableCible = colonne.type.split(':')[1];
    const refColonneCible = meta.refColonne.get(`${tableCible}.${colonne.visibleCol}`);
    const refColonne = meta.refColonne.get(`${table}.${colonne.id}`);
    if (!refColonneCible || !refColonne) {
      throw new Error(`Référence introuvable pour ${table}.${colonne.id}`);
    }
    actions.push(['ModifyColumn', table, colonne.id, {visibleCol: refColonneCible}]);
    actions.push(['SetDisplayFormula', table, null, refColonne,
      `$${colonne.id}.${colonne.visibleCol}`]);
  }
  await client.appliquerActions(idDoc, actions);
  console.log(`  ${actions.length / 2} colonne(s) de référence rendues lisibles`);
}

/** Pose le libellé et la description de chaque table sur sa vue brute. */
async function reglerLibellesTables(idDoc) {
  const meta = await lireMetadonnees(idDoc);
  const actions = TABLES
    .filter((table) => meta.rawViewSection.get(table.id))
    .map((table) => ['UpdateRecord', '_grist_Views_section', meta.rawViewSection.get(table.id), {
      title: table.libelle ?? table.id,
      description: table.description ?? '',
    }]);
  await client.appliquerActions(idDoc, actions);
  console.log(`  ${actions.length} libellé(s) de table posés`);
}

/** Supprime la table « Table1 » que Grist crée avec tout nouveau document. */
async function retirerTableParDefaut(idDoc) {
  const tables = await client.listerTables(idDoc);
  const parDefaut = tables.tables.find((t) => t.id === 'Table1');
  if (parDefaut) {
    await client.appliquerActions(idDoc, [['RemoveTable', 'Table1']]);
    console.log('  table Table1 retirée');
  }
}

// --- Injection des données ----------------------------------------------

/** Type de la colonne `colId` de la table `tableId`, tel que déclaré au schéma. */
function typeColonne(tableId, colId) {
  const table = TABLES.find((t) => t.id === tableId);
  const colonne = table?.colonnes.find((c) => c.id === colId)
    ?? REFERENCES_DIFFEREES.find((r) => r.table === tableId && r.colonne.id === colId)?.colonne;
  return colonne?.type;
}

/**
 * Remplace les renvois locaux `{_ref: n}` par les identifiants de ligne Grist.
 * La table visée est déduite du type de la colonne, pas du contenu : une
 * référence mal typée lève plutôt que d'écrire une ligne silencieusement fausse.
 */
function resoudreReferences(tableId, lignes, idsParTable) {
  return lignes.map((ligne) => Object.fromEntries(
    Object.entries(ligne).map(([colId, valeur]) => {
      if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur) || !('_ref' in valeur)) {
        return [colId, valeur];
      }
      const type = typeColonne(tableId, colId);
      const tableCible = type?.split(':')[1];
      const ids = idsParTable.get(tableCible);
      if (!ids) {
        throw new Error(`${tableId}.${colId} : table cible « ${tableCible} » inconnue`);
      }
      const id = ids[valeur._ref];
      if (id === undefined) {
        throw new Error(`${tableId}.${colId} : ligne ${valeur._ref} introuvable dans ${tableCible}`);
      }
      return [colId, id];
    }),
  ));
}

async function injecterDonnees(idDoc, donnees) {
  const idsParTable = new Map();
  // Les équipes sont insérées avant les bénévoles, donc sans leur responsable ;
  // on revient le poser une fois les bénévoles créés.
  const responsables = donnees.Equipes.map((e) => e.Responsable);
  const equipesSansResponsable = donnees.Equipes.map(({Responsable, ...reste}) => reste);

  for (const table of TABLES) {
    const lignes = table.id === 'Equipes' ? equipesSansResponsable : donnees[table.id];
    if (!lignes || lignes.length === 0) {
      idsParTable.set(table.id, []);
      continue;
    }
    const resolues = resoudreReferences(table.id, lignes, idsParTable);
    const ids = await client.ajouterEnregistrements(idDoc, table.id, resolues);
    idsParTable.set(table.id, ids);
    console.log(`  ${table.id} : ${ids.length} ligne(s)`);
  }

  const majResponsables = responsables
    .map((responsable, i) => ({responsable, i}))
    .filter(({responsable}) => responsable)
    .map(({responsable, i}) => ({
      id: idsParTable.get('Equipes')[i],
      fields: {Responsable: idsParTable.get('Benevoles')[responsable._ref]},
    }));
  if (majResponsables.length > 0) {
    await client.majEnregistrements(idDoc, 'Equipes', majResponsables);
    console.log(`  Equipes : ${majResponsables.length} responsable(s) renseignés`);
  }
  return idsParTable;
}

// --- Point d'entrée ------------------------------------------------------

async function principal() {
  console.log(`Grist : ${config.url}`);

  const orgs = await client.listerOrgs();
  const org = orgs.find((o) => o.domain === 'docs') ?? orgs[0];
  if (!org) { throw new Error("Aucune organisation accessible avec cette clé d'API."); }

  const workspaces = await client.listerWorkspaces(org.id);
  let workspace = workspaces.find((w) => w.name === config.nomWorkspace);
  if (!workspace) {
    const id = await client.creerWorkspace(org.id, config.nomWorkspace);
    workspace = {id, name: config.nomWorkspace, docs: []};
    console.log(`Espace de travail « ${config.nomWorkspace} » créé.`);
  }

  for (const doc of workspace.docs ?? []) {
    if (doc.name === config.nomDoc) {
      await client.supprimerDoc(doc.id);
      console.log(`Ancien document « ${doc.name} » supprimé.`);
    }
  }

  const idDoc = await client.creerDoc(workspace.id, config.nomDoc);
  console.log(`Document créé : ${idDoc}`);

  console.log('Schéma :');
  await creerTables(idDoc);
  await retirerColonnesParDefaut(idDoc);
  await retirerTableParDefaut(idDoc);
  await reglerAffichageReferences(idDoc);
  await reglerLibellesTables(idDoc);

  console.log(`Données (graine ${config.graine}, ${config.nbJours} jours, ${config.nbBenevoles} bénévoles) :`);
  const donnees = genererFestival({
    graine: config.graine,
    nbJours: config.nbJours,
    nbBenevoles: config.nbBenevoles,
  });
  await injecterDonnees(idDoc, donnees);

  console.log(`\nFuseau horaire du document : ${TIMEZONE}`);
  console.log(`Document prêt : ${config.url}/o/docs/${idDoc}`);
}

principal().catch((erreur) => {
  console.error(`\nÉchec : ${erreur.message}`);
  process.exitCode = 1;
});
