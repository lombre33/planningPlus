/**
 * Tout ce qui se calcule à partir du `Modele` plutôt que de s'y stocker :
 * couverture d'un besoin, classement de candidats pour une place, anomalies,
 * trajectoire d'un indicatif. Aucune fonction ici ne mute le magasin.
 */

import {t, traductions} from '../i18n.js';
import {
  cleJourFestival, epochDebutJourFestival, HEURE_COUPURE_JOUR_FESTIVAL, libelleJourLong, PAS_SECONDES,
} from '../temps.js';

traductions({
  'un artiste souhaité': 'a wished-for artist',
});

// --- Index -------------------------------------------------------------

export function indexer(m) {
  return {
    equipe: new Map(m.equipes.map((e) => [e.id, e])),
    lieu: new Map(m.lieux.map((l) => [l.id, l])),
    benevole: new Map(m.benevoles.map((b) => [b.id, b])),
    mission: new Map(m.missions.map((mi) => [mi.id, mi])),
    artiste: new Map(m.artistes.map((a) => [a.id, a])),
    macroCreneau: new Map(m.macroCreneaux.map((mc) => [mc.id, mc])),
    sousCreneau: new Map(m.sousCreneaux.map((s) => [s.id, s])),
    besoin: new Map(m.besoins.map((b) => [b.id, b])),
    groupe: new Map(m.groupes.map((g) => [g.id, g])),
  };
}

// --- Jours -------------------------------------------------------------

/** Regroupe les macro-créneaux par jour de festival — bascule à une heure de
 *  coupure paramétrable (6h par défaut) plutôt qu'à minuit civil, pour ne
 *  jamais couper une soirée en deux (§6.2 du cahier des charges). Concept
 *  purement visuel : ne modifie ni ne stocke aucune borne de temps. */
export function regrouperParJour(macroCreneaux, heureCoupure = HEURE_COUPURE_JOUR_FESTIVAL) {
  const parCle = new Map();
  for (const macro of macroCreneaux) {
    const cle = cleJourFestival(macro.Debut, heureCoupure);
    const liste = parCle.get(cle) ?? [];
    liste.push(macro);
    parCle.set(cle, liste);
  }
  return [...parCle.entries()]
    .map(([cle, macros]) => ({
      cle, libelle: libelleJourLong(epochDebutJourFestival(macros[0].Debut, heureCoupure)),
      macros: macros.sort((a, b) => a.Debut - b.Debut),
    }))
    .sort((a, b) => a.macros[0].Debut - b.macros[0].Debut);
}

/** Tous les quarts d'heure d'un jour de festival (chacun de ses macro-créneaux, au pas de l'application). */
export function quartsDuJour(jour) {
  const quarts = new Set();
  for (const macro of jour?.macros ?? []) {
    for (let t = macro.Debut; t < macro.Fin; t += PAS_SECONDES) { quarts.add(t); }
  }
  return quarts;
}

/**
 * Bénévoles ayant une vraie disponibilité un jour donné : au moins un quart
 * marqué `Disponible`, pas seulement « pas Indisponible ». Un souhait
 * « voir un artiste » (`Statut === 'Artiste'`) n'en est pas une — Antoine
 * l'a trouvé lui-même le 2026-09-24 en voyant des bénévoles absents ce
 * jour-là apparaître comme disponibles, parce que seule l'info « veut voir
 * un artiste » existait sur leur profil. Le moteur, lui, garde `Artiste`
 * comme candidat éligible en secours (§7.2, `moteur/eligibilite.js`) — ce
 * prédicat ne change rien à l'algorithme, il sert uniquement l'affichage
 * « qui est vraiment là aujourd'hui » (roster Affectation, feuille
 * imprimable). Seule source pour cette question : toute vue qui la pose
 * doit passer par ici plutôt que refaire son propre filtre.
 */
export function benevolesDisponiblesCeJour(m, quarts) {
  const disponibles = new Set();
  for (const d of m.disponibilites) {
    if (d.Statut === 'Disponible' && quarts.has(d.Quart_heure)) { disponibles.add(d.Benevole); }
  }
  return disponibles;
}

/**
 * Index (bénévole, quart) -> statut, pour un test de vraie disponibilité
 * répété sur toute une grille (feuille imprimable, 2026-09-24) sans relire
 * `m.disponibilites` en boucle à chaque cellule. À construire une fois par
 * rendu, à passer à `estVraimentDisponibleAuQuart`.
 */
