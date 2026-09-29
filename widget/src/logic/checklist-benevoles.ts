/**
 * Checklist de respect des souhaits, bénévole par bénévole — complément à la
 * page Anomalies demandé par Antoine le 2026-09-25 : « le planning proposé
 * respecte-t-il leur disponibilité, leur binôme, au moins 30mn de chaque
 * artiste qu'iels veulent voir ? ». Vue en lecture seule comme le reste de
 * cette page (§7.4) : elle informe, ne corrige rien — aucun score, juste ce
 * qui est respecté et ce qui ne l'est pas, en clair (précision du
 * coordinateur, 2026-09-25).
 *
 * Trois vérités déjà calculées ailleurs, jamais réécrites ici :
 * disponibilité réelle au quart d'heure (`estVraimentDisponibleAuQuart`,
 * `indexerDisponibilites`), règle des 30 minutes (`peutVoirArtiste`,
 * `moteur/temps.ts`), binôme souhaité (`Affinites` de type 'Ensemble').
 *
 * Piège à ne jamais réintroduire (demande explicite du coordinateur) : un
 * bénévole sans aucune ligne dans `Disponibilites` ne reçoit ni coche verte
 * ni croix rouge sur la colonne Disponibilité — on n'a rien vérifié, on le
 * dit (`sans-donnee`). C'est distinct d'un souhait explicitement absent
 * (binôme non déclaré, aucun artiste souhaité : `sans-objet`), qui est un
 * fait connu, pas un trou de donnée.
 *
 * Deuxième piège, trouvé par Antoine le 2026-09-25 en lisant la première
 * version (« beaucoup trop de bénévoles dont l'affinité n'est pas
 * respectée ») : un partenaire de binôme souhaité qui n'est affecté à AUCUN
 * indicatif ce jour-là (absent, pas nécessaire, ou simplement affecté un
 * autre jour) rend la paire structurellement impossible — ce n'est jamais
 * un raté du planning, l'algorithme n'avait rien à choisir. Distinct d'un
 * partenaire réellement affecté ce jour-là mais ailleurs (`viole`, un vrai
 * écart) : voir `partenaire-absent` ci-dessous. Autre cause du même
 * signalement gonflé : l'affinité `Ensemble` est symétrique ici (si A
 * souhaite B, les deux lignes sont jugées sur cette paire) — une seule paire
 * cassée compte donc double en nombre de bénévoles, d'où le compteur de
 * paires distinctes renvoyé par `calculerChecklistBenevoles`.
 *
 * Troisième piège, trouvé par Antoine le 2026-09-25 12h21 : un souhait
 * « voir cet artiste » (`Disponibilite.Statut === 'Artiste'`) se déclare
 * quart par quart sur toute la durée du festival, pas seulement le jour
 * affiché — `verifierArtistes` doit filtrer ces quarts sur le jour affiché
 * (`quarts`, même Set que pour la disponibilité et le binôme), sous peine de
 * juger un souhait d'un autre jour contre les quarts affectés du jour
 * affiché, qui ne s'en approchent jamais : toujours "respecté" à tort.
 */

import type {Id, StatutDisponibilite} from '../domain/types';
import {
  estVraimentDisponibleAuQuart, indexerDisponibilites, type Index, type Jour,
  placesDuGroupe, positionsDuGroupe, quartsDuJour, quartsDuSousCreneau,
} from './derive';
import {affectationsQuartParBenevole, type AffectationQuart} from './impression';
import {peutVoirArtiste} from '../moteur';
import {PAS_SECONDES} from '../temps';
import type {Magasin} from '../store';

export type EtatVerification = 'respecte' | 'viole' | 'sans-objet' | 'sans-donnee' | 'partenaire-absent';

export interface VerdictCritere {
  etat: EtatVerification;
  detail: string;
}

export interface LigneChecklistBenevole {
  benevoleId: Id;
  nom: string;
  disponibilite: VerdictCritere;
  binome: VerdictCritere;
  artiste: VerdictCritere;
}

/** Les indicatifs (groupes) que ce bénévole tient et qui ont au moins une
 *  position sur un quart du jour affiché — un bénévole peut tenir des
 *  groupes différents selon les jours (seule l'exclusivité par jour est une
 *  contrainte dure, voir `logic/impression.ts` `indicatifDuJour`). */
function groupesActifsCeJour(m: Magasin, ix: Index, benevoleId: Id, quarts: ReadonlySet<number>): Id[] {
  const groupeIds: Id[] = [];
  for (const place of m.places) {
    if (place.Benevole !== benevoleId) { continue; }
    const actif = positionsDuGroupe(m, ix, place.Groupe).some(
      ({sousCreneau}) => quartsDuSousCreneau(sousCreneau).some((q) => quarts.has(q)),
    );
    if (actif) { groupeIds.push(place.Groupe); }
  }
  return groupeIds;
}

