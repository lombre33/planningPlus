/**
 * La journée telle que la voit la table d'affectation (étape 5, maquette B
 * validée par Antoine le 2026-09-29) : ses indicatifs et leurs places, qui
 * est libre ou pointé absent, et les trois compteurs qui disent ce que vaut
 * le planning du jour dans son ordre de priorité du 2026-09-25 — places
 * couvertes, binômes souhaités réunis, artistes souhaités vus (au moins
 * 30 minutes libres pendant le passage, `peutVoirArtiste` du moteur).
 *
 * Aucune fonction ici ne mute le magasin. `m` peut être le magasin réel ou
 * un brouillon (`logic/brouillon.js`) : seuls ses tableaux sont lus.
 */

import {
  benevolesDisponiblesCeJour, heuresAffectees, indexer, positionsDuGroupe, quartsDuJour, quartsDuSousCreneau,
} from './derive.js';
import {peutVoirArtiste, seChevauchent} from '../moteur/index.js';
import {PAS_SECONDES} from '../temps.js';

/** Même convention que le moteur (`estMissionRestauration`, `moteur/eligibilite.js`) :
 *  seul souhait de mission encore pris en compte (Antoine, 2026-09-25). */
const estRestauration = (mission) => /restauration/i.test(mission.Nom);
const PREFERENCES_POSITIVES = new Set(['Intéressé', 'Souhaite fortement']);

export const clePaire = (a, b) => (a <= b ? `${a}:${b}` : `${b}:${a}`);
export const cleSouhait = (benevoleId, artisteId) => `${benevoleId}>${artisteId}`;

/** Jour de festival affiché : celui du macro-créneau choisi dans le bandeau
 *  commun, sinon le premier (même règle que les autres vues). */
export function jourAffiche(jours, macroCreneauSelectionne) {
  return jours.find((j) => j.macros.some((ma) => ma.id === macroCreneauSelectionne)) ?? jours[0] ?? null;
}

/**
 * Tout ce que la table affiche d'un jour, calculé une fois par rendu.
 * `occupantParPlace` reflète `m.places` ; les scénarios en dérivent des
 * variantes (`appliquerMouvements`) sans jamais toucher au magasin.
 */
export function construireJournee(m, jour) {
  const ix = indexer(m);
  const quarts = quartsDuJour(jour);
  const macroIds = new Set((jour?.macros ?? []).map((ma) => ma.id));
  const debut = Math.min(...(jour?.macros ?? []).map((ma) => ma.Debut));
  const fin = Math.max(...(jour?.macros ?? []).map((ma) => ma.Fin));

  const groupes = [];
  for (const groupe of m.groupes) {
    const positions = positionsDuGroupe(m, ix, groupe.id)
      .filter(({sousCreneau}) => macroIds.has(sousCreneau.Macro_creneau))
      .map(({besoin, sousCreneau}) => ({besoin, sousCreneau, mission: ix.mission.get(besoin.Mission) ?? null}));
    if (positions.length === 0) { continue; }
    const quartsGroupe = new Set();
    for (const {sousCreneau} of positions) {
      for (const q of quartsDuSousCreneau(sousCreneau)) { quartsGroupe.add(q); }
    }
    groupes.push({
      groupe,
      positions,
      quarts: quartsGroupe,
      critique: positions.some((p) => p.mission?.Priorite === 'Critique'),
      restauration: positions.some((p) => p.mission != null && estRestauration(p.mission)),
      places: m.places.filter((p) => p.Groupe === groupe.id).sort((a, b) => a.Rang - b.Rang),
    });
  }
  groupes.sort((a, b) => a.groupe.Code.localeCompare(b.groupe.Code, 'fr', {numeric: true}));

  const placeParId = new Map();
  const groupeDePlace = new Map();
  const occupantParPlace = new Map();
  for (const g of groupes) {
    for (const place of g.places) {
      placeParId.set(place.id, place);
      groupeDePlace.set(place.id, g);
      occupantParPlace.set(place.id, place.Benevole ?? null);
    }
  }

  const cleJour = jour?.cle ?? null;
  const absents = new Set();
  const presents = new Set();
  for (const p of m.presences ?? []) {
    if (p.Jour !== cleJour) { continue; }
    (p.Present ? presents : absents).add(p.Benevole);
  }
  // Un désistement (Bénévoles › Désistements) vaut absence tous les jours :
  // ses places non verrouillées sont déjà vidées ; une place verrouillée
  // reste à son nom et passe « à couvrir », comme celle d'un absent à l'appel.
  const desistes = new Set(m.benevoles.filter((b) => b.Statut === 'Absent').map((b) => b.id));
  for (const b of desistes) { absents.add(b); presents.delete(b); }

  const duJour = benevolesDisponiblesCeJour(m, quarts);
  const tenus = new Set();
  for (const b of occupantParPlace.values()) { if (b != null) { duJour.add(b); tenus.add(b); } }
  for (const b of [...duJour]) {
    // Un désisté sans place ce jour n'a rien à faire dans la table.
    if (!ix.benevole.has(b) || (desistes.has(b) && !tenus.has(b))) { duJour.delete(b); }
  }
  const comptes = (b) => duJour.has(b) && !absents.has(b);

  const paires = [];
  const vues = new Set();
  for (const a of m.affinites) {
    if (a.Type !== 'Ensemble' || a.Benevole_A === a.Benevole_B) { continue; }
    const cle = clePaire(a.Benevole_A, a.Benevole_B);
    if (vues.has(cle) || !comptes(a.Benevole_A) || !comptes(a.Benevole_B)) { continue; }
    vues.add(cle);
    paires.push([a.Benevole_A, a.Benevole_B]);
  }

  // Un souhait « voir cet artiste » se déclare quart par quart sur tout le
  // festival : seuls ceux d'un quart du jour affiché comptent (règle née de
  // la PR #21).
  const souhaits = new Map();
  for (const d of m.disponibilites) {
    if (d.Statut !== 'Artiste' || d.Artiste == null || !quarts.has(d.Quart_heure)) { continue; }
    if (!comptes(d.Benevole) || !ix.artiste.has(d.Artiste)) { continue; }
    const liste = souhaits.get(d.Benevole) ?? new Set();
    liste.add(d.Artiste);
    souhaits.set(d.Benevole, liste);
  }

  const restauSouhaitee = new Set();
  for (const s of m.souhaitsMissions) {
    const mission = ix.mission.get(s.Mission);
    if (mission && estRestauration(mission) && PREFERENCES_POSITIVES.has(s.Preference) && comptes(s.Benevole)) {
      restauSouhaitee.add(s.Benevole);
    }
  }

  const partenaires = new Map();
  for (const [a, b] of paires) {
    partenaires.set(a, [...(partenaires.get(a) ?? []), b]);
    partenaires.set(b, [...(partenaires.get(b) ?? []), a]);
  }

  return {
    m, ix, jour, quarts, macroIds, debut, fin,
    groupes, placeParId, groupeDePlace, occupantParPlace,
    absents, presents, desistes, duJour, paires, partenaires, souhaits, restauSouhaitee,
  };
}

