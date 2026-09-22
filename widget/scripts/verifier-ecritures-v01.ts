/**
 * Vérification bout en bout des chemins d'écriture V0.1 (missions,
 * macro-créneaux, sous-créneaux, besoins, indicatifs) contre un document
 * reparti du modèle vierge (`dev/seed/modele-planningplus.grist`, 0 ligne) —
 * le scénario confirmé par Antoine le 2026-09-22 : pas de données de test,
 * le widget écrit ce qu'il saisit dans un document neuf.
 *
 * Couvre en particulier la séquence liée macro-créneau → sous-créneaux
 * (l'appelant ne connaît l'id réel du macro-créneau qu'après le premier
 * aller-retour ; Grist ne permet pas de le référencer par anticipation dans
 * le même appel `applyUserActions`), et la forme exacte des `retValues`
 * pour un `AddRecord` seul face à un `BulkAddRecord`.
 *
 * Usage : depuis widget/, `npx vite-node scripts/verifier-ecritures-v01.ts
 * --doc=<id>` (ou `GRIST_DOC_ID=<id>` dans l'environnement) — `<id>` doit
 * être un document importé depuis `dev/seed/modele-planningplus.grist`, pas
 * le document de démo peuplé.
 */

import {
  actionsCreerBesoin,
  actionsCreerGroupe,
  actionsCreerMacroCreneau,
  actionsCreerMission,
  actionsCreerSousCreneaux,
  actionsDefinirPlaces,
  actionsDeplacerPositionGroupe,
  actionsModifierGroupe,
  actionsModifierMission,
  actionsModifierSousCreneau,
  actionsPositionnerGroupe,
  actionsRenommerMacroCreneau,
  actionsRetirerPositionGroupe,
  actionsSupprimerBesoin,
  actionsSupprimerGroupe,
  actionsSupprimerMacroCreneau,
  actionsSupprimerMission,
  actionsSupprimerSousCreneaux,
  appliquerActions,
  lireDocument,
  type UserAction,
} from '../src/grist';

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
  console.error('Usage : npx vite-node scripts/verifier-ecritures-v01.ts --doc=<id> [--cle=<clé>] [--url=<url>]');
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

