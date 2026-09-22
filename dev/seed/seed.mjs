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
 *
 * `--sans-donnees` construit le schéma seul (les 17 tables, aucune ligne) :
 * c'est ce mode qui produit `dev/seed/modele-planningplus.grist` (voir
 * `dev/README.md`, « Document modèle »), le fichier qu'un utilisateur sans
 * accès à ce dépôt importe pour obtenir le schéma dans son propre document.
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
  nbJours: Number(args.jours ?? 5),
  nbBenevoles: Number(args.benevoles ?? 70),
  nbEquipes: Number(args.equipes ?? 3),
  nbArtistes: Number(args.artistes ?? 20),
  dureeSousCreneauMinutes: Number(args['duree-sous-creneau'] ?? 90),
  graine: Number(args.graine ?? 20260717),
  sansDonnees: args['sans-donnees'] === 'true',
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

/**
 * Retrouve, pour chaque table du schéma, l'identifiant réel courant dans le
 * document, à partir de l'identifiant de ligne (stable) de sa métadonnée
 * `_grist_Tables`.
 *
 * Nécessaire parce que poser le titre d'une table (`reglerLibellesTables`)
 * renomme silencieusement son identifiant réel quand celui-ci n'a jamais été
 * personnalisé à la main : un identifiant capturé juste après la création
 * peut donc devenir invalide. On ne s'appuie jamais sur l'identifiant déclaré
 * au schéma ni sur un identifiant capturé plus tôt pour construire une URL
 * d'API : on le retrouve toujours via l'identifiant de ligne.
 */
async function idsReelsDepuisLignes(idDoc, rowIdParSchema) {
  const tables = (await client.lireEnregistrements(idDoc, '_grist_Tables')).records;
  const idParRowId = new Map(tables.map((t) => [t.id, t.fields.tableId]));
  const idReelParSchema = new Map();
  for (const [schemaId, rowId] of rowIdParSchema) {
    const idReel = idParRowId.get(rowId);
    if (!idReel) { throw new Error(`Table « ${schemaId} » : ligne de métadonnée ${rowId} introuvable.`); }
    idReelParSchema.set(schemaId, idReel);
  }
  return idReelParSchema;
}

/** Traduit une colonne du schéma en définition de colonne pour l'API Grist. */
function definitionColonne(colonne) {
  const fields = {
    label: colonne.libelle ?? colonne.id,
    type: colonne.type,
    isFormula: Boolean(colonne.formule),
    formula: colonne.formule ?? '',
  };
  if (colonne.description) { fields.description = colonne.description; }
  if (colonne.choix) {
    fields.widgetOptions = JSON.stringify({choices: colonne.choix, choiceOptions: {}});
  }
  return {id: colonne.id, fields};
}

/**
 * Crée les tables et leurs colonnes, hors références différées.
 *
 * Grist peut réassigner l'identifiant réel d'une table à la création (par
 * exemple à partir d'un identifiant en casse mixte comme `MacroCreneaux`) :
 * on ne suppose donc jamais que l'identifiant déclaré au schéma est celui du
 * document, on relit systématiquement celui que l'API renvoie.
 *
 * L'identifiant renvoyé par cet appel n'est valable qu'à cet instant : poser
 * le titre d'une table plus tard (`reglerLibellesTables`) peut la renommer.
 * On capture donc aussi, dans la foulée, l'identifiant de ligne (stable) de
 * chaque table en métadonnée, seule référence fiable sur la durée du script
 * (voir `idsReelsDepuisLignes`).
 *
 * @returns {Promise<Map<string, number>>} identifiant du schéma → identifiant de ligne dans `_grist_Tables`.
 */
async function creerTables(idDoc) {
  const idInitialParSchema = new Map();
  for (const table of TABLES) {
    const reponse = await client.requete('POST', `/api/docs/${idDoc}/tables`, {
      tables: [{
        id: table.id,
        columns: table.colonnes.map(definitionColonne),
      }],
    });
    const idReel = reponse.tables[0].id;
    idInitialParSchema.set(table.id, idReel);
    const suffixe = idReel === table.id ? '' : ` (identifiant réel : ${idReel})`;
    console.log(`  table ${table.id} créée (${table.colonnes.length} colonnes)${suffixe}`);
  }
  for (const differee of REFERENCES_DIFFEREES) {
    const idReelCible = idInitialParSchema.get(differee.table);
    await client.requete('POST', `/api/docs/${idDoc}/tables/${idReelCible}/columns`, {
      columns: [definitionColonne(differee.colonne)],
    });
    console.log(`  colonne ${differee.table}.${differee.colonne.id} ajoutée`);
  }

  const tables = (await client.lireEnregistrements(idDoc, '_grist_Tables')).records;
  const rowIdParIdReel = new Map(tables.map((t) => [t.fields.tableId, t.id]));
  const rowIdParSchema = new Map();
  for (const [schemaId, idReel] of idInitialParSchema) {
    const rowId = rowIdParIdReel.get(idReel);
    if (!rowId) { throw new Error(`Table « ${schemaId} » (${idReel}) : ligne de métadonnée introuvable.`); }
    rowIdParSchema.set(schemaId, rowId);
  }
  return rowIdParSchema;
}

/**
 * Grist crée toute nouvelle table avec une colonne texte « A », « B », « C »
 * dont on n'a pas l'usage : on les retire une fois nos colonnes en place.
 */
