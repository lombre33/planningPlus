/**
 * Sérialisation de `ParametresAlgorithme` (et de l'heure de coupure du jour
 * de festival) vers/depuis la table `Parametres` (`Cle`, `Valeur`), seule
 * table de type clé-valeur du modèle.
 *
 * Une ligne par réglage scalaire plutôt qu'un unique blob JSON dans
 * `Valeur` : c'est ce qui garde la table filtrable et triable nativement
 * (§5.4) — un blob unique serait lisible mais pas exploitable. Décision de
 * cette couche, faute d'un tranchage plus fin dans le cahier des charges
 * (§6.5 ne fixe que la forme `Cle`/`Valeur`).
 *
 * Toute clé absente du document retombe sur `PARAMETRES_PAR_DEFAUT` : un
 * document jamais configuré reste utilisable.
 */

import {PARAMETRES_PAR_DEFAUT, type ParametresAlgorithme} from '../moteur/types';

/** Clé sous laquelle vit l'heure de coupure du jour de festival (§3, §6.2). */
export const CLE_HEURE_COUPURE = 'heure_coupure_jour';

/** Heure de coupure par défaut (6 h du matin), quand la clé est absente. */
export const HEURE_COUPURE_PAR_DEFAUT = 6;

/** Une ligne de la table `Parametres`, telle que décodée par `lecture.ts`. */
export interface LigneParametre {
  cle: string;
  valeur: string;
}

/**
 * Aplatit `ParametresAlgorithme` en couples clé/valeur pour `Parametres`.
 *
 * `souhaitMission.Neutre` n'est pas persisté : structurellement toujours 0
 * (« neutre » veut dire aucun bonus ni malus), il n'a rien de configurable.
 */
export function clesEtValeursParametresAlgorithme(parametres: ParametresAlgorithme): [string, string][] {
  return [
    ['pas_secondes', String(parametres.pasSecondes)],
    ['poids.conflit_artiste', String(parametres.poids.conflitArtiste)],
    ['poids.equite', String(parametres.poids.equite)],
    ['poids.affinite_ensemble', String(parametres.poids.affiniteEnsemble)],
    ['poids.affinite_eviter', String(parametres.poids.affiniteEviter)],
    ['poids.equipe_correspond', String(parametres.poids.equipeCorrespond)],
    ['poids.souhait_mission.Réticent', String(parametres.poids.souhaitMission['Réticent'])],
    ['poids.souhait_mission.Intéressé', String(parametres.poids.souhaitMission['Intéressé'])],
    ['poids.souhait_mission.Souhaite fortement', String(parametres.poids.souhaitMission['Souhaite fortement'])],
  ];
}

function nombre(carte: Map<string, string>, cle: string, defaut: number): number {
  const brut = carte.get(cle);
  if (brut === undefined) { return defaut; }
  const valeur = Number(brut);
  return Number.isFinite(valeur) ? valeur : defaut;
}

/** Reconstruit `ParametresAlgorithme` à partir des lignes lues dans `Parametres`. */
export function parametresAlgorithmeDepuisLignes(lignes: readonly LigneParametre[]): ParametresAlgorithme {
  const carte = new Map(lignes.map((l) => [l.cle, l.valeur]));
  const defaut = PARAMETRES_PAR_DEFAUT;
  return {
    pasSecondes: nombre(carte, 'pas_secondes', defaut.pasSecondes),
    poids: {
      conflitArtiste: nombre(carte, 'poids.conflit_artiste', defaut.poids.conflitArtiste),
      equite: nombre(carte, 'poids.equite', defaut.poids.equite),
      affiniteEnsemble: nombre(carte, 'poids.affinite_ensemble', defaut.poids.affiniteEnsemble),
      affiniteEviter: nombre(carte, 'poids.affinite_eviter', defaut.poids.affiniteEviter),
      equipeCorrespond: nombre(carte, 'poids.equipe_correspond', defaut.poids.equipeCorrespond),
      souhaitMission: {
        'Réticent': nombre(carte, 'poids.souhait_mission.Réticent', defaut.poids.souhaitMission['Réticent']),
        'Neutre': 0,
        'Intéressé': nombre(carte, 'poids.souhait_mission.Intéressé', defaut.poids.souhaitMission['Intéressé']),
        'Souhaite fortement': nombre(
          carte, 'poids.souhait_mission.Souhaite fortement', defaut.poids.souhaitMission['Souhaite fortement'],
        ),
      },
    },
  };
}

/** Lit l'heure de coupure du jour de festival (0-23), défaut compris. */
export function heureCoupureDepuisLignes(lignes: readonly LigneParametre[]): number {
  const ligne = lignes.find((l) => l.cle === CLE_HEURE_COUPURE);
  if (!ligne) { return HEURE_COUPURE_PAR_DEFAUT; }
  const valeur = Number(ligne.valeur);
  return Number.isFinite(valeur) ? valeur : HEURE_COUPURE_PAR_DEFAUT;
}
