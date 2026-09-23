/**
 * Écriture : construit les actions utilisateur Grist (`UserAction`, le seul
 * langage que `docApi.applyUserActions` comprenne) à partir d'objets du
 * domaine, puis les envoie.
 *
 * Portée (voir le fil qui a confié cette couche, §5.4 du cahier des charges,
 * et la V0.1 agile décidée par Antoine le 2026-09-22) : ce que le widget
 * doit pouvoir écrire aujourd'hui — missions, macro-créneaux et
 * sous-créneaux (structure temporelle, désormais en écriture, V0.1, y
 * compris modification et suppression), les besoins (mission × sous-créneau,
 * §6.3 — la case vide sur laquelle un « + » crée la ligne), un groupe
 * (indicatif) et ses positions, le roster (`Places`) qui va avec, des
 * disponibilités, le verrouillage d'une place, et les deux réglages qui ont
 * valeur d'audit (paramètres d'algorithme, heure de coupure). Artistes
 * (création et modification, demandé le 2026-09-22 pour le fil Artistes).
 * Bénévoles : statut et compétences depuis le début, et depuis le
 * 2026-09-23 leur création/mise à jour en masse par peuplement depuis une
 * table externe qu'Antoine désigne lui-même (§6.4) — jamais un
 * remplacement intégral, jamais une suppression. Lieux et équipes restent
 * saisis nativement dans Grist — ce module ne les écrit pas, tant que rien
 * ne le demande.
 *
 * Chaque `actionsXxx` est une fonction pure qui rend un tableau d'actions ;
 * `appliquerActions` est le seul point qui parle réellement à
 * `docApi.applyUserActions`, et c'est son retour (`retValues`) qui porte le
 * rowId réellement attribué par Grist à une ligne créée — voir le
 * doc-comment d'`appliquerActions` pour la forme exacte (id direct pour un
 * `AddRecord`, tableau d'ids pour un `BulkAddRecord`). Un appelant qui vient
 * de créer une ligne recolle son identifiant local sur ce retour ; cette
 * fonction ne fabrique jamais elle-même d'id. Cette séparation permet aussi
 * de tester les constructeurs d'actions sans document Grist réel
 * (`ecriture.test.ts`) tout en les rejouant, inchangés, contre une vraie
 * instance (`dev/`).
 *
 * Chaque type `NouveauXxx` a ses propres champs en camelCase (`equipeId`,
 * pas `Equipe`), délibérément distincts des types du domaine
 * (`../domain/types`, en PascalCase) : une même forme pour toute construction
 * d'action, plutôt qu'une variante par écran qui l'appelle (trois fils ont
 * demandé un chemin d'écriture pour la V0.1 ; c'est le risque que cette
 * convention évite). Une modification partielle (`actionsModifierXxx`) suit
 * la même règle en `Partial` : un champ absent (`undefined`) n'est pas
 * touché, un champ de référence explicitement mis à `null` efface la
 * référence (encodée `0`, jamais `null`, voir `./valeurs`) — la différence
 * entre « je ne touche pas ce champ » et « je le vide » est déportée sur
 * `undefined` vs `null`, jamais sur une valeur par défaut devinée ici.
 */

import type {Epoch, Priorite} from '../domain/types';
import type {Id, OriginePlace, ParametresAlgorithme} from '../moteur/types';
import {encoderListe, encoderRef} from './valeurs';
import {clesEtValeursParametresAlgorithme, CLE_HEURE_COUPURE, type LigneParametre} from './parametres';

/** Une action utilisateur Grist : `[nom, ...arguments]`. Volontairement peu typé, à l'image de l'API. */
export type UserAction = [string, ...unknown[]];

export interface DocApiEcriture {
  applyUserActions(actions: UserAction[]): Promise<{retValues?: unknown[]} | unknown[] | void>;
}

/**
 * Traduit l'identifiant de table (schéma canonique, en position 1 de chaque
 * action) vers l'identifiant réel du document, via la résolution rendue par
 * `lireDocument` (voir `./tables`). Une table sans résolution connue part
 * inchangée : ce n'est pas à cette fonction de décider si c'est une erreur.
 */
function traduireIdsTables(actions: readonly UserAction[], resolution: Record<string, string>): UserAction[] {
  return actions.map(([nom, tableId, ...reste]) => (
    [nom, typeof tableId === 'string' ? (resolution[tableId] ?? tableId) : tableId, ...reste]
  ));
}

