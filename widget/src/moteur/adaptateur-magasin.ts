/**
 * Adaptateur entre le `Magasin` de l'intégration widget (`../store`,
 * `../domain/types`) et le moteur d'affectation pur de ce dossier (§7.5).
 * Remplace les fonctions provisoires `classerCandidats` et
 * `calculerAnomalies` de `../logic/derive.ts` par le vrai moteur, sans
 * toucher aux fichiers qui les appellent : mêmes signatures, même forme de
 * résultat — un changement d'import côté appelant suffit.
 *
 * « Thin » veut dire ici : aucune règle d'éligibilité ni de score n'est
 * reécrite dans ce fichier, tout vient de `./affectation` et `./anomalies`.
 * Ce fichier ne fait que la conversion de forme (Magasin <-> DonneesPlanning)
 * et la mise en forme d'affichage (tags, libellés dénormalisés) à partir des
 * résultats bruts du moteur.
 *
 * Écarts de comportement connus entre l'ancien mock et ce qui sort d'ici —
 * communiqués au fil « Interface d'affectation des bénévoles » le
 * 2026-09-21, à garder en tête avant de basculer les imports :
 *
 * 1. `classerCandidats` n'expose ici que les candidats éligibles (comme
 *    l'ancien mock) : le moteur en sait plus (`../moteur/affectation`
 *    `classerCandidats` liste aussi les inéligibles avec leur raison,
 *    §7.5.3) mais ce n'est pas dans la forme `Candidat[]` actuelle. Si une
 *    vue veut cette liste enrichie, il faut appeler le moteur directement
 *    plutôt que passer par cet adaptateur.
 * 2. `calculerAnomalies` ne peut pas représenter le 7e type du moteur,
 *    `chevauchement_creneaux` (deux sous-créneaux d'un même macro-créneau
 *    qui se recouvrent dans le temps — indépendant de tout bénévole ou
 *    place). Le type `Anomalie` de `derive.ts` n'a que six cas : tant qu'un
 *    septième cas n'y est pas ajouté (leur fichier, leur décision), cette
 *    anomalie est calculée par le moteur mais n'atteint jamais l'affichage.
 *    Elle n'est pas perdue : `moteurDetecterAnomalies` la retourne toujours,
 *    seule la conversion vers `Anomalie` (UI) l'ignore explicitement
 *    ci-dessous plutôt que de planter.
 * 3. `Magasin` ne modélise pas encore les affinités (`get affinites()`
 *    absent de `../store.ts`, alors que `Modele.affinites` existe) :
 *    `versDonneesPlanning` retourne toujours `affinites: []`, donc le bonus
 *    d'affinité du moteur (§7.2, préférence de second rang) est neutre pour
 *    l'instant à travers cet adaptateur. Pas un bug de ce fichier — à
 *    corriger le jour où `Magasin` porte cette table.
 * 4. Ce fichier ne couvre PAS le sens écriture (poser une affectation). Le
 *    fil UI a dit vouloir appeler `corrigerPlace` du moteur directement sur
 *    un `DonneesPlanning` obtenu via `versDonneesPlanning`, puis reporter le
 *    résultat dans le `Magasin` avec ses propres `assignerPlace` /
 *    `basculerVerrouillage` : à faire attention, `corrigerPlace` verrouille
 *    TOUJOURS la place corrigée (même vidée), alors que `Magasin.assignerPlace`
 *    ne touche jamais `Verrouillee` aujourd'hui — sans relayer ce
 *    verrouillage, un recalcul reprendrait la main sur une place qu'un
 *    humain vient de corriger à la main.
 */

import type {Anomalie as AnomalieUI, Candidat, Index} from '../logic/derive';
import {couvertureBesoin} from '../logic/derive';
import type {Magasin} from '../store';
import type {
  Benevole as BenevoleUI,
  Besoin as BesoinUI,
  Groupe as GroupeUI,
  Id,
  Mission as MissionUI,
  Place as PlaceUI,
  PositionGroupe as PositionGroupeUI,
  SousCreneau as SousCreneauUI,
} from '../domain/types';

