/**
 * Calcul de géométrie partagé par les deux dispositions du comparatif
 * agenda vertical/horizontal (`agenda-comparatif.ts`). Une seule fonction de
 * position sert les deux axes (`positionCreneau`) : c'est ce qui garantit
 * qu'elles montrent exactement les mêmes données, juste projetées
 * différemment.
 *
 * Les positions se calculent en minutes depuis minuit local de CHAQUE jour,
 * pas sur une frise en temps absolu : deux jours affichés côte à côte n'ont
 * pas besoin d'être consécutifs (samedi peut être absent entre vendredi et
 * dimanche, §8 vue 1 — jours ajoutés librement, sans continuité). Une frise
 * en temps absolu créerait un vide énorme entre deux jours espacés ; aligner
 * sur l'heure du jour, comme le fait déjà `views/agenda.ts`, est ce qui
 * permet de comparer des jours quelconques.
 */

import type {MacroCreneau} from '../domain/types';
import {cleJour, epochMinuitLocal, libelleJourLong} from '../temps';

/** Un jour de festival et les macro-créneaux qui lui appartiennent (voir `regrouperParJourFestival`). */
export interface JourFestival {
  cle: string;
  libelle: string;
  macros: MacroCreneau[];
}

/**
 * Regroupe des macro-créneaux par **jour de festival** (cahier des charges
 * §6.2), pas par jour civil : un regroupement purement visuel, jamais
 * stocké, qui bascule à `heureCoupureHeures` (6h par défaut) plutôt qu'à
 * minuit. Une soirée de 22h à 2h appartient tout entière au jour de
 * festival commencé la veille, jamais scindée entre deux jours d'affichage
 * — contrairement à un simple regroupement par jour civil du début de
 * chaque macro-créneau, qui suffit tant qu'aucun macro-créneau ne commence
 * lui-même après minuit et avant la coupure (un poste de nuit 2h–6h, par
 * exemple).
 */
export function regrouperParJourFestival(macroCreneaux: MacroCreneau[], heureCoupureHeures = 6): JourFestival[] {
  const decalageSecondes = heureCoupureHeures * 3600;
  const parCle = new Map<string, MacroCreneau[]>();
  for (const macro of macroCreneaux) {
    const cle = cleJour(macro.Debut - decalageSecondes);
    const liste = parCle.get(cle) ?? [];
    liste.push(macro);
    parCle.set(cle, liste);
  }
  return [...parCle.entries()]
    .map(([cle, macros]) => ({
      cle,
      libelle: libelleJourLong(macros[0]!.Debut),
      macros: macros.sort((a, b) => a.Debut - b.Debut),
    }))
    .sort((a, b) => a.macros[0]!.Debut - b.macros[0]!.Debut);
}

/** Plage commune (en minutes depuis minuit local) couvrant tous les jours affichés. */
export interface PlageJournaliere {
  minMinute: number;
  maxMinute: number;
}

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
 * tombe minuit à l'intérieur d'un tel bloc, dans les deux dispositions.
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