/**
 * Envoie des actions et rend leurs `retValues` (une entrée par action, dans
 * l'ordre de `actions`). Piège vérifié empiriquement : le retValue d'un
 * `AddRecord` est directement le nouvel id (un nombre), mais celui d'un
 * `BulkAddRecord` est le *tableau* des ids créés — passer ce tableau tel
 * quel comme id de ligne à une action suivante échoue côté sandbox Python
 * (`TypeError: unhashable type: 'list'`) plutôt que de le signaler
 * clairement. `actionsDefinirPlaces`/`actionsPositionnerGroupe`/
 * `actionsEcrireDisponibilites` rendent toutes une seule action
 * `BulkAddRecord` : leur résultat est donc `[ [id1, id2, ...] ]`, à déplier
 * avant usage (voir `scripts/verifier-integration.ts`).
 *
 * `resolution` (canonique → identifiant réel, rendue par `lireDocument`) est
 * fortement recommandée : sans elle, les actions ciblent l'identifiant de
 * schéma tel quel, qui peut ne plus correspondre à rien si Grist a dérivé
 * l'identifiant réel d'une table de son titre (`./tables`, constaté sur
 * `Positions_groupe`/`Souhaits_missions`) — l'écriture échoue alors côté
 * serveur plutôt que silencieusement.
 */
export async function appliquerActions(
  docApi: DocApiEcriture,
  actions: UserAction[],
  resolution: Record<string, string> = {},
): Promise<unknown[]> {
  if (actions.length === 0) { return []; }
  const resultat = await docApi.applyUserActions(traduireIdsTables(actions, resolution));
  if (Array.isArray(resultat)) { return resultat; }
  return (resultat as {retValues?: unknown[]} | undefined)?.retValues ?? [];
}

// --- Équipes ------------------------------------------------------------

export interface NouvelleEquipe {
  nom: string;
  couleur?: string;
  notes?: string;
}

/** Crée une équipe (demande d'Antoine du 2026-09-22 : le widget écrit
 *  aussi les équipes, plus seulement les tables). `retValues[0]` est son
 *  nouvel id. */
export function actionsCreerEquipe(equipe: NouvelleEquipe): UserAction[] {
  return [[
    'AddRecord', 'Equipes', null, {
      Nom: equipe.nom,
      Couleur: equipe.couleur ?? '',
      Notes: equipe.notes ?? '',
    },
  ]];
}

// --- Missions ---------------------------------------------------------------

export interface NouvelleMission {
  nom: string;
  description?: string;
  lieuId: Id | null;
  equipeId: Id | null;
  priorite: Priorite;
  competencesRequises?: readonly string[];
}

/** Crée une mission (V0.1, §1.1 étape 2). `retValues[0]` de l'action est son nouvel id. */
export function actionsCreerMission(mission: NouvelleMission): UserAction[] {
  return [[
    'AddRecord', 'Missions', null, {
      Nom: mission.nom,
      Description: mission.description ?? '',
      Lieu: encoderRef(mission.lieuId),
      Equipe: encoderRef(mission.equipeId),
      Priorite: mission.priorite,
      Competences_requises: encoderListe(mission.competencesRequises ?? []),
    },
  ]];
}

/** Modifie une mission existante ; seuls les champs fournis sont touchés (voir l'en-tête du fichier). */
export function actionsModifierMission(missionId: Id, champs: Partial<NouvelleMission>): UserAction[] {
  const valeurs: Record<string, unknown> = {};
  if (champs.nom !== undefined) { valeurs.Nom = champs.nom; }
  if (champs.description !== undefined) { valeurs.Description = champs.description; }
  if (champs.lieuId !== undefined) { valeurs.Lieu = encoderRef(champs.lieuId); }
  if (champs.equipeId !== undefined) { valeurs.Equipe = encoderRef(champs.equipeId); }
  if (champs.priorite !== undefined) { valeurs.Priorite = champs.priorite; }
  if (champs.competencesRequises !== undefined) { valeurs.Competences_requises = encoderListe(champs.competencesRequises); }
  if (Object.keys(valeurs).length === 0) { return []; }
  return [['UpdateRecord', 'Missions', missionId, valeurs]];
}

/** Supprime une mission. N'efface pas les besoins qui la référencent (à la charge de l'appelant). */
export function actionsSupprimerMission(missionId: Id): UserAction[] {
  return [['RemoveRecord', 'Missions', missionId]];
}

// --- Artistes -----------------------------------------------------------

export interface NouvelArtiste {
  nom: string;
  lieuId: Id | null;
  debut: Epoch;
  fin: Epoch;
}