async function retirerColonnesParDefaut(idDoc, idReelParSchema) {
  const meta = await lireMetadonnees(idDoc);
  const actions = [];
  const attendues = new Map(TABLES.map((t) => [
    idReelParSchema.get(t.id),
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
async function reglerAffichageReferences(idDoc, idReelParSchema) {
  const meta = await lireMetadonnees(idDoc);
  const actions = [];
  const toutes = [
    ...TABLES.flatMap((t) => t.colonnes.map((c) => ({table: t.id, colonne: c}))),
    ...REFERENCES_DIFFEREES.map((r) => ({table: r.table, colonne: r.colonne})),
  ];
  for (const {table, colonne} of toutes) {
    if (!colonne.visibleCol) { continue; }
    const idReelTable = idReelParSchema.get(table);
    const tableCible = colonne.type.split(':')[1];
    const idReelCible = idReelParSchema.get(tableCible);
    const refColonneCible = meta.refColonne.get(`${idReelCible}.${colonne.visibleCol}`);
    const refColonne = meta.refColonne.get(`${idReelTable}.${colonne.id}`);
    if (!refColonneCible || !refColonne) {
      throw new Error(`Référence introuvable pour ${table}.${colonne.id}`);
    }
    actions.push(['ModifyColumn', idReelTable, colonne.id, {visibleCol: refColonneCible}]);
    actions.push(['SetDisplayFormula', idReelTable, null, refColonne,
      `$${colonne.id}.${colonne.visibleCol}`]);
  }
  await client.appliquerActions(idDoc, actions);
  console.log(`  ${actions.length / 2} colonne(s) de référence rendues lisibles`);
}

/** Pose le libellé et la description de chaque table sur sa vue brute. */
async function reglerLibellesTables(idDoc, idReelParSchema) {
  const meta = await lireMetadonnees(idDoc);
  const actions = TABLES
    .map((table) => ({table, idReel: idReelParSchema.get(table.id)}))
    .filter(({idReel}) => meta.rawViewSection.get(idReel))
    .map(({table, idReel}) => ['UpdateRecord', '_grist_Views_section', meta.rawViewSection.get(idReel), {
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

async function injecterDonnees(idDoc, donnees, idReelParSchema) {
  const idsParTable = new Map();
  // Les équipes sont insérées avant les bénévoles, donc sans leur référent ;
  // on revient le poser une fois les bénévoles créés.
  const referents = donnees.Equipes.map((e) => e.Referent);
  const equipesSansReferent = donnees.Equipes.map(({Referent, ...reste}) => reste);

  for (const table of TABLES) {
    const lignes = table.id === 'Equipes' ? equipesSansReferent : donnees[table.id];
    if (!lignes || lignes.length === 0) {
      idsParTable.set(table.id, []);
      continue;
    }
    const resolues = resoudreReferences(table.id, lignes, idsParTable);
    const ids = await client.ajouterEnregistrements(idDoc, idReelParSchema.get(table.id), resolues);
    idsParTable.set(table.id, ids);
    console.log(`  ${table.id} : ${ids.length} ligne(s)`);
  }

  const majReferents = referents
    .map((referent, i) => ({referent, i}))
    .filter(({referent}) => referent)
    .map(({referent, i}) => ({
      id: idsParTable.get('Equipes')[i],
      fields: {Referent: idsParTable.get('Benevoles')[referent._ref]},
    }));
  if (majReferents.length > 0) {
    await client.majEnregistrements(idDoc, idReelParSchema.get('Equipes'), majReferents);
    console.log(`  Equipes : ${majReferents.length} référent(s) renseigné(s)`);
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
  const rowIdParSchema = await creerTables(idDoc);
  let idReelParSchema = await idsReelsDepuisLignes(idDoc, rowIdParSchema);
  await retirerColonnesParDefaut(idDoc, idReelParSchema);
  await retirerTableParDefaut(idDoc);
  await reglerAffichageReferences(idDoc, idReelParSchema);
  await reglerLibellesTables(idDoc, idReelParSchema);
  // Poser le titre d'une table peut la renommer (voir `idsReelsDepuisLignes`) :
  // on relit les identifiants réels avant l'injection de données, qui en dépend.
  idReelParSchema = await idsReelsDepuisLignes(idDoc, rowIdParSchema);

  if (config.sansDonnees) {
    console.log('Données : aucune (--sans-donnees) — document schéma seul, tables vides.');
  } else {
    console.log(
      `Données (graine ${config.graine}, ${config.nbJours} jours, ${config.nbBenevoles} bénévoles, `
      + `${config.nbEquipes} équipes, ${config.nbArtistes} artistes) :`,
    );
    const donnees = genererFestival({
      graine: config.graine,
      nbJours: config.nbJours,
      nbBenevoles: config.nbBenevoles,
      nbEquipes: config.nbEquipes,
      nbArtistes: config.nbArtistes,
      dureeSousCreneauMinutes: config.dureeSousCreneauMinutes,
    });
    await injecterDonnees(idDoc, donnees, idReelParSchema);
  }

  console.log(`\nFuseau horaire du document : ${TIMEZONE}`);
  console.log(`Document prêt : ${config.url}/o/docs/${idDoc}`);
}

principal().catch((erreur) => {
  console.error(`\nÉchec : ${erreur.message}`);
  process.exitCode = 1;
});
