/**
 * Conversions de temps entre heure locale et horodatage Unix.
 *
 * Grist stocke les colonnes Date et DateTime en secondes Unix. Le jeu de
 * données est décrit en heure locale française : il faut donc convertir en
 * tenant compte du décalage réel à l'instant considéré, changement d'heure
 * compris, plutôt que de coder un décalage en dur.
 */

/** Décalage d'un fuseau, en minutes, à un instant donné. */
function decalageMinutes(instantMs, fuseau) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parties = Object.fromEntries(
    format.formatToParts(new Date(instantMs)).map((p) => [p.type, p.value]),
  );
  // L'heure locale lue comme si elle était UTC, moins l'instant réel, donne le décalage.
  const commeUtc = Date.UTC(
    Number(parties.year), Number(parties.month) - 1, Number(parties.day),
    Number(parties.hour) % 24, Number(parties.minute), Number(parties.second),
  );
  return (commeUtc - instantMs) / 60000;
}

/**
 * Horodatage Unix, en secondes, d'une heure murale locale.
 *
 * Deux passes : la première estime le décalage, la seconde le corrige si
 * l'estimation tombait de l'autre côté d'un changement d'heure.
 */
export function epochDepuisHeureLocale({annee, mois, jour, heures = 0, minutes = 0}, fuseau) {
  const naif = Date.UTC(annee, mois - 1, jour, heures, minutes, 0);
  const premierEssai = naif - decalageMinutes(naif, fuseau) * 60000;
  const corrige = naif - decalageMinutes(premierEssai, fuseau) * 60000;
  return Math.round(corrige / 1000);
}

/** Horodatage Unix, en secondes, de minuit local d'un jour donné. */
export function epochDeJour({annee, mois, jour}, fuseau) {
  return epochDepuisHeureLocale({annee, mois, jour}, fuseau);
}

/** Libellé « ven. 14:00 » d'un horodatage, en heure locale. */
export function libelleCourt(epochSecondes, fuseau) {
  const format = new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return format.format(new Date(epochSecondes * 1000)).replace(/ /g, ' ');
}

/** Heure « 14:00 » d'un horodatage, en heure locale. */
export function libelleHeure(epochSecondes, fuseau) {
  const format = new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return format.format(new Date(epochSecondes * 1000));
}