/** Les coéquipiers du bénévole, tous indicatifs actifs ce jour-là confondus. */
function coequipiersCeJour(m: Magasin, ix: Index, benevoleId: Id, quarts: ReadonlySet<number>): Set<Id> {
  const coequipiers = new Set<Id>();
  for (const groupeId of groupesActifsCeJour(m, ix, benevoleId, quarts)) {
    for (const place of placesDuGroupe(m, groupeId)) {
      if (place.Benevole != null && place.Benevole !== benevoleId) { coequipiers.add(place.Benevole); }
    }
  }
  return coequipiers;
}

function verifierDisponibilite(
  m: Magasin, benevoleId: Id, quartsAffectes: readonly number[],
  indexDispoReelle: Map<string, StatutDisponibilite>,
  affectationsBenevole: ReadonlyMap<number, AffectationQuart>,
): VerdictCritere {
  const aDesDonnees = m.disponibilites.some((d) => d.Benevole === benevoleId);
  if (!aDesDonnees) {
    return {etat: 'sans-donnee', detail: 'Aucune disponibilité déclarée pour ce bénévole : impossible de vérifier.'};
  }
  const horsDispo = quartsAffectes.filter((q) => !estVraimentDisponibleAuQuart(indexDispoReelle, benevoleId, q));
  if (horsDispo.length === 0) {
    return {etat: 'respecte', detail: 'Toutes ses affectations tombent sur des quarts qu’il a déclarés disponibles.'};
  }
  const missions = [...new Set(
    horsDispo.map((q) => affectationsBenevole.get(q)?.missionNom).filter((n): n is string => n != null),
  )];
  const n = horsDispo.length;
  return {
    etat: 'viole',
    detail: `${n} quart${n > 1 ? 's' : ''} affecté${n > 1 ? 's' : ''} hors de sa disponibilité déclarée`
      + `${missions.length > 0 ? ` (${missions.slice(0, 3).join(', ')})` : ''}.`,
  };
}

function verifierBinome(
  m: Magasin, ix: Index, benevoleId: Id, nomDe: (id: Id) => string,
  quarts: ReadonlySet<number>, benevolesAffectesAujourdhui: ReadonlySet<Id>,
): VerdictCritere {
  const partenaireIds = m.affinites
    .filter((a) => a.Type === 'Ensemble' && (a.Benevole_A === benevoleId || a.Benevole_B === benevoleId))
    .map((a) => (a.Benevole_A === benevoleId ? a.Benevole_B : a.Benevole_A));
  if (partenaireIds.length === 0) {
    return {etat: 'sans-objet', detail: 'Aucun binôme souhaité déclaré.'};
  }
  const coequipiers = coequipiersCeJour(m, ix, benevoleId, quarts);
  const present = partenaireIds.find((id) => coequipiers.has(id));
  if (present != null) {
    return {etat: 'respecte', detail: `Avec ${nomDe(present)}, son binôme souhaité, sur le même indicatif.`};
  }
  // Un partenaire réellement affecté ce jour-là, mais pas avec lui, est un
  // vrai écart imputable au plan. Un partenaire absent du plan ce jour-là
  // (pas affecté du tout) n'en est pas un — voir le piège en tête de
  // fichier : ne jamais le présenter comme un défaut de l'algorithme.
  const ailleurs = partenaireIds.filter((id) => benevolesAffectesAujourdhui.has(id));
  if (ailleurs.length > 0) {
    return {
      etat: 'viole',
      detail: `${ailleurs.map((id) => `${nomDe(id)} est affecté ailleurs aujourd’hui`).join(' ; ')}.`,
    };
  }
  return {
    etat: 'partenaire-absent',
    detail: `${partenaireIds.map((id) => `${nomDe(id)} n’est affecté à aucun indicatif aujourd’hui`).join(' ; ')}`
      + ' : rien que ce planning aurait pu changer.',
  };
}

/**
 * Nombre de paires de binôme souhaité (`Affinites` de type 'Ensemble')
 * réellement cassées ce jour-là — les deux affectés, mais pas ensemble.
 * Sert à corriger la lecture des lignes `viole` de la colonne Binôme, qui
 * comptent chaque paire en double (une ligne par bénévole, §note en tête de
 * fichier) : une paire dont un membre est simplement absent du plan ce
 * jour-là n'est jamais comptée ici, ce n'est pas un écart du planning.
 */
