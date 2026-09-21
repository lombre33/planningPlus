/**
 * Modèle de données typé de PlanningPlus.
 *
 * Les champs reprennent exactement les noms de colonnes de
 * `dev/seed/schema.mjs` (qui documente le modèle du cahier des charges §6) :
 * même vocabulaire dans le code, le JSON de démonstration et les futures
 * tables Grist, pour que la lecture croisée reste directe côté audit DINUM.
 * Les références (`Equipe`, `Mission`, `Groupe`…) sont déjà résolues en
 * identifiants numériques par `donnees/normaliser.ts` — plus de `{_ref}`
 * une fois passé cette étape.
 */

export type Id = number;

/** Horodatage Unix en secondes, aligné sur le quart d'heure (voir `temps.ts`). */
export type Epoch = number;

export interface Equipe {
  id: Id;
  Nom: string;
  Couleur: string;
  Referent: Id | null;
  Notes: string;
}

export interface Lieu {
  id: Id;
  Nom: string;
  Description: string;
}

export type StatutBenevole = 'Actif' | 'Absent';

export interface Benevole {
  id: Id;
  Nom: string;
  Contact: string;
  Equipe: Id;
  Competences: string[];
  Quota_heures_min: number;
  Quota_heures_max: number;
  Statut: StatutBenevole;
  Notes: string;
}

export type Priorite = 'Critique' | 'Normale' | 'Confort';

export interface Mission {
  id: Id;
  Nom: string;
  Description: string;
  Lieu: Id;
  Equipe: Id;
  Priorite: Priorite;
  Competences_requises: string[];
}

export interface Artiste {
  id: Id;
  Nom: string;
  Lieu: Id;
  Debut: Epoch;
  Fin: Epoch;
}

export interface MacroCreneau {
  id: Id;
  Nom: string;
  Debut: Epoch;
  Fin: Epoch;
}

export interface SousCreneau {
  id: Id;
  Macro_creneau: Id;
  /** Renseigné seulement quand ce sous-créneau est spécifique à une mission
   *  (rythme différent de la grille commune du macro-créneau, §6.2). */
  Mission: Id | null;
  Libelle: string;
  Debut: Epoch;
  Fin: Epoch;
}

export interface Besoin {
  id: Id;
  Mission: Id;
  Sous_creneau: Id;
  Effectif_min: number;
  Effectif_max: number;
  Taille_groupe: number;
}

/** Indicatif : place théorique nommée, positionnée à l'avance sur un ou
 *  plusieurs besoins via `PositionGroupe` (cahier des charges §6.3). */
export interface Groupe {
  id: Id;
  Code: string;
  Taille: number;
  Equipe: Id;
  Notes: string;
}

/** Un indicatif positionné sur un besoin donné. */
export interface PositionGroupe {
  id: Id;
  Groupe: Id;
  Besoin: Id;
}

export type OriginePlace = 'Algorithme' | 'Manuel';

/** Une place dans un groupe : une personne, à un rang, qui suit le groupe
 *  sur toutes ses positions. Bénévole nul = place non pourvue. */
export interface Place {
  id: Id;
  Groupe: Id;
  Rang: number;
  Benevole: Id | null;
  Origine: OriginePlace;
  Verrouillee: boolean;
  Score: number;
}

export type StatutDisponibilite = 'Disponible' | 'Indisponible' | 'Artiste';

export interface Disponibilite {
  Benevole: Id;
  Quart_heure: Epoch;
  Statut: StatutDisponibilite;
  Artiste: Id | null;
}

export type Preference = 'Refuse' | 'Réticent' | 'Neutre' | 'Intéressé' | 'Souhaite fortement';

export interface SouhaitMission {
  id: Id;
  Benevole: Id;
  Mission: Id;
  Preference: Preference;
}

export type TypeAffinite = 'Ensemble' | 'Éviter';

export interface Affinite {
  id: Id;
  Benevole_A: Id;
  Benevole_B: Id;
  Type: TypeAffinite;
}

/** Le jeu de données complet, une fois décodé. */
export interface Modele {
  equipes: Equipe[];
  lieux: Lieu[];
  benevoles: Benevole[];
  missions: Mission[];
  artistes: Artiste[];
  macroCreneaux: MacroCreneau[];
  sousCreneaux: SousCreneau[];
  besoins: Besoin[];
  groupes: Groupe[];
  positionsGroupe: PositionGroupe[];
  places: Place[];
  disponibilites: Disponibilite[];
  souhaitsMissions: SouhaitMission[];
  affinites: Affinite[];
}