import {classerCandidats as moteurClasserCandidats} from './affectation';
import {detecterAnomalies as moteurDetecterAnomalies} from './anomalies';
import type {Benevole, Besoin, DonneesPlanning, Groupe, Mission, NiveauPreferenceMission, Place, PositionGroupe, SousCreneau} from './types';

// --- Conversion Magasin -> DonneesPlanning ---------------------------------
//
// Renommage pur (colonnes PascalCase Grist -> domaine camelCase du moteur),
// mêmes valeurs de chaîne des deux côtés (voir l'en-tête de
// `../domain/types.ts` et de `./types.ts`, tous deux alignés sur
// `dev/seed/schema.mjs`) : pas de table de correspondance nécessaire.

function versBenevole(b: BenevoleUI): Benevole {
  return {
    id: b.id, nom: b.Nom, equipeId: b.Equipe, competences: b.Competences,
    quotaHeuresMin: b.Quota_heures_min, quotaHeuresMax: b.Quota_heures_max, statut: b.Statut,
  };
}

function versMission(mi: MissionUI): Mission {
  return {id: mi.id, nom: mi.Nom, equipeId: mi.Equipe, priorite: mi.Priorite, competencesRequises: mi.Competences_requises};
}

function versSousCreneau(sc: SousCreneauUI): SousCreneau {
  return {id: sc.id, macroCreneauId: sc.Macro_creneau, missionId: sc.Mission, debut: sc.Debut, fin: sc.Fin};
}

function versBesoin(b: BesoinUI): Besoin {
  return {
    id: b.id, missionId: b.Mission, sousCreneauId: b.Sous_creneau,
    effectifMin: b.Effectif_min, effectifMax: b.Effectif_max, tailleGroupe: b.Taille_groupe,
  };
}

function versGroupe(g: GroupeUI): Groupe {
  return {id: g.id, code: g.Code, taille: g.Taille, equipeId: g.Equipe};
}

function versPositionGroupe(p: PositionGroupeUI): PositionGroupe {
  return {id: p.id, groupeId: p.Groupe, besoinId: p.Besoin};
}

function versPlace(p: PlaceUI): Place {
  return {id: p.id, groupeId: p.Groupe, rang: p.Rang, benevoleId: p.Benevole, origine: p.Origine, verrouillee: p.Verrouillee, score: p.Score};
}

/**
 * Conversion pure et sans état du `Magasin` vers `DonneesPlanning`. Toujours
 * `affinites: []` — voir l'écart n°3 en tête de fichier.
 */
export function versDonneesPlanning(m: Magasin): DonneesPlanning {
  return {
    benevoles: m.benevoles.map(versBenevole),
    missions: m.missions.map(versMission),
    sousCreneaux: m.sousCreneaux.map(versSousCreneau),
    besoins: m.besoins.map(versBesoin),
    groupes: m.groupes.map(versGroupe),
    positionsGroupe: m.positionsGroupe.map(versPositionGroupe),
    places: m.places.map(versPlace),
    disponibilites: m.disponibilites.map((d) => ({
      benevoleId: d.Benevole, quartHeure: d.Quart_heure, statut: d.Statut, artisteId: d.Artiste,
    })),
    souhaitsMissions: m.souhaitsMissions.map((s) => ({benevoleId: s.Benevole, missionId: s.Mission, preference: s.Preference})),
    affinites: [],
  };
}

// --- classerCandidats --------------------------------------------------------

const ORDRE_PREFERENCE: NiveauPreferenceMission[] = ['Refuse', 'Réticent', 'Neutre', 'Intéressé', 'Souhaite fortement'];

/**
 * Remplace `derive.ts` `classerCandidats` : même signature, même forme de
 * retour (les 8 meilleurs éligibles, avec tags d'explication), mais classé
 * par le vrai moteur (`./affectation` `classerCandidats`) plutôt que par une
 * réimplémentation indépendante du score. Voir l'écart n°1 en tête de
 * fichier : les inéligibles restent filtrés ici, comme dans l'ancien mock.
 */
