/**
 * Génération d'un jeu de données de festival.
 *
 * Le tirage est déterministe : à graine égale, le jeu de données est
 * identique. C'est ce qui permet de rejouer une batterie de tests sur des
 * données stables, et de reproduire un bogue à l'identique.
 *
 * Reflète le modèle de données v1 (`docs/cahier-des-charges.md`, §6.3) : un
 * groupe (indicatif) porte un roster fixe (`Places`), positionné sur autant
 * de besoins que nécessaire (`Positions_groupe`) — y compris sur des
 * missions différentes d'un sous-créneau à l'autre. Le roster d'un groupe
 * est donc fixé une fois, pas par position.
 *
 * Ce module ne parle pas à Grist : il rend des tableaux d'objets que
 * `seed.mjs` se charge d'injecter.
 */

import {TIMEZONE, PAS_MINUTES} from './schema.mjs';
import {epochDepuisHeureLocale, libelleCourt, libelleHeure} from './temps.mjs';

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function generateurAleatoire(graine) {
  let etat = graine >>> 0;
  return function aleatoire() {
    etat = (etat + 0x6D2B79F5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRENOMS = [
  'Camille', 'Lucas', 'Léa', 'Nathan', 'Manon', 'Hugo', 'Chloé', 'Enzo',
  'Inès', 'Théo', 'Jade', 'Raphaël', 'Louise', 'Gabriel', 'Alice', 'Arthur',
  'Emma', 'Noah', 'Zoé', 'Adam', 'Sarah', 'Paul', 'Anna', 'Maël',
  'Rose', 'Ethan', 'Nina', 'Tom', 'Éva', 'Antoine', 'Clara', 'Baptiste',
  'Julie', 'Rémi', 'Awa', 'Yanis', 'Maya', 'Samuel', 'Lina', 'Pierre',
];

const NOMS = [
  'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit',
  'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel',
  'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel',
  'Girard', 'André', 'Lefèvre', 'Mercier', 'Blanc', 'Guérin', 'Boyer',
  'Diallo', 'Traoré', 'Nguyen', 'Benali', 'Da Silva', 'Rossi', 'Kowalski',
  'Faure', 'Rousseau', 'Chevalier', 'Perrin', 'Marchand',
];

const NOMS_EQUIPES = [
  {nom: 'Accueil', couleur: '#2E7D32'},
  {nom: 'Bars', couleur: '#C62828'},
  {nom: 'Scènes', couleur: '#1565C0'},
  {nom: 'Logistique', couleur: '#EF6C00'},
  {nom: 'Propreté', couleur: '#00838F'},
  {nom: 'Billetterie', couleur: '#6A1B9A'},
  {nom: 'Catering', couleur: '#AD1457'},
  {nom: 'Mobilité', couleur: '#4E342E'},
];

/**
 * Catalogue de missions. `moment` limite la mission à une partie de la
 * journée ; `journee` et `soiree` correspondent aux deux macro-créneaux types.
 */
const CATALOGUE_MISSIONS = [
  {nom: 'Accueil public', lieu: 'Entrée principale', min: 2, max: 6, moment: 'tout', competences: ['Anglais'], equipe: 'Accueil', priorite: 'Normale'},
  {nom: 'Billetterie', lieu: 'Guichet', min: 2, max: 4, moment: 'tout', competences: ['Caisse', 'Majeur'], equipe: 'Billetterie', priorite: 'Normale'},
  {nom: 'Contrôle des bracelets', lieu: 'Entrée principale', min: 2, max: 6, moment: 'tout', competences: ['Majeur'], equipe: 'Accueil', priorite: 'Normale'},
  {nom: 'Bar grande scène', lieu: 'Grande scène', min: 4, max: 8, moment: 'tout', competences: ['Majeur', 'Caisse'], equipe: 'Bars', priorite: 'Normale'},
  {nom: 'Bar chapiteau', lieu: 'Chapiteau', min: 2, max: 6, moment: 'soiree', competences: ['Majeur'], equipe: 'Bars', priorite: 'Confort'},
  {nom: 'Plateau grande scène', lieu: 'Grande scène', min: 2, max: 4, moment: 'tout', competences: ['Manutention'], equipe: 'Scènes', priorite: 'Critique'},
  {nom: 'Plateau scène club', lieu: 'Scène club', min: 2, max: 4, moment: 'soiree', competences: ['Manutention'], equipe: 'Scènes', priorite: 'Normale'},
  {nom: 'Loges et artistes', lieu: 'Loges', min: 2, max: 4, moment: 'tout', competences: ['Anglais'], equipe: 'Scènes', priorite: 'Normale'},
  {nom: 'Catering bénévoles', lieu: 'Cantine', min: 2, max: 6, moment: 'tout', competences: [], equipe: 'Catering', priorite: 'Confort'},
  {nom: 'Propreté site', lieu: 'Site', min: 3, max: 8, moment: 'tout', competences: [], equipe: 'Propreté', priorite: 'Normale'},
  {nom: 'Tri des déchets', lieu: 'Zone technique', min: 2, max: 4, moment: 'tout', competences: ['Manutention'], equipe: 'Propreté', priorite: 'Confort'},
  {nom: 'Parking et navettes', lieu: 'Parking', min: 2, max: 5, moment: 'tout', competences: ['Permis B'], equipe: 'Mobilité', priorite: 'Normale'},
  {nom: 'Poste de secours', lieu: 'Infirmerie', min: 1, max: 2, moment: 'tout', competences: ['SST', 'Majeur'], equipe: 'Logistique', priorite: 'Critique'},
  {nom: 'Merchandising', lieu: 'Stand merch', min: 1, max: 3, moment: 'soiree', competences: ['Caisse'], equipe: 'Logistique', priorite: 'Confort'},
  {nom: 'Montage et démontage', lieu: 'Site', min: 3, max: 8, moment: 'journee', competences: ['Manutention'], equipe: 'Logistique', priorite: 'Normale'},
];

const NOMS_ARTISTES = [
  'Les Ondes Courtes', 'Marceline', 'Cactus Club', 'Nuit Blanche', 'Zéphyr',
  'Bloc Nord', 'La Fanfare Mobile', 'Sœurs Volage', 'Radio Cactus', 'Vertigo',
  'Papier Mâché', 'Quatre Heures', 'Le Grand Bain', 'Hors Piste', 'Mistral',
  'Sable Fin', 'Télégramme', 'Bonne Pioche', 'Orage Sec', 'Carillon',
  'Fleuve', 'Tandem', 'Bleu Nuit', 'Kilomètre Zéro', 'Perpétuel',
  'Les Voisins', 'Halogène', 'Marée Haute', 'Pic Rouge', 'Sous-Bois',
];

const SCENES = ['Grande scène', 'Scène club', 'Chapiteau', 'Scène découverte'];

/** Tire un élément au hasard dans un tableau. */
function tirer(aleatoire, tableau) {
  return tableau[Math.floor(aleatoire() * tableau.length)];
}

/** Tire `nombre` éléments distincts d'un tableau. */
function tirerPlusieurs(aleatoire, tableau, nombre) {
  const restants = [...tableau];
  const choisis = [];
  for (let i = 0; i < nombre && restants.length > 0; i++) {
    choisis.push(...restants.splice(Math.floor(aleatoire() * restants.length), 1));
  }
  return choisis;
}

/** Entier entre `min` et `max`, bornes comprises. */
function entier(aleatoire, min, max) {
  return min + Math.floor(aleatoire() * (max - min + 1));
}

/**
 * Encode une valeur ChoiceList pour l'API Grist : un tableau JS brut est
 * rejeté, il faut le préfixer du code d'objet `L` (liste). Voir
 * `GristObjCode.List` dans les sources de grist-core (`app/plugin/GristData.ts`).
 */
function listeGrist(valeurs) {
  return ['L', ...valeurs];
}

/**
 * Construit le jeu de données complet.
 *
 * Les objets rendus portent des `_ref` locales (indices dans leur propre
 * tableau) là où une colonne Grist attend une référence ; `seed.mjs` les
 * remplace par les identifiants de ligne réels après insertion.
 */
export function genererFestival(options = {}) {
  const {
    graine = 20260717,
    nbJours = 5,
    nbBenevoles = 70,
    nbEquipes = 3,
    nbArtistes = 20,
    dureeSousCreneauMinutes = 90,
    debut = {annee: 2026, mois: 7, jour: 17},
    partAffectees = 0.85,
  } = options;

  const aleatoire = generateurAleatoire(graine);
  const heure = (jourOffset, heures, minutes = 0) => epochDepuisHeureLocale({
    annee: debut.annee, mois: debut.mois, jour: debut.jour + jourOffset, heures, minutes,
  }, TIMEZONE);

  // --- Équipes -------------------------------------------------------------
  // Le catalogue ci-dessus (8 noms) est un maximum réaliste : en dessous, on
  // en prend un sous-ensemble ; au-dessus, on complète par des noms génériques.
  const catalogueEquipes = nbEquipes <= NOMS_EQUIPES.length
    ? NOMS_EQUIPES.slice(0, nbEquipes)
    : [
      ...NOMS_EQUIPES,
      ...Array.from({length: nbEquipes - NOMS_EQUIPES.length}, (_, i) => ({
        nom: `Équipe ${NOMS_EQUIPES.length + i + 1}`,
        couleur: NOMS_EQUIPES[(NOMS_EQUIPES.length + i) % NOMS_EQUIPES.length].couleur,
      })),
    ];
  const equipes = catalogueEquipes.map((e) => ({Nom: e.nom, Couleur: e.couleur, Notes: ''}));
  const nomsEquipesRetenues = new Set(catalogueEquipes.map((e) => e.nom));

  // `equipeEffective` reste interne au générateur (la table Missions ne garde
  // qu'une référence directe, mais le catalogue est écrit en dur avec 8
  // équipes) : une mission dont l'équipe d'origine n'est pas retenue est
  // reportée sur une équipe retenue, par rotation déterministe.
  const equipeEffectiveParMission = CATALOGUE_MISSIONS.map((m, i) => (
    nomsEquipesRetenues.has(m.equipe) ? m.equipe : catalogueEquipes[i % catalogueEquipes.length].nom
  ));

  // --- Lieux -----------------------------------------------------------------
  const nomsLieux = [...new Set([...CATALOGUE_MISSIONS.map((m) => m.lieu), ...SCENES])];
  const lieux = nomsLieux.map((nom) => ({Nom: nom, Description: ''}));
  const refLieu = new Map(nomsLieux.map((nom, i) => [nom, i]));

  // --- Bénévoles -------------------------------------------------------------
  const benevoles = [];
  const combinaisonsUtilisees = new Set();
  for (let i = 0; i < nbBenevoles; i++) {
    let prenom, nom, cle;
    do {
      prenom = tirer(aleatoire, PRENOMS);
      nom = tirer(aleatoire, NOMS);
      cle = `${prenom} ${nom}`;
    } while (combinaisonsUtilisees.has(cle));
    combinaisonsUtilisees.add(cle);

    const equipe = entier(aleatoire, 0, equipes.length - 1);
    const quotaMin = entier(aleatoire, 4, 12);
    benevoles.push({
      Nom: cle,
      Contact: `${prenom}.${nom}`.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z.]/g, '')
        + `@exemple.test`,
      Equipe: {_ref: equipe},
      Competences: listeGrist(tirerPlusieurs(aleatoire, ['Majeur', 'Permis B', 'Caisse', 'SST', 'Manutention', 'Anglais'], entier(aleatoire, 1, 4))),
      Quota_heures_min: quotaMin,
      Quota_heures_max: quotaMin + entier(aleatoire, 4, 12),
      Statut: 'Actif',
      Notes: '',
    });
  }

  // Une personne référente par équipe, choisie parmi ses membres.
  equipes.forEach((equipe, indexEq) => {
    const membres = benevoles
      .map((b, i) => ({b, i}))
      .filter(({b}) => b.Equipe._ref === indexEq);
    if (membres.length > 0) {
      equipe.Referent = {_ref: membres[Math.floor(aleatoire() * membres.length)].i};
    }
  });

  // --- Missions --------------------------------------------------------------
  const missions = CATALOGUE_MISSIONS.map((m) => ({
    Nom: m.nom,
    Description: `${m.nom} — ${m.lieu}`,
    Lieu: {_ref: refLieu.get(m.lieu)},
    Equipe: {_ref: [...nomsEquipesRetenues].indexOf(equipeEffectiveParMission[CATALOGUE_MISSIONS.indexOf(m)])},
    Priorite: m.priorite,
    Competences_requises: listeGrist(m.competences),
  }));

  // --- Macro-créneaux et sous-créneaux ----------------------------------------
  const macroCreneaux = [];
  const sousCreneaux = [];
  const joursSemaine = ['vendredi', 'samedi', 'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi'];

  for (let j = 0; j < nbJours; j++) {
    const libelleJour = joursSemaine[j % joursSemaine.length];
    const plages = [
      {nom: `Journée ${libelleJour}`, moment: 'journee', debut: heure(j, 10), fin: heure(j, 18)},
      {nom: `Soirée ${libelleJour}`, moment: 'soiree', debut: heure(j, 18), fin: heure(j + 1, 2)},
    ];
    for (const plage of plages) {
      const refMacro = macroCreneaux.length;
      macroCreneaux.push({
        Nom: plage.nom, Debut: plage.debut, Fin: plage.fin, _moment: plage.moment,
      });
      for (let t = plage.debut; t < plage.fin; t += dureeSousCreneauMinutes * 60) {
        const fin = Math.min(t + dureeSousCreneauMinutes * 60, plage.fin);
        sousCreneaux.push({
          Macro_creneau: {_ref: refMacro},
          Mission: 0, // vide : sous-créneaux communs à toutes les missions (§6.2)
          Libelle: `${libelleCourt(t, TIMEZONE)}–${libelleHeure(fin, TIMEZONE)}`,
          Debut: t,
          Fin: fin,
          _moment: plage.moment,
        });
      }
    }
  }

  // --- Artistes ----------------------------------------------------------
  // Le catalogue de noms (30) borne le nombre d'artistes distincts possible ;
  // au-delà, on numérote pour rester déterministe plutôt que de répéter un nom.
  const nomsArtistesDisponibles = nbArtistes <= NOMS_ARTISTES.length
    ? [...NOMS_ARTISTES]
    : [...NOMS_ARTISTES, ...Array.from(
      {length: nbArtistes - NOMS_ARTISTES.length},
      (_, i) => `Artiste ${NOMS_ARTISTES.length + i + 1}`,
    )];
  const artistes = [];
  for (let j = 0; j < nbJours && artistes.length < nbArtistes; j++) {
    for (const scene of SCENES) {
      if (artistes.length >= nbArtistes) { break; }
      let t = heure(j, scene === 'Scène découverte' ? 14 : 19);
      const finScene = heure(j + 1, scene === 'Scène découverte' ? -6 : 1);
      while (t < finScene && nomsArtistesDisponibles.length > 0 && artistes.length < nbArtistes) {
        const duree = entier(aleatoire, 3, 6) * 15 * 60; // 45 min à 1 h 30
        artistes.push({
          Nom: nomsArtistesDisponibles.splice(Math.floor(aleatoire() * nomsArtistesDisponibles.length), 1)[0],
          Lieu: {_ref: refLieu.get(scene)},
          Debut: t,
          Fin: t + duree,
        });
        t += duree + 30 * 60; // 30 min de battement entre deux passages
      }
    }
  }

  // --- Besoins -------------------------------------------------------------
  const besoins = [];
  sousCreneaux.forEach((sousCreneau, refSousCreneau) => {
    CATALOGUE_MISSIONS.forEach((mission, refMission) => {
      const pertinente = mission.moment === 'tout' || mission.moment === sousCreneau._moment;
      // Une mission pertinente est ouverte la plupart du temps, pas toujours.
      if (!pertinente || aleatoire() > 0.85) { return; }
      const min = Math.max(1, mission.min + entier(aleatoire, -1, 1));
      const max = Math.max(min, mission.max + entier(aleatoire, -2, 0));
      besoins.push({
        Mission: {_ref: refMission},
        Sous_creneau: {_ref: refSousCreneau},
        Effectif_min: min,
        Effectif_max: max,
        Taille_groupe: min >= 4 ? 2 : Math.min(min, 2) || 1,
      });
    });
  });

  // --- Disponibilités au quart d'heure ---------------------------------
  const pasSecondes = PAS_MINUTES * 60;
  const quartsDHeure = [];
  for (const macro of macroCreneaux) {
    for (let t = macro.Debut; t < macro.Fin; t += pasSecondes) { quartsDHeure.push(t); }
  }

  const disponibilites = [];
  benevoles.forEach((benevole, refBenevole) => {
    // Périodes d'indisponibilité : quelques blocs contigus dans le festival.
    const blocsIndispo = [];
    for (let k = 0; k < entier(aleatoire, 1, 4); k++) {
      const depart = tirer(aleatoire, quartsDHeure);
      blocsIndispo.push([depart, depart + entier(aleatoire, 2, 16) * pasSecondes]);
    }
    // Artistes que le bénévole veut voir.
    const souhaits = tirerPlusieurs(aleatoire, artistes, entier(aleatoire, 0, 4))
      .map((a) => ({artiste: a, ref: artistes.indexOf(a)}));

    for (const t of quartsDHeure) {
      const indispo = blocsIndispo.some(([d, f]) => t >= d && t < f);
      const souhait = souhaits.find(({artiste}) => t >= artiste.Debut && t < artiste.Fin);
      if (indispo) {
        disponibilites.push({Benevole: {_ref: refBenevole}, Quart_heure: t, Statut: 'Indisponible', Artiste: 0});
      } else if (souhait) {
        disponibilites.push({Benevole: {_ref: refBenevole}, Quart_heure: t, Statut: 'Artiste', Artiste: {_ref: souhait.ref}});
      } else {
        disponibilites.push({Benevole: {_ref: refBenevole}, Quart_heure: t, Statut: 'Disponible', Artiste: 0});
      }
    }
  });

  // --- Souhaits de mission -------------------------------------------------
  const ECHELLE = ['Refuse', 'Réticent', 'Neutre', 'Intéressé', 'Souhaite fortement'];
  const souhaitsMissions = [];
  benevoles.forEach((benevole, refBenevole) => {
    const concernees = tirerPlusieurs(aleatoire, missions.map((_, i) => i), entier(aleatoire, 2, 5));
    for (const refMission of concernees) {
      // Distribution volontairement favorable au centre-haut de l'échelle :
      // la plupart des souhaits exprimés sont positifs, les refus sont rares.
      const tirage = aleatoire();
      const niveau = tirage < 0.08 ? 0 : tirage < 0.2 ? 1 : tirage < 0.45 ? 2 : tirage < 0.8 ? 3 : 4;
      souhaitsMissions.push({
        Benevole: {_ref: refBenevole}, Mission: {_ref: refMission}, Preference: ECHELLE[niveau],
      });
    }
  });
  const preferenceParPaire = new Map(
    souhaitsMissions.map((s) => [`${s.Benevole._ref}:${s.Mission._ref}`, s.Preference]),
  );

  // --- Affinités -------------------------------------------------------------
  // Un petit nombre de paires, par équipe pour « ensemble » (plausible : des
  // amis qui se sont inscrits ensemble), inter-équipes pour « éviter ».
  const affinites = [];
  catalogueEquipes.forEach((_, refEquipe) => {
    const membres = benevoles.map((b, i) => ({b, i})).filter(({b}) => b.Equipe._ref === refEquipe).map(({i}) => i);
    for (let k = 0; k < Math.min(2, Math.floor(membres.length / 4)); k++) {
      const [a, b] = tirerPlusieurs(aleatoire, membres, 2);
      if (a !== undefined && b !== undefined) {
        affinites.push({Benevole_A: {_ref: a}, Benevole_B: {_ref: b}, Type: 'Ensemble'});
      }
    }
  });
  for (let k = 0; k < Math.min(3, Math.floor(benevoles.length / 20)); k++) {
    const [a, b] = tirerPlusieurs(aleatoire, benevoles.map((_, i) => i), 2);
    if (a !== undefined && b !== undefined) {
      affinites.push({Benevole_A: {_ref: a}, Benevole_B: {_ref: b}, Type: 'Éviter'});
    }
  }

  // --- Groupes, positions et places ------------------------------------------
  //
  // Un groupe (indicatif) est créé pour un macro-créneau et une équipe donnés,
  // puis positionné sur les besoins de cette équipe au sein de ce
  // macro-créneau, en tournant d'une mission à l'autre d'un sous-créneau au
  // suivant (§6.3 : « ce sont les missions qui tournent, pas les personnes »).
  // Son roster (Places) est tiré une seule fois et vaut pour toutes ses
  // positions.
  const groupes = [];
  const positionsGroupe = [];
  const places = [];
  const occupationParBenevole = new Map(); // refBenevole -> Set de refSousCreneau déjà pris
  benevoles.forEach((_, i) => occupationParBenevole.set(i, new Set()));

  // Un bénévole est indisponible sur un sous-créneau dès qu'il l'est sur au
  // moins un quart d'heure de ce sous-créneau.
  const indisponibleAuQuart = new Set(
    disponibilites.filter((d) => d.Statut !== 'Disponible').map((d) => `${d.Benevole._ref}@${d.Quart_heure}`),
  );
  const indisponibleParSousCreneau = new Map(); // refBenevole -> Set de refSousCreneau
  benevoles.forEach((_, refBenevole) => {
    const indispos = new Set();
    sousCreneaux.forEach((sousCreneau, refSousCreneau) => {
      for (let t = sousCreneau.Debut; t < sousCreneau.Fin; t += pasSecondes) {
        if (indisponibleAuQuart.has(`${refBenevole}@${t}`)) { indispos.add(refSousCreneau); return; }
      }
    });
    indisponibleParSousCreneau.set(refBenevole, indispos);
  });

  /** Choisit un roster de `taille` bénévoles de l'équipe donnée pour un nouveau groupe. */
  function tirerRoster(refEquipe, refSousCreneauInitial, taille) {
    const candidats = benevoles
      .map((b, i) => ({b, i}))
      .filter(({b, i}) => b.Equipe._ref === refEquipe
        && !occupationParBenevole.get(i).has(refSousCreneauInitial)
        && !indisponibleParSousCreneau.get(i).has(refSousCreneauInitial));
    const choisis = tirerPlusieurs(aleatoire, candidats, taille);
    return choisis.map(({i}) => i);
  }

  // Un besoin est déjà couvert lorsque la somme des tailles de ses positions
  // atteint son effectif minimum.
  const couvertureParBesoin = new Map(besoins.map((_, i) => [i, 0]));
  // Anomalie volontaire n°1 : ce besoin restera sous-staffé (§7.2 objectif 1 —
  // on ne force jamais un bénévole contre son souhait pour boucler l'effectif).
  const refBesoinSousStaffe = besoins.findIndex((b) => b.Effectif_min >= 2);

  besoins.forEach((besoin, refBesoin) => {
    if (refBesoin === refBesoinSousStaffe) { return; } // volontairement non couvert
    const refEquipe = [...nomsEquipesRetenues].indexOf(equipeEffectiveParMission[besoin.Mission._ref]);
    const refSousCreneau = besoin.Sous_creneau._ref;
    let tentatives = 0;
    while (couvertureParBesoin.get(refBesoin) < besoin.Effectif_min && tentatives < 8) {
      tentatives++;
      const refGroupe = groupes.length;
      const roster = tirerRoster(refEquipe, refSousCreneau, besoin.Taille_groupe);
      if (roster.length === 0) { break; } // plus personne de disponible dans l'équipe : anomalie naturelle
      groupes.push({
        Code: `${catalogueEquipes[refEquipe].nom.slice(0, 2).toUpperCase()}${String(refGroupe + 1).padStart(2, '0')}`,
        Taille: besoin.Taille_groupe,
        Equipe: {_ref: refEquipe},
        Notes: '',
      });
      roster.forEach((refBenevole, rang) => {
        occupationParBenevole.get(refBenevole).add(refSousCreneau);
        const souhait = preferenceParPaire.get(`${refBenevole}:${besoin.Mission._ref}`);
        places.push({
          Groupe: {_ref: refGroupe},
          Rang: rang + 1,
          Benevole: {_ref: refBenevole},
          Origine: 'Algorithme',
          Verrouillee: false,
          Score: souhait === 'Souhaite fortement' ? 1 : souhait === 'Intéressé' ? 0.8 : 0.6,
        });
      });
      positionsGroupe.push({Groupe: {_ref: refGroupe}, Besoin: {_ref: refBesoin}});
      couvertureParBesoin.set(refBesoin, couvertureParBesoin.get(refBesoin) + roster.length);

      // Le groupe reste actif sur le reste du macro-créneau : on le repositionne
      // sur d'autres besoins de son équipe dans les sous-créneaux suivants, tant
      // que son roster reste disponible. C'est le mécanisme « Beta12 » du §6.3.
      const macroDuSousCreneau = sousCreneaux[refSousCreneau]._moment;
      const autresBesoinsDuGroupe = besoins
        .map((b, i) => ({b, i}))
        .filter(({b, i}) => i !== refBesoin
          && i !== refBesoinSousStaffe
          && [...nomsEquipesRetenues].indexOf(equipeEffectiveParMission[b.Mission._ref]) === refEquipe
          && sousCreneaux[b.Sous_creneau._ref]._moment === macroDuSousCreneau
          && sousCreneaux[b.Sous_creneau._ref].Debut > sousCreneaux[refSousCreneau].Debut
          && couvertureParBesoin.get(i) < b.Effectif_min
          && roster.every((refBenevole) => !occupationParBenevole.get(refBenevole).has(b.Sous_creneau._ref)
            && !indisponibleParSousCreneau.get(refBenevole).has(b.Sous_creneau._ref)));
      if (autresBesoinsDuGroupe.length > 0 && aleatoire() < 0.6) {
        const {b: besoinSuivant, i: refBesoinSuivant} = tirer(aleatoire, autresBesoinsDuGroupe);
        roster.forEach((refBenevole) => occupationParBenevole.get(refBenevole).add(besoinSuivant.Sous_creneau._ref));
        positionsGroupe.push({Groupe: {_ref: refGroupe}, Besoin: {_ref: refBesoinSuivant}});
        couvertureParBesoin.set(refBesoinSuivant, couvertureParBesoin.get(refBesoinSuivant) + roster.length);
      }
    }
  });

  // Anomalie volontaire n°2 : un ou deux conflits repérables (bénévole placé
  // malgré un souhait de refus, ou malgré une indisponibilité), pour éprouver
  // la vue anomalies. On ne force jamais ça par l'algorithme normal — on le
  // pose ici explicitement, comme le ferait une correction manuelle malheureuse.
  const conflits = [];
  const refuts = souhaitsMissions.filter((s) => s.Preference === 'Refuse');
  for (const refus of refuts) {
    if (conflits.length >= 1) { break; }
    const positionCandidate = positionsGroupe.find((p) => besoins[p.Besoin._ref].Mission._ref === refus.Mission._ref);
    if (!positionCandidate) { continue; }
    const placeCible = places.find((pl) => pl.Groupe._ref === positionCandidate.Groupe._ref);
    if (!placeCible) { continue; }
    placeCible.Benevole = refus.Benevole;
    placeCible.Origine = 'Manuel';
    placeCible.Score = 0;
    conflits.push('souhait refusé');
  }
  benevoles.forEach((_, refBenevole) => {
    if (conflits.length >= 2) { return; }
    const indispos = indisponibleParSousCreneau.get(refBenevole);
    const positionCandidate = positionsGroupe.find((p) => indispos.has(besoins[p.Besoin._ref].Sous_creneau._ref));
    if (!positionCandidate) { return; }
    const placeCible = places.find((pl) => pl.Groupe._ref === positionCandidate.Groupe._ref);
    if (!placeCible) { return; }
    placeCible.Benevole = {_ref: refBenevole};
    placeCible.Origine = 'Manuel';
    placeCible.Score = 0;
    conflits.push('indisponibilité');
  });
  void partAffectees; // conservé en option publique, non utilisé par ce mécanisme de couverture

  // Les champs techniques préfixés d'un souligné ne partent pas dans Grist.
  const sansChampsInternes = (lignes) => lignes.map((ligne) =>
    Object.fromEntries(Object.entries(ligne).filter(([cle]) => !cle.startsWith('_'))));

  return {
    Equipes: equipes,
    Lieux: lieux,
    Benevoles: benevoles,
    Missions: missions,
    Artistes: artistes,
    Macro_creneaux: sansChampsInternes(macroCreneaux),
    Sous_creneaux: sansChampsInternes(sousCreneaux),
    Besoins: besoins,
    Groupes: groupes,
    Positions_groupe: positionsGroupe,
    Places: places,
    Disponibilites: disponibilites,
    Souhaits_missions: souhaitsMissions,
    Affinites: affinites,
    Versions: [],
    Journal: [],
  };
}
