/**
 * Modèle de données du moteur d'affectation.
 *
 * Ce module ne dépend ni de Grist ni du DOM : les types ci-dessous forment
 * une couche de domaine propre, en miroir du modèle §6 du cahier des charges
 * (`docs/cahier-des-charges.md`). La conversion depuis les lignes Grist
 * réelles (colonnes `_ref`, encodage `ChoiceList`, etc.) est la
 * responsabilité de l'intégration widget, pas de ce module — voir le
 * `README.md` de ce dossier.
 *
 * Les valeurs des unions de chaînes reprennent volontairement, caractère
 * pour caractère, les choix déclarés dans `dev/seed/schema.mjs`, pour qu'un
 * relecteur puisse comparer les deux sans table de correspondance.
 */

/** Identifiant d'une ligne Grist (le `id` natif de la table). */
export type Id = number;

export type StatutBenevole = 'Actif' | 'Absent';

export interface Benevole {
  id: Id;
  nom: string;
  equipeId: Id | null;
  competences: string[];
  quotaHeuresMin: number | null;
  quotaHeuresMax: number | null;
  statut: StatutBenevole;
}

export type PrioriteMission = 'Critique' | 'Normale' | 'Confort';

export interface Mission {
  id: Id;
  nom: string;
  equipeId: Id | null;
  priorite: PrioriteMission;
  competencesRequises: string[];
}

/**
 * Sous-créneau : la rotation à l'intérieur d'un macro-créneau (§6.2). Les
 * bornes sont en secondes Unix, alignées sur le quart d'heure — le moteur ne
 * les réaligne pas, c'est la responsabilité de la saisie.
 */
export interface SousCreneau {
  id: Id;
  macroCreneauId: Id;
  /** Renseigné seulement si ce sous-créneau est spécifique à une mission. */
  missionId: Id | null;
  debut: number;
  fin: number;
}

export interface Besoin {
  id: Id;
  missionId: Id;
  sousCreneauId: Id;
  effectifMin: number;
  effectifMax: number;
  tailleGroupe: number;
}

/** Indicatif (§6.3) : un roster de taille fixe, positionné sur des besoins. */
export interface Groupe {
  id: Id;
  code: string;
  taille: number;
  equipeId: Id | null;
}

/** Positionne un groupe sur un besoin ; un groupe peut en avoir plusieurs. */
export interface PositionGroupe {
  id: Id;
  groupeId: Id;
  besoinId: Id;
}

export type OriginePlace = 'Algorithme' | 'Manuel';

/** Une place individuelle dans un groupe : l'unité affectée à un bénévole. */
export interface Place {
  id: Id;
  groupeId: Id;
  rang: number;
  benevoleId: Id | null;
  origine: OriginePlace;
  verrouillee: boolean;
  score: number | null;
}

export type StatutDisponibilite = 'Disponible' | 'Indisponible' | 'Artiste';

/** Une ligne par bénévole et par quart d'heure ; l'absence vaut indisponible. */
export interface Disponibilite {
  benevoleId: Id;
  /** Début du quart d'heure, en secondes Unix. */
  quartHeure: number;
  statut: StatutDisponibilite;
  artisteId: Id | null;
}

export type NiveauPreferenceMission =
  | 'Refuse'
  | 'Réticent'
  | 'Neutre'
  | 'Intéressé'
  | 'Souhaite fortement';

export interface SouhaitMission {
  benevoleId: Id;
  missionId: Id;
  preference: NiveauPreferenceMission;
}

export type TypeAffinite = 'Ensemble' | 'Éviter';

export interface Affinite {
  benevoleAId: Id;
  benevoleBId: Id;
  type: TypeAffinite;
}

/** L'état complet dont le moteur a besoin pour calculer ou ajuster un planning. */
export interface DonneesPlanning {
  benevoles: Benevole[];
  missions: Mission[];
  sousCreneaux: SousCreneau[];
  besoins: Besoin[];
  groupes: Groupe[];
  positionsGroupe: PositionGroupe[];
  places: Place[];
  disponibilites: Disponibilite[];
  souhaitsMissions: SouhaitMission[];
  affinites: Affinite[];
}

/**
 * Poids et réglages de l'algorithme (§7.2 : « l'ordre et les poids relatifs
 * sont paramétrables, et le paramétrage est stocké dans le document pour
 * être audité et rejoué »). Toutes les valeurs sont des ajustements fins :
 * l'ORDRE de priorité (couverture > disponibilité/artiste > souhait mission
 * > équité > affinité) est, lui, une propriété structurelle de l'algorithme
 * et n'est pas paramétrable ici — le cahier des charges le fixe.
 */