const docApi = {
  async listTables(): Promise<string[]> {
    const reponse = await requeteJson(`/api/docs/${idDoc}/tables`) as {tables: {id: string}[]};
    return reponse.tables.map((t) => t.id);
  },
  async fetchTable(tableId: string): Promise<Record<string, unknown[]>> {
    return await requeteJson(`/api/docs/${idDoc}/tables/${tableId}/data`) as Record<string, unknown[]>;
  },
  async applyUserActions(actions: UserAction[]) {
    return await requeteJson(`/api/docs/${idDoc}/apply`, {method: 'POST', body: JSON.stringify(actions)}) as {retValues: unknown[]};
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

  console.log('0. Lecture du document — doit être vide (modèle vierge, scénario Antoine)');
  const avant = await lireDocument(docApi);
  const {resolution} = avant;
  verifier('aucune mission au départ', avant.donnees.missions.length === 0);
  verifier('aucun besoin au départ', avant.donnees.besoins.length === 0);
  verifier('aucun groupe au départ', avant.donnees.groupes.length === 0);

  console.log('\n1. Mission (sans lieu ni équipe : rien à référencer sur un document vierge)');
  const [idMission] = await appliquerActions(docApi, actionsCreerMission({
    nom: 'Bar principal', lieuId: null, equipeId: null, priorite: 'Critique', competencesRequises: ['Majeur'],
  }), resolution) as [number];
  verifier('AddRecord Missions a rendu un id', typeof idMission === 'number' && idMission > 0);

  console.log('\n2. Macro-créneau, puis sous-créneaux référençant son id réel (séquence liée)');
  const [idMacro] = await appliquerActions(docApi, actionsCreerMacroCreneau({
    nom: 'Journée vendredi', debut: 1_700_000_000, fin: 1_700_050_000,
  }), resolution) as [number];
  verifier('AddRecord Macro_creneaux a rendu un id', typeof idMacro === 'number' && idMacro > 0);

  const retourSousCreneaux = await appliquerActions(docApi, actionsCreerSousCreneaux([
    {macroCreneauId: idMacro, missionId: null, libelle: 'Commun 10h-11h30', debut: 1_700_000_000, fin: 1_700_005_400},
    {macroCreneauId: idMacro, missionId: idMission, libelle: 'Bar 11h30-13h', debut: 1_700_005_400, fin: 1_700_010_800},
  ]), resolution);
  console.log(`   retValues bruts d'un BulkAddRecord : ${JSON.stringify(retourSousCreneaux)}`);
  const [idsSousCreneaux] = retourSousCreneaux as [number[]];
  verifier(
    "le BulkAddRecord rend UNE entrée qui est le tableau des deux ids (pas deux entrées)",
    retourSousCreneaux.length === 1 && Array.isArray(idsSousCreneaux) && idsSousCreneaux.length === 2,
  );
  const [idSousCreneauCommun, idSousCreneauMission] = idsSousCreneaux;
  verifier('les deux sous-créneaux ont un id réel distinct', idSousCreneauCommun! > 0 && idSousCreneauMission! > 0 && idSousCreneauCommun !== idSousCreneauMission);

  console.log('\n3. Deux besoins (mission × sous-créneau, §6.3 — la case sur laquelle porte le "+")');
  const [idBesoin] = await appliquerActions(docApi, actionsCreerBesoin({
    missionId: idMission, sousCreneauId: idSousCreneauMission!, effectifMin: 1, effectifMax: 2, tailleGroupe: 2,
  }), resolution) as [number];
  const [idBesoinAlt] = await appliquerActions(docApi, actionsCreerBesoin({
    missionId: idMission, sousCreneauId: idSousCreneauCommun!, effectifMin: 1, effectifMax: 2, tailleGroupe: 2,
  }), resolution) as [number];
  verifier('AddRecord Besoins a rendu un id', typeof idBesoin === 'number' && idBesoin > 0);
  verifier('le second besoin a un id distinct', idBesoinAlt > 0 && idBesoinAlt !== idBesoin);

  console.log('\n4. Indicatif (groupe) positionné sur ce besoin, sans équipe ni bénévole (rien à référencer)');
  const [idGroupe] = await appliquerActions(docApi, actionsCreerGroupe({
    code: 'Beta01', taille: 2, equipeId: null,
  }), resolution) as [number];
  const retourPosition = await appliquerActions(docApi, actionsPositionnerGroupe(idGroupe, [idBesoin]), resolution);
  const [idPosition] = (retourPosition[0] as number[]);
  const [idsPlaces] = await appliquerActions(docApi, actionsDefinirPlaces(idGroupe, [
    {rang: 1, benevoleId: null, origine: 'Manuel', verrouillee: false, score: null},
    {rang: 2, benevoleId: null, origine: 'Manuel', verrouillee: false, score: null},
  ]), resolution) as [number[]];
  verifier('le roster (Places) du groupe a bien deux rangs créés', idsPlaces.length === 2);

  console.log('\n5. Relecture : tout ce qui a été créé se relit avec les bons liens');
  const apres = await lireDocument(docApi);
  const missionRelue = apres.donnees.missions.find((m) => m.id === idMission);
  verifier('la mission se relit', missionRelue?.nom === 'Bar principal');
  const sousCreneauMissionRelu = apres.donnees.besoins.find((b) => b.id === idBesoin);
  verifier('le besoin se relit, lié à la bonne mission et au bon sous-créneau', !!sousCreneauMissionRelu
    && sousCreneauMissionRelu.missionId === idMission && sousCreneauMissionRelu.sousCreneauId === idSousCreneauMission);
  const groupeRelu = apres.donnees.groupes.find((g) => g.id === idGroupe);
  verifier('le groupe se relit avec équipe null (pas 0)', groupeRelu?.equipeId === null);
  const positionRelue = apres.donnees.positionsGroupe.find((p) => p.groupeId === idGroupe);
  verifier('la position se relit, liée au bon besoin', positionRelue?.besoinId === idBesoin);

  console.log('\n6. Modification : renommer/déplacer/reclasser ce qui vient d\'être créé');
  await appliquerActions(docApi, actionsModifierMission(idMission, {nom: 'Bar VIP'}), resolution);
  await appliquerActions(docApi, actionsRenommerMacroCreneau(idMacro, 'Journée samedi'), resolution);
  await appliquerActions(docApi, actionsModifierSousCreneau(idSousCreneauCommun!, {libelle: 'Commun 10h-11h (raccourci)'}), resolution);
  await appliquerActions(docApi, actionsModifierGroupe(idGroupe, {taille: 3}), resolution);
  const modifie = await lireDocument(docApi);
  verifier('la mission renommée se relit', modifie.donnees.missions.find((m) => m.id === idMission)?.nom === 'Bar VIP');
  verifier('le groupe reclassé se relit', modifie.donnees.groupes.find((g) => g.id === idGroupe)?.taille === 3);

  console.log('\n6b. Glisser-déposer : déplacer la position de l\'indicatif vers l\'autre besoin');
  await appliquerActions(docApi, actionsDeplacerPositionGroupe(idPosition!, idBesoinAlt), resolution);
  const apresDeplacement = await lireDocument(docApi);
  const positionDeplacee = apresDeplacement.donnees.positionsGroupe.find((p) => p.id === idPosition);
  verifier('la position garde son id mais pointe désormais sur l\'autre besoin', positionDeplacee?.besoinId === idBesoinAlt);
  await appliquerActions(docApi, actionsRetirerPositionGroupe(idPosition!), resolution);
  const apresRetrait = await lireDocument(docApi);
  verifier('la position retirée a disparu', !apresRetrait.donnees.positionsGroupe.some((p) => p.id === idPosition));

  console.log('\n7. Suppression, dans l\'ordre qui évite les références mortes (besoins puis structure)');
  await appliquerActions(docApi, actionsSupprimerBesoin(idBesoin), resolution);
  await appliquerActions(docApi, actionsSupprimerBesoin(idBesoinAlt), resolution);
  await appliquerActions(docApi, actionsSupprimerGroupe(idGroupe), resolution);
  await appliquerActions(docApi, actionsSupprimerSousCreneaux([idSousCreneauCommun!, idSousCreneauMission!]), resolution);
  await appliquerActions(docApi, actionsSupprimerMacroCreneau(idMacro), resolution);
  await appliquerActions(docApi, actionsSupprimerMission(idMission), resolution);
  const final = await lireDocument(docApi);
  verifier('la mission a bien disparu', !final.donnees.missions.some((m) => m.id === idMission));
  verifier('le macro-créneau a bien disparu', !final.donnees.groupes.some((g) => g.id === idGroupe));
  verifier('le document est revenu à l\'état vide (aucun résidu)', final.donnees.missions.length === 0
    && final.donnees.besoins.length === 0 && final.donnees.groupes.length === 0);

  console.log(`\n${echecs === 0 ? 'TOUT EST BON' : `${echecs} ÉCHEC(S)`} — voir le détail ci-dessus.`);
  process.exitCode = echecs === 0 ? 0 : 1;
}

principal().catch((erreur) => {
  console.error(`\nÉchec du script : ${(erreur as Error).stack ?? erreur}`);
  process.exitCode = 1;
});