function compterPairesBinomeCassees(
  m: Magasin, ix: Index, quarts: ReadonlySet<number>, benevolesAffectesAujourdhui: ReadonlySet<Id>,
): number {
  let n = 0;
  for (const a of m.affinites) {
    if (a.Type !== 'Ensemble') { continue; }
    if (!benevolesAffectesAujourdhui.has(a.Benevole_A) || !benevolesAffectesAujourdhui.has(a.Benevole_B)) { continue; }
    if (coequipiersCeJour(m, ix, a.Benevole_A, quarts).has(a.Benevole_B)) { continue; }
    n++;
  }
  return n;
}

function verifierArtistes(
  ix: Index, m: Magasin, benevoleId: Id, quartsAffectes: readonly number[], quarts: ReadonlySet<number>,
): VerdictCritere {
  // Un souhait « voir cet artiste » se déclare quart par quart (`Quart_heure`),
  // sur toute la durée du festival, pas seulement le jour affiché — sans ce
  // filtre, un souhait pour un artiste d'un autre jour se retrouvait jugé ici
  // contre les quarts affectés du jour affiché (qui ne s'en approchent jamais),
  // et ressortait donc toujours "respecté" à tort (Antoine, 2026-09-25 12h21).
  const artisteIds = [...new Set(
    m.disponibilites
      .filter((d) => d.Benevole === benevoleId && d.Statut === 'Artiste' && d.Artiste != null && quarts.has(d.Quart_heure))
      .map((d) => d.Artiste!),
  )];
  if (artisteIds.length === 0) {
    return {etat: 'sans-objet', detail: 'Ne souhaite voir aucun artiste ce jour-là.'};
  }
  const occupes = new Set(quartsAffectes);
  const vus: string[] = [];
  const manques: string[] = [];
  for (const artisteId of artisteIds) {
    const artiste = ix.artiste.get(artisteId);
    if (!artiste) { continue; } // référence pendante (artiste supprimé) : rien à juger pour lui
    if (peutVoirArtiste(artiste.Debut, artiste.Fin, occupes, PAS_SECONDES)) { vus.push(artiste.Nom); } else { manques.push(artiste.Nom); }
  }
  if (manques.length === 0) {
    return vus.length === 0
      ? {etat: 'sans-objet', detail: 'Ne souhaite voir aucun artiste encore référencé.'}
      : {etat: 'respecte', detail: `Au moins 30 min libres pendant le passage de ${vus.join(', ')}.`};
  }
  return {
    etat: 'viole',
    detail: `Moins de 30 min libres pendant le passage de ${manques.join(', ')}`
      + `${vus.length > 0 ? ` (mais voit bien ${vus.join(', ')})` : ''}.`,
  };
}

export interface ResultatChecklistBenevoles {
  lignes: LigneChecklistBenevole[];
  /** Voir `compterPairesBinomeCassees` : le nombre réel de paires en défaut,
   *  à distinguer du nombre de lignes `viole` sur la colonne Binôme (double
   *  chaque paire) — à afficher à côté du titre de la section. */
  pairesBinomeCassees: number;
}

/**
 * Une ligne par bénévole ayant au moins une place affectée le jour donné
 * (la question porte sur « le planning proposé » : rien à vérifier pour qui
 * n'y figure pas ce jour-là). Triée par nom affiché.
 */
export function calculerChecklistBenevoles(
  m: Magasin, ix: Index, jour: Jour, nomsComplets: ReadonlyMap<Id, string>,
): ResultatChecklistBenevoles {
  const quarts = quartsDuJour(jour);
  const affectations = affectationsQuartParBenevole(m, ix, quarts);
  const benevolesAffectesAujourdhui = new Set(affectations.keys());
  const indexDispoReelle = indexerDisponibilites(m);
  const nomDe = (id: Id) => nomsComplets.get(id) ?? ix.benevole.get(id)?.Nom ?? 'Bénévole introuvable';

  const lignes: LigneChecklistBenevole[] = [];
  for (const [benevoleId, affectationsBenevole] of affectations) {
    const benevole = ix.benevole.get(benevoleId);
    if (!benevole) { continue; } // référence pendante (édition manuelle) : ignoré, comme ailleurs dans ce fichier
    const quartsAffectes = [...affectationsBenevole.keys()];
    lignes.push({
      benevoleId,
      nom: nomDe(benevoleId),
      disponibilite: verifierDisponibilite(m, benevoleId, quartsAffectes, indexDispoReelle, affectationsBenevole),
      binome: verifierBinome(m, ix, benevoleId, nomDe, quarts, benevolesAffectesAujourdhui),
      artiste: verifierArtistes(ix, m, benevoleId, quartsAffectes, quarts),
    });
  }
  return {
    lignes: lignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    pairesBinomeCassees: compterPairesBinomeCassees(m, ix, quarts, benevolesAffectesAujourdhui),
  };
}