export function indexerDisponibilites(m) {
  const index = new Map();
  for (const d of m.disponibilites) { index.set(`${d.Benevole}:${d.Quart_heure}`, d.Statut); }
  return index;
}

/**
 * Vraie disponibilité à UN quart précis, même vérité que
 * `benevolesDisponiblesCeJour` (un souhait « Artiste » n'en est pas une) et
 * que le moteur (`moteur/eligibilite.js`, `evaluerEligibilite` : une absence
 * d'entrée vaut « Indisponible », jamais « Disponible » par défaut).
 */
export function estVraimentDisponibleAuQuart(
  index, benevoleId, quartHeure,
) {
  return index.get(`${benevoleId}:${quartHeure}`) === 'Disponible';
}

// --- Créneaux et couverture ----------------------------------------------

export function quartsDuSousCreneau(sc) {
  const quarts = [];
  for (let t = sc.Debut; t < sc.Fin; t += PAS_SECONDES) { quarts.push(t); }
  return quarts;
}

/** Sous-créneaux qu'une mission voit sur un jour donné (§6.2 du cahier des
 *  charges, « communs, avec exceptions ») : dès qu'elle a au moins un
 *  sous-créneau à elle, ceux-ci remplacent entièrement les sous-créneaux
 *  communs pour elle — jamais un mélange des deux. Partagée entre la grille
 *  Missions et la vue Indicatifs (extraite le 2026-09-23 à la demande du
 *  coordinateur : la règle avait déjà divergé une fois entre les deux
 *  copies le même jour) — `tousSousCreneaux` reste à filtrer par
 *  l'appelant sur le jour affiché, cette fonction ne connaît aucun jour. */
export function sousCreneauxApplicables(mission, tousSousCreneaux) {
  const propres = tousSousCreneaux.filter((sc) => sc.Mission === mission.id);
  const base = propres.length > 0 ? propres : tousSousCreneaux.filter((sc) => sc.Mission === null);
  return base.slice().sort((a, b) => a.Debut - b.Debut);
}

/**
 * Les positions d'un groupe, triées par heure de début du sous-créneau.
 * Une position dont le besoin ou le sous-créneau référencé a disparu du
 * document (édition manuelle) est ignorée plutôt que de faire planter tout
 * le calcul : fonction centrale, utilisée par la couverture, les heures
 * affectées, la feuille de route et les indicatifs.
 */
export function positionsDuGroupe(m, ix, groupeId) {
  const resultat = [];
  for (const p of m.positionsGroupe) {
    if (p.Groupe !== groupeId) { continue; }
    const besoin = ix.besoin.get(p.Besoin);
    const sousCreneau = besoin ? ix.sousCreneau.get(besoin.Sous_creneau) : undefined;
    if (!besoin || !sousCreneau) { continue; }
    resultat.push({position: p, besoin, sousCreneau});
  }
  return resultat.sort((a, b) => a.sousCreneau.Debut - b.sousCreneau.Debut);
}

export function quartsCouvertsParGroupe(m, ix, groupeId) {
  const quarts = new Set();
  for (const {sousCreneau} of positionsDuGroupe(m, ix, groupeId)) {
    for (const q of quartsDuSousCreneau(sousCreneau)) { quarts.add(q); }
  }
  return quarts;
}

export function missionsCouvertesParGroupe(m, ix, groupeId) {
  return [...new Set(positionsDuGroupe(m, ix, groupeId).map((p) => p.besoin.Mission))];
}

export function placesDuGroupe(m, groupeId) {
  return m.places.filter((p) => p.Groupe === groupeId).sort((a, b) => a.Rang - b.Rang);
}

export function couvertureBesoin(m, ix, besoinId) {
  const besoin = ix.besoin.get(besoinId);
  const positions = m.positionsGroupe.filter((p) => p.Besoin === besoinId);
  const groupesPositionnes = [];
  for (const p of positions) {
    const groupe = ix.groupe.get(p.Groupe);
    if (!groupe) { continue; } // groupe orphelin : position ignorée
    groupesPositionnes.push({groupe, places: placesDuGroupe(m, groupe.id)});
  }
  const places = groupesPositionnes.reduce((n, g) => n + g.groupe.Taille, 0);
  const pourvues = groupesPositionnes.reduce((n, g) => n + g.places.filter((pl) => pl.Benevole != null).length, 0);
  // Une zone sans aucun indicatif positionné n'est pas encore construite : ce
  // n'est pas une anomalie, juste un choix de l'utilisateur de s'en occuper
  // plus tard (parcours de construction incrémental, §7.4 — même règle que
  // `moteur/anomalies.js` côté vrai moteur).
  const statut = groupesPositionnes.length === 0 ? 'ok'
    : pourvues < besoin.Effectif_min ? 'sous'
    : pourvues < places ? 'partiel' : 'ok';
  return {besoin, groupesPositionnes, places, pourvues, statut};
}

