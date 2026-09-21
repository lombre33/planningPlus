/**
 * Détection des anomalies (§7.4) : sept types exacts, deux niveaux de
 * gravité fixes (voir `GRAVITE_PAR_CODE` dans `types.ts`). Fonction de
 * lecture pure sur l'état courant — elle ne sait rien de qui a produit cet
 * état (algorithme ou correction manuelle) et peut être rejouée après
 * n'importe quelle modification (§7.5.6 : « anomalies à jour en continu »).
 */

import type {Contexte} from './contexte';
import {construireContexte} from './contexte';
import {construireEtatOccupation, heuresActuelles} from './eligibilite';
import {quartsDIntervalle, seChevauchent} from './temps';
import type {Anomalie, DonneesPlanning, Id, ParametresAlgorithme} from './types';
import {GRAVITE_PAR_CODE, PARAMETRES_PAR_DEFAUT} from './types';

function couvertureBesoin(ctx: Contexte, besoinId: Id): number {
  let total = 0;
  for (const position of ctx.donnees.positionsGroupe) {
    if (position.besoinId !== besoinId) { continue; }
    for (const place of ctx.placesParGroupe.get(position.groupeId) ?? []) {
      if (place.benevoleId != null) { total++; }
    }
  }
  return total;
}

function detecterEffectifs(ctx: Contexte): Anomalie[] {
  const anomalies: Anomalie[] = [];
  for (const besoin of ctx.donnees.besoins) {
    const couverture = couvertureBesoin(ctx, besoin.id);
    if (couverture < besoin.effectifMin) {
      anomalies.push({
        code: 'sous_effectif',
        gravite: GRAVITE_PAR_CODE.sous_effectif,
        besoinId: besoin.id,
        message: `Besoin #${besoin.id} : ${couverture} bénévole(s) affecté(s) pour un minimum de ${besoin.effectifMin}.`,
      });
    }
    if (couverture > besoin.effectifMax) {
      anomalies.push({
        code: 'sur_effectif',
        gravite: GRAVITE_PAR_CODE.sur_effectif,
        besoinId: besoin.id,
        message: `Besoin #${besoin.id} : ${couverture} bénévole(s) affecté(s) pour un maximum de ${besoin.effectifMax}.`,
      });
    }
  }
  return anomalies;
}

/** Souhait refusé, indisponibilité et conflit artiste : un passage par place pourvue et par position de son groupe. */
function detecterViolationsParPlace(ctx: Contexte): Anomalie[] {
  const anomalies: Anomalie[] = [];
  for (const place of ctx.donnees.places) {
    if (place.benevoleId == null) { continue; }
    const benevoleId = place.benevoleId;
    const positions = ctx.positionsParGroupe.get(place.groupeId) ?? [];
    const disponibilitesDuBenevole = ctx.disponibiliteParBenevoleEtQuart.get(benevoleId);

    for (const position of positions) {
      const besoin = ctx.besoinParId.get(position.besoinId);
      if (!besoin) { continue; }
      const mission = ctx.missionParId.get(besoin.missionId);
      const sousCreneau = ctx.sousCreneauParId.get(besoin.sousCreneauId);

      if (mission) {
        const souhait = ctx.souhaitParBenevoleEtMission.get(`${benevoleId}:${mission.id}`);
        if (souhait?.preference === 'Refuse') {
          anomalies.push({
            code: 'souhait_refuse',
            gravite: GRAVITE_PAR_CODE.souhait_refuse,
            placeId: place.id,
            groupeId: place.groupeId,
            besoinId: besoin.id,
            benevoleId,
            message: `Bénévole #${benevoleId} occupe la place #${place.id} sur la mission #${mission.id}, qu'il a explicitement refusée.`,
          });
        }
      }

      if (sousCreneau) {
        const quarts = quartsDIntervalle(sousCreneau.debut, sousCreneau.fin, ctx.parametres.pasSecondes);
        const indisponible = quarts.some((q) => (disponibilitesDuBenevole?.get(q)?.statut ?? 'Indisponible') === 'Indisponible');
        const conflitArtiste = quarts.some((q) => disponibilitesDuBenevole?.get(q)?.statut === 'Artiste');
        if (indisponible) {
          anomalies.push({
            code: 'indisponibilite',
            gravite: GRAVITE_PAR_CODE.indisponibilite,
            placeId: place.id,
            groupeId: place.groupeId,
            besoinId: besoin.id,
            benevoleId,
            sousCreneauId: sousCreneau.id,
            message: `Bénévole #${benevoleId} occupe la place #${place.id} sur le sous-créneau #${sousCreneau.id} alors qu'il y est indisponible.`,
          });
        }
        if (conflitArtiste) {
          anomalies.push({
            code: 'conflit_artiste',
            gravite: GRAVITE_PAR_CODE.conflit_artiste,
            placeId: place.id,
            groupeId: place.groupeId,
            besoinId: besoin.id,
            benevoleId,
            sousCreneauId: sousCreneau.id,
            message: `Bénévole #${benevoleId} occupe la place #${place.id} pendant le sous-créneau #${sousCreneau.id}, où il voulait voir un artiste.`,
          });
        }
      }
    }
  }
  return anomalies;
}

