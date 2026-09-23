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

/**
 * Seuil de la règle « voir un artiste » (§7.2, revu par Antoine le
 * 2026-09-23) : il suffit désormais d'avoir 30 minutes libres, d'affilée,
 * pendant le passage d'un artiste souhaité — pas le créneau complet. Un
 * passage plus court que ce seuil compte comme vu dès qu'il est libre en
 * entier (voir `peutVoirArtiste` ci-dessous, qui applique cette réduction).
 */
export const SEUIL_MINUTES_VOIR_ARTISTE = 30;

/**
 * Le plus long segment libre, en minutes, dans [debut, fin), une fois
 * retirés les quarts occupés donnés (débuts de quart en secondes Unix,
 * mêmes unités que `quartsDIntervalle`). Fonction de temps pure, sans
 * connaissance d'un bénévole ni d'un artiste précis : `peutVoirArtiste`
 * l'applique au passage d'un artiste, mais elle sert aussi telle quelle à
 * un affichage (panneau Indicatifs, §8) qui veut la même valeur plutôt
 * qu'un simple booléen.
 */
export function minutesLibresConsecutives(
  debut: number, fin: number, quartsOccupes: ReadonlySet<number>, pasSecondes: number,
): number {
  let maxLibre = 0;
  let libreCourant = 0;
  for (let t = debut; t < fin; t += pasSecondes) {
    if (quartsOccupes.has(t)) {
      libreCourant = 0;
    } else {
      libreCourant += pasSecondes;
      if (libreCourant > maxLibre) { maxLibre = libreCourant; }
    }
  }
  return maxLibre / 60;
}

/**
 * Le bénévole peut-il encore voir cet artiste (§7.2) une fois les quarts
 * donnés occupés ? Il faut `SEUIL_MINUTES_VOIR_ARTISTE` minutes libres
 * d'affilée pendant son passage — ou le passage entier, s'il dure moins
 * que ce seuil (`Math.min` ci-dessous : le seuil ne peut jamais dépasser
 * la durée réelle du passage).
 */
export function peutVoirArtiste(
  artisteDebut: number, artisteFin: number, quartsOccupes: ReadonlySet<number>, pasSecondes: number,
): boolean {
  const dureePassageMinutes = Math.max(0, artisteFin - artisteDebut) / 60;
  const seuil = Math.min(SEUIL_MINUTES_VOIR_ARTISTE, dureePassageMinutes);
  return minutesLibresConsecutives(artisteDebut, artisteFin, quartsOccupes, pasSecondes) >= seuil;
}
