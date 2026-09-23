/**
 * Lecture : des tables Grist brutes (telles que renvoyées par
 * `docApi.fetchTable`, au format colonnaire) vers `DonneesPlanning`, le
 * modèle de domaine du moteur d'affectation (`../moteur/types`).
 *
 * Chaque fonction `xxxDepuisLigne` prend une ligne déjà « dézippée »
 * (`{id, Colonne: valeur, ...}`) — voir `zipperTable`, seul point qui
 * connaît le format colonnaire natif de l'API Grist.
 *
 * Ce module ne dépend de `window.grist` qu'au travers d'un paramètre
 * (`docApi`), jamais globalement : les fonctions de conversion elles-mêmes
 * sont pures et testables sans document Grist réel (voir `lecture.test.ts`).
 */

import type {
  Affinite,
  Artiste,
  Benevole,
  Besoin,
  Disponibilite,
  DonneesPlanning,
  Groupe,
  Mission,
  PositionGroupe,
  Place,
  SousCreneau,
  SouhaitMission,
} from '../moteur/types';
import type {Modele} from '../domain/types';
import {decoderBool, decoderListe, decoderNombre, decoderNumeriqueOptionnel, decoderRef, decoderTexte} from './valeurs';
import {type DocumentBrut, type LigneBrute, type TableBrute, zipperTable} from './brut';
import {construireModele} from './modele';
import {type LigneParametre} from './parametres';
import {resoudreIdsTables} from './tables';

export type {DocumentBrut, LigneBrute, TableBrute} from './brut';
export {zipperTable} from './brut';

function benevoleDepuisLigne(l: LigneBrute): Benevole {
  return {
    id: l.id,
    nom: decoderTexte(l.Nom),
    equipeId: decoderRef(l.Equipe),
    competences: decoderListe(l.Competences),
    quotaHeuresMin: decoderNumeriqueOptionnel(l.Quota_heures_min),
    quotaHeuresMax: decoderNumeriqueOptionnel(l.Quota_heures_max),
    statut: l.Statut === 'Absent' ? 'Absent' : 'Actif',
  };
}

function missionDepuisLigne(l: LigneBrute): Mission {
  const priorite = l.Priorite;
  return {
    id: l.id,
    nom: decoderTexte(l.Nom),
    equipeId: decoderRef(l.Equipe),
    priorite: priorite === 'Critique' || priorite === 'Confort' ? priorite : 'Normale',
    competencesRequises: decoderListe(l.Competences_requises),
  };
}

function sousCreneauDepuisLigne(l: LigneBrute): SousCreneau {
  return {
    id: l.id,
    macroCreneauId: decoderNombre(l.Macro_creneau),
    missionId: decoderRef(l.Mission),
    debut: decoderNombre(l.Debut),
    fin: decoderNombre(l.Fin),
  };
}

function besoinDepuisLigne(l: LigneBrute): Besoin {
  return {
    id: l.id,
    missionId: decoderNombre(l.Mission),
    sousCreneauId: decoderNombre(l.Sous_creneau),
    effectifMin: decoderNombre(l.Effectif_min),
    effectifMax: decoderNombre(l.Effectif_max),
    tailleGroupe: decoderNombre(l.Taille_groupe),
  };
}

function groupeDepuisLigne(l: LigneBrute): Groupe {
  return {
    id: l.id,
    code: decoderTexte(l.Code),
    taille: decoderNombre(l.Taille),
    equipeId: decoderRef(l.Equipe),
  };
}

function positionGroupeDepuisLigne(l: LigneBrute): PositionGroupe {
  return {
    id: l.id,
    groupeId: decoderNombre(l.Groupe),
    besoinId: decoderNombre(l.Besoin),
  };
}

function placeDepuisLigne(l: LigneBrute): Place {
  return {
    id: l.id,
    groupeId: decoderNombre(l.Groupe),
    rang: decoderNombre(l.Rang),
    benevoleId: decoderRef(l.Benevole),
    origine: l.Origine === 'Manuel' ? 'Manuel' : 'Algorithme',
    verrouillee: decoderBool(l.Verrouillee),
    score: decoderNumeriqueOptionnel(l.Score),
  };
}

function disponibiliteDepuisLigne(l: LigneBrute): Disponibilite {
  return {
    benevoleId: decoderNombre(l.Benevole),
    quartHeure: decoderNombre(l.Quart_heure),
    statut: l.Statut === 'Indisponible' || l.Statut === 'Artiste' ? l.Statut : 'Disponible',
    artisteId: decoderRef(l.Artiste),
  };
}