export function classerCandidats(m: Magasin, ix: Index, groupeId: Id, options: {exclure?: Id} = {}): Candidat[] {
  const donnees = versDonneesPlanning(m);
  const classement = moteurClasserCandidats(donnees, groupeId);

  const resultats: Candidat[] = [];
  for (const c of classement) {
    if (!c.eligible || c.score == null || c.explication == null) { continue; }
    if (options.exclure != null && c.benevoleId === options.exclure) { continue; }

    const benevole = ix.benevole.get(c.benevoleId)!;
    const equipe = ix.equipe.get(benevole.Equipe)!;
    const tags: Candidat['tags'] = [];

    if (c.explication.equipeCorrespond === true) {
      tags.push({texte: `équipe ${equipe.Nom}`, sens: 'plus'});
    } else if (c.explication.equipeCorrespond === false) {
      tags.push({texte: `hors équipe (${equipe.Nom})`, sens: 'moins'});
    }

    const meilleurSouhait = c.explication.souhaitsMission.reduce<NiveauPreferenceMission | null>((meilleur, s) => {
      if (!s.preference) { return meilleur; }
      const rang = ORDRE_PREFERENCE.indexOf(s.preference);
      const rangMeilleur = meilleur ? ORDRE_PREFERENCE.indexOf(meilleur) : -1;
      return rang > rangMeilleur ? s.preference : meilleur;
    }, null);
    if (meilleurSouhait === 'Souhaite fortement') { tags.push({texte: 'souhaite fortement', sens: 'plus'}); }
    else if (meilleurSouhait === 'Intéressé') { tags.push({texte: 'intéressé', sens: 'plus'}); }
    else if (meilleurSouhait === 'Réticent') { tags.push({texte: 'réticent', sens: 'moins'}); }

    if (c.explication.conflitArtiste) {
      tags.push({texte: 'veut voir un artiste sur ce créneau', sens: 'moins'});
    }

    if (c.explication.depasseraitQuota) {
      tags.push({texte: `dépasse son quota (${benevole.Quota_heures_max} h)`, sens: 'moins'});
    } else if (benevole.Quota_heures_min > 0 && c.explication.heuresActuelles < benevole.Quota_heures_min) {
      tags.push({texte: 'sous son quota minimum', sens: 'plus'});
    }

    resultats.push({benevoleId: c.benevoleId, nom: benevole.Nom, equipeNom: equipe.Nom, score: c.score, tags});
  }

  // Déjà trié éligibles-d'abord par score décroissant par le moteur.
  return resultats.slice(0, 8);
}

// --- calculerAnomalies -------------------------------------------------------

/**
 * Remplace `derive.ts` `calculerAnomalies` : même signature, même forme de
 * retour (six cas), mais détecté par le vrai moteur (`./anomalies`
 * `detecterAnomalies`) plutôt que par une réimplémentation indépendante.
 * Voir l'écart n°2 en tête de fichier : le 7e type du moteur
 * (`chevauchement_creneaux`) n'a pas d'équivalent dans le type `Anomalie`
 * ci-contre et est donc ignoré ici, pas perdu côté moteur.
 */
