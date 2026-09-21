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

export {construireModele} from './modele';

export type {DocApiEcriture, NouveauGroupe, NouvelleDisponibilite, NouvellePlace, UserAction} from './ecriture';
export {
  actionsCreerGroupe,
  actionsDefinirCompetencesBenevole,
  actionsDefinirPlaces,
  actionsEcrireDisponibilites,
  actionsEnregistrerHeureCoupure,
  actionsEnregistrerParametresAlgorithme,
  actionsPositionnerGroupe,
  actionsVerrouillerPlace,
  appliquerActions,
} from './ecriture';

export {LIBELLE_PAR_TABLE, resoudreIdsTables} from './tables';

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