/** Une place est à couvrir si elle est vide ou tenue par un absent à l'appel :
 *  l'appel ne libère aucune place (choix d'Antoine du 2026-09-24). */
export function estACouvrir(journee, occupant) {
  return occupant == null || journee.absents.has(occupant);
}

/** Places du jour tenues par chaque bénévole présent, pour une occupation donnée. */
function groupesParBenevole(journee, occupant, seulement) {
  const resultat = new Map();
  for (const [placeId, b] of occupant) {
    if (b == null || journee.absents.has(b)) { continue; }
    if (seulement && !seulement.has(b)) { continue; }
    const g = journee.groupeDePlace.get(placeId);
    if (!g) { continue; }
    const liste = resultat.get(b) ?? [];
    liste.push(g);
    resultat.set(b, liste);
  }
  return resultat;
}

function partagentUnIndicatif(groupes, a, b) {
  const ga = groupes.get(a);
  const gb = groupes.get(b);
  return ga != null && gb != null && ga.some((g) => gb.includes(g));
}

function voitArtiste(journee, groupes, benevoleId, artisteId) {
  const artiste = journee.ix.artiste.get(artisteId);
  const occupes = new Set();
  for (const g of groupes.get(benevoleId) ?? []) {
    for (const q of g.quarts) { occupes.add(q); }
  }
  return peutVoirArtiste(artiste.Debut, artiste.Fin, occupes, PAS_SECONDES);
}

/**
 * Compteurs du jour pour une occupation (par défaut celle du magasin). Si
 * `seulement` est fourni, ne juge que les binômes, souhaits et restaurations
 * de ces bénévoles (évaluation d'un scénario, voir `evaluerMouvements`).
 */