export interface ParametresAlgorithme {
  /** Granularité du planning, en secondes. 900 = quart d'heure. */
  pasSecondes: number;
  poids: {
    /** Pénalité de score appliquée quand un conflit « veut voir un artiste » est toléré en dernier recours. */
    conflitArtiste: number;
    /** Score additif par niveau de souhait de mission (hors « Refuse », qui exclut). */
    souhaitMission: Record<Exclude<NiveauPreferenceMission, 'Refuse'>, number>;
    /** Amplitude maximale du bonus d'équité (bénévole très en-dessous de son quota). */
    equite: number;
    /** Bonus/malus par paire de rang d'un même groupe selon les affinités. */
    affiniteEnsemble: number;
    affiniteEviter: number;
    /**
     * Bonus quand l'équipe du bénévole correspond à celle du groupe. Un
     * repère opérationnel (§6.1, §7.5.3 : l'explication d'un candidat doit
     * montrer son équipe) plutôt qu'une contrainte dure — absente du
     * catalogue §7.1, un renfort inter-équipe reste possible.
     */
    equipeCorrespond: number;
  };
}

export const PARAMETRES_PAR_DEFAUT: ParametresAlgorithme = {
  pasSecondes: 15 * 60,
  poids: {
    conflitArtiste: -0.4,
    souhaitMission: {
      'Réticent': -0.15,
      'Neutre': 0,
      'Intéressé': 0.2,
      'Souhaite fortement': 0.35,
    },
    equite: 0.15,
    affiniteEnsemble: 0.1,
    affiniteEviter: -0.1,
    equipeCorrespond: 0.1,
  },
};

/** Cause du blocage d'une place que le solveur n'a pas su, ou pas dû, pourvoir. */
export type CauseNonPourvue =
  /** Aucun bénévole disponible et compétent n'a pu être identifié. */
  | 'aucun_candidat'
  /** Des candidats existaient mais uniquement en conflit avec un souhait « artiste », non utilisés car non nécessaires pour l'effectif minimum. */
  | 'conflit_artiste_non_necessaire'
  /** Périmètre de résolution restreint : la place est hors du périmètre demandé. */
  | 'hors_perimetre';

/**
 * Catalogue des anomalies (§7.4 du cahier des charges) : exactement sept
 * types, fixés avec Antoine sur retour de la première maquette. Toute
 * nouvelle anomalie doit être ajoutée au cahier des charges avant de l'être
 * ici — ce n'est pas un type ouvert.
 */
export type CodeAnomalie =
  | 'sous_effectif'
  | 'souhait_refuse'
  | 'indisponibilite'
  | 'sur_effectif'
  | 'conflit_artiste'
  | 'chevauchement_creneaux'
  | 'hors_quota';

/**
 * « À corriger » signe une vraie violation de règle (ne devrait arriver que
 * par une correction manuelle qui l'a introduite). « À surveiller » est un
 * état normal du système, jamais bloquant. Correspondance fixe avec
 * {@link CodeAnomalie}, voir {@link GRAVITE_PAR_CODE}.
 */
export type GraviteAnomalie = 'a_corriger' | 'a_surveiller';

export const GRAVITE_PAR_CODE: Record<CodeAnomalie, GraviteAnomalie> = {
  sous_effectif: 'a_corriger',
  souhait_refuse: 'a_corriger',
  indisponibilite: 'a_corriger',
  sur_effectif: 'a_surveiller',
  conflit_artiste: 'a_surveiller',
  chevauchement_creneaux: 'a_surveiller',
  hors_quota: 'a_surveiller',
};

export interface Anomalie {
  code: CodeAnomalie;
  gravite: GraviteAnomalie;
  message: string;
  placeId?: Id;
  groupeId?: Id;
  besoinId?: Id;
  benevoleId?: Id;
  sousCreneauId?: Id;
}

/**
 * Un changement proposé sur une place — jamais appliqué directement par le
 * solveur (§7.3 : un aperçu se valide). `origineApres`/`verrouilleeApres`
 * portent explicitement ce que l'application de la proposition doit écrire ;
 * pour une proposition du solveur, `origineApres` vaut toujours `Algorithme`
 * et `verrouilleeApres` toujours `false` (voir `corrigerPlace` pour le
 * pendant manuel, qui verrouille).
 */
