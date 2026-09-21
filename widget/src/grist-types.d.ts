/**
 * Déclarations minimales pour `window.grist`, tel qu'exposé par
 * `public/vendor/grist-plugin-api.js` (voir ce fichier pour la provenance).
 *
 * Seul le sous-ensemble de l'API réellement utilisé par ce widget est
 * déclaré ici, plutôt que de reproduire l'intégralité des types de
 * `grist-core`. Référence : `app/plugin/GristAPI.ts` et
 * `app/plugin/CustomSectionAPI.ts` dans les sources de grist-core.
 */

/** Niveau d'accès demandé au document lors de `grist.ready`. */
type GristAccessLevel = 'none' | 'read table' | 'full';

interface GristReadyOptions {
  requiredAccess?: GristAccessLevel;
}

/** Une ligne de table Grist : ses colonnes, plus l'identifiant `id`. */
interface GristRowRecord {
  id: number;
  [colonne: string]: unknown;
}

/** Résultat d'`applyUserActions`, tel que renvoyé par le serveur (`ApplyUAResult`). */
interface GristApplyUAResult {
  retValues: unknown[];
}

interface GristDocApi {
  listTables(): Promise<string[]>;
  fetchTable(tableId: string): Promise<Record<string, unknown[]>>;
  /** Chaque action est un tuple `[nom, ...arguments]` (`UserAction` côté grist-core). */
  applyUserActions(actions: unknown[][]): Promise<GristApplyUAResult>;
}

interface GristApi {
  ready(options?: GristReadyOptions): void;
  docApi: GristDocApi;
}

declare global {
  interface Window {
    grist: GristApi;
  }
}

export {};
