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

export type EtatVerification = 'respecte' | 'viole' | 'sans-objet' | 'sans-donnee';

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
  const detailsAbsence = partenaireIds.map((id) => (
    benevolesAffectesAujourdhui.has(id)
      ? `${nomDe(id)} est affecté ailleurs aujourd’hui`
      : `${nomDe(id)} n’est affecté à aucun indicatif aujourd’hui`
  ));
  return {etat: 'viole', detail: `${detailsAbsence.join(' ; ')}.`};
}

function verifierArtistes(
  ix: Index, m: Magasin, benevoleId: Id, quartsAffectes: readonly number[],
): VerdictCritere {
  const artisteIds = [...new Set(
    m.disponibilites
      .filter((d) => d.Benevole === benevoleId && d.Statut === 'Artiste' && d.Artiste != null)
      .map((d) => d.Artiste!),
  )];
  if (artisteIds.length === 0) {
    return {etat: 'sans-objet', detail: 'Ne souhaite voir aucun artiste.'};
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

/**
 * Une ligne par bénévole ayant au moins une place affectée le jour donné
 * (la question porte sur « le planning proposé » : rien à vérifier pour qui
 * n'y figure pas ce jour-là). Triée par nom affiché.
 */
export function calculerChecklistBenevoles(
  m: Magasin, ix: Index, jour: Jour, nomsComplets: ReadonlyMap<Id, string>,
): LigneChecklistBenevole[] {
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
      artiste: verifierArtistes(ix, m, benevoleId, quartsAffectes),
    });
  }
  return lignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