export function mesurer(journee, occupant = journee.occupantParPlace, seulement = null) {
  let totalPlaces = 0;
  const aCouvrir = [];
  for (const [placeId, b] of occupant) {
    totalPlaces++;
    if (estACouvrir(journee, b)) { aCouvrir.push(placeId); }
  }
  let concernes = seulement;
  if (seulement) {
    concernes = new Set(seulement);
    for (const b of seulement) { for (const p of journee.partenaires.get(b) ?? []) { concernes.add(p); } }
  }
  const groupes = groupesParBenevole(journee, occupant, concernes);

  const pairesRespectees = new Set();
  let binomesTotal = 0;
  for (const [a, b] of journee.paires) {
    if (seulement && !seulement.has(a) && !seulement.has(b)) { continue; }
    binomesTotal++;
    if (partagentUnIndicatif(groupes, a, b)) { pairesRespectees.add(clePaire(a, b)); }
  }

  const souhaitsVus = new Set();
  let artistesTotal = 0;
  for (const [b, artistes] of journee.souhaits) {
    if (seulement && !seulement.has(b)) { continue; }
    for (const a of artistes) {
      artistesTotal++;
      if (voitArtiste(journee, groupes, b, a)) { souhaitsVus.add(cleSouhait(b, a)); }
    }
  }

  const restauTenue = new Set();
  for (const b of journee.restauSouhaitee) {
    if (seulement && !seulement.has(b)) { continue; }
    if ((groupes.get(b) ?? []).some((g) => g.restauration)) { restauTenue.add(b); }
  }

  return {
    totalPlaces,
    couvertes: totalPlaces - aCouvrir.length,
    aCouvrir,
    binomes: pairesRespectees.size,
    binomesTotal,
    pairesRespectees,
    artistes: souhaitsVus.size,
    artistesTotal,
    souhaitsVus,
    restauTenue,
  };
}

/** Pour un bénévole présent : chaque artiste qu'il veut voir ce jour, vu ou raté. */
export function souhaitsDuBenevole(journee, occupant, benevoleId) {
  const groupes = groupesParBenevole(journee, occupant, new Set([benevoleId]));
  return [...(journee.souhaits.get(benevoleId) ?? [])].map((artisteId) => ({
    artiste: journee.ix.artiste.get(artisteId),
    vu: voitArtiste(journee, groupes, benevoleId, artisteId),
  }));
}

/** Pour un bénévole présent : chaque binôme souhaité du jour, réuni ou non, et où est l'autre. */
export function binomesDuBenevole(journee, occupant, benevoleId) {
  const partenaires = journee.partenaires.get(benevoleId) ?? [];
  const groupes = groupesParBenevole(journee, occupant, new Set([benevoleId, ...partenaires]));
  return partenaires.map((partenaireId) => ({
    partenaireId,
    reunis: partagentUnIndicatif(groupes, benevoleId, partenaireId),
    codes: (groupes.get(partenaireId) ?? []).map((g) => g.groupe.Code),
  }));
}

/**
 * Ce que signalait la page Anomalies, ramené au jour affiché et à une
 * occupation (brouillon, aperçu) : l'entrée Anomalies disparaît et ses
 * signalements passent dans la table (ménage choisi par Antoine le
 * 2026-09-29). Mêmes règles que le moteur (`moteur/anomalies.js`), avec la
 * seule différence de toute la table : la place d'un absent (appel du jour
 * ou désistement) ne compte pas comme tenue.
 *
 * - `effectifs` : besoins du jour hors de leurs bornes (`detecterEffectifs`),
 *   seulement là où un indicatif est positionné (décision du 2026-09-21 :
 *   une zone pas encore construite n'est pas une anomalie) ;
 * - `refus` : place → missions de ses créneaux que son occupant a refusées
 *   (`souhait_refuse`) ;
 * - `enMemeTemps` : place → autres places du jour que son occupant tient sur
 *   des quarts qui se recouvrent (`double_engagement`) ;
 * - `quotas` : bénévole → heures affectées sur tout le festival, quand elles
 *   dépassent son quota (`hors_quota`) ; `planning` doit porter la même
 *   occupation que `occupant` ;
 * - `chevauchements` : paires de sous-créneaux d'un même macro-créneau du
 *   jour qui se recouvrent (`chevauchement_creneaux`), pour information.
 *
 * Indisponibilités et artistes ratés (`indisponibilite`, `conflit_artiste`)
 * n'y sont pas : la table les montre déjà sur chaque ligne.
 */
