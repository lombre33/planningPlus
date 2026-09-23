/**
 * Décode les tables Grist brutes vers `Modele`, le modèle de domaine complet
 * de l'UI (`../domain/types`, 14 tableaux) — distinct de `lecture.ts`, qui
 * décode vers `DonneesPlanning`, le sous-ensemble utilisé par le moteur
 * d'affectation (10 tableaux, champs renommés en `camelCase`).
 *
 * Les deux décodages sont indépendants plutôt que l'un dérivé de l'autre :
 * `DonneesPlanning` ne porte pas tous les champs qu'exige `Modele`
 * (`Contact`, `Notes`, `Description`, `Lieu`, `Libelle`... l'algorithme n'en
 * ayant pas besoin), un adaptateur serait donc incomplet. `Modele` reprend
 * en revanche exactement les noms de colonnes Grist (voir la documentation
 * de `domain/types.ts`), ce qui rend ce décodage direct plus simple que
 * celui de `lecture.ts` : peu de renommage, seulement le typage des valeurs
 * brutes et la résolution des références.
 *
 * `Macro_creneau.Debut`/`Fin` restent des timestamps Unix absolus (§6.2) :
 * ce module ne les regroupe par jour ni ne les convertit d'aucune façon,
 * comme les autres bornes de temps déjà décodées par `lecture.ts`.
 */

import type {
  Affinite,
  Artiste,
  Benevole,
  Besoin,
  Disponibilite,
  Equipe,
  Groupe,
  Lieu,
  MacroCreneau,
  Mission,
  Modele,
  Place,
  PositionGroupe,
  Preference,
  SousCreneau,
  SouhaitMission,
} from '../domain/types';
import {type DocumentBrut, type LigneBrute, zipperTable} from './brut';
import {decoderBool, decoderListe, decoderNombre, decoderRef, decoderTexte} from './valeurs';

function equipeDepuisLigne(l: LigneBrute): Equipe {
  return {
    id: l.id,
    Nom: decoderTexte(l.Nom),
    Couleur: decoderTexte(l.Couleur),
    Referent: decoderRef(l.Referent),
    Notes: decoderTexte(l.Notes),
  };
}

function lieuDepuisLigne(l: LigneBrute): Lieu {
  return {id: l.id, Nom: decoderTexte(l.Nom), Description: decoderTexte(l.Description)};
}

/** Exportée pour être réutilisée par `main.ts` après un peuplement de
 *  bénévoles (`EcritureGrist.peuplerBenevoles`) : relire la table à jour
 *  plutôt que de reconstruire l'état local à la main. `Id_source` se lit
 *  comme n'importe quelle colonne de référence (`decoderRef`, 0/absente
 *  vaut `null`) même si ce n'est pas une vraie colonne `Ref` Grist — la
 *  colonne peut ne pas encore exister sur un document où elle n'a pas
 *  encore été provisionnée (`grist/creation.ts`), auquel cas `l.Id_source`
 *  est `undefined` et se décode déjà proprement en `null`. */
export function benevoleDepuisLigne(l: LigneBrute): Benevole {
  return {
    id: l.id,
    Nom: decoderTexte(l.Nom),
    Contact: decoderTexte(l.Contact),
    Equipe: decoderNombre(l.Equipe),
    Competences: decoderListe(l.Competences),
    Quota_heures_min: decoderNombre(l.Quota_heures_min),
    Quota_heures_max: decoderNombre(l.Quota_heures_max),
    Statut: l.Statut === 'Absent' ? 'Absent' : 'Actif',
    Notes: decoderTexte(l.Notes),
    Id_source: decoderRef(l.Id_source),
  };
}

function missionDepuisLigne(l: LigneBrute): Mission {
  const priorite = l.Priorite;
  return {
    id: l.id,
    Nom: decoderTexte(l.Nom),
    Description: decoderTexte(l.Description),
    Lieu: decoderNombre(l.Lieu),
    Equipe: decoderNombre(l.Equipe),
    Priorite: priorite === 'Critique' || priorite === 'Confort' ? priorite : 'Normale',
    Competences_requises: decoderListe(l.Competences_requises),
  };
}

function artisteDepuisLigne(l: LigneBrute): Artiste {
  return {
    id: l.id,
    Nom: decoderTexte(l.Nom),
    Lieu: decoderNombre(l.Lieu),
    Debut: decoderNombre(l.Debut),
    Fin: decoderNombre(l.Fin),
  };
}

function macroCreneauDepuisLigne(l: LigneBrute): MacroCreneau {
  return {id: l.id, Nom: decoderTexte(l.Nom), Debut: decoderNombre(l.Debut), Fin: decoderNombre(l.Fin)};
}

