/**
 * Conversions et libellés de temps.
 *
 * Toutes les colonnes de date/heure du document sont en secondes Unix,
 * comme dans Grist (cf. `dev/seed/temps.mjs`, dont ce module reprend les
 * fonctions). L'unité de granularité du planning est le quart d'heure
 * (cahier des charges §3, glossaire).
 */

export const TIMEZONE = 'Europe/Paris';
export const PAS_MINUTES = 15;
export const PAS_SECONDES = PAS_MINUTES * 60;

function decalageMinutes(instantMs: number, fuseau: string): number {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parties = Object.fromEntries(
    format.formatToParts(new Date(instantMs)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const commeUtc = Date.UTC(
    Number(parties.year), Number(parties.month) - 1, Number(parties.day),
    Number(parties.hour) % 24, Number(parties.minute), Number(parties.second),
  );
  return (commeUtc - instantMs) / 60000;
}

export function epochDepuisHeureLocale(
  {annee, mois, jour, heures = 0, minutes = 0}:
  {annee: number; mois: number; jour: number; heures?: number; minutes?: number},
  fuseau: string = TIMEZONE,
): number {
  const naif = Date.UTC(annee, mois - 1, jour, heures, minutes, 0);
  const premierEssai = naif - decalageMinutes(naif, fuseau) * 60000;
  const corrige = naif - decalageMinutes(premierEssai, fuseau) * 60000;
  return Math.round(corrige / 1000);
}

export function libelleJourCourt(epochSecondes: number, fuseau = TIMEZONE): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau, weekday: 'short', day: '2-digit', month: 'short',
  }).format(new Date(epochSecondes * 1000));
}

export function libelleJourLong(epochSecondes: number, fuseau = TIMEZONE): string {
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau, weekday: 'long', day: '2-digit', month: 'long',
  }).format(new Date(epochSecondes * 1000));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function libelleHeure(epochSecondes: number, fuseau = TIMEZONE): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseau, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(epochSecondes * 1000));
}

export function libelleHeurePlage(debut: number, fin: number, fuseau = TIMEZONE): string {
  return `${libelleHeure(debut, fuseau)}–${libelleHeure(fin, fuseau)}`;
}

/** Clé de jour civil (YYYY-MM-DD en heure locale), pour grouper par jour. */
export function cleJour(epochSecondes: number, fuseau = TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(epochSecondes * 1000));
}

/** Minuit local du jour civil d'un horodatage. */
export function epochMinuitLocal(epochSecondes: number, fuseau = TIMEZONE): number {
  const cle = cleJour(epochSecondes, fuseau);
  const [annee, mois, jour] = cle.split('-').map(Number) as [number, number, number];
  return epochDepuisHeureLocale({annee, mois, jour}, fuseau);
}

/** Horodatage d'une date (YYYY-MM-DD) et d'une heure « HH:MM », l'heure
 *  pouvant dépasser 23:59 pour désigner un instant après minuit (une
 *  soirée qui franchit minuit, cahier des charges §2.1). */
export function epochDepuisDateEtHeure(dateISO: string, heureTexte: string, fuseau = TIMEZONE): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  const heureMatch = /^(\d{1,2}):(\d{2})$/.exec(heureTexte.trim());
  if (!dateMatch || !heureMatch) { return null; }
  const [annee, mois, jour] = [dateMatch[1], dateMatch[2], dateMatch[3]].map(Number);
  const [heures, minutes] = [heureMatch[1], heureMatch[2]].map(Number);
  return epochDepuisHeureLocale({annee: annee!, mois: mois!, jour: jour!, heures: heures!, minutes: minutes!}, fuseau);
}
