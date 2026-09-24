/**
 * Tout ce qui se calcule à partir du `Modele` plutôt que de s'y stocker :
 * couverture d'un besoin, classement de candidats pour une place, anomalies,
 * trajectoire d'un indicatif. Aucune fonction ici ne mute le magasin.
 */

import type {
  Artiste, Benevole, Besoin, Groupe, Id, MacroCreneau, Mission, Place, SousCreneau, StatutDisponibilite,
} from '../domain/types';
import {
  cleJourFestival, epochDebutJourFestival, HEURE_COUPURE_JOUR_FESTIVAL, libelleJourLong, PAS_SECONDES,
} from '../temps';
import type {Magasin} from '../store';

// --- Index -------------------------------------------------------------

export function indexer(m: Magasin) {
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
export type Index = ReturnType<typeof indexer>;

// --- Jours -------------------------------------------------------------

export interface Jour {
  cle: string;
  libelle: string;
  macros: MacroCreneau[];
}

/** Regroupe les macro-créneaux par jour de festival — bascule à une heure de
 *  coupure paramétrable (6h par défaut) plutôt qu'à minuit civil, pour ne
 *  jamais couper une soirée en deux (§6.2 du cahier des charges). Concept
 *  purement visuel : ne modifie ni ne stocke aucune borne de temps. */
export function regrouperParJour(macroCreneaux: MacroCreneau[], heureCoupure = HEURE_COUPURE_JOUR_FESTIVAL): Jour[] {
  const parCle = new Map<string, MacroCreneau[]>();
  for (const macro of macroCreneaux) {
    const cle = cleJourFestival(macro.Debut, heureCoupure);
    const liste = parCle.get(cle) ?? [];
    liste.push(macro);
    parCle.set(cle, liste);
  }
  return [...parCle.entries()]
    .map(([cle, macros]) => ({
      cle, libelle: libelleJourLong(epochDebutJourFestival(macros[0]!.Debut, heureCoupure)),
      macros: macros.sort((a, b) => a.Debut - b.Debut),
    }))
    .sort((a, b) => a.macros[0]!.Debut - b.macros[0]!.Debut);
}

/** Tous les quarts d'heure d'un jour de festival (chacun de ses macro-créneaux, au pas de l'application). */
export function quartsDuJour(jour: Jour | undefined): Set<number> {
  const quarts = new Set<number>();
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
 * comme candidat éligible en secours (§7.2, `moteur/eligibilite.ts`) — ce
 * prédicat ne change rien à l'algorithme, il sert uniquement l'affichage
 * « qui est vraiment là aujourd'hui » (roster Affectation, feuille
 * imprimable). Seule source pour cette question : toute vue qui la pose
 * doit passer par ici plutôt que refaire son propre filtre.
 */
export function benevolesDisponiblesCeJour(m: Magasin, quarts: Set<number>): Set<Id> {
  const disponibles = new Set<Id>();
  for (const d of m.disponibilites) {
    if (d.Statut === 'Disponible' && quarts.has(d.Quart_heure)) { disponibles.add(d.Benevole); }
  }
  return disponibles;
}

// --- Créneaux et couverture ----------------------------------------------

export function quartsDuSousCreneau(sc: SousCreneau): number[] {
  const quarts: number[] = [];
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
export function sousCreneauxApplicables(mission: Mission, tousSousCreneaux: SousCreneau[]): SousCreneau[] {
  const propres = tousSousCreneaux.filter((sc) => sc.Mission === mission.id);
  const base = propres.length > 0 ? propres : tousSousCreneaux.filter((sc) => sc.Mission === null);
  return base.slice().sort((a, b) => a.Debut - b.Debut);
}

/** Les positions d'un groupe, triées par heure de début du sous-créneau. */
export function positionsDuGroupe(m: Magasin, ix: Index, groupeId: Id) {
  return m.positionsGroupe
    .filter((p) => p.Groupe === groupeId)
    .map((p) => {
      const besoin = ix.besoin.get(p.Besoin)!;
      const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau)!;
      return {position: p, besoin, sousCreneau};
    })
    .sort((a, b) => a.sousCreneau.Debut - b.sousCreneau.Debut);
}

export function quartsCouvertsParGroupe(m: Magasin, ix: Index, groupeId: Id): Set<number> {
  const quarts = new Set<number>();
  for (const {sousCreneau} of positionsDuGroupe(m, ix, groupeId)) {
    for (const q of quartsDuSousCreneau(sousCreneau)) { quarts.add(q); }
  }
  return quarts;
}

export function missionsCouvertesParGroupe(m: Magasin, ix: Index, groupeId: Id): Id[] {
  return [...new Set(positionsDuGroupe(m, ix, groupeId).map((p) => p.besoin.Mission))];
}

export function placesDuGroupe(m: Magasin, groupeId: Id): Place[] {
  return m.places.filter((p) => p.Groupe === groupeId).sort((a, b) => a.Rang - b.Rang);
}

export interface Couverture {
  besoin: Besoin;
  groupesPositionnes: {groupe: Groupe; places: Place[]}[];
  places: number;   // total de places ouvertes (somme des tailles des groupes positionnés)
  pourvues: number; // places avec un bénévole
  statut: 'ok' | 'partiel' | 'sous';
}

export function couvertureBesoin(m: Magasin, ix: Index, besoinId: Id): Couverture {
  const besoin = ix.besoin.get(besoinId)!;
  const positions = m.positionsGroupe.filter((p) => p.Besoin === besoinId);
  const groupesPositionnes = positions.map((p) => {
    const groupe = ix.groupe.get(p.Groupe)!;
    return {groupe, places: placesDuGroupe(m, groupe.id)};
  });
  const places = groupesPositionnes.reduce((n, g) => n + g.groupe.Taille, 0);
  const pourvues = groupesPositionnes.reduce((n, g) => n + g.places.filter((pl) => pl.Benevole != null).length, 0);
  // Une zone sans aucun indicatif positionné n'est pas encore construite : ce
  // n'est pas une anomalie, juste un choix de l'utilisateur de s'en occuper
  // plus tard (parcours de construction incrémental, §7.4 — même règle que
  // `moteur/anomalies.ts` côté vrai moteur).
  const statut: Couverture['statut'] = groupesPositionnes.length === 0 ? 'ok'
    : pourvues < besoin.Effectif_min ? 'sous'
    : pourvues < places ? 'partiel' : 'ok';
  return {besoin, groupesPositionnes, places, pourvues, statut};
}

/** Heures distinctes couvertes par les places actuellement tenues par un
 *  bénévole, tous groupes confondus. */
export function heuresAffectees(m: Magasin, ix: Index, benevoleId: Id): number {
  const quarts = new Set<number>();
  for (const place of m.places) {
    if (place.Benevole !== benevoleId) { continue; }
    for (const q of quartsCouvertsParGroupe(m, ix, place.Groupe)) { quarts.add(q); }
  }
  return quarts.size * (PAS_SECONDES / 3600);
}

function statutQuart(m: Magasin, benevoleId: Id, quart: number): StatutDisponibilite | 'Non renseigné' {
  const d = m.disponibilites.find((d) => d.Benevole === benevoleId && d.Quart_heure === quart);
  return d ? d.Statut : 'Non renseigné';
}

// --- Classement des candidats ---------------------------------------------

/** Forme partagée avec le vrai moteur de classement : voir
 *  `moteur/adaptateur-magasin.ts` `classerCandidats`, qui produit ces
 *  candidats en s'appuyant sur `moteur/affectation.ts`. L'ancienne
 *  réimplémentation locale de ce classement a été retirée le 2026-09-23
 *  (elle divergeait du vrai moteur, notamment sur l'affinité). */
export interface Candidat {
  benevoleId: Id;
  nom: string;
  equipeNom: string;
  score: number;
  tags: {texte: string; sens: 'plus' | 'moins'}[];
}

// --- Anomalies -------------------------------------------------------------

export type Anomalie =
  | {type: 'sous-effectif'; gravite: 'danger'; besoin: Besoin; missionNom: string; sousCreneauLibelle: string; manque: number}
  | {type: 'sur-effectif'; gravite: 'warn'; besoin: Besoin; missionNom: string; sousCreneauLibelle: string; surplus: number}
  | {type: 'souhait-refuse'; gravite: 'danger'; place: Place; benevoleNom: string; missionNom: string; groupeCode: string}
  | {type: 'indisponibilite'; gravite: 'danger'; place: Place; benevoleNom: string; groupeCode: string; sousCreneauLibelle: string}
  | {type: 'conflit-artiste'; gravite: 'warn'; place: Place; benevoleNom: string; artisteNom: string; groupeCode: string}
  | {type: 'hors-quota'; gravite: 'warn'; benevoleId: Id; benevoleNom: string; heures: number; quotaMax: number}
  // §7.4 v1.4 : structurel, à surveiller — deux sous-créneaux qui se
  // recouvrent dans le temps, potentiellement voulu (missions à des rythmes
  // différents). Ne pas confondre avec le double engagement ci-dessous.
  | {type: 'chevauchement-creneaux'; gravite: 'warn'; sousCreneau: SousCreneau}
  // §7.1 contrainte dure, §7.4 v1.4 : un bénévole affecté sur deux places
  // dont les créneaux se recouvrent. Toujours une erreur, mais un filet de
  // sécurité seulement — `logic/glisser-deposer.ts` refuse déjà ce cas à la
  // saisie ; ceci ne peut arriver qu'après une édition directe des tables.
  | {type: 'double-engagement'; gravite: 'danger'; benevoleId: Id; benevoleNom: string};

export function calculerAnomalies(m: Magasin, ix: Index): Anomalie[] {
  const anomalies: Anomalie[] = [];

  for (const besoin of m.besoins) {
    const c = couvertureBesoin(m, ix, besoin.id);
    if (c.statut === 'sous') {
      anomalies.push({
        type: 'sous-effectif', gravite: 'danger', besoin,
        missionNom: ix.mission.get(besoin.Mission)!.Nom,
        sousCreneauLibelle: ix.sousCreneau.get(besoin.Sous_creneau)!.Libelle,
        manque: besoin.Effectif_min - c.pourvues,
      });
    } else if (c.pourvues > besoin.Effectif_max) {
      anomalies.push({
        type: 'sur-effectif', gravite: 'warn', besoin,
        missionNom: ix.mission.get(besoin.Mission)!.Nom,
        sousCreneauLibelle: ix.sousCreneau.get(besoin.Sous_creneau)!.Libelle,
        surplus: c.pourvues - besoin.Effectif_max,
      });
    }
  }

  for (const place of m.places) {
    if (place.Benevole == null) { continue; }
    const benevole = ix.benevole.get(place.Benevole)!;
    const groupe = ix.groupe.get(place.Groupe)!;
    const missions = missionsCouvertesParGroupe(m, ix, groupe.id).map((id) => ix.mission.get(id)!);
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
        benevoleNom: benevole.Nom, artisteNom: nomArtiste ?? 'un artiste souhaité', groupeCode: groupe.Code,
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
export function placesDuBenevole(m: Magasin, ix: Index, benevoleId: Id) {
  return m.places
    .filter((p) => p.Benevole === benevoleId)
    .map((place) => {
      const groupe = ix.groupe.get(place.Groupe)!;
      const positions = positionsDuGroupe(m, ix, groupe.id);
      return {place, groupe, positions};
    });
}

// `EtapePermutation`/`proposerPermutation` ont déménagé dans
// `moteur/adaptateur-magasin.ts` le 2026-09-23 : la fonction s'appuyait sur
// l'ancien `classerCandidats` de ce fichier (retiré ci-dessus), qui
// ignorait l'affinité (priorité 3 d'Antoine). Voir `views/jourJ.ts` pour
// l'appelant.

// --- Regroupement par jour de festival ---------------------------------

export interface GroupeJourFestival<T> {
  cle: string;
  libelle: string;
  items: T[];
}

/**
 * Regroupe des éléments par jour de festival plutôt que par jour civil
 * (§6.2 : bascule à une heure de coupure paramétrable, 6h par défaut, jamais
 * à minuit — une soirée 22h-2h reste un seul jour). Purement pour
 * l'affichage (feuille bénévole, vue équipe, vue artistes) : aucun calcul
 * métier ne doit dépendre de ce regroupement.
 */
export function regrouperParJourFestival<T>(
  items: T[], epochDe: (item: T) => number, heureCoupure = HEURE_COUPURE_JOUR_FESTIVAL,
): GroupeJourFestival<T>[] {
  const parCle = new Map<string, T[]>();
  for (const item of items) {
    const cle = cleJourFestival(epochDe(item), heureCoupure);
    const liste = parCle.get(cle) ?? [];
    liste.push(item);
    parCle.set(cle, liste);
  }
  return [...parCle.entries()]
    .map(([cle, liste]) => ({
      cle, libelle: libelleJourLong(epochDebutJourFestival(epochDe(liste[0]!), heureCoupure)), items: liste,
    }))
    .sort((a, b) => epochDe(a.items[0]!) - epochDe(b.items[0]!));
}

// --- Vue bénévole : feuille de route individuelle --------------------------

export interface EtapeBenevole {
  sousCreneauId: Id;
  debut: number;
  fin: number;
  libelle: string;
  missionNom: string;
  lieuNom: string;
  groupeCode: string;
  coequipiers: string[];
  /** Chevauche l'étape précédente une fois triées par heure de début : signale
   *  un double-positionnement (anomalie de chevauchement, §6.2) directement
   *  sur la feuille de la personne concernée plutôt que de le lui laisser
   *  découvrir sur place. */
  chevaucheLaPrecedente: boolean;
}

export interface FeuilleBenevole {
  benevole: Benevole;
  equipeNom: string;
  etapes: EtapeBenevole[];
  totalHeures: number;
}

/** La feuille de route d'un bénévole : toutes ses étapes (via tous les
 *  indicatifs où il tient une place), triées chronologiquement, avec ses
 *  coéquipiers de chaque indicatif (§8.6, feuille imprimable). */
export function feuilleBenevole(m: Magasin, ix: Index, benevoleId: Id): FeuilleBenevole | null {
  const benevole = ix.benevole.get(benevoleId);
  if (!benevole) { return null; }

  const groupeIds = new Set(
    m.places.filter((p) => p.Benevole === benevoleId).map((p) => p.Groupe),
  );

  const brutes = [...groupeIds].flatMap((groupeId) => {
    const groupe = ix.groupe.get(groupeId)!;
    const coequipiers = placesDuGroupe(m, groupeId)
      .filter((p) => p.Benevole != null && p.Benevole !== benevoleId)
      .map((p) => ix.benevole.get(p.Benevole!)?.Nom)
      .filter((nom): nom is string => nom != null);

    return positionsDuGroupe(m, ix, groupeId).map(({besoin, sousCreneau}) => {
      const mission = ix.mission.get(besoin.Mission)!;
      const lieu = ix.lieu.get(mission.Lieu);
      return {
        sousCreneauId: sousCreneau.id, debut: sousCreneau.Debut, fin: sousCreneau.Fin,
        libelle: sousCreneau.Libelle, missionNom: mission.Nom, lieuNom: lieu?.Nom ?? '',
        groupeCode: groupe.Code, coequipiers,
      };
    });
  }).sort((a, b) => a.debut - b.debut);

  const etapes: EtapeBenevole[] = brutes.map((etape, i) => ({
    ...etape, chevaucheLaPrecedente: i > 0 && etape.debut < brutes[i - 1]!.fin,
  }));

  const totalHeures = etapes.reduce((somme, e) => somme + (e.fin - e.debut) / 3600, 0);
  // Équipe orpheline possible (même défaut que rosterCard, corrigé le 2026-09-23) : ne doit pas planter la feuille de route.
  const equipe = ix.equipe.get(benevole.Equipe);

  return {benevole, equipeNom: equipe?.Nom ?? '?', etapes, totalHeures};
}

// --- Vue équipe : indicatifs d'une équipe sur toute la durée ----------------

export interface MembreIndicatif {
  rang: number;
  /** `null` = place non pourvue : c'est exactement ce qu'une cheffe d'équipe
   *  doit pouvoir repérer d'un coup d'œil pour le signaler (§4, « consultent,
   *  signalent »), sans pouvoir la modifier elle-même depuis cette vue. */
  nom: string | null;
}

export interface PositionIndicatifEquipe {
  besoinId: Id;
  sousCreneauId: Id;
  debut: number;
  fin: number;
  libelle: string;
  missionNom: string;
  lieuNom: string;
  couverture: Couverture;
}

export interface IndicatifEquipe {
  groupe: Groupe;
  membres: MembreIndicatif[];
  positions: PositionIndicatifEquipe[];
}

/** Les indicatifs d'une équipe, chacun avec son roster et sa trajectoire
 *  chronologique complète (§8.7 : « une équipe sur toute la durée, par
 *  groupe »). La couverture de chaque position compte toutes les places de
 *  tous les indicatifs positionnés sur le même besoin, pas seulement celles
 *  de cette équipe : une cheffe doit voir le sous-effectif réel. */
export function indicatifsDeLEquipe(m: Magasin, ix: Index, equipeId: Id): IndicatifEquipe[] {
  return m.groupes
    .filter((g) => g.Equipe === equipeId)
    .map((groupe) => {
      const membres: MembreIndicatif[] = placesDuGroupe(m, groupe.id).map((p) => ({
        rang: p.Rang, nom: p.Benevole != null ? ix.benevole.get(p.Benevole)?.Nom ?? null : null,
      }));

      const positions: PositionIndicatifEquipe[] = positionsDuGroupe(m, ix, groupe.id).map(
        ({besoin, sousCreneau}) => {
          const mission = ix.mission.get(besoin.Mission)!;
          const lieu = ix.lieu.get(mission.Lieu);
          return {
            besoinId: besoin.id, sousCreneauId: sousCreneau.id,
            debut: sousCreneau.Debut, fin: sousCreneau.Fin, libelle: sousCreneau.Libelle,
            missionNom: mission.Nom, lieuNom: lieu?.Nom ?? '',
            couverture: couvertureBesoin(m, ix, besoin.id),
          };
        },
      );

      return {groupe, membres, positions};
    })
    .sort((a, b) => a.groupe.Code.localeCompare(b.groupe.Code, 'fr'));
}

// --- Vue artistes : pression de demande -------------------------------------

export interface LigneArtiste {
  artiste: Artiste;
  lieuNom: string;
  /** Bénévoles distincts ayant déclaré vouloir voir cet artiste. */
  demande: number;
  /** Parmi eux, ceux déjà affectés sur une place qui chevauche son passage
   *  (préférence forte non respectée, §7.2 — même critère que l'anomalie
   *  « conflit artiste », mais agrégé par artiste plutôt que par place). */
  conflits: number;
}

/** Qui joue quand, et combien de bénévoles veulent voir chacun (§8.8). Aide à
 *  comprendre pourquoi une mission ne se remplit pas : une forte demande sur
 *  un artiste réduit d'autant le vivier disponible sur ce créneau. */
export function ligneArtistes(m: Magasin, ix: Index): LigneArtiste[] {
  const souhaitantsParArtiste = new Map<Id, Set<Id>>();
  for (const d of m.disponibilites) {
    if (d.Statut !== 'Artiste' || d.Artiste == null) { continue; }
    const ensemble = souhaitantsParArtiste.get(d.Artiste) ?? new Set<Id>();
    ensemble.add(d.Benevole);
    souhaitantsParArtiste.set(d.Artiste, ensemble);
  }

  const quartsOccupesParBenevole = new Map<Id, Set<number>>();
  function quartsOccupes(benevoleId: Id): Set<number> {
    const dejaCalcule = quartsOccupesParBenevole.get(benevoleId);
    if (dejaCalcule) { return dejaCalcule; }
    const quarts = new Set<number>();
    for (const place of m.places) {
      if (place.Benevole !== benevoleId) { continue; }
      for (const q of quartsCouvertsParGroupe(m, ix, place.Groupe)) { quarts.add(q); }
    }
    quartsOccupesParBenevole.set(benevoleId, quarts);
    return quarts;
  }

  return m.artistes.map((artiste) => {
    const souhaitants = souhaitantsParArtiste.get(artiste.id) ?? new Set<Id>();
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

export interface LigneGroupeArtiste {
  nom: string;
  passages: LigneArtiste[];
}

/** Un artiste, tous ses passages (§8.8, demande Antoine 2026-09-22 : « chaque
 *  groupe [d'artiste] est l'équivalent d'une ligne, leur horaire de passage
 *  un sous-créneau/besoin », même schéma que la vue Missions). La table
 *  `Artistes` reste un passage par ligne (§6) : un artiste qui joue
 *  plusieurs fois n'est pas une entité séparée, juste plusieurs lignes du
 *  même nom regroupées ici pour l'affichage — aucun changement de modèle. */
export function lignesGroupeesParArtiste(m: Magasin, ix: Index): LigneGroupeArtiste[] {
  const parNom = new Map<string, LigneArtiste[]>();
  for (const ligne of ligneArtistes(m, ix)) {
    const liste = parNom.get(ligne.artiste.Nom) ?? [];
    liste.push(ligne);
    parNom.set(ligne.artiste.Nom, liste);
  }
  return [...parNom.entries()]
    .map(([nom, passages]) => ({nom, passages: passages.sort((a, b) => a.artiste.Debut - b.artiste.Debut)}))
    .sort((a, b) => a.passages[0]!.artiste.Debut - b.passages[0]!.artiste.Debut);
}