/** Crée un artiste (passage). `retValues[0]` de l'action est son nouvel id. */
export function actionsCreerArtiste(artiste: NouvelArtiste): UserAction[] {
  return [[
    'AddRecord', 'Artistes', null, {
      Nom: artiste.nom,
      Lieu: encoderRef(artiste.lieuId),
      Debut: artiste.debut,
      Fin: artiste.fin,
    },
  ]];
}

/** Modifie un artiste existant ; seuls les champs fournis sont touchés (voir l'en-tête du fichier). */
export function actionsModifierArtiste(artisteId: Id, champs: Partial<NouvelArtiste>): UserAction[] {
  const valeurs: Record<string, unknown> = {};
  if (champs.nom !== undefined) { valeurs.Nom = champs.nom; }
  if (champs.lieuId !== undefined) { valeurs.Lieu = encoderRef(champs.lieuId); }
  if (champs.debut !== undefined) { valeurs.Debut = champs.debut; }
  if (champs.fin !== undefined) { valeurs.Fin = champs.fin; }
  if (Object.keys(valeurs).length === 0) { return []; }
  return [['UpdateRecord', 'Artistes', artisteId, valeurs]];
}

// --- Macro-créneaux et sous-créneaux -----------------------------------------

export interface NouveauMacroCreneau {
  nom: string;
  debut: Epoch;
  fin: Epoch;
}

/** Crée un macro-créneau (V0.1, §1.1 étape 1). `retValues[0]` de l'action est son nouvel id. */
export function actionsCreerMacroCreneau(macroCreneau: NouveauMacroCreneau): UserAction[] {
  return [[
    'AddRecord', 'Macro_creneaux', null, {
      Nom: macroCreneau.nom,
      Debut: macroCreneau.debut,
      Fin: macroCreneau.fin,
    },
  ]];
}

/** Déplace ou redimensionne un macro-créneau existant (glisser-déposer sur l'agenda). */
export function actionsDeplacerMacroCreneau(macroCreneauId: Id, debut: Epoch, fin: Epoch): UserAction[] {
  return [['UpdateRecord', 'Macro_creneaux', macroCreneauId, {Debut: debut, Fin: fin}]];
}

/** Renomme un macro-créneau existant. */
export function actionsRenommerMacroCreneau(macroCreneauId: Id, nom: string): UserAction[] {
  return [['UpdateRecord', 'Macro_creneaux', macroCreneauId, {Nom: nom}]];
}

/**
 * Supprime un macro-créneau. N'efface pas ses sous-créneaux : Grist ne
 * cascade pas les suppressions, et un macro-créneau vidé de ses
 * sous-créneaux avant d'être supprimé n'est pas la même décision produit
 * qu'une suppression qui en emporte le contenu — à la charge de l'appelant.
 */
export function actionsSupprimerMacroCreneau(macroCreneauId: Id): UserAction[] {
  return [['RemoveRecord', 'Macro_creneaux', macroCreneauId]];
}

export interface NouveauSousCreneau {
  macroCreneauId: Id;
  /** `null` pour un sous-créneau commun à toutes les missions du macro-créneau (§6.2). */
  missionId: Id | null;
  libelle: string;
  debut: Epoch;
  fin: Epoch;
}

/**
 * Crée un ou plusieurs sous-créneaux dans un macro-créneau (V0.1, §1.1
 * étape 3) — un découpage automatique par durée par défaut se réduit à
 * calculer cette liste côté appelant, cette fonction ne fait qu'écrire.
 */
export function actionsCreerSousCreneaux(sousCreneaux: readonly NouveauSousCreneau[]): UserAction[] {
  if (sousCreneaux.length === 0) { return []; }
  return [[
    'BulkAddRecord', 'Sous_creneaux', sousCreneaux.map(() => null),
    {
      Macro_creneau: sousCreneaux.map((s) => s.macroCreneauId),
      Mission: sousCreneaux.map((s) => encoderRef(s.missionId)),
      Libelle: sousCreneaux.map((s) => s.libelle),
      Debut: sousCreneaux.map((s) => s.debut),
      Fin: sousCreneaux.map((s) => s.fin),
    },
  ]];
}

