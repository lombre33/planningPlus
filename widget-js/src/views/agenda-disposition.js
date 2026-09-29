/**
 * Calcul de géométrie de la vue Agenda (`agenda.js`) : position d'un
 * macro-créneau sur l'axe du temps, une fois les jours groupés par
 * `regrouperParJour` (`logic/derive.js` — jour de festival, coupure à 6h
 * plutôt qu'à minuit civil, cahier des charges §6.2 ; c'est la version
 * canonique, partagée avec la grille missions, pas recalculée ici).
 *
 * Les positions se calculent en minutes depuis minuit local de CHAQUE jour,
 * pas sur une frise en temps absolu : deux jours affichés côte à côte n'ont
 * pas besoin d'être consécutifs (samedi peut être absent entre vendredi et
 * dimanche, §8 vue 1 — jours ajoutés librement, sans continuité). Une frise
 * en temps absolu créerait un vide énorme entre deux jours espacés ; aligner
 * sur l'heure du jour est ce qui permet de comparer des jours quelconques
 * à la même échelle.
 */

import {t, traductions} from '../i18n.js';
import {epochMinuitLocal} from '../temps.js';

traductions({
  '{heure}h': '{heure}:00',
});

/** Plage affichée quand aucun macro-créneau n'existe encore (document neuf, ou tous les jours vidés) — un cadre pour accueillir le premier, plutôt qu'une grille vide ou dégénérée. */
const PLAGE_PAR_DEFAUT = {minMinute: 9 * 60, maxMinute: 18 * 60};

/** Construit la plage horaire commune à partir des macro-créneaux de chaque jour, arrondie à l'heure. */
export function construirePlageJournaliere(joursMacros) {
  let minMinute = Infinity;
  let maxMinute = -Infinity;
  for (const macros of joursMacros) {
    const premier = macros[0];
    if (!premier) { continue; }
    const minuit = epochMinuitLocal(premier.Debut);
    for (const macro of macros) {
      minMinute = Math.min(minMinute, (macro.Debut - minuit) / 60);
      maxMinute = Math.max(maxMinute, (macro.Fin - minuit) / 60);
    }
  }
  if (!Number.isFinite(minMinute) || !Number.isFinite(maxMinute)) {
    return PLAGE_PAR_DEFAUT;
  }
  return {
    minMinute: Math.floor(minMinute / 60) * 60,
    maxMinute: Math.ceil(maxMinute / 60) * 60,
  };
}

export function positionCreneau(
  creneau,
  minuitEpoch,
  plage,
  pxParMinute,
) {
  const debutMin = (creneau.Debut - minuitEpoch) / 60;
  const finMin = (creneau.Fin - minuitEpoch) / 60;
  return {
    decalagePx: (debutMin - plage.minMinute) * pxParMinute,
    longueurPx: (finMin - debutMin) * pxParMinute,
  };
}

/** Longueur totale de l'axe du temps (en pixels), pour dimensionner la grille. */
export function longueurAxePx(plage, pxParMinute) {
  return (plage.maxMinute - plage.minMinute) * pxParMinute;
}

/** Une graduation par heure pleine, sur toute la plage — le libellé est l'heure du jour, indépendant de la date. */
export function graduationsHoraires(plage, pxParMinute) {
  const graduations = [];
  for (let minute = plage.minMinute; minute <= plage.maxMinute; minute += 60) {
    graduations.push({
      libelle: t('{heure}h', {heure: String(Math.floor(minute / 60) % 24).padStart(2, '0')}),
      decalagePx: (minute - plage.minMinute) * pxParMinute,
    });
  }
  return graduations;
}

const MINUTES_PAR_JOUR = 24 * 60;

/**
 * Décalages (en pixels) de chaque minuit traversé par la plage.
 *
 * Une soirée qui déborde sur le lendemain (ex. 18h–2h, cahier des charges
 * §2) reste un seul macro-créneau, positionné sur l'axe de SON jour de
 * début sans repli à 0h (`positionCreneau` le laisse dépasser 24h) : il se
 * lit donc comme un seul bloc continu, jamais coupé en deux morceaux
 * orphelins. Ces marqueurs se contentent de signaler visuellement où
 * tombe minuit à l'intérieur d'un tel bloc.
 */
export function graduationsMinuit(plage, pxParMinute) {
  const marqueurs = [];
  const premierMinuit = Math.ceil(plage.minMinute / MINUTES_PAR_JOUR) * MINUTES_PAR_JOUR;
  for (let minute = premierMinuit; minute <= plage.maxMinute; minute += MINUTES_PAR_JOUR) {
    if (minute > plage.minMinute) {
      marqueurs.push((minute - plage.minMinute) * pxParMinute);
    }
  }
  return marqueurs;
}
