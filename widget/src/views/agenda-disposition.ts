/**
 * Calcul de géométrie de la vue Agenda (`agenda.ts`) : position d'un
 * macro-créneau sur l'axe du temps, une fois les jours groupés par
 * `regrouperParJour` (`logic/derive.ts` — jour de festival, coupure à 6h
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

import type {MacroCreneau} from '../domain/types';
import {epochMinuitLocal} from '../temps';

/** Plage commune (en minutes depuis minuit local) couvrant tous les jours affichés. */
export interface PlageJournaliere {
  minMinute: number;
  maxMinute: number;
}

/** Plage affichée quand aucun macro-créneau n'existe encore (document neuf, ou tous les jours vidés) — un cadre pour accueillir le premier, plutôt qu'une grille vide ou dégénérée. */
const PLAGE_PAR_DEFAUT: PlageJournaliere = {minMinute: 9 * 60, maxMinute: 18 * 60};

/** Construit la plage horaire commune à partir des macro-créneaux de chaque jour, arrondie à l'heure. */
export function construirePlageJournaliere(joursMacros: MacroCreneau[][]): PlageJournaliere {
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

/** Décalage et longueur (en pixels) d'un créneau sur l'axe du temps de son jour. */
export interface PositionSurAxe {
  decalagePx: number;
  longueurPx: number;
}

export function positionCreneau(
  creneau: {Debut: number; Fin: number},
  minuitEpoch: number,
  plage: PlageJournaliere,
  pxParMinute: number,
): PositionSurAxe {
  const debutMin = (creneau.Debut - minuitEpoch) / 60;
  const finMin = (creneau.Fin - minuitEpoch) / 60;
  return {
    decalagePx: (debutMin - plage.minMinute) * pxParMinute,
    longueurPx: (finMin - debutMin) * pxParMinute,
  };
}

/** Longueur totale de l'axe du temps (en pixels), pour dimensionner la grille. */
export function longueurAxePx(plage: PlageJournaliere, pxParMinute: number): number {
  return (plage.maxMinute - plage.minMinute) * pxParMinute;
}

/** Une graduation horaire de l'axe du temps, à sa position dans la plage. */
export interface Graduation {
  libelle: string;
  decalagePx: number;
}

/** Une graduation par heure pleine, sur toute la plage — le libellé est l'heure du jour, indépendant de la date. */
export function graduationsHoraires(plage: PlageJournaliere, pxParMinute: number): Graduation[] {
  const graduations: Graduation[] = [];
  for (let minute = plage.minMinute; minute <= plage.maxMinute; minute += 60) {
    graduations.push({
      libelle: `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}h`,
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
export function graduationsMinuit(plage: PlageJournaliere, pxParMinute: number): number[] {
  const marqueurs: number[] = [];
  const premierMinuit = Math.ceil(plage.minMinute / MINUTES_PAR_JOUR) * MINUTES_PAR_JOUR;
  for (let minute = premierMinuit; minute <= plage.maxMinute; minute += MINUTES_PAR_JOUR) {
    if (minute > plage.minMinute) {
      marqueurs.push((minute - plage.minMinute) * pxParMinute);
    }
  }
  return marqueurs;
}
