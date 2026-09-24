/**
 * Noms complets des bénévoles lus directement dans la table externe
 * d'Antoine, au moment de l'affichage — jamais en repeuplant notre propre
 * table Bénévoles (demande explicite du 2026-09-24 : il refuse de relancer
 * l'import, même vérifié sans risque pour ses disponibilités, c'est sa
 * donnée et sa décision). Lecture seule stricte, comme `valeursColonneBrute`
 * (`store.ts`) dont ce module ne fait qu'assembler le résultat : jamais un
 * appel qui écrit dans sa table.
 *
 * Recherche la colonne par un nom normalisé (« Nom_prenom », « Nom prénom »,
 * accents/espaces/soulignés indifférents) plutôt qu'un `colId` exact deviné
 * à l'avance : le `colId` réel dépend de la façon dont Grist a dérivé
 * l'identifiant du libellé qu'Antoine a choisi, jamais garanti d'avance.
 * Pragmatique plutôt que général (autorisé explicitement par Antoine,
 * « hardcoder si besoin ») : pas d'écran de configuration, une seule colonne
 * cherchée.
 */

import type {Benevole, Id} from '../domain/types';
import {decoderTexte} from '../grist/valeurs';
import {CLE_COLONNE_NOM_BENEVOLES, CLE_TABLE_BENEVOLES} from './parametres-benevoles';
import type {Magasin} from '../store';

const CIBLE_COLONNE_NOM_COMPLET = 'nomprenom';

function normaliserIdentifiant(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Reconstitue, pour chaque bénévole, son nom complet trouvé dans la table
 * source — jamais deviné : `Id_source` (lien exact posé au peuplement)
 * priment toujours ; à défaut (bénévole jamais peuplé depuis cette table),
 * un repli par correspondance exacte du nom déjà connu (`nomParLigneSource`,
 * peut être `null` si l'appelant n'a pas cette information) — **seulement
 * si la correspondance est unique**, pour ne jamais attribuer le nom complet
 * d'un homonyme à un autre. Un bénévole sans nom complet trouvé est
 * simplement absent du résultat (l'appelant garde alors son `Nom` actuel).
 */
export function nomsCompletsParBenevole(
  benevoles: readonly Benevole[],
  nomCompletParLigneSource: ReadonlyMap<Id, string>,
  nomParLigneSource: ReadonlyMap<Id, string> | null,
): Map<Id, string> {
  const resultat = new Map<Id, string>();
  for (const b of benevoles) {
    if (b.Id_source != null) {
      const complet = nomCompletParLigneSource.get(b.Id_source);
      if (complet) { resultat.set(b.id, complet); }
      continue;
    }
    if (!nomParLigneSource) { continue; }
    const correspondances = [...nomParLigneSource].filter(([, nom]) => nom === b.Nom);
    if (correspondances.length === 1) {
      const complet = nomCompletParLigneSource.get(correspondances[0]![0]);
      if (complet) { resultat.set(b.id, complet); }
    }
    // 0 ou plusieurs correspondances (homonyme) : on ne devine jamais, le bénévole garde son Nom.
  }
  return resultat;
}

function versTexteParLigne(brut: ReadonlyMap<Id, unknown>): Map<Id, string> {
  const resultat = new Map<Id, string>();
  for (const [id, v] of brut) {
    const texte = decoderTexte(v).trim();
    if (texte) { resultat.set(id, texte); }
  }
  return resultat;
}

/**
 * Lit la colonne « nom complet » de la table de bénévoles externe
 * d'Antoine (désignée via `CLE_TABLE_BENEVOLES`, §6.4) et construit le nom
 * complet par bénévole — `new Map()` si aucune table n'est désignée, ou si
 * aucune colonne de ce nom n'existe dessus (rien à afficher de plus que
 * `Nom`, jamais une erreur). Un second aller-retour (colonne du nom déjà
 * utilisée au peuplement) n'a lieu que si au moins un bénévole n'a pas
 * d'`Id_source` — jamais sinon, pour ne pas lire une colonne pour rien.
 */
export async function nomsCompletsDepuisSource(m: Magasin): Promise<Map<Id, string>> {
  const tableSourceId = m.parametre(CLE_TABLE_BENEVOLES);
  if (!tableSourceId) { return new Map(); }

  const colonnes = await m.colonnesTable(tableSourceId);
  const colonneNomComplet = colonnes.find((c) => normaliserIdentifiant(c.label) === CIBLE_COLONNE_NOM_COMPLET
    || normaliserIdentifiant(c.colId) === CIBLE_COLONNE_NOM_COMPLET);
  if (!colonneNomComplet) { return new Map(); }

  const nomCompletParLigneSource = versTexteParLigne(await m.valeursColonneBrute(tableSourceId, colonneNomComplet.colId));
  if (nomCompletParLigneSource.size === 0) { return new Map(); }

  const colNomId = m.parametre(CLE_COLONNE_NOM_BENEVOLES);
  const aBesoinDuRepli = colNomId != null && m.benevoles.some((b) => b.Id_source == null);
  const nomParLigneSource = aBesoinDuRepli
    ? versTexteParLigne(await m.valeursColonneBrute(tableSourceId, colNomId))
    : null;

  return nomsCompletsParBenevole(m.benevoles, nomCompletParLigneSource, nomParLigneSource);
}
