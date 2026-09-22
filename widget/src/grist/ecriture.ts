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
 * Bénévoles, lieux et équipes restent saisis nativement dans Grist — ce
 * module ne les écrit pas, tant que rien ne le demande.
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

// --- Compétences (ChoiceList) : exemple d'utilisation d'`encoderListe` -----

/** Met à jour les compétences d'un bénévole (colonne `ChoiceList`). */
export function actionsDefinirCompetencesBenevole(benevoleId: Id, competences: readonly string[]): UserAction[] {
  return [['UpdateRecord', 'Benevoles', benevoleId, {Competences: encoderListe(competences)}]];
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