/** Heures distinctes couvertes par les places actuellement tenues par un
 *  bénévole, tous groupes confondus. */
export function heuresAffectees(m, ix, benevoleId) {
  const quarts = new Set();
  for (const place of m.places) {
    if (place.Benevole !== benevoleId) { continue; }
    for (const q of quartsCouvertsParGroupe(m, ix, place.Groupe)) { quarts.add(q); }
  }
  return quarts.size * (PAS_SECONDES / 3600);
}

function statutQuart(m, benevoleId, quart) {
  const d = m.disponibilites.find((d) => d.Benevole === benevoleId && d.Quart_heure === quart);
  return d ? d.Statut : 'Non renseigné';
}

// --- Classement des candidats ---------------------------------------------

// --- Anomalies -------------------------------------------------------------

export function calculerAnomalies(m, ix) {
  const anomalies = [];

  for (const besoin of m.besoins) {
    const mission = ix.mission.get(besoin.Mission);
    const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau);
    if (!mission || !sousCreneau) { continue; } // référence pendante : besoin ignoré
    const c = couvertureBesoin(m, ix, besoin.id);
    if (c.statut === 'sous') {
      anomalies.push({
        type: 'sous-effectif', gravite: 'danger', besoin,
        missionNom: mission.Nom,
        sousCreneauLibelle: sousCreneau.Libelle,
        manque: besoin.Effectif_min - c.pourvues,
      });
    } else if (c.pourvues > besoin.Effectif_max) {
      anomalies.push({
        type: 'sur-effectif', gravite: 'warn', besoin,
        missionNom: mission.Nom,
        sousCreneauLibelle: sousCreneau.Libelle,
        surplus: c.pourvues - besoin.Effectif_max,
      });
    }
  }

  for (const place of m.places) {
    if (place.Benevole == null) { continue; }
    const benevole = ix.benevole.get(place.Benevole);
    const groupe = ix.groupe.get(place.Groupe);
    if (!benevole || !groupe) { continue; } // référence pendante : place ignorée
    const missions = missionsCouvertesParGroupe(m, ix, groupe.id)
      .map((id) => ix.mission.get(id))
      .filter((mi) => mi != null);
    const quarts = [...quartsCouvertsParGroupe(m, ix, groupe.id)];

    const refus = missions.find((mi) => m.souhaitsMissions.some(
      (s) => s.Benevole === benevole.id && s.Mission === mi.id && s.Preference === 'Refuse',
    ));
    if (refus) {
      anomalies.push({
        type: 'souhait-refuse', gravite: 'danger', place,
        benevoleNom: benevole.Nom, missionNom: refus.Nom, groupeCode: groupe.Code,
      });
    }

    const quartIndispo = quarts.find((q) => statutQuart(m, benevole.id, q) === 'Indisponible');
    if (quartIndispo !== undefined) {
      const sc = positionsDuGroupe(m, ix, groupe.id).find(
        (p) => quartsDuSousCreneau(p.sousCreneau).includes(quartIndispo),
      )?.sousCreneau;
      anomalies.push({
        type: 'indisponibilite', gravite: 'danger', place,
        benevoleNom: benevole.Nom, groupeCode: groupe.Code,
        sousCreneauLibelle: sc?.Libelle ?? '',
      });
    }

    const quartArtiste = quarts.find((q) => statutQuart(m, benevole.id, q) === 'Artiste');
    if (quartArtiste !== undefined) {
      const dispo = m.disponibilites.find((d) => d.Benevole === benevole.id && d.Quart_heure === quartArtiste);
      const nomArtiste = dispo?.Artiste != null ? ix.artiste.get(dispo.Artiste)?.Nom : undefined;
      anomalies.push({
        type: 'conflit-artiste', gravite: 'warn', place,
        benevoleNom: benevole.Nom, artisteNom: nomArtiste ?? t('un artiste souhaité'), groupeCode: groupe.Code,
      });
    }
  }

  for (const benevole of m.benevoles) {
    const heures = heuresAffectees(m, ix, benevole.id);
    if (heures > benevole.Quota_heures_max) {
      anomalies.push({
        type: 'hors-quota', gravite: 'warn', benevoleId: benevole.id,
        benevoleNom: benevole.Nom, heures, quotaMax: benevole.Quota_heures_max,
      });
    }
  }

  return anomalies.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === 'danger' ? -1 : 1));
}