function souhaitMissionDepuisLigne(l: LigneBrute): SouhaitMission {
  const preference = l.Preference;
  const echelle = ['Refuse', 'Réticent', 'Neutre', 'Intéressé', 'Souhaite fortement'];
  return {
    benevoleId: decoderNombre(l.Benevole),
    missionId: decoderNombre(l.Mission),
    preference: echelle.includes(preference as string) ? (preference as SouhaitMission['preference']) : 'Neutre',
  };
}

function artisteDepuisLigne(l: LigneBrute): Artiste {
  return {id: l.id, debut: decoderNombre(l.Debut), fin: decoderNombre(l.Fin)};
}

function affiniteDepuisLigne(l: LigneBrute): Affinite {
  return {
    benevoleAId: decoderNombre(l.Benevole_A),
    benevoleBId: decoderNombre(l.Benevole_B),
    type: l.Type === 'Éviter' ? 'Éviter' : 'Ensemble',
  };
}

function parametreDepuisLigne(l: LigneBrute): LigneParametre & {id: number} {
  return {id: l.id, cle: decoderTexte(l.Cle), valeur: decoderTexte(l.Valeur)};
}

/**
 * Construit `DonneesPlanning` à partir des tables brutes d'un document.
 * Une table absente du document (pas encore créée) compte comme vide plutôt
 * que de lever — utile tant que le schéma bouge encore.
 */
export function construireDonneesPlanning(document: DocumentBrut): DonneesPlanning {
  return {
    benevoles: zipperTable(document.Benevoles).map(benevoleDepuisLigne),
    missions: zipperTable(document.Missions).map(missionDepuisLigne),
    sousCreneaux: zipperTable(document.Sous_creneaux).map(sousCreneauDepuisLigne),
    besoins: zipperTable(document.Besoins).map(besoinDepuisLigne),
    groupes: zipperTable(document.Groupes).map(groupeDepuisLigne),
    positionsGroupe: zipperTable(document.Positions_groupe).map(positionGroupeDepuisLigne),
    places: zipperTable(document.Places).map(placeDepuisLigne),
    disponibilites: zipperTable(document.Disponibilites).map(disponibiliteDepuisLigne),
    souhaitsMissions: zipperTable(document.Souhaits_missions).map(souhaitMissionDepuisLigne),
    affinites: zipperTable(document.Affinites).map(affiniteDepuisLigne),
    artistes: zipperTable(document.Artistes).map(artisteDepuisLigne),
  };
}

/**
 * Décode la table `Parametres` en lignes clé/valeur (voir `./parametres`),
 * id de ligne Grist inclus — indispensable pour un upsert ciblé côté
 * écriture (`ecriture.ts`), une simple `LigneParametre` n'en portant pas.
 */
export function construireLignesParametres(document: DocumentBrut): (LigneParametre & {id: number})[] {
  return zipperTable(document.Parametres).map(parametreDepuisLigne);
}

/**
 * Lit tout le document via l'API du plugin (une requête `fetchTable` par
 * table canonique résolue, voir `./tables`) et le convertit en
 * `DonneesPlanning` (moteur), `Modele` (UI, `./modele`) + lignes
 * `Parametres`. Seule fonction de ce module qui parle réellement à Grist.
 *
 * Rend `donnees` et `modele` côte à côte plutôt que l'un dérivé de l'autre :
 * `DonneesPlanning` ne porte pas tous les champs de `Modele` (voir
 * `./modele`). La coquille (`main.ts`) consomme `modele` pour alimenter le
 * `Magasin` ; le moteur d'affectation consomme `donnees`.
 *
 * Rend aussi `resolution` (canonique → identifiant réel) : `ecriture.ts` en
 * a besoin pour cibler les mêmes tables réelles en écriture.
 */
export async function lireDocument(
  docApi: {listTables(): Promise<string[]>; fetchTable(tableId: string): Promise<TableBrute>},
): Promise<{
  donnees: DonneesPlanning;
  modele: Modele;
  parametres: (LigneParametre & {id: number})[];
  resolution: Record<string, string>;
}> {
  const idsReels = await docApi.listTables();
  const resolution = resoudreIdsTables(idsReels);
  const document: DocumentBrut = {};
  for (const [canonique, reel] of Object.entries(resolution)) {
    document[canonique] = await docApi.fetchTable(reel);
  }
  return {
    donnees: construireDonneesPlanning(document),
    modele: construireModele(document),
    parametres: construireLignesParametres(document),
    resolution,
  };
}
