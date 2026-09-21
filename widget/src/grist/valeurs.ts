/**
 * Encodage/décodage des valeurs de cellule Grist (`CellValue`), au niveau le
 * plus bas de la couche d'accès.
 *
 * Vérifié empiriquement contre une vraie instance grist-core (v1.7.19,
 * `app/common/gristTypes.ts`) plutôt que déduit de la documentation : une
 * colonne `Ref` ou `Date`/`DateTime` stocke un scalaire (entier de ligne,
 * timestamp Unix en secondes) et se lit/s'écrit tel quel — aucun encodage
 * particulier. Une colonne `ChoiceList` (ou `RefList`, absente de ce schéma)
 * stocke en revanche une vraie liste, que SQLite ne sait pas représenter
 * nativement : elle transite donc marshalée sous forme de tuple
 * `['L', ...items]` (`GristObjCode.List`), à la fois en lecture et en
 * écriture. C'est ce dernier point, découvert par un 400 de l'API pendant
 * l'écriture de `dev/seed/`, qui a guidé ce module (voir `dev/README.md`,
 * section « Pièges »).
 *
 * Une colonne `Ref` vide se lit `0`, jamais `null` (c'est la valeur par
 * défaut SQLite d'une colonne `Ref` côté grist-core) : ce module la
 * normalise en `null` pour coller au modèle de domaine (`Id | null`).
 */

/** Valeur de cellule telle qu'échangée par l'API du plugin Grist. */
export type ValeurGrist = string | number | boolean | null | unknown[];

/** Encode un identifiant de ligne optionnel pour une colonne `Ref`. */
export function encoderRef(id: number | null): number {
  return id ?? 0;
}

/** Décode une colonne `Ref` : `0` (valeur par défaut Grist) devient `null`. */
export function decoderRef(valeur: unknown): number | null {
  return typeof valeur === 'number' && valeur !== 0 ? valeur : null;
}

/** Encode une colonne `ChoiceList` : marshalée en tuple `['L', ...items]`. */
export function encoderListe(valeurs: readonly string[]): ['L', ...string[]] {
  return ['L', ...valeurs];
}

/**
 * Décode une colonne `ChoiceList`. Une cellule jamais renseignée peut valoir
 * `null` (défaut de colonne) tout autant qu'un `['L']` explicite : les deux
 * décodent en liste vide.
 */
export function decoderListe(valeur: unknown): string[] {
  if (Array.isArray(valeur) && valeur[0] === 'L') {
    return valeur.slice(1).map(String);
  }
  return [];
}

/** Décode une colonne `Text`, en traitant `null`/`undefined` comme chaîne vide. */
export function decoderTexte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : '';
}

/** Décode une colonne `Numeric` optionnelle (`Quota_heures_max`, `Score`, ...). */
export function decoderNumeriqueOptionnel(valeur: unknown): number | null {
  return typeof valeur === 'number' ? valeur : null;
}

/** Décode une colonne `Int`/`Numeric` non optionnelle, `null`/absent valant `0`. */
export function decoderNombre(valeur: unknown): number {
  return typeof valeur === 'number' ? valeur : 0;
}

/** Décode une colonne `Bool`. */
export function decoderBool(valeur: unknown): boolean {
  return valeur === true;
}
