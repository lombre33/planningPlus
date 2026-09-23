/**
 * Calcul pur pour la saisie manuelle quart d'heure par quart d'heure d'une
 * disponibilité (cahier des charges §8 point 10, cas "disponible mais..."
 * de la réponse macro-créneau qu'`import-disponibilites.ts` ne sait pas
 * classer automatiquement). Ne mute rien : produit le nouveau jeu complet
 * de lignes pour la période éditée, à la forme attendue par un futur
 * `Magasin.remplacerDisponibilites(benevoleId, debut, fin, nouvelles)`
 * (remplacement total de la plage, cohérent avec l'absence d'id sur
 * `Disponibilite` côté domaine).
 */

import type {Disponibilite, Epoch, Id, StatutDisponibilite} from '../domain/types';

const CYCLE_CLIC: readonly StatutDisponibilite[] = ['Indisponible', 'Disponible'];

/**
 * Prochain statut lors d'un simple clic sur une case, en édition manuelle.
 * Cycle à deux états seulement : "veut voir un artiste" ne se devine
 * jamais d'un clic, il passe par une action dédiée (sélection de
 * l'artiste) qui n'est pas ce basculement. Partant d'une case "Artiste"
 * (déduite d'un import), un clic simple l'efface d'abord vers
 * "Indisponible" plutôt que de sauter directement à "Disponible".
 */
export function prochainStatutCellule(actuel: StatutDisponibilite): StatutDisponibilite {
  const indexActuel = CYCLE_CLIC.indexOf(actuel);
  return CYCLE_CLIC[(indexActuel + 1) % CYCLE_CLIC.length]!;
}

/**
 * Le nouveau jeu complet de disponibilités d'un bénévole sur `quarts`
 * (typiquement tous les quarts d'heure d'un macro-créneau), après qu'un
 * clic ait basculé `quartBascule`. Les quarts non touchés gardent leur
 * statut actuel (`Indisponible` par défaut, absence de ligne, §6.4) ; le
 * quart cliqué passe par `prochainStatutCellule`.
 */
export function disponibilitesApresBasculement(
  benevoleId: Id, quarts: readonly Epoch[], indexActuel: ReadonlyMap<Epoch, Disponibilite>, quartBascule: Epoch,
): Disponibilite[] {
  return quarts.map((quart): Disponibilite => {
    if (quart !== quartBascule) {
      return indexActuel.get(quart) ?? {Benevole: benevoleId, Quart_heure: quart, Statut: 'Indisponible', Artiste: null};
    }
    const actuel = indexActuel.get(quart)?.Statut ?? 'Indisponible';
    return {Benevole: benevoleId, Quart_heure: quart, Statut: prochainStatutCellule(actuel), Artiste: null};
  });
}

/**
 * Le nouveau jeu complet après avoir affecté (ou effacé, `artisteId: null`)
 * un souhait d'artiste explicite sur un seul quart d'heure — l'action
 * dédiée évoquée ci-dessus, distincte du clic simple.
 */
export function disponibilitesApresChoixArtiste(
  benevoleId: Id, quarts: readonly Epoch[], indexActuel: ReadonlyMap<Epoch, Disponibilite>,
  quartVise: Epoch, artisteId: Id | null,
): Disponibilite[] {
  return quarts.map((quart): Disponibilite => {
    if (quart !== quartVise) {
      return indexActuel.get(quart) ?? {Benevole: benevoleId, Quart_heure: quart, Statut: 'Indisponible', Artiste: null};
    }
    return artisteId != null
      ? {Benevole: benevoleId, Quart_heure: quart, Statut: 'Artiste', Artiste: artisteId}
      : {Benevole: benevoleId, Quart_heure: quart, Statut: 'Indisponible', Artiste: null};
  });
}
