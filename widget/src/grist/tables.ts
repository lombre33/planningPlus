/**
 * Résolution des identifiants réels de table.
 *
 * Trouvaille empirique de ce fil (`scripts/verifier-integration.ts` contre
 * une vraie instance) : Grist peut dériver l'identifiant réel d'une table de
 * son *titre* plutôt que de l'identifiant demandé à sa création, exactement
 * comme documenté pour `dev/seed/` (voir `dev/README.md`, « Pièges »). Sur le
 * document de test généré par `dev/seed/seed.mjs`, `Positions_groupe` (le nom
 * du schéma) se retrouve ainsi sous l'identifiant réel `Positions_de_groupe`,
 * dérivé du titre « Positions de groupe » ; de même pour `Souhaits_missions`
 * → `Souhaits_de_mission`. Coder ces noms en dur dans `lecture.ts` ou
 * `ecriture.ts` casse donc silencieusement l'écriture (`KeyError` côté
 * sandbox Grist, vu en pratique) dès que le titre d'une table diffère un peu
 * de son identifiant de schéma — ce que rien n'empêche, y compris de la main
 * d'un utilisateur qui renomme une table dans Grist après coup.
 *
 * Ce module résout donc, une fois par session, l'identifiant réel de chaque
 * table attendue par ce widget, par comparaison normalisée avec son libellé
 * (le texte dont Grist dérive l'identifiant) — jamais par comparaison avec
 * l'identifiant de schéma lui-même, qui peut ne plus correspondre à rien.
 */

/** Libellé (titre) de chaque table attendue, en miroir de `dev/seed/schema.mjs` (`libelle`). */
export const LIBELLE_PAR_TABLE: Record<string, string> = {
  Equipes: 'Équipes',
  Lieux: 'Lieux',
  Benevoles: 'Bénévoles',
  Missions: 'Missions',
  Artistes: 'Artistes',
  Macro_creneaux: 'Macro-créneaux',
  Sous_creneaux: 'Sous-créneaux',
  Besoins: 'Besoins',
  Groupes: 'Groupes',
  Positions_groupe: 'Positions de groupe',
  Places: 'Places',
  Disponibilites: 'Disponibilités',
  Souhaits_missions: 'Souhaits de mission',
  Affinites: 'Affinités',
  Versions: 'Versions',
  Parametres: 'Paramètres',
  Journal: 'Journal',
};

/** Normalise pour une comparaison tolérante aux accents, à la casse et à la ponctuation. */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Résout, pour chaque table canonique connue de ce widget
 * (`LIBELLE_PAR_TABLE`), son identifiant réel dans le document ouvert. Une
 * table canonique absente du document (jamais créée) est simplement absente
 * du résultat plutôt que de lever — utile tant que le schéma bouge encore.
 */
export function resoudreIdsTables(idsReels: readonly string[]): Record<string, string> {
  const parNormalise = new Map(idsReels.map((id) => [normaliser(id), id]));
  const resolues: Record<string, string> = {};
  for (const [canonique, libelle] of Object.entries(LIBELLE_PAR_TABLE)) {
    const reel = parNormalise.get(normaliser(libelle));
    if (reel) { resolues[canonique] = reel; }
  }
  return resolues;
}