// --- Jour J : remplacement et permutations ----------------------------------

/** Les places actuellement tenues par un bénévole, avec leur groupe et un
 *  aperçu de ce qu'elles couvrent. */
export function placesDuBenevole(m, ix, benevoleId) {
  const resultat = [];
  for (const place of m.places) {
    if (place.Benevole !== benevoleId) { continue; }
    const groupe = ix.groupe.get(place.Groupe);
    if (!groupe) { continue; } // groupe orphelin : place ignorée
    resultat.push({place, groupe, positions: positionsDuGroupe(m, ix, groupe.id)});
  }
  return resultat;
}

// --- Regroupement par jour de festival ---------------------------------

/**
 * Regroupe des éléments par jour de festival plutôt que par jour civil
 * (§6.2 : bascule à une heure de coupure paramétrable, 6h par défaut, jamais
 * à minuit — une soirée 22h-2h reste un seul jour). Purement pour
 * l'affichage (feuille bénévole, vue équipe, vue artistes) : aucun calcul
 * métier ne doit dépendre de ce regroupement.
 */
export function regrouperParJourFestival(
  items, epochDe, heureCoupure = HEURE_COUPURE_JOUR_FESTIVAL,
) {
  const parCle = new Map();
  for (const item of items) {
    const cle = cleJourFestival(epochDe(item), heureCoupure);
    const liste = parCle.get(cle) ?? [];
    liste.push(item);
    parCle.set(cle, liste);
  }
  return [...parCle.entries()]
    .map(([cle, liste]) => ({
      cle, libelle: libelleJourLong(epochDebutJourFestival(epochDe(liste[0]), heureCoupure)), items: liste,
    }))
    .sort((a, b) => epochDe(a.items[0]) - epochDe(b.items[0]));
}

// --- Vue bénévole : feuille de route individuelle --------------------------

/** La feuille de route d'un bénévole : toutes ses étapes (via tous les
 *  indicatifs où il tient une place), triées chronologiquement, avec ses
 *  coéquipiers de chaque indicatif (§8.6, feuille imprimable). */
export function feuilleBenevole(m, ix, benevoleId) {
  const benevole = ix.benevole.get(benevoleId);
  if (!benevole) { return null; }

  const groupeIds = new Set(
    m.places.filter((p) => p.Benevole === benevoleId).map((p) => p.Groupe),
  );

  const brutes = [...groupeIds].flatMap((groupeId) => {
    const groupe = ix.groupe.get(groupeId);
    if (!groupe) { return []; } // groupe orphelin : ignoré dans la feuille de route

    const coequipiers = placesDuGroupe(m, groupeId)
      .filter((p) => p.Benevole != null && p.Benevole !== benevoleId)
      .map((p) => ix.benevole.get(p.Benevole)?.Nom)
      .filter((nom) => nom != null);

    return positionsDuGroupe(m, ix, groupeId).flatMap(({besoin, sousCreneau}) => {
      const mission = ix.mission.get(besoin.Mission);
      if (!mission) { return []; } // mission orpheline : étape ignorée
      const lieu = ix.lieu.get(mission.Lieu);
      return [{
        sousCreneauId: sousCreneau.id, debut: sousCreneau.Debut, fin: sousCreneau.Fin,
        libelle: sousCreneau.Libelle, missionNom: mission.Nom, lieuNom: lieu?.Nom ?? '',
        groupeCode: groupe.Code, coequipiers,
      }];
    });
  }).sort((a, b) => a.debut - b.debut);

  const etapes = brutes.map((etape, i) => ({
    ...etape, chevaucheLaPrecedente: i > 0 && etape.debut < brutes[i - 1].fin,
  }));

  const totalHeures = etapes.reduce((somme, e) => somme + (e.fin - e.debut) / 3600, 0);
  // Équipe orpheline possible (même défaut que rosterCard, corrigé le 2026-09-23) : ne doit pas planter la feuille de route.
  const equipe = ix.equipe.get(benevole.Equipe);

  return {benevole, equipeNom: equipe?.Nom ?? '?', etapes, totalHeures};
}

// --- Vue équipe : indicatifs d'une équipe sur toute la durée ----------------

