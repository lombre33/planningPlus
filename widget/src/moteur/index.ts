/**
 * Moteur d'affectation et de correction (§7.5 du cahier des charges,
 * point G du fil de discussion). Point d'entrée public du dossier.
 *
 * Portée : ce module remplit et corrige des `Places` déjà positionnées
 * (`Groupes` + `Positions_groupe`) — il ne crée jamais de groupe ni de
 * position. Aucune dépendance au DOM ni à l'API Grist : `DonneesPlanning`
 * est un ensemble de tableaux de domaine ordinaires ; la conversion depuis
 * les lignes Grist réelles (résolution des `_ref`, décodage `ChoiceList`,
 * etc.) est la responsabilité de l'intégration widget qui appellera ces
 * fonctions, pas de ce module.
 *
 * Voir `docs/tests-moteur-affectation.md` pour la batterie de tests tenue à
 * jour (NF7) et le détail des décisions de conception non triviales.
 */

export type {
  Affinite,
  Anomalie,
  Benevole,
  Besoin,
  CandidatClasse,
  CandidatEligible,
  CauseNonPourvue,
  CodeAnomalie,
  Disponibilite,
  DonneesPlanning,
  ExplicationScore,
  GraviteAnomalie,
  Groupe,
  Id,
  Mission,
  NiveauPreferenceMission,
  OriginePlace,
  ParametresAlgorithme,
  Perimetre,
  Place,
  PositionGroupe,
  PrevisualisationDeplacement,
  PrioriteMission,
  Proposition,
  RaisonInEligibilite,
  ResultatAffectation,
  SousCreneau,
  SouhaitMission,
  StatutBenevole,
  StatutDisponibilite,
  TypeAffinite,
} from './types';
export {GRAVITE_PAR_CODE, PARAMETRES_PAR_DEFAUT} from './types';

export {
  appliquerPropositions,
  calculerAffectation,
  classerCandidats,
  corrigerPlace,
  deverrouillerPlace,
  perimetreAbsence,
  previsualiserDeplacement,
  repositionnerGroupe,
} from './affectation';

export {detecterAnomalies} from './anomalies';

export {heuresDIntervalle, quartsDIntervalle, seChevauchent} from './temps';