/** Modifie un sous-créneau existant ; seuls les champs fournis sont touchés. */
export function actionsModifierSousCreneau(
  sousCreneauId: Id,
  champs: Partial<Omit<NouveauSousCreneau, 'macroCreneauId'>>,
): UserAction[] {
  const valeurs: Record<string, unknown> = {};
  if (champs.missionId !== undefined) { valeurs.Mission = encoderRef(champs.missionId); }
  if (champs.libelle !== undefined) { valeurs.Libelle = champs.libelle; }
  if (champs.debut !== undefined) { valeurs.Debut = champs.debut; }
  if (champs.fin !== undefined) { valeurs.Fin = champs.fin; }
  if (Object.keys(valeurs).length === 0) { return []; }
  return [['UpdateRecord', 'Sous_creneaux', sousCreneauId, valeurs]];
}

export interface PatchSousCreneau {
  id: Id;
  libelle?: string;
  debut?: Epoch;
  fin?: Epoch;
}

const CHAMPS_PATCH_SOUS_CRENEAU = ['libelle', 'debut', 'fin'] as const;

/**
 * Modifie plusieurs sous-créneaux existants en place, chacun avec ses
 * propres champs fournis — jamais en supprimant puis recréant
 * (`actionsSupprimerSousCreneaux` + `actionsCreerSousCreneaux`, réservé au
 * redécoupage d'une plage entière) : recréer changerait leur identifiant et
 * casserait la référence d'un besoin déjà positionné sur l'un d'eux
 * (`Besoins.Sous_creneau` ne porte que l'identifiant, jamais les horaires —
 * constat du fil Agenda). Sert au redimensionnement d'un sous-créneau avec
 * poussée des suivants : tous gardent leur identifiant, seuls leurs
 * horaires (et parfois le libellé) bougent.
 *
 * Les patches qui renseignent exactement le même jeu de champs sont groupés
 * en un seul `BulkUpdateRecord` (une valeur par ligne et par colonne : un
 * champ absent pour une ligne mais présent pour une autre ne peut pas
 * cohabiter dans un même appel) ; un patch isolé reste un `UpdateRecord`.
 * Tout part dans le même aller-retour : ce sont des modifications sur des
 * lignes déjà existantes, jamais des créations qui se référencent entre
 * elles.
 */
export function actionsModifierSousCreneaux(patches: readonly PatchSousCreneau[]): UserAction[] {
  const groupes = new Map<string, PatchSousCreneau[]>();
  for (const patch of patches) {
    const champs = CHAMPS_PATCH_SOUS_CRENEAU.filter((c) => patch[c] !== undefined);
    if (champs.length === 0) { continue; }
    const cle = champs.join(',');
    const groupe = groupes.get(cle) ?? [];
    groupe.push(patch);
    groupes.set(cle, groupe);
  }

  const actions: UserAction[] = [];
  for (const [cle, groupe] of groupes) {
    const champs = cle.split(',') as Array<typeof CHAMPS_PATCH_SOUS_CRENEAU[number]>;
    if (groupe.length === 1) {
      actions.push(...actionsModifierSousCreneau(groupe[0]!.id, groupe[0]!));
      continue;
    }
    const colonnes: Record<string, unknown[]> = {};
    if (champs.includes('libelle')) { colonnes.Libelle = groupe.map((p) => p.libelle); }
    if (champs.includes('debut')) { colonnes.Debut = groupe.map((p) => p.debut); }
    if (champs.includes('fin')) { colonnes.Fin = groupe.map((p) => p.fin); }
    actions.push(['BulkUpdateRecord', 'Sous_creneaux', groupe.map((p) => p.id), colonnes]);
  }
  return actions;
}

/**
 * Supprime un ou plusieurs sous-créneaux (un re-découpage automatique de la
 * plage, par exemple, remplace l'ensemble existant plutôt que de le
 * modifier ligne à ligne). N'efface pas les besoins qui les référencent.
 */
export function actionsSupprimerSousCreneaux(sousCreneauIds: readonly Id[]): UserAction[] {
  if (sousCreneauIds.length === 0) { return []; }
  return [['BulkRemoveRecord', 'Sous_creneaux', [...sousCreneauIds]]];
}

// --- Besoins (mission × sous-créneau, §6.3) ---------------------------------

export interface NouveauBesoin {
  missionId: Id;
  sousCreneauId: Id;
  effectifMin: number;
  effectifMax: number;
  tailleGroupe: number;
}

/**
 * Crée un besoin : une mission ouverte sur un sous-créneau donné, avec son
 * effectif attendu (§6.3). C'est la ligne que fait naître le « + » discret
 * sur une case vide de la page Indicatifs — une case sans besoin n'est pas
 * une anomalie (§7.4), elle n'a simplement encore aucune ligne ici.
 * `retValues[0]` de l'action est son nouvel id.
 */