/** Les indicatifs d'une équipe, chacun avec son roster et sa trajectoire
 *  chronologique complète (§8.7 : « une équipe sur toute la durée, par
 *  groupe »). La couverture de chaque position compte toutes les places de
 *  tous les indicatifs positionnés sur le même besoin, pas seulement celles
 *  de cette équipe : une cheffe doit voir le sous-effectif réel. */
export function indicatifsDeLEquipe(m, ix, equipeId) {
  return m.groupes
    .filter((g) => g.Equipe === equipeId)
    .map((groupe) => {
      const membres = placesDuGroupe(m, groupe.id).map((p) => ({
        rang: p.Rang, nom: p.Benevole != null ? ix.benevole.get(p.Benevole)?.Nom ?? null : null,
      }));

      const positions = positionsDuGroupe(m, ix, groupe.id).flatMap(
        ({besoin, sousCreneau}) => {
          const mission = ix.mission.get(besoin.Mission);
          if (!mission) { return []; } // mission orpheline : position ignorée
          const lieu = ix.lieu.get(mission.Lieu);
          return [{
            besoinId: besoin.id, sousCreneauId: sousCreneau.id,
            debut: sousCreneau.Debut, fin: sousCreneau.Fin, libelle: sousCreneau.Libelle,
            missionNom: mission.Nom, lieuNom: lieu?.Nom ?? '',
            couverture: couvertureBesoin(m, ix, besoin.id),
          }];
        },
      );

      return {groupe, membres, positions};
    })
    .sort((a, b) => a.groupe.Code.localeCompare(b.groupe.Code, 'fr'));
}

// --- Vue artistes : pression de demande -------------------------------------

/** Qui joue quand, et combien de bénévoles veulent voir chacun (§8.8). Aide à
 *  comprendre pourquoi une mission ne se remplit pas : une forte demande sur
 *  un artiste réduit d'autant le vivier disponible sur ce créneau. */
export function ligneArtistes(m, ix) {
  const souhaitantsParArtiste = new Map();
  for (const d of m.disponibilites) {
    if (d.Statut !== 'Artiste' || d.Artiste == null) { continue; }
    const ensemble = souhaitantsParArtiste.get(d.Artiste) ?? new Set();
    ensemble.add(d.Benevole);
    souhaitantsParArtiste.set(d.Artiste, ensemble);
  }

  const quartsOccupesParBenevole = new Map();
  function quartsOccupes(benevoleId) {
    const dejaCalcule = quartsOccupesParBenevole.get(benevoleId);
    if (dejaCalcule) { return dejaCalcule; }
    const quarts = new Set();
    for (const place of m.places) {
      if (place.Benevole !== benevoleId) { continue; }
      for (const q of quartsCouvertsParGroupe(m, ix, place.Groupe)) { quarts.add(q); }
    }
    quartsOccupesParBenevole.set(benevoleId, quarts);
    return quarts;
  }

  return m.artistes.map((artiste) => {
    const souhaitants = souhaitantsParArtiste.get(artiste.id) ?? new Set();
    let conflits = 0;
    for (const benevoleId of souhaitants) {
      const enConflit = [...quartsOccupes(benevoleId)].some((q) => q >= artiste.Debut && q < artiste.Fin);
      if (enConflit) { conflits++; }
    }
    return {
      artiste, lieuNom: ix.lieu.get(artiste.Lieu)?.Nom ?? '',
      demande: souhaitants.size, conflits,
    };
  }).sort((a, b) => a.artiste.Debut - b.artiste.Debut);
}

/** Un artiste, tous ses passages (§8.8, demande Antoine 2026-09-22 : « chaque
 *  groupe [d'artiste] est l'équivalent d'une ligne, leur horaire de passage
 *  un sous-créneau/besoin », même schéma que la vue Missions). La table
 *  `Artistes` reste un passage par ligne (§6) : un artiste qui joue
 *  plusieurs fois n'est pas une entité séparée, juste plusieurs lignes du
 *  même nom regroupées ici pour l'affichage — aucun changement de modèle. */
export function lignesGroupeesParArtiste(m, ix) {
  const parNom = new Map();
  for (const ligne of ligneArtistes(m, ix)) {
    const liste = parNom.get(ligne.artiste.Nom) ?? [];
    liste.push(ligne);
    parNom.set(ligne.artiste.Nom, liste);
  }
  return [...parNom.entries()]
    .map(([nom, passages]) => ({nom, passages: passages.sort((a, b) => a.artiste.Debut - b.artiste.Debut)}))
    .sort((a, b) => a.passages[0].artiste.Debut - b.passages[0].artiste.Debut);
}
