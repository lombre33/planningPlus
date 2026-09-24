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
  Presences: 'Présences',
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
 * Regroupe les identifiants réels du document par forme normalisée — sert à
 * la fois à `resoudreIdsTables` et `ambiguitesTables` juste en dessous.
 */
function candidatsParNormalise(idsReels: readonly string[]): Map<string, string[]> {
  const candidats = new Map<string, string[]>();
  for (const id of idsReels) {
    const cle = normaliser(id);
    const liste = candidats.get(cle);
    if (liste) { liste.push(id); } else { candidats.set(cle, [id]); }
  }
  return candidats;
}

/**
 * Résout, pour chaque table canonique connue de ce widget
 * (`LIBELLE_PAR_TABLE`), son identifiant réel dans le document ouvert. Une
 * table canonique absente du document (jamais créée) est simplement absente
 * du résultat plutôt que de lever — utile tant que le schéma bouge encore.
 *
 * Deux étapes, jamais une seule comparaison normalisée directe (régression
 * corrigée le 2026-09-23, signalée par le coordinateur) :
 *  1. l'identifiant de schéma existe tel quel dans le document (cas courant :
 *     ce widget crée toujours ses tables sous cet identifiant exact) — il
 *     gagne toujours, sans même regarder les candidats normalisés ;
 *  2. sinon, repli sur la comparaison normalisée (`Positions_groupe` ->
 *     `Positions_de_groupe`, etc.), mais seulement si elle désigne un
 *     candidat unique. Constaté en pratique : une table étrangère au widget
 *     (ex. `Bene_voles`, un identifiant réel que Grist n'a pas jugé assez
 *     proche de `Benevoles` pour le suffixer, alors que notre normalisation,
 *     elle, les confond) peut normaliser vers le même libellé que la nôtre.
 *     Avant ce correctif, la dernière table rencontrée dans le document
 *     gagnait silencieusement l'identifiant canonique — potentiellement la
 *     table d'un utilisateur plutôt que la nôtre, avec le risque d'y écrire
 *     par-dessus ses données. Une table canonique ambiguë (plusieurs
 *     candidats, aucun identifiant exact) est maintenant omise du résultat
 *     plutôt que résolue au hasard — traitée comme une table absente
 *     (`main.ts` la recréera plutôt que d'écrire dans l'une des deux tables
 *     réelles en présence, jamais pire que l'existant).
 */
export function resoudreIdsTables(idsReels: readonly string[]): Record<string, string> {
  const idsReelsPresents = new Set(idsReels);
  const parNormalise = candidatsParNormalise(idsReels);
  const resolues: Record<string, string> = {};
  for (const [canonique, libelle] of Object.entries(LIBELLE_PAR_TABLE)) {
    if (idsReelsPresents.has(canonique)) { resolues[canonique] = canonique; continue; }
    const candidats = parNormalise.get(normaliser(libelle)) ?? [];
    if (candidats.length === 1) { resolues[canonique] = candidats[0]!; }
  }
  return resolues;
}

/**
 * Identifiants réels à donner à un faux `docApi.listTables()` dans un
 * double de test, plutôt que d'y coder en dur des noms de table : un test
 * qui invente ses propres identifiants (les noms de schéma, par exemple)
 * ment dans le sens rassurant dès que l'un d'eux a dérivé de son titre
 * (`Positions_groupe`/`Souhaits_missions`, voir plus haut) — un document
 * réellement complet se ferait alors passer pour incomplet, ou l'inverse.
 * Les libellés (`LIBELLE_PAR_TABLE`) conviennent tels quels : c'est le
 * texte dont Grist dérive l'identifiant réel, et `resoudreIdsTables` les
 * compare de façon normalisée, jamais à l'identifiant de schéma lui-même.
 *
 * `omettre` retire une ou plusieurs tables canoniques du résultat, pour
 * simuler un document auquel il manque une table.
 */
export function idsReelsDeTest(omettre: readonly string[] = []): string[] {
  return Object.entries(LIBELLE_PAR_TABLE)
    .filter(([canonique]) => !omettre.includes(canonique))
    .map(([, libelle]) => libelle);
}