export function actionsCreerBesoin(besoin: NouveauBesoin): UserAction[] {
  return [[
    'AddRecord', 'Besoins', null, {
      Mission: besoin.missionId,
      Sous_creneau: besoin.sousCreneauId,
      Effectif_min: besoin.effectifMin,
      Effectif_max: besoin.effectifMax,
      Taille_groupe: besoin.tailleGroupe,
    },
  ]];
}

/**
 * Supprime un besoin (la case redevient une zone vide). N'efface pas les
 * positions de groupe qui le référencent.
 */
export function actionsSupprimerBesoin(besoinId: Id): UserAction[] {
  return [['RemoveRecord', 'Besoins', besoinId]];
}

/** Supprime plusieurs besoins en un seul aller-retour (suppression forcée
 *  d'un macro-créneau, §8 vue Agenda, 2026-09-23 : chaque besoin de ses
 *  sous-créneaux s'en va explicitement, Grist ne cascade pas). N'efface
 *  pas les positions de groupe qui les référencent. */
export function actionsSupprimerBesoins(besoinIds: readonly Id[]): UserAction[] {
  if (besoinIds.length === 0) { return []; }
  return [['BulkRemoveRecord', 'Besoins', [...besoinIds]]];
}

/** Repointe un ou plusieurs besoins vers un autre sous-créneau, en place
 *  (même id de besoin) — jamais une suppression-recréation, qui perdrait
 *  ses positions de groupe (`Positions_groupe` ne référence que l'id du
 *  besoin). Sert à `Magasin.materialiserCreneauxPropres` (retour d'Antoine
 *  du 2026-09-23) : convertir un créneau commun en créneau propre à une
 *  mission crée une copie sous un nouvel id, et les besoins de CETTE
 *  mission sur le commun doivent suivre vers cette copie — ceux des autres
 *  missions restent sur le commun d'origine, jamais touchés. */
export function actionsRepointerBesoins(patches: readonly {id: Id; sousCreneauId: Id}[]): UserAction[] {
  if (patches.length === 0) { return []; }
  if (patches.length === 1) {
    return [['UpdateRecord', 'Besoins', patches[0]!.id, {Sous_creneau: patches[0]!.sousCreneauId}]];
  }
  return [[
    'BulkUpdateRecord', 'Besoins', patches.map((p) => p.id), {Sous_creneau: patches.map((p) => p.sousCreneauId)},
  ]];
}

// --- Groupe, positions, roster --------------------------------------------

export interface NouveauGroupe {
  code: string;
  taille: number;
  equipeId: Id | null;
  notes?: string;
}

/** Crée un groupe (indicatif). `retValues[0]` de l'action est son nouvel id. */
export function actionsCreerGroupe(groupe: NouveauGroupe): UserAction[] {
  return [[
    'AddRecord', 'Groupes', null, {
      Code: groupe.code,
      Taille: groupe.taille,
      Equipe: encoderRef(groupe.equipeId),
      Notes: groupe.notes ?? '',
    },
  ]];
}

/** Modifie un groupe (indicatif) existant ; seuls les champs fournis sont touchés. */
export function actionsModifierGroupe(groupeId: Id, champs: Partial<NouveauGroupe>): UserAction[] {
  const valeurs: Record<string, unknown> = {};
  if (champs.code !== undefined) { valeurs.Code = champs.code; }
  if (champs.taille !== undefined) { valeurs.Taille = champs.taille; }
  if (champs.equipeId !== undefined) { valeurs.Equipe = encoderRef(champs.equipeId); }
  if (champs.notes !== undefined) { valeurs.Notes = champs.notes; }
  if (Object.keys(valeurs).length === 0) { return []; }
  return [['UpdateRecord', 'Groupes', groupeId, valeurs]];
}

/**
 * Supprime un groupe (indicatif). N'efface pas ses positions ni son roster
 * (`Positions_groupe`, `Places`) : les retirer d'abord est à la charge de
 * l'appelant, qui connaît le geste produit exact (retrait vs réaffectation).
 */
export function actionsSupprimerGroupe(groupeId: Id): UserAction[] {
  return [['RemoveRecord', 'Groupes', groupeId]];
}

/** Positionne un groupe déjà créé sur un ou plusieurs besoins (§6.3). */
export function actionsPositionnerGroupe(groupeId: Id, besoinIds: readonly Id[]): UserAction[] {
  if (besoinIds.length === 0) { return []; }
  return [[
    'BulkAddRecord', 'Positions_groupe', besoinIds.map(() => null),
    {
      Groupe: besoinIds.map(() => groupeId),
      Besoin: [...besoinIds],
    },
  ]];
}

