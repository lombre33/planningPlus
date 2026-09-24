/**
 * Couche d'accès Grist réelle : lit et écrit un document Grist via l'API du
 * plugin, vers `DonneesPlanning` (le modèle du moteur d'affectation,
 * `../moteur`) et vers `Modele` (le modèle complet de l'UI, `../domain`).
 * Point d'entrée public de ce dossier — voir `lecture.ts`, `modele.ts` et
 * `ecriture.ts` pour le détail, et `dev/README.md` pour la façon de la
 * vérifier contre une vraie instance.
 */

export type {DocumentBrut, LigneBrute, TableBrute} from './brut';
export {zipperTable} from './brut';

export {construireDonneesPlanning, construireLignesParametres, lireDocument} from './lecture';

export {benevoleDepuisLigne, construireModele} from './modele';

export type {
  BenevoleSourceActualise,
  DocApiEcriture,
  NouveauBenevoleSource,
  NouveauBesoin,
  NouveauGroupe,
  NouveauMacroCreneau,
  NouveauSousCreneau,
  NouvelArtiste,
  NouvelleAffiniteEnsemble,
  NouvelleDisponibilite,
  NouvelleEquipe,
  NouvelleMission,
  NouvellePlace,
  PatchPlace,
  PatchSousCreneau,
  UserAction,
} from './ecriture';
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
} from './ecriture';

export {idsReelsDeTest, LIBELLE_PAR_TABLE, resoudreIdsTables} from './tables';

export type {ColonneTable, TableDocument} from './colonnes';
export {colonnesDeTable, tablesDuDocument} from './colonnes';

export {actionsAjouterColonneManquante, actionsCreerTablesManquantes, actionsReglerAffichage} from './creation';

export type {LigneParametre} from './parametres';
export {
  CLE_HEURE_COUPURE,
  HEURE_COUPURE_PAR_DEFAUT,
  clesEtValeursParametresAlgorithme,
  heureCoupureDepuisLignes,
  parametresAlgorithmeDepuisLignes,
} from './parametres';

export {
  decoderBool,
  decoderListe,
  decoderNombre,
  decoderNumeriqueOptionnel,
  decoderRef,
  decoderTexte,
  encoderListe,
  encoderRef,
} from './valeurs';