export interface Proposition {
  placeId: Id;
  groupeId: Id;
  rang: number;
  benevoleIdAvant: Id | null;
  benevoleIdApres: Id | null;
  origineApres: OriginePlace;
  verrouilleeApres: boolean;
  score: number | null;
  /** Renseigné seulement quand la place reste (ou redevient) non pourvue. */
  causeNonPourvue?: CauseNonPourvue;
}

export interface ResultatAffectation {
  propositions: Proposition[];
  anomalies: Anomalie[];
  parametres: ParametresAlgorithme;
}

/**
 * Périmètre d'une résolution partielle (contrainte C, §7.5 point 1 : « tout
 * le planning ou un périmètre choisi — une mission, un macro-créneau »).
 * Tous les critères renseignés se combinent en union ; une place appartient
 * au périmètre dès qu'elle correspond à l'un d'eux. Omettre les cinq revient
 * à un périmètre complet (toutes les places non verrouillées).
 */
export interface Perimetre {
  placeIds?: Id[];
  groupeIds?: Id[];
  besoinIds?: Id[];
  missionIds?: Id[];
  macroCreneauIds?: Id[];
}

/** Explication d'un score, pour l'afficher à côté du candidat (§7.5 point 3). */
export interface ExplicationScore {
  /** Compétences requises par toutes les missions servies par le groupe, détenues par le candidat. */
  competencesOk: boolean;
  /** L'équipe du candidat correspond-elle à celle du groupe ? `null` si l'une des deux n'est pas renseignée. */
  equipeCorrespond: boolean | null;
  /** Le candidat veut voir un artiste pendant au moins un quart d'heure occupé par le groupe. */
  conflitArtiste: boolean;
  /** Souhaits du candidat pour chacune des missions distinctes servies par le groupe. */
  souhaitsMission: {missionId: Id; preference: NiveauPreferenceMission | null}[];
  /** Heures déjà affectées au candidat au moment du calcul (équité). */
  heuresActuelles: number;
  quotaHeuresMax: number | null;
  /** Vrai si l'affecter ici lui ferait dépasser son quota d'heures maximum. */
  depasseraitQuota: boolean;
  /** Affinités avec les bénévoles déjà occupant une autre place du même groupe. */
  affinite: 'positive' | 'negative' | 'neutre';
}

export interface CandidatEligible {
  benevoleId: Id;
  score: number;
  explication: ExplicationScore;
}

/** Pourquoi un candidat n'est pas éligible (§7.1, une contrainte dure). */
export type RaisonInEligibilite =
  | 'statut_absent'
  | 'competence_manquante'
  | 'refus_mission'
  | 'deja_occupe'
  | 'indisponible';

/**
 * Un candidat classé pour une place, éligible ou non (§7.5.3 : Antoine veut
 * voir aussi les inéligibles, avec leur raison, pour pouvoir forcer un cas
 * impossible en connaissance de cause — `corrigerPlace` ne vérifie
 * d'ailleurs aucune contrainte, exactement pour permettre ça). Les
 * candidats éligibles arrivent en tête, triés par score décroissant.
 */
export interface CandidatClasse {
  benevoleId: Id;
  eligible: boolean;
  /** Non `null` seulement si `eligible` est vrai. */
  score: number | null;
  /** Non `null` seulement si `eligible` est vrai. */
  explication: ExplicationScore | null;
  /** Non `null` seulement si `eligible` est faux. */
  raison: RaisonInEligibilite | null;
}

/**
 * Aperçu, sans mutation, d'un déplacement ou d'un échange entre deux places
 * (glisser-déposer, §7.3 : un aperçu se valide avant application). Si
 * `placeCibleId` est déjà pourvue, c'est un échange des deux occupants ;
 * sinon un simple déplacement. Ne fait rien si l'une des deux places est
 * verrouillée (`possible: false`) — un verrouillage protège toujours contre
 * n'importe quel mouvement, y compris manuel (§7.1).
 */
export interface PrevisualisationDeplacement {
  possible: boolean;
  raisonImpossible?: 'place_verrouillee' | 'place_introuvable';
  donneesApres: DonneesPlanning;
  anomaliesAvant: Anomalie[];
  anomaliesApres: Anomalie[];
  anomaliesCreees: Anomalie[];
  anomaliesResolues: Anomalie[];
}
