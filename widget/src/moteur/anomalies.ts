/**
 * Détection des anomalies (§7.4) : huit types exacts, deux niveaux de
 * gravité fixes (voir `GRAVITE_PAR_CODE` dans `types.ts`). Fonction de
 * lecture pure sur l'état courant — elle ne sait rien de qui a produit cet
 * état (algorithme ou correction manuelle) et peut être rejouée après
 * n'importe quelle modification (§7.5.6 : « anomalies à jour en continu »).
 */

import type {Contexte} from './contexte';
import {construireContexte} from './contexte';
import {construireEtatOccupation, heuresActuelles} from './eligibilite';
import {peutVoirArtiste, quartsDIntervalle, seChevauchent} from './temps';
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

function aUnIndicatifPositionne(ctx: Contexte, besoinId: Id): boolean {
  return ctx.donnees.positionsGroupe.some((position) => position.besoinId === besoinId);
}

/**
 * Un besoin sur lequel aucun indicatif n'a encore été positionné (étape 3,
 * §6.3, pas encore atteinte pour cette zone) n'est pas un sous-effectif :
 * c'est une zone que l'utilisateur n'a pas encore construite, pas une
 * anomalie. (Décision Antoine, 2026-09-21 : le moteur doit rester utile sur
 * un planning en cours de construction, avec des zones volontairement
 * vides, plutôt que de se plaindre d'une entrée incomplète.)
 */
function detecterEffectifs(ctx: Contexte): Anomalie[] {
  const anomalies: Anomalie[] = [];
  for (const besoin of ctx.donnees.besoins) {
    if (!aUnIndicatifPositionne(ctx, besoin.id)) { continue; }
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
  // Sert à juger la règle des 30 minutes (§7.2, 2026-09-23) sur l'ensemble
  // du planning déjà occupé par le bénévole, pas seulement ce sous-créneau
  // — même état que `evaluerEligibilite`, pour ne jamais diverger de lui.
  const etat = construireEtatOccupation(ctx);
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
        // Règle des 30 minutes (§7.2, 2026-09-23, même calcul que
        // `evaluerEligibilite`) : un souhait sans artiste identifié reste un
        // conflit par défaut, faute de passage à juger.
        const artistesSouhaites = new Set<Id>();
        let conflitArtiste = false;
        for (const q of quarts) {
          const dispo = disponibilitesDuBenevole?.get(q);
          if (dispo?.statut !== 'Artiste') { continue; }
          if (dispo.artisteId != null) { artistesSouhaites.add(dispo.artisteId); } else { conflitArtiste = true; }
        }
        if (artistesSouhaites.size > 0) {
          const quartsOccupes = etat.quartsParBenevole.get(benevoleId) ?? new Set<number>();
          for (const artisteId of artistesSouhaites) {
            const artiste = ctx.artisteParId.get(artisteId);
            if (!artiste || !peutVoirArtiste(artiste.debut, artiste.fin, quartsOccupes, ctx.parametres.pasSecondes)) {
              conflitArtiste = true;
            }
          }
        }
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

/**
 * Un bénévole affecté à deux places dont les quarts d'heure se recouvrent
 * (§7.1, règle 1 — la contrainte dure numéro un, jamais violée par
 * l'algorithme ni par `corrigerPlace`, voir `eligibilite.ts`
 * `evaluerEligibilite` raison `deja_occupe`). Ne devrait donc survenir que
 * par une édition directe des tables Grist, hors du widget : ce détecteur
 * est le filet de sécurité résiduel pour ce cas, distinct de
 * `chevauchement_creneaux` qui porte sur la structure (deux sous-créneaux),
 * pas sur qui est affecté dessus (§7.4, précision du 2026-09-21).
 */
function detecterDoubleEngagement(ctx: Contexte): Anomalie[] {
  const anomalies: Anomalie[] = [];
  const placesParBenevole = new Map<Id, typeof ctx.donnees.places>();
  for (const place of ctx.donnees.places) {
    if (place.benevoleId == null) { continue; }
    const liste = placesParBenevole.get(place.benevoleId);
    if (liste) { liste.push(place); } else { placesParBenevole.set(place.benevoleId, [place]); }
  }
  for (const [benevoleId, places] of placesParBenevole) {
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const a = places[i]!;
        const b = places[j]!;
        const quartsA = ctx.quartsParGroupe.get(a.groupeId) ?? new Set<number>();
        const quartsB = ctx.quartsParGroupe.get(b.groupeId) ?? new Set<number>();
        const chevauche = [...quartsA].some((q) => quartsB.has(q));
        if (chevauche) {
          anomalies.push({
            code: 'double_engagement',
            gravite: GRAVITE_PAR_CODE.double_engagement,
            placeId: a.id,
            groupeId: a.groupeId,
            benevoleId,
            message: `Bénévole #${benevoleId} occupe à la fois la place #${a.id} et la place #${b.id}, dont les quarts d'heure se recouvrent.`,
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
    ...detecterDoubleEngagement(ctx),
    ...detecterChevauchements(ctx),
    ...detecterHorsQuota(ctx),
  ];
}