/**
 * Déplace une position existante vers un autre besoin (glisser-déposer d'un
 * indicatif d'un sous-créneau à un autre, page Indicatifs). Une position
 * garde son id : c'est un `UpdateRecord`, pas un retrait suivi d'une
 * recréation.
 */
export function actionsDeplacerPositionGroupe(positionId: Id, nouveauBesoinId: Id): UserAction[] {
  return [['UpdateRecord', 'Positions_groupe', positionId, {Besoin: nouveauBesoinId}]];
}

/** Retire un groupe d'un besoin (la position disparaît, le groupe et ses places restent). */
export function actionsRetirerPositionGroupe(positionId: Id): UserAction[] {
  return [['RemoveRecord', 'Positions_groupe', positionId]];
}

/** Retire plusieurs positions en un seul aller-retour (suppression forcée
 *  d'un macro-créneau, §8 vue Agenda, 2026-09-23) : les groupes (binômes)
 *  et leurs places restent, seules les positions disparaissent — les
 *  binômes redeviennent libres. */
export function actionsRetirerPositionsGroupe(positionIds: readonly Id[]): UserAction[] {
  if (positionIds.length === 0) { return []; }
  return [['BulkRemoveRecord', 'Positions_groupe', [...positionIds]]];
}

export interface NouvellePlace {
  rang: number;
  benevoleId: Id | null;
  origine: OriginePlace;
  verrouillee: boolean;
  score: number | null;
}

/** Crée le roster (`Places`) d'un groupe déjà créé, un rang à la fois. */
export function actionsDefinirPlaces(groupeId: Id, places: readonly NouvellePlace[]): UserAction[] {
  if (places.length === 0) { return []; }
  return [[
    'BulkAddRecord', 'Places', places.map(() => null),
    {
      Groupe: places.map(() => groupeId),
      Rang: places.map((p) => p.rang),
      Benevole: places.map((p) => encoderRef(p.benevoleId)),
      Origine: places.map((p) => p.origine),
      Verrouillee: places.map((p) => p.verrouillee),
      Score: places.map((p) => p.score),
    },
  ]];
}

/** Verrouille ou déverrouille une place existante (§7.1, règle 4). */
export function actionsVerrouillerPlace(placeId: Id, verrouillee: boolean): UserAction[] {
  return [['UpdateRecord', 'Places', placeId, {Verrouillee: verrouillee}]];
}

export interface PatchPlace {
  id: Id;
  benevoleId: Id | null;
  origine: OriginePlace;
  verrouillee: boolean;
  score: number | null;
}

/**
 * Modifie plusieurs places existantes en place (même id, même rang, même
 * groupe — seul l'occupant change), en un seul aller-retour : l'algorithme
 * applique potentiellement des dizaines de propositions d'un coup (§7.5.1,
 * `Magasin.appliquerPropositionsAlgorithme`). Chaque patch fournit toujours
 * le même jeu de champs (pas de `Partial` ici, contrairement à
 * `actionsModifierSousCreneaux` : rien à grouper par forme), d'où un seul
 * `BulkUpdateRecord` dès que plus d'une place est touchée.
 */
export function actionsModifierPlaces(patches: readonly PatchPlace[]): UserAction[] {
  if (patches.length === 0) { return []; }
  if (patches.length === 1) {
    const patch = patches[0]!;
    return [['UpdateRecord', 'Places', patch.id, {
      Benevole: encoderRef(patch.benevoleId), Origine: patch.origine, Verrouillee: patch.verrouillee, Score: patch.score,
    }]];
  }
  return [[
    'BulkUpdateRecord', 'Places', patches.map((p) => p.id),
    {
      Benevole: patches.map((p) => encoderRef(p.benevoleId)),
      Origine: patches.map((p) => p.origine),
      Verrouillee: patches.map((p) => p.verrouillee),
      Score: patches.map((p) => p.score),
    },
  ]];
}

// --- Disponibilités ---------------------------------------------------------

export interface NouvelleDisponibilite {
  benevoleId: Id;
  quartHeure: number;
  statut: 'Disponible' | 'Indisponible' | 'Artiste';
  artisteId: Id | null;
}

