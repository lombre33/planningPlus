/**
 * Petits utilitaires de temps du moteur. Tout est en secondes Unix (comme
 * les colonnes DateTime de Grist, voir `dev/seed/temps.mjs`) ; ce module ne
 * connaît pas les fuseaux horaires, ils n'ont pas d'incidence sur les
 * calculs de recouvrement ou de granularité au quart d'heure.
 */

/** Les débuts de quart d'heure (ou du pas donné) couverts par [debut, fin). */
export function quartsDIntervalle(debut: number, fin: number, pasSecondes: number): number[] {
  if (pasSecondes <= 0) {
    throw new RangeError('pasSecondes doit être strictement positif');
  }
  const quarts: number[] = [];
  for (let t = debut; t < fin; t += pasSecondes) {
    quarts.push(t);
  }
  return quarts;
}

/** Durée d'un intervalle, en heures. */
export function heuresDIntervalle(debut: number, fin: number): number {
  return Math.max(0, fin - debut) / 3600;
}

/** Vrai si les deux intervalles [debutA, finA) et [debutB, finB) se recouvrent strictement. */
export function seChevauchent(debutA: number, finA: number, debutB: number, finB: number): boolean {
  return debutA < finB && debutB < finA;
}
