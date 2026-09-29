/**
 * Couche d'accès Grist réelle : lit et écrit un document Grist via l'API du
 * plugin, vers `DonneesPlanning` (le modèle du moteur d'affectation,
 * `../moteur`) et vers `Modele` (le modèle complet de l'UI, `../domain`).
 * Point d'entrée public de ce dossier — voir `lecture.js`, `modele.js` et
 * `ecriture.js` pour le détail, et `dev/README.md` pour la façon de la
 * vérifier contre une vraie instance.
 */

export {zipperTable} from './brut.js';

export {construireDonneesPlanning, construireLignesParametres, lireDocument} from './lecture.js';

export {benevoleDepuisLigne, construireModele} from './modele.js';

export {
  actionsActualiserBenevolesSource,
  actionsCreerAffinites,
  actionsCreerArtiste,
  actionsCreerBenevolesSource,
  actionsCreerBesoin,
  actionsCreerEquipe,
  actionsCreerGroupe,
  actionsCreerMacroCreneau,
  actionsCreerMission,
  actionsCreerSousCreneaux,
  actionsDefinirAbsence,
  actionsDefinirCompetencesBenevole,
  actionsDefinirParametre,
  actionsDefinirPlaces,
  actionsDefinirPresence,
  actionsDeplacerMacroCreneau,
  actionsDeplacerPositionGroupe,
  actionsEcrireDisponibilites,
  actionsEnregistrerHeureCoupure,
  actionsEnregistrerParametresAlgorithme,
  actionsModifierArtiste,
  actionsModifierGroupe,
  actionsModifierMission,
  actionsModifierPlaces,
  actionsModifierSousCreneau,
  actionsModifierSousCreneaux,
  actionsPositionnerGroupe,
  actionsRenommerMacroCreneau,
  actionsRepointerBesoins,
  actionsRetirerPositionGroupe,
  actionsRetirerPositionsGroupe,
  actionsSupprimerBesoin,
  actionsSupprimerBesoins,
  actionsSupprimerDisponibilites,
  actionsSupprimerGroupe,
  actionsSupprimerMacroCreneau,
  actionsSupprimerMission,
  actionsSupprimerSousCreneaux,
  actionsVerrouillerPlace,
  appliquerActions,
} from './ecriture.js';

export {idsReelsDeTest, LIBELLE_PAR_TABLE, resoudreIdsTables} from './tables.js';

export {colonnesDeTable, tablesDuDocument} from './colonnes.js';

export {actionsAjouterColonneManquante, actionsCreerTablesManquantes, actionsReglerAffichage} from './creation.js';

export {
  CLE_HEURE_COUPURE,
  HEURE_COUPURE_PAR_DEFAUT,
  clesEtValeursParametresAlgorithme,
  heureCoupureDepuisLignes,
  parametresAlgorithmeDepuisLignes,
} from './parametres.js';

export {
  decoderBool,
  decoderListe,
  decoderNombre,
  decoderNumeriqueOptionnel,
  decoderRef,
  decoderTexte,
  encoderListe,
  encoderRef,
} from './valeurs.js';