export function calculerAnomalies(m: Magasin, ix: Index): AnomalieUI[] {
  const donnees = versDonneesPlanning(m);
  const brutes = moteurDetecterAnomalies(donnees);
  const anomalies: AnomalieUI[] = [];

  for (const a of brutes) {
    switch (a.code) {
      case 'sous_effectif': {
        const besoin = ix.besoin.get(a.besoinId!)!;
        const c = couvertureBesoin(m, ix, besoin.id);
        anomalies.push({
          type: 'sous-effectif', gravite: 'danger', besoin,
          missionNom: ix.mission.get(besoin.Mission)!.Nom,
          sousCreneauLibelle: ix.sousCreneau.get(besoin.Sous_creneau)!.Libelle,
          manque: besoin.Effectif_min - c.pourvues,
        });
        break;
      }
      case 'sur_effectif': {
        const besoin = ix.besoin.get(a.besoinId!)!;
        const c = couvertureBesoin(m, ix, besoin.id);
        anomalies.push({
          type: 'sur-effectif', gravite: 'warn', besoin,
          missionNom: ix.mission.get(besoin.Mission)!.Nom,
          sousCreneauLibelle: ix.sousCreneau.get(besoin.Sous_creneau)!.Libelle,
          surplus: c.pourvues - besoin.Effectif_max,
        });
        break;
      }
      case 'souhait_refuse': {
        const place = m.places.find((p) => p.id === a.placeId)!;
        const benevole = ix.benevole.get(a.benevoleId!)!;
        const besoin = ix.besoin.get(a.besoinId!)!;
        const groupe = ix.groupe.get(place.Groupe)!;
        anomalies.push({
          type: 'souhait-refuse', gravite: 'danger', place,
          benevoleNom: benevole.Nom, missionNom: ix.mission.get(besoin.Mission)!.Nom, groupeCode: groupe.Code,
        });
        break;
      }
      case 'indisponibilite': {
        const place = m.places.find((p) => p.id === a.placeId)!;
        const benevole = ix.benevole.get(a.benevoleId!)!;
        const groupe = ix.groupe.get(place.Groupe)!;
        const sousCreneau = ix.sousCreneau.get(a.sousCreneauId!)!;
        anomalies.push({
          type: 'indisponibilite', gravite: 'danger', place,
          benevoleNom: benevole.Nom, groupeCode: groupe.Code, sousCreneauLibelle: sousCreneau.Libelle,
        });
        break;
      }
      case 'conflit_artiste': {
        const place = m.places.find((p) => p.id === a.placeId)!;
        const benevole = ix.benevole.get(a.benevoleId!)!;
        const groupe = ix.groupe.get(place.Groupe)!;
        // Le moteur ne retient que le fait qu'il y a conflit, pas le nom de
        // l'artiste visé sur ce quart précis (voir `./types.ts`
        // `ExplicationScore` / `Anomalie`) : texte générique, comme le
        // faisait déjà l'ancien mock en l'absence d'artiste identifié.
        anomalies.push({
          type: 'conflit-artiste', gravite: 'warn', place,
          benevoleNom: benevole.Nom, artisteNom: 'un artiste souhaité', groupeCode: groupe.Code,
        });
        break;
      }
      case 'chevauchement_creneaux':
        // Pas de cas correspondant dans le type `Anomalie` de `derive.ts` — voir l'écart n°2.
        break;
      case 'hors_quota': {
        const benevole = ix.benevole.get(a.benevoleId!)!;
        anomalies.push({
          type: 'hors-quota', gravite: 'warn', benevoleId: a.benevoleId!,
          benevoleNom: benevole.Nom, heures: heuresAffecteesPourAffichage(m, ix, benevole.id), quotaMax: benevole.Quota_heures_max,
        });
        break;
      }
    }
  }

  return anomalies.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === 'danger' ? -1 : 1));
}

/** Heures affectées pour l'affichage — recalculées via l'index UI plutôt que
 *  reparsées depuis le message du moteur, qui n'est pas une donnée stable. */
function heuresAffecteesPourAffichage(m: Magasin, ix: Index, benevoleId: Id): number {
  const quarts = new Set<number>();
  for (const place of m.places) {
    if (place.Benevole !== benevoleId) { continue; }
    const groupe = ix.groupe.get(place.Groupe);
    if (!groupe) { continue; }
    for (const {sousCreneau} of positionsDuGroupePourHeures(m, ix, place.Groupe)) {
      for (let t = sousCreneau.Debut; t < sousCreneau.Fin; t += 900) { quarts.add(t); }
    }
  }
  return quarts.size / 4;
}

function positionsDuGroupePourHeures(m: Magasin, ix: Index, groupeId: Id) {
  return m.positionsGroupe
    .filter((p) => p.Groupe === groupeId)
    .map((p) => ({sousCreneau: ix.sousCreneau.get(ix.besoin.get(p.Besoin)!.Sous_creneau)!}));
}