export function signalementsDuJour(journee, occupant, planning) {
  const {ix, groupes, groupeDePlace, absents} = journee;
  const tient = (b) => b != null && !absents.has(b);

  const parBesoin = new Map();
  for (const g of groupes) {
    const tenues = g.places.filter((p) => tient(occupant.get(p.id))).length;
    for (const {besoin, sousCreneau, mission} of g.positions) {
      const e = parBesoin.get(besoin.id) ?? {besoin, sousCreneau, mission, places: 0, pourvues: 0};
      e.places += g.places.length;
      e.pourvues += tenues;
      parBesoin.set(besoin.id, e);
    }
  }
  const effectifs = [...parBesoin.values()]
    .filter((e) => e.pourvues < e.besoin.Effectif_min || e.pourvues > e.besoin.Effectif_max)
    .sort((a, b) => a.sousCreneau.Debut - b.sousCreneau.Debut);

  const refusees = new Set(planning.souhaitsMissions.filter((s) => s.Preference === 'Refuse').map((s) => `${s.Benevole}:${s.Mission}`));
  const refus = new Map();
  const placesParBenevole = new Map();
  for (const [placeId, b] of occupant) {
    const g = groupeDePlace.get(placeId);
    if (!tient(b) || !g) { continue; }
    const missions = [...new Set(g.positions.map((p) => p.mission))].filter((mi) => mi != null && refusees.has(`${b}:${mi.id}`));
    if (missions.length > 0) { refus.set(placeId, missions); }
    placesParBenevole.set(b, [...(placesParBenevole.get(b) ?? []), placeId]);
  }

  const enMemeTemps = new Map();
  const quotas = new Map();
  for (const [b, placeIds] of placesParBenevole) {
    for (let i = 0; i < placeIds.length; i++) {
      for (let j = i + 1; j < placeIds.length; j++) {
        const [a, z] = [placeIds[i], placeIds[j]];
        const quartsZ = groupeDePlace.get(z).quarts;
        if (![...groupeDePlace.get(a).quarts].some((q) => quartsZ.has(q))) { continue; }
        enMemeTemps.set(a, [...(enMemeTemps.get(a) ?? []), z]);
        enMemeTemps.set(z, [...(enMemeTemps.get(z) ?? []), a]);
      }
    }
    const max = ix.benevole.get(b)?.Quota_heures_max;
    if (max == null) { continue; }
    const heures = heuresAffectees(planning, ix, b);
    if (heures > max) { quotas.set(b, {heures, max}); }
  }

  const chevauchements = [];
  for (const macroId of journee.macroIds) {
    const sousCreneaux = planning.sousCreneaux.filter((sc) => sc.Macro_creneau === macroId).sort((a, b) => a.Debut - b.Debut);
    for (let i = 0; i < sousCreneaux.length; i++) {
      for (let j = i + 1; j < sousCreneaux.length; j++) {
        const [a, z] = [sousCreneaux[i], sousCreneaux[j]];
        if (seChevauchent(a.Debut, a.Fin, z.Debut, z.Fin)) { chevauchements.push([a, z]); }
      }
    }
  }

  return {effectifs, refus, enMemeTemps, quotas, chevauchements};
}

/**
 * Occupation après une liste de mouvements `{benevoleId, de, vers}` (ids de
 * place, `null` pour « sans place ») : les départs d'abord, puis les
 * arrivées, pour qu'un échange ne s'annule pas lui-même.
 */
export function appliquerMouvements(occupant, mouvements) {
  const apres = new Map(occupant);
  for (const mv of mouvements) {
    if (mv.de != null && apres.get(mv.de) === mv.benevoleId) { apres.set(mv.de, null); }
  }
  for (const mv of mouvements) {
    if (mv.vers != null) { apres.set(mv.vers, mv.benevoleId); }
  }
  return apres;
}

/** Ce qu'un scénario gagne et sacrifie, jugé seulement sur les bénévoles qu'il déplace. */
export function evaluerMouvements(journee, occupant, mouvements) {
  const apres = appliquerMouvements(occupant, mouvements);
  const touches = new Set(mouvements.map((mv) => mv.benevoleId));
  for (const mv of mouvements) {
    if (mv.vers != null && occupant.get(mv.vers) != null) { touches.add(occupant.get(mv.vers)); }
  }
  const avant = mesurer(journee, occupant, touches);
  const ensuite = mesurer(journee, apres, touches);
  const paire = (cle) => cle.split(':').map(Number);
  const souhait = (cle) => cle.split('>').map(Number);
  return {
    binomesGagnes: [...ensuite.pairesRespectees].filter((c) => !avant.pairesRespectees.has(c)).map(paire),
    binomesPerdus: [...avant.pairesRespectees].filter((c) => !ensuite.pairesRespectees.has(c)).map(paire),
    artistesGagnes: [...ensuite.souhaitsVus].filter((c) => !avant.souhaitsVus.has(c)).map(souhait),
    artistesPerdus: [...avant.souhaitsVus].filter((c) => !ensuite.souhaitsVus.has(c)).map(souhait),
    restauGagnee: [...ensuite.restauTenue].filter((b) => !avant.restauTenue.has(b)),
    restauPerdue: [...avant.restauTenue].filter((b) => !ensuite.restauTenue.has(b)),
    dACouvrir: ensuite.aCouvrir.length - avant.aCouvrir.length,
  };
}