/** Deux sous-créneaux d'un même macro-créneau qui se chevauchent (§6.2, décidé mais toléré). */
function detecterChevauchements(ctx: Contexte): Anomalie[] {
  const anomalies: Anomalie[] = [];
  const parMacro = new Map<Id, typeof ctx.donnees.sousCreneaux>();
  for (const sousCreneau of ctx.donnees.sousCreneaux) {
    const liste = parMacro.get(sousCreneau.macroCreneauId);
    if (liste) { liste.push(sousCreneau); } else { parMacro.set(sousCreneau.macroCreneauId, [sousCreneau]); }
  }
  for (const sousCreneaux of parMacro.values()) {
    for (let i = 0; i < sousCreneaux.length; i++) {
      for (let j = i + 1; j < sousCreneaux.length; j++) {
        const a = sousCreneaux[i]!;
        const b = sousCreneaux[j]!;
        if (seChevauchent(a.debut, a.fin, b.debut, b.fin)) {
          anomalies.push({
            code: 'chevauchement_creneaux',
            gravite: GRAVITE_PAR_CODE.chevauchement_creneaux,
            sousCreneauId: a.id,
            message: `Le sous-créneau #${a.id} chevauche le sous-créneau #${b.id} dans le même macro-créneau.`,
          });
        }
      }
    }
  }
  return anomalies;
}

function detecterHorsQuota(ctx: Contexte): Anomalie[] {
  const anomalies: Anomalie[] = [];
  const etat = construireEtatOccupation(ctx);
  for (const benevole of ctx.donnees.benevoles) {
    if (benevole.quotaHeuresMax == null) { continue; }
    const heures = heuresActuelles(etat, ctx, benevole.id);
    if (heures > benevole.quotaHeuresMax) {
      anomalies.push({
        code: 'hors_quota',
        gravite: GRAVITE_PAR_CODE.hors_quota,
        benevoleId: benevole.id,
        message: `Bénévole #${benevole.id} : ${heures.toFixed(2)} h affectées pour un quota maximum de ${benevole.quotaHeuresMax} h.`,
      });
    }
  }
  return anomalies;
}

export function detecterAnomalies(
  donnees: DonneesPlanning,
  parametres: ParametresAlgorithme = PARAMETRES_PAR_DEFAUT,
): Anomalie[] {
  const ctx = construireContexte(donnees, parametres);
  return [
    ...detecterEffectifs(ctx),
    ...detecterViolationsParPlace(ctx),
    ...detecterChevauchements(ctx),
    ...detecterHorsQuota(ctx),
  ];
}
