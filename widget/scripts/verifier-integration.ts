/**
 * Vérification bout en bout de `widget/src/grist/` contre une vraie instance
 * Grist : lecture du document réel, écriture d'un groupe/positions/places/
 * disponibilités/verrouillage/paramètres via les mêmes fonctions que le
 * widget, puis relecture pour confirmer que tout revient identique.
 *
 * N'utilise PAS `window.grist` (ce script tourne sous Node, pas dans un
 * widget) : un petit adaptateur REST fait office de `docApi`, en frappant
 * les mêmes routes que `dev/seed/grist-api.mjs`. `applyUserActions` côté
 * plugin et `/apply` côté REST appellent le même code serveur
 * (`ActiveDoc.applyUserActions`) : ce script exerce donc le même chemin que
 * ce que fera le widget une fois chargé dans Grist, sans avoir besoin d'un
 * navigateur pour ça — seule la partie « lisibilité native » (grille,
 * filtre, tri) a vraiment besoin d'un navigateur, voir `dev/README.md`.
 *
 * Usage : depuis widget/, `npx vite-node scripts/verifier-integration.ts
 * --doc=<id>` (ou `GRIST_DOC_ID=<id>` dans l'environnement).
 */

import {
  actionsCreerGroupe,
  actionsDefinirPlaces,
  actionsEcrireDisponibilites,
  actionsEnregistrerHeureCoupure,
  actionsEnregistrerParametresAlgorithme,
  actionsPositionnerGroupe,
  actionsVerrouillerPlace,
  appliquerActions,
  construireLignesParametres,
  heureCoupureDepuisLignes,
  lireDocument,
  parametresAlgorithmeDepuisLignes,
  type UserAction,
} from '../src/grist';
import type {DonneesPlanning} from '../src/moteur/types';

function lireArguments(argv: string[]): Record<string, string> {
  return Object.fromEntries(
    argv.filter((a) => a.startsWith('--')).map((a) => {
      const separateur = a.indexOf('=');
      return separateur === -1 ? [a.slice(2), 'true'] : [a.slice(2, separateur), a.slice(separateur + 1)];
    }),
  );
}

const args = lireArguments(process.argv.slice(2));
const url = (args.url ?? process.env.GRIST_URL ?? 'http://localhost:8484').replace(/\/+$/, '');
const cle = args.cle ?? process.env.GRIST_API_KEY ?? '';
const idDoc = args.doc ?? process.env.GRIST_DOC_ID ?? '';

if (!cle || !idDoc) {
  console.error('Usage : npx vite-node scripts/verifier-integration.ts --doc=<id> [--cle=<clé>] [--url=<url>]');
  console.error("(ou GRIST_DOC_ID / GRIST_API_KEY / GRIST_URL dans l'environnement, comme dev/.env)");
  process.exit(1);
}