/** Écrit des disponibilités (une ligne par bénévole et par quart d'heure, §6.4). */
export function actionsEcrireDisponibilites(disponibilites: readonly NouvelleDisponibilite[]): UserAction[] {
  if (disponibilites.length === 0) { return []; }
  return [[
    'BulkAddRecord', 'Disponibilites', disponibilites.map(() => null),
    {
      Benevole: disponibilites.map((d) => d.benevoleId),
      Quart_heure: disponibilites.map((d) => d.quartHeure),
      Statut: disponibilites.map((d) => d.statut),
      Artiste: disponibilites.map((d) => encoderRef(d.artisteId)),
    },
  ]];
}

/** Retire des disponibilités en masse (un ré-import ou une resaisie remplace
 *  l'ensemble existant plutôt que de le fusionner ligne à ligne — même
 *  logique que `actionsSupprimerBesoins`/`actionsRetirerPositionsGroupe`).
 *  Aucune table ne référence une ligne de `Disponibilites` par son
 *  identifiant (le type de domaine n'en a même pas), donc rien à repointer
 *  après coup, contrairement à un sous-créneau. */
export function actionsSupprimerDisponibilites(ids: readonly Id[]): UserAction[] {
  if (ids.length === 0) { return []; }
  return [['BulkRemoveRecord', 'Disponibilites', [...ids]]];
}

// --- Bénévoles (statut, compétences) ---------------------------------------

/** Met à jour les compétences d'un bénévole (colonne `ChoiceList`) : exemple d'utilisation d'`encoderListe`. */
export function actionsDefinirCompetencesBenevole(benevoleId: Id, competences: readonly string[]): UserAction[] {
  return [['UpdateRecord', 'Benevoles', benevoleId, {Competences: encoderListe(competences)}]];
}

// --- Bénévoles (peuplement depuis la table source d'Antoine, §6.4, 2026-09-23) ---

export interface NouveauBenevoleSource {
  idSource: Id;
  nom: string;
  contact: string;
}

/**
 * Crée des bénévoles dans NOTRE table à partir de lignes lues dans la
 * table qu'Antoine a désignée (jamais modifiée : ce module n'écrit ici que
 * dans `Benevoles`). `Id_source` porte l'identifiant de la ligne d'origine,
 * pour qu'un second peuplement reconnaisse ces mêmes bénévoles au lieu
 * d'en recréer (`actionsActualiserBenevolesSource`, l'upsert
 * correspondant). Équipe/quotas/statut reçoivent un défaut raisonnable À
 * LA CRÉATION SEULEMENT : un peuplement ultérieur ne les touche plus
 * jamais, ce sont des champs qu'Antoine gère ensuite depuis le widget.
 */
export function actionsCreerBenevolesSource(benevoles: readonly NouveauBenevoleSource[], equipeParDefautId: Id): UserAction[] {
  if (benevoles.length === 0) { return []; }
  return [[
    'BulkAddRecord', 'Benevoles', benevoles.map(() => null),
    {
      Nom: benevoles.map((b) => b.nom),
      Contact: benevoles.map((b) => b.contact),
      Equipe: benevoles.map(() => encoderRef(equipeParDefautId)),
      Quota_heures_min: benevoles.map(() => 0),
      Quota_heures_max: benevoles.map(() => 40),
      Statut: benevoles.map(() => 'Actif'),
      Id_source: benevoles.map((b) => b.idSource),
    },
  ]];
}

export interface BenevoleSourceActualise {
  id: Id;
  nom: string;
  contact: string;
}

/** Met à jour Nom/Contact des bénévoles déjà liés à une ligne source
 *  (`Id_source` déjà posé lors d'un peuplement précédent) — jamais leurs
 *  autres champs, voir `actionsCreerBenevolesSource`. */
export function actionsActualiserBenevolesSource(benevoles: readonly BenevoleSourceActualise[]): UserAction[] {
  if (benevoles.length === 0) { return []; }
  return [[
    'BulkUpdateRecord', 'Benevoles', benevoles.map((b) => b.id),
    {
      Nom: benevoles.map((b) => b.nom),
      Contact: benevoles.map((b) => b.contact),
    },
  ]];
}

// --- Affinités (binôme souhaité, import, §6.4 point 4, 2026-09-23) ---------

export interface NouvelleAffiniteEnsemble {
  benevoleAId: Id;
  benevoleBId: Id;
}

/**
 * Crée des lignes `Affinites` de type "Ensemble" (binôme souhaité) —
 * l'algorithme les fait déjà primer sur l'artiste souhaité, voir
 * `moteur/adaptateur-magasin.ts`. L'appelant filtre déjà les paires qui
 * existent déjà (upsert, voir la vue) : cette fonction crée sans vérifier.
 */
