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
 * 2. (Résolu le 2026-09-21) `calculerAnomalies` couvre maintenant les huit
 *    types : `derive.ts` a ajouté les cas `chevauchement-creneaux` et
 *    `double-engagement`, ce fichier les convertit ci-dessous comme les six
 *    autres.
 * 3. (Résolu le 2026-09-23) Antoine a confirmé sa priorité 3 (« le fait
 *    qu'il soit avec l'autre bénévole souhaité ») : `versDonneesPlanning`
 *    convertit maintenant réellement `Magasin.affinites` au lieu de
 *    renvoyer `affinites: []` — voir la note mise à jour dans `./types.ts`.
 * 4. (Résolu le 2026-09-21) `Magasin.assignerPlace` verrouille désormais
 *    systématiquement la place sur une origine `'Manuel'` (même vidée),
 *    exactement comme `corrigerPlace` du moteur : plus de risque qu'un
 *    recalcul reprenne la main sur une correction manuelle faute de relais
 *    du verrouillage.
 */

import type {Anomalie as AnomalieUI, Candidat, Index} from '../logic/derive';
import {couvertureBesoin, missionsCouvertesParGroupe, positionsDuGroupe} from '../logic/derive';
import type {Magasin} from '../store';
import type {
  Affinite as AffiniteUI,
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
import type {
  Affinite, Benevole, Besoin, DonneesPlanning, Groupe, Mission, NiveauPreferenceMission, Place, PositionGroupe,
  RaisonInEligibilite, SousCreneau,
} from './types';

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

function versAffinite(a: AffiniteUI): Affinite {
  return {benevoleAId: a.Benevole_A, benevoleBId: a.Benevole_B, type: a.Type};
}

/** Conversion pure et sans état du `Magasin` vers `DonneesPlanning`. */
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
    affinites: m.affinites.map(versAffinite),
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
export function classerCandidats(
  m: Magasin, ix: Index, groupeId: Id, options: {exclure?: Id; placeIdCible?: Id} = {},
): Candidat[] {
  const donnees = versDonneesPlanning(m);
  // `placeIdCible` libère d'abord l'occupant actuel de cette place (voir le
  // moteur, `classerCandidats`) : sans ça, l'occupant d'une place déjà
  // pourvue est toujours exclu de son propre classement (« deja_occupe »),
  // ce qui empêche d'expliquer pourquoi il est là (`views/affectation.ts`).
  const classement = moteurClasserCandidats(donnees, groupeId, options.placeIdCible);

  const resultats: Candidat[] = [];
  for (const c of classement) {
    if (!c.eligible || c.score == null || c.explication == null) { continue; }
    if (options.exclure != null && c.benevoleId === options.exclure) { continue; }

    const benevole = ix.benevole.get(c.benevoleId)!;
    // `equipe` peut être `undefined` si le bénévole porte une référence
    // d'équipe orpheline (vue confirmée cassée sur le banc le 2026-09-23,
    // même défaut que `rosterCard` dans `views/affectation.ts`) — ce
    // classement est appelé pour chaque place affichée, donc un seul
    // candidat orphelin plantait tout l'écran, pas seulement sa carte.
    const equipe = ix.equipe.get(benevole.Equipe);
    const tags: Candidat['tags'] = [];

    if (c.explication.equipeCorrespond === true) {
      tags.push({texte: `équipe ${equipe?.Nom ?? '?'}`, sens: 'plus'});
    } else if (c.explication.equipeCorrespond === false) {
      tags.push({texte: `hors équipe (${equipe?.Nom ?? '?'})`, sens: 'moins'});
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

    // Le binôme souhaité (§7.2 objectif 2, devant l'artiste depuis le
    // 2026-09-23) est ce qui peut faire accepter le conflit artiste
    // ci-dessous : les deux tags doivent donc pouvoir apparaître ensemble,
    // pour qu'on lise « avec son binôme, au prix de l'artiste » plutôt que
    // de ne voir que le sacrifice.
    if (c.explication.affinite === 'positive') {
      tags.push({texte: 'binôme souhaité', sens: 'plus'});
    } else if (c.explication.affinite === 'negative') {
      tags.push({texte: 'binôme à éviter', sens: 'moins'});
    }

    if (c.explication.conflitArtiste) {
      tags.push({texte: 'veut voir un artiste sur ce créneau', sens: 'moins'});
    }

    if (c.explication.depasseraitQuota) {
      tags.push({texte: `dépasse son quota (${benevole.Quota_heures_max} h)`, sens: 'moins'});
    } else if (benevole.Quota_heures_min > 0 && c.explication.heuresActuelles < benevole.Quota_heures_min) {
      tags.push({texte: 'sous son quota minimum', sens: 'plus'});
    }

    resultats.push({benevoleId: c.benevoleId, nom: benevole.Nom, equipeNom: equipe?.Nom ?? '?', score: c.score, tags});
  }

  // Déjà trié éligibles-d'abord par score décroissant par le moteur.
  return resultats.slice(0, 8);
}

// --- raisonsPlaceVide --------------------------------------------------------

const LIBELLE_RAISON: Record<RaisonInEligibilite, string> = {
  indisponible: 'personne de disponible sur ce créneau',
  competence_manquante: "personne n'a la compétence requise",
  deja_occupe: 'les bénévoles disponibles sont déjà occupés ailleurs sur ce créneau',
  autre_indicatif_meme_jour: 'les bénévoles disponibles tiennent déjà un autre indicatif ce jour-là',
  refus_mission: 'les bénévoles disponibles ont refusé cette mission',
  statut_absent: 'les seuls bénévoles qui conviendraient sont marqués absents',
};

/**
 * Pourquoi une place reste vide, en langage métier (question du
 * coordinateur, 2026-09-23 : le pendant de l'explicabilité d'une
 * affectation, côté échec cette fois — écart n°1 noté en tête de fichier,
 * jamais exploité jusqu'ici). Le moteur sait déjà pourquoi chaque bénévole
 * est inéligible (`raison`, §7.5.3) ; cette fonction agrège ces raisons sur
 * tout le groupe en une ou deux phrases courtes, au lieu de forcer
 * l'utilisateur à deviner depuis un simple compteur de sous-effectifs.
 */
export function raisonsPlaceVide(m: Magasin, groupeId: Id): string[] {
  const donnees = versDonneesPlanning(m);
  // Cas particulier : sans aucun bénévole importé, le moteur n'a personne à
  // classer, donc aucune `raison` d'inéligibilité n'est jamais produite — la
  // boucle ci-dessous resterait silencieuse (§7.5.3, écart trouvé sur le
  // banc le 2026-09-23 en rejouant l'état d'Antoine : zéro bénévole importé,
  // la page semblait ne rien faire faute d'explication).
  if (donnees.benevoles.length === 0) {
    return ['aucun bénévole importé'];
  }
  const classement = moteurClasserCandidats(donnees, groupeId);
  const eligibles = classement.filter((c) => c.eligible);

  if (eligibles.length > 0) {
    // Des candidats existent mais tous en conflit avec un souhait « voir un
    // artiste » (§7.2 objectif 7) : non utilisés ici car pas nécessaires
    // pour l'effectif minimum de ce besoin (voir `estNecessairePourMinimum`).
    if (eligibles.every((c) => c.explication?.conflitArtiste)) {
      return ['un binôme existe mais uniquement en conflit avec un souhait « voir un artiste », pas nécessaire ici'];
    }
    return []; // un candidat propre existe : ne devrait pas arriver sur une place restée vide
  }

  const raisons = new Set<RaisonInEligibilite>();
  for (const c of classement) {
    if (!c.eligible && c.raison) { raisons.add(c.raison); }
  }
  return [...raisons].map((r) => LIBELLE_RAISON[r]);
}

// --- proposerPermutation (Jour J) -------------------------------------------

export interface EtapePermutation {
  benevoleId: Id;
  benevoleNom: string;
  place: PlaceUI;
  groupeCode: string;
  depuisMissionNom: string | null; // null = candidat frais, ne quitte aucune autre place
  versMissionNom: string;
}

/**
 * Remplace `derive.ts` `proposerPermutation` (déménagé ici le 2026-09-23) :
 * même signature, même comportement — cherche une permutation à un cran
 * pour repourvoir `placeVacanteId` quand aucun remplaçant direct propre
 * n'existe (§7.3), en déplaçant un bénévole déjà affecté ailleurs sur un
 * besoin qui resterait couvert sans lui, puis en cherchant un candidat
 * frais pour la place qu'il libère à son tour. Classe désormais ses
 * candidats via `classerCandidats` ci-dessus (le vrai moteur) plutôt que
 * via l'ancien mock de `derive.ts` : sans ce déménagement, la chaîne de
 * permutation proposée en Jour J ignorait l'affinité (priorité 3
 * d'Antoine) alors que les remplaçants directs la respectent déjà. Ne
 * modifie rien : c'est à l'appelant de valider.
 */
export function proposerPermutation(m: Magasin, ix: Index, placeVacanteId: Id): EtapePermutation[] | null {
  const placeVacante = m.places.find((p) => p.id === placeVacanteId);
  if (!placeVacante) { return null; }
  const groupeCible = ix.groupe.get(placeVacante.Groupe)!;
  const missionCible = missionsCouvertesParGroupe(m, ix, groupeCible.id)
    .map((id) => ix.mission.get(id)!)[0];

  const directs = classerCandidats(m, ix, groupeCible.id);
  const meilleurDirect = directs[0];
  const direct = meilleurDirect && !meilleurDirect.tags.some((t) => t.sens === 'moins');
  if (direct) { return null; } // un remplaçant propre existe déjà, inutile de permuter

  for (const donneur of m.places) {
    if (donneur.Benevole == null || donneur.Verrouillee || donneur.id === placeVacanteId) { continue; }
    const groupeDonneur = ix.groupe.get(donneur.Groupe)!;
    if (groupeDonneur.id === groupeCible.id) { continue; }

    // Le groupe donneur ne doit pas tomber sous le minimum une fois ce
    // bénévole retiré : on vérifie chacun de ses besoins positionnés.
    const resteAuDessusDuMinimum = positionsDuGroupe(m, ix, groupeDonneur.id).every(({besoin}) => {
      const c = couvertureBesoin(m, ix, besoin.id);
      return c.pourvues - 1 >= besoin.Effectif_min;
    });
    if (!resteAuDessusDuMinimum) { continue; }

    // Le donneur doit lui-même être un candidat propre (sans motif négatif)
    // pour la place cible, sans quoi la permutation ne résout rien. On libère
    // d'abord sa propre place (`placeIdCible: donneur.id`, même mécanisme que
    // ci-dessus) : sinon l'exclusivité par jour (§7.1, 2026-09-23) le
    // disqualifierait toujours pour un groupe cible du même jour que celui
    // qu'il est justement en train de quitter.
    const evalCible = classerCandidats(m, ix, groupeCible.id, {placeIdCible: donneur.id})
      .find((c) => c.benevoleId === donneur.Benevole);
    if (!evalCible || evalCible.tags.some((t) => t.sens === 'moins')) { continue; }

    const candidatsPourDonneur = classerCandidats(m, ix, groupeDonneur.id, {exclure: donneur.Benevole});
    if (candidatsPourDonneur.length === 0) { continue; }
    const remplacant = candidatsPourDonneur[0]!;

    const benevoleDonneur = ix.benevole.get(donneur.Benevole)!;
    const missionDonneur = missionsCouvertesParGroupe(m, ix, groupeDonneur.id).map((id) => ix.mission.get(id)!)[0];

    return [
      {
        benevoleId: benevoleDonneur.id, benevoleNom: benevoleDonneur.Nom, place: placeVacante,
        groupeCode: groupeCible.Code,
        depuisMissionNom: missionDonneur?.Nom ?? groupeDonneur.Code,
        versMissionNom: missionCible?.Nom ?? groupeCible.Code,
      },
      {
        benevoleId: remplacant.benevoleId, benevoleNom: remplacant.nom, place: donneur,
        groupeCode: groupeDonneur.Code,
        depuisMissionNom: null,
        versMissionNom: missionDonneur?.Nom ?? groupeDonneur.Code,
      },
    ];
  }
  return null;
}

// --- calculerAnomalies -------------------------------------------------------

/**
 * Remplace `derive.ts` `calculerAnomalies` : même signature, même forme de
 * retour (les huit cas), mais détecté par le vrai moteur (`./anomalies`
 * `detecterAnomalies`) plutôt que par une réimplémentation indépendante.
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
      case 'chevauchement_creneaux': {
        const sousCreneau = ix.sousCreneau.get(a.sousCreneauId!)!;
        anomalies.push({type: 'chevauchement-creneaux', gravite: 'warn', sousCreneau});
        break;
      }
      case 'double_engagement': {
        const benevole = ix.benevole.get(a.benevoleId!)!;
        anomalies.push({type: 'double-engagement', gravite: 'danger', benevoleId: benevole.id, benevoleNom: benevole.Nom});
        break;
      }
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