async function requeteJson(chemin: string, options: RequestInit = {}): Promise<unknown> {
  const reponse = await fetch(`${url}${chemin}`, {
    ...options,
    headers: {Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', ...options.headers},
  });
  const texte = await reponse.text();
  if (!reponse.ok) { throw new Error(`${options.method ?? 'GET'} ${chemin} → ${reponse.status} : ${texte.slice(0, 300)}`); }
  return texte ? JSON.parse(texte) : null;
}

/** Adaptateur REST jouant le rôle de `window.grist.docApi`, pour ce script Node. */
const docApi = {
  async listTables(): Promise<string[]> {
    const reponse = await requeteJson(`/api/docs/${idDoc}/tables`) as {tables: {id: string}[]};
    return reponse.tables.map((t) => t.id);
  },
  async fetchTable(tableId: string): Promise<Record<string, unknown[]>> {
    return await requeteJson(`/api/docs/${idDoc}/tables/${tableId}/data`) as Record<string, unknown[]>;
  },
  async applyUserActions(actions: UserAction[]) {
    const retValues = await requeteJson(`/api/docs/${idDoc}/apply`, {
      method: 'POST',
      body: JSON.stringify(actions),
    }) as {retValues: unknown[]};
    return retValues;
  },
};

let echecs = 0;
function verifier(intitule: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${intitule}`);
  } else {
    echecs++;
    console.log(`  ✗ ${intitule}${detail ? ` — ${detail}` : ''}`);
  }
}

async function principal(): Promise<void> {
  console.log(`Document : ${url}/o/docs/${idDoc}\n`);

  console.log('1. Lecture du document existant');
  const avant = await lireDocument(docApi);
  const {resolution} = avant;
  console.log(`   résolution de table (canonique → réel) : ${JSON.stringify(resolution)}`);
  const compteTables = (d: DonneesPlanning) => ({
    benevoles: d.benevoles.length, missions: d.missions.length, besoins: d.besoins.length,
    groupes: d.groupes.length, places: d.places.length, disponibilites: d.disponibilites.length,
  });
  console.log('  ', compteTables(avant.donnees));
  verifier('des bénévoles ont été lus', avant.donnees.benevoles.length > 0);
  verifier('des besoins ont été lus', avant.donnees.besoins.length > 0);
  verifier('des places ont été lues', avant.donnees.places.length > 0);

  const parametresAvant = parametresAlgorithmeDepuisLignes(avant.parametres);
  const heureCoupureAvant = heureCoupureDepuisLignes(avant.parametres);
  console.log(`   heure de coupure lue : ${heureCoupureAvant}h, poids.equite lu : ${parametresAvant.poids.equite}`);

  console.log('\n2. Écriture : un nouveau groupe, positionné, avec son roster');
  const benevole = avant.donnees.benevoles[0]!;
  const besoin = avant.donnees.besoins[0]!;

  const [idGroupe] = await appliquerActions(docApi, actionsCreerGroupe({
    code: 'ZZ_TEST', taille: 2, equipeId: benevole.equipeId, notes: 'créé par verifier-integration.ts',
  }), resolution) as [number];
  verifier('AddRecord Groupes a rendu un id', typeof idGroupe === 'number' && idGroupe > 0);

  await appliquerActions(docApi, actionsPositionnerGroupe(idGroupe, [besoin.id]), resolution);
  // Une BulkAddRecord est une seule action : son retValue est le tableau des
  // ids créés (retValues[0]), pas un retValue par id — à la différence d'un
  // AddRecord simple, dont le retValue est directement le nouvel id.
  const [idsPlaces] = await appliquerActions(docApi, actionsDefinirPlaces(idGroupe, [
    {rang: 1, benevoleId: benevole.id, origine: 'Manuel', verrouillee: false, score: 0.9},
    {rang: 2, benevoleId: null, origine: 'Algorithme', verrouillee: false, score: null},
  ]), resolution) as [number[]];
  const [idPlaceOccupee, idPlaceVide] = idsPlaces;
  verifier('BulkAddRecord Places a rendu deux ids', typeof idPlaceOccupee === 'number' && typeof idPlaceVide === 'number');

  console.log('\n3. Écriture : verrouillage de la place occupée');
  await appliquerActions(docApi, actionsVerrouillerPlace(idPlaceOccupee!, true), resolution);

  console.log('\n4. Écriture : une disponibilité de test');
  const quartDeTest = 4102444800; // 2100-01-01T00:00:00Z, hors du festival généré : ne collisionne jamais
  await appliquerActions(docApi, actionsEcrireDisponibilites([
    {benevoleId: benevole.id, quartHeure: quartDeTest, statut: 'Disponible', artisteId: null},
  ]), resolution);

  console.log('\n5. Écriture : paramètres (upsert — poids.equite modifié)');
  await appliquerActions(docApi, actionsEnregistrerParametresAlgorithme(
    {...parametresAvant, poids: {...parametresAvant.poids, equite: 0.42}}, avant.parametres,
  ), resolution);

  console.log('\n6. Relecture complète, pour comparer avec ce qui vient d\'être écrit');
  const apres = await lireDocument(docApi);

  const groupeRelu = apres.donnees.groupes.find((g) => g.id === idGroupe);
  verifier('le groupe créé se relit avec les bons champs', !!groupeRelu
    && groupeRelu.code === 'ZZ_TEST' && groupeRelu.taille === 2 && groupeRelu.equipeId === benevole.equipeId);

  const positionRelue = apres.donnees.positionsGroupe.find((p) => p.groupeId === idGroupe);
  verifier('la position se relit, liée au bon besoin', positionRelue?.besoinId === besoin.id);

  const placeOccupeeRelue = apres.donnees.places.find((p) => p.id === idPlaceOccupee);
  verifier('la place occupée se relit (bénévole, origine, score, verrouillage)', !!placeOccupeeRelue
    && placeOccupeeRelue.benevoleId === benevole.id
    && placeOccupeeRelue.origine === 'Manuel'
    && placeOccupeeRelue.score === 0.9
    && placeOccupeeRelue.verrouillee === true);

  const placeVideRelue = apres.donnees.places.find((p) => p.id === idPlaceVide);
  verifier('la place vide se relit avec benevoleId === null (pas 0)', placeVideRelue?.benevoleId === null);

  const dispoRelue = apres.donnees.disponibilites.find((d) => d.benevoleId === benevole.id && d.quartHeure === quartDeTest);
  verifier('la disponibilité de test se relit', dispoRelue?.statut === 'Disponible');

  const parametresApres = parametresAlgorithmeDepuisLignes(apres.parametres);
  verifier('poids.equite se relit modifié (0.42)', parametresApres.poids.equite === 0.42);
  verifier(
    'les autres poids sont inchangés (upsert ciblé, pas de duplication de ligne)',
    parametresApres.poids.conflitArtiste === parametresAvant.poids.conflitArtiste,
  );
  const lignesParametresApres = construireLignesParametres({Parametres: await docApi.fetchTable(resolution.Parametres!)});
  verifier(
    "aucune ligne Parametres dupliquée (une seule ligne 'poids.equite')",
    lignesParametresApres.filter((l) => l.cle === 'poids.equite').length === 1,
  );

  console.log('\n7. Écriture : heure de coupure (upsert d\'une clé qui, elle, existait déjà)');
  await appliquerActions(docApi, actionsEnregistrerHeureCoupure(7, apres.parametres), resolution);
  const finalLignes = construireLignesParametres({Parametres: await docApi.fetchTable(resolution.Parametres!)});
  verifier(
    'heure de coupure mise à jour sans dupliquer la ligne',
    heureCoupureDepuisLignes(finalLignes) === 7 && finalLignes.filter((l) => l.cle === 'heure_coupure_jour').length === 1,
  );

  console.log(`\n${echecs === 0 ? 'TOUT EST BON' : `${echecs} ÉCHEC(S)`} — voir le détail ci-dessus.`);
  process.exitCode = echecs === 0 ? 0 : 1;
}

principal().catch((erreur) => {
  console.error(`\nÉchec du script : ${(erreur as Error).stack ?? erreur}`);
  process.exitCode = 1;
});