export function actionsCreerAffinites(paires: readonly NouvelleAffiniteEnsemble[]): UserAction[] {
  if (paires.length === 0) { return []; }
  return [[
    'BulkAddRecord', 'Affinites', paires.map(() => null),
    {
      Benevole_A: paires.map((p) => encoderRef(p.benevoleAId)),
      Benevole_B: paires.map((p) => encoderRef(p.benevoleBId)),
      Type: paires.map(() => 'Ensemble'),
    },
  ]];
}

/**
 * Marque un bénévole absent ou de retour, et libère dans le même
 * aller-retour les places qu'une absence rend vacantes (§7.4,
 * `Magasin.definirAbsence`) : bénévole retiré, origine remise à « Manuel »,
 * score remis à zéro — jamais le verrouillage, qu'une absence ne touche
 * pas. `placeIdsLiberees` est la liste déjà filtrée aux places non
 * verrouillées par l'appelant (cette fonction ne relit aucune place, elle
 * écrit la liste qu'on lui donne) ; toujours vide quand `absent` est faux,
 * un retour ne libère jamais rien.
 */
export function actionsDefinirAbsence(
  benevoleId: Id, absent: boolean, placeIdsLiberees: readonly Id[],
): UserAction[] {
  const actions: UserAction[] = [
    ['UpdateRecord', 'Benevoles', benevoleId, {Statut: absent ? 'Absent' : 'Actif'}],
  ];
  if (placeIdsLiberees.length === 1) {
    actions.push(['UpdateRecord', 'Places', placeIdsLiberees[0]!, {Benevole: encoderRef(null), Origine: 'Manuel', Score: 0}]);
  } else if (placeIdsLiberees.length > 1) {
    actions.push([
      'BulkUpdateRecord', 'Places', [...placeIdsLiberees],
      {
        Benevole: placeIdsLiberees.map(() => encoderRef(null)),
        Origine: placeIdsLiberees.map(() => 'Manuel'),
        Score: placeIdsLiberees.map(() => 0),
      },
    ]);
  }
  return actions;
}

// --- Paramètres (§5.4, §7.2) -------------------------------------------------

/**
 * Construit les actions d'un « upsert » sur `Parametres` : `UpdateRecord`
 * pour les clés déjà présentes, `AddRecord` pour les nouvelles. Sans cette
 * distinction, rejouer l'écriture dupliquerait les lignes au lieu de les
 * remplacer.
 */
function upsertParametres(
  clesEtValeurs: readonly [string, string][],
  lignesExistantes: readonly (LigneParametre & {id: Id})[],
): UserAction[] {
  const idParCle = new Map(lignesExistantes.map((l) => [l.cle, l.id]));
  const actions: UserAction[] = [];
  for (const [cle, valeur] of clesEtValeurs) {
    const idExistant = idParCle.get(cle);
    if (idExistant !== undefined) {
      actions.push(['UpdateRecord', 'Parametres', idExistant, {Valeur: valeur}]);
    } else {
      actions.push(['AddRecord', 'Parametres', null, {Cle: cle, Valeur: valeur}]);
    }
  }
  return actions;
}

/** Enregistre `ParametresAlgorithme` dans `Parametres` (upsert, une ligne par poids). */
export function actionsEnregistrerParametresAlgorithme(
  parametres: ParametresAlgorithme,
  lignesExistantes: readonly (LigneParametre & {id: Id})[],
): UserAction[] {
  return upsertParametres(clesEtValeursParametresAlgorithme(parametres), lignesExistantes);
}

/** Enregistre l'heure de coupure du jour de festival (§3, §6.2) dans `Parametres`. */
export function actionsEnregistrerHeureCoupure(
  heure: number,
  lignesExistantes: readonly (LigneParametre & {id: Id})[],
): UserAction[] {
  return upsertParametres([[CLE_HEURE_COUPURE, String(heure)]], lignesExistantes);
}

/** Enregistre une clé/valeur quelconque dans `Parametres` (upsert) : même
 *  `upsertParametres` privé qu'`actionsEnregistrerHeureCoupure`, mais sur
 *  une clé fournie par l'appelant plutôt que fixée ici — pour un réglage
 *  qui n'a pas encore sa propre fonction dédiée. */
export function actionsDefinirParametre(
  cle: string, valeur: string,
  lignesExistantes: readonly (LigneParametre & {id: Id})[],
): UserAction[] {
  return upsertParametres([[cle, valeur]], lignesExistantes);
}