function sousCreneauDepuisLigne(l: LigneBrute): SousCreneau {
  return {
    id: l.id,
    Macro_creneau: decoderNombre(l.Macro_creneau),
    Mission: decoderRef(l.Mission),
    Libelle: decoderTexte(l.Libelle),
    Debut: decoderNombre(l.Debut),
    Fin: decoderNombre(l.Fin),
  };
}

function besoinDepuisLigne(l: LigneBrute): Besoin {
  return {
    id: l.id,
    Mission: decoderNombre(l.Mission),
    Sous_creneau: decoderNombre(l.Sous_creneau),
    Effectif_min: decoderNombre(l.Effectif_min),
    Effectif_max: decoderNombre(l.Effectif_max),
    Taille_groupe: decoderNombre(l.Taille_groupe),
  };
}

function groupeDepuisLigne(l: LigneBrute): Groupe {
  return {
    id: l.id,
    Code: decoderTexte(l.Code),
    Taille: decoderNombre(l.Taille),
    Equipe: decoderNombre(l.Equipe),
    Notes: decoderTexte(l.Notes),
  };
}

function positionGroupeDepuisLigne(l: LigneBrute): PositionGroupe {
  return {id: l.id, Groupe: decoderNombre(l.Groupe), Besoin: decoderNombre(l.Besoin)};
}

function placeDepuisLigne(l: LigneBrute): Place {
  return {
    id: l.id,
    Groupe: decoderNombre(l.Groupe),
    Rang: decoderNombre(l.Rang),
    Benevole: decoderRef(l.Benevole),
    Origine: l.Origine === 'Manuel' ? 'Manuel' : 'Algorithme',
    Verrouillee: decoderBool(l.Verrouillee),
    Score: decoderNombre(l.Score),
  };
}

function disponibiliteDepuisLigne(l: LigneBrute): Disponibilite {
  return {
    Benevole: decoderNombre(l.Benevole),
    Quart_heure: decoderNombre(l.Quart_heure),
    Statut: l.Statut === 'Indisponible' || l.Statut === 'Artiste' ? l.Statut : 'Disponible',
    Artiste: decoderRef(l.Artiste),
  };
}

function souhaitMissionDepuisLigne(l: LigneBrute): SouhaitMission {
  const preference = l.Preference;
  const echelle = ['Refuse', 'Réticent', 'Neutre', 'Intéressé', 'Souhaite fortement'];
  return {
    id: l.id,
    Benevole: decoderNombre(l.Benevole),
    Mission: decoderNombre(l.Mission),
    Preference: echelle.includes(preference as string) ? (preference as Preference) : 'Neutre',
  };
}

function affiniteDepuisLigne(l: LigneBrute): Affinite {
  return {
    id: l.id,
    Benevole_A: decoderNombre(l.Benevole_A),
    Benevole_B: decoderNombre(l.Benevole_B),
    Type: l.Type === 'Éviter' ? 'Éviter' : 'Ensemble',
  };
}

/**
 * Construit le `Modele` complet de l'UI à partir des tables brutes d'un
 * document — les 14 tableaux, y compris Équipes/Lieux/Artistes/Macro-
 * créneaux. Une table absente du document compte comme vide plutôt que de
 * lever, comme `construireDonneesPlanning` (`./lecture`).
 */
export function construireModele(document: DocumentBrut): Modele {
  return {
    equipes: zipperTable(document.Equipes).map(equipeDepuisLigne),
    lieux: zipperTable(document.Lieux).map(lieuDepuisLigne),
    benevoles: zipperTable(document.Benevoles).map(benevoleDepuisLigne),
    missions: zipperTable(document.Missions).map(missionDepuisLigne),
    artistes: zipperTable(document.Artistes).map(artisteDepuisLigne),
    macroCreneaux: zipperTable(document.Macro_creneaux).map(macroCreneauDepuisLigne),
    sousCreneaux: zipperTable(document.Sous_creneaux).map(sousCreneauDepuisLigne),
    besoins: zipperTable(document.Besoins).map(besoinDepuisLigne),
    groupes: zipperTable(document.Groupes).map(groupeDepuisLigne),
    positionsGroupe: zipperTable(document.Positions_groupe).map(positionGroupeDepuisLigne),
    places: zipperTable(document.Places).map(placeDepuisLigne),
    disponibilites: zipperTable(document.Disponibilites).map(disponibiliteDepuisLigne),
    souhaitsMissions: zipperTable(document.Souhaits_missions).map(souhaitMissionDepuisLigne),
    affinites: zipperTable(document.Affinites).map(affiniteDepuisLigne),
  };
}
