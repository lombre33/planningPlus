/**
 * Génération d'un jeu de données de festival.
 *
 * Le tirage est déterministe : à graine égale, le jeu de données est
 * identique. C'est ce qui permet de rejouer une batterie de tests sur des
 * données stables, et de reproduire un bogue à l'identique.
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
  {nom: 'Accueil public', lieu: 'Entrée principale', min: 2, max: 6, moment: 'tout', competences: ['Anglais'], equipe: 'Accueil'},
  {nom: 'Billetterie', lieu: 'Guichet', min: 2, max: 4, moment: 'tout', competences: ['Caisse', 'Majeur'], equipe: 'Billetterie'},
  {nom: 'Contrôle des bracelets', lieu: 'Entrée principale', min: 2, max: 6, moment: 'tout', competences: ['Majeur'], equipe: 'Accueil'},
  {nom: 'Bar grande scène', lieu: 'Grande scène', min: 4, max: 8, moment: 'tout', competences: ['Majeur', 'Caisse'], equipe: 'Bars'},
  {nom: 'Bar chapiteau', lieu: 'Chapiteau', min: 2, max: 6, moment: 'soiree', competences: ['Majeur'], equipe: 'Bars'},
  {nom: 'Plateau grande scène', lieu: 'Grande scène', min: 2, max: 4, moment: 'tout', competences: ['Manutention'], equipe: 'Scènes'},
  {nom: 'Plateau scène club', lieu: 'Scène club', min: 2, max: 4, moment: 'soiree', competences: ['Manutention'], equipe: 'Scènes'},
  {nom: 'Loges et artistes', lieu: 'Loges', min: 2, max: 4, moment: 'tout', competences: ['Anglais'], equipe: 'Scènes'},
  {nom: 'Catering bénévoles', lieu: 'Cantine', min: 2, max: 6, moment: 'tout', competences: [], equipe: 'Catering'},
  {nom: 'Propreté site', lieu: 'Site', min: 3, max: 8, moment: 'tout', competences: [], equipe: 'Propreté'},
  {nom: 'Tri des déchets', lieu: 'Zone technique', min: 2, max: 4, moment: 'tout', competences: ['Manutention'], equipe: 'Propreté'},
  {nom: 'Parking et navettes', lieu: 'Parking', min: 2, max: 5, moment: 'tout', competences: ['Permis B'], equipe: 'Mobilité'},
  {nom: 'Poste de secours', lieu: 'Infirmerie', min: 1, max: 2, moment: 'tout', competences: ['SST', 'Majeur'], equipe: 'Logistique'},
  {nom: 'Merchandising', lieu: 'Stand merch', min: 1, max: 3, moment: 'soiree', competences: ['Caisse'], equipe: 'Logistique'},
  {nom: 'Montage et démontage', lieu: 'Site', min: 3, max: 8, moment: 'journee', competences: ['Manutention'], equipe: 'Logistique'},
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
 * Construit le jeu de données complet.
 *
 * Les objets rendus portent des `_ref` locales (indices dans leur propre
 * tableau) là où une colonne Grist attend une référence ; `seed.mjs` les
 * remplace par les identifiants de ligne réels après insertion.
 */
export function genererFestival(options = {}) {
  const {
    graine = 20260717,
    nbJours = 3,
    nbBenevoles = 120,
    dureeSousCreneauMinutes = 120,
    debut = {annee: 2026, mois: 7, jour: 17},
    partAffectees = 0.85,
  } = options;

  const aleatoire = generateurAleatoire(graine);
  const heure = (jourOffset, heures, minutes = 0) => epochDepuisHeureLocale({
    annee: debut.annee, mois: debut.mois, jour: debut.jour + jourOffset, heures, minutes,
  }, TIMEZONE);

  // --- Équipes ---------------------------------------------------------
  const equipes = NOMS_EQUIPES.map((e) => ({
    Nom: e.nom, Couleur: e.couleur, Notes: '',
  }));
  const indexEquipe = new Map(NOMS_EQUIPES.map((e, i) => [e.nom, i]));

  // --- Missions --------------------------------------------------------
  const missions = CATALOGUE_MISSIONS.map((m) => ({
    Nom: m.nom,
    Description: `${m.nom} — ${m.lieu}`,
    Lieu: m.lieu,
    MinBenevoles: m.min,
    MaxBenevoles: m.max,
    Competences: ['L', ...m.competences],
    Active: true,
  }));

  // --- Macro-créneaux et sous-créneaux ---------------------------------
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
        Nom: plage.nom,
        Jour: heure(j, 0),
        Debut: plage.debut,
        Fin: plage.fin,
        Notes: '',
        _moment: plage.moment,
      });
      for (let t = plage.debut; t < plage.fin; t += dureeSousCreneauMinutes * 60) {
        const fin = Math.min(t + dureeSousCreneauMinutes * 60, plage.fin);
        sousCreneaux.push({
          MacroCreneau: {_ref: refMacro},
          Libelle: `${libelleCourt(t, TIMEZONE)}–${libelleHeure(fin, TIMEZONE)}`,
          Debut: t,
          Fin: fin,
          _moment: plage.moment,
        });
      }
    }
  }

  // --- Artistes --------------------------------------------------------
  const artistes = [];
  const nomsDisponibles = [...NOMS_ARTISTES];
  for (let j = 0; j < nbJours; j++) {
    for (const scene of SCENES) {
      let t = heure(j, scene === 'Scène découverte' ? 14 : 19);
      const finScene = heure(j + 1, scene === 'Scène découverte' ? -6 : 1);
      while (t < finScene && nomsDisponibles.length > 0) {
        const duree = entier(aleatoire, 3, 6) * 15 * 60; // 45 min à 1 h 30
        artistes.push({
          Nom: nomsDisponibles.splice(Math.floor(aleatoire() * nomsDisponibles.length), 1)[0],
          Scene: scene,
          Debut: t,
          Fin: t + duree,
          Notes: '',
        });
        t += duree + 30 * 60; // 30 min de battement entre deux passages
      }
    }
  }

  // --- Bénévoles -------------------------------------------------------
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
    benevoles.push({
      Prenom: prenom,
      Nom: nom,
      NomComplet: cle,
      Email: `${prenom}.${nom}`.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z.]/g, '')
        + `@exemple.test`,
      Telephone: `06${String(entier(aleatoire, 10000000, 99999999))}`,
      Equipe: {_ref: equipe},
      Competences: ['L', ...tirerPlusieurs(aleatoire, ['Majeur', 'Permis B', 'Caisse', 'SST', 'Manutention', 'Anglais'], entier(aleatoire, 0, 3))],
      HeuresMax: entier(aleatoire, 8, 24),
      Notes: '',
    });
  }

  // Une personne responsable par équipe, choisie parmi ses membres.
  equipes.forEach((equipe, indexEq) => {
    const membres = benevoles
      .map((b, i) => ({b, i}))
      .filter(({b}) => b.Equipe._ref === indexEq);
    if (membres.length > 0) {
      equipe.Responsable = {_ref: membres[Math.floor(aleatoire() * membres.length)].i};
    }
  });

  // --- Besoins ---------------------------------------------------------
  const besoins = [];
  sousCreneaux.forEach((sousCreneau, refSousCreneau) => {
    CATALOGUE_MISSIONS.forEach((mission, refMission) => {
      const pertinente = mission.moment === 'tout' || mission.moment === sousCreneau._moment;
      // Une mission pertinente est ouverte la plupart du temps, pas toujours.
      if (!pertinente || aleatoire() > 0.85) { return; }
      const min = Math.max(1, mission.min + entier(aleatoire, -1, 1));
      besoins.push({
        Mission: {_ref: refMission},
        SousCreneau: {_ref: refSousCreneau},
        MinBenevoles: min,
        MaxBenevoles: Math.max(min, mission.max + entier(aleatoire, -2, 0)),
        Notes: '',
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
        disponibilites.push({
          Benevole: {_ref: refBenevole}, Debut: t, Statut: 'Indisponible',
          Artiste: 0, Commentaire: '',
        });
      } else if (souhait) {
        disponibilites.push({
          Benevole: {_ref: refBenevole}, Debut: t, Statut: 'Artiste',
          Artiste: {_ref: souhait.ref, _table: 'Artistes'}, Commentaire: '',
        });
      } else {
        disponibilites.push({
          Benevole: {_ref: refBenevole}, Debut: t, Statut: 'Disponible',
          Artiste: 0, Commentaire: '',
        });
      }
    }
  });

  // --- Préférences de mission ------------------------------------------
  const preferences = [];
  benevoles.forEach((benevole, refBenevole) => {
    const souhaitees = tirerPlusieurs(aleatoire, missions.map((_, i) => i), entier(aleatoire, 1, 4));
    const refusees = tirerPlusieurs(
      aleatoire,
      missions.map((_, i) => i).filter((i) => !souhaitees.includes(i)),
      entier(aleatoire, 0, 2),
    );
    for (const refMission of souhaitees) {
      preferences.push({
        Benevole: {_ref: refBenevole}, Mission: {_ref: refMission},
        Souhait: 'Souhaite', Commentaire: '',
      });
    }
    for (const refMission of refusees) {
      preferences.push({
        Benevole: {_ref: refBenevole}, Mission: {_ref: refMission},
        Souhait: 'Refuse', Commentaire: '',
      });
    }
  });

  // --- Binômes ---------------------------------------------------------
  // Assez d'indicatifs par équipe pour couvrir les besoins qui lui reviennent.
  const binomes = [];
  const binomesParEquipe = new Map();
  NOMS_EQUIPES.forEach((equipe, refEquipe) => {
    const initiale = equipe.nom.slice(0, 2).toUpperCase();
    const indicatifs = [];
    for (let k = 1; k <= 24; k++) {
      // Un trinôme sur six, pour vérifier que la dimension n tient.
      const taille = k % 6 === 0 ? 3 : 2;
      indicatifs.push(binomes.length);
      binomes.push({
        Indicatif: `${initiale}${String(k).padStart(2, '0')}`,
        Equipe: {_ref: refEquipe},
        Taille: taille,
        Notes: '',
      });
    }
    binomesParEquipe.set(equipe.nom, indicatifs);
  });

  // --- Postes ----------------------------------------------------------
  // Un besoin est couvert par autant de binômes que nécessaire pour atteindre
  // son minimum. Les indicatifs tournent au sein de l'équipe de la mission.
  const postes = [];
  const compteurParEquipe = new Map();
  besoins.forEach((besoin, refBesoin) => {
    const mission = CATALOGUE_MISSIONS[besoin.Mission._ref];
    const indicatifs = binomesParEquipe.get(mission.equipe);
    let places = 0;
    while (places < besoin.MinBenevoles) {
      const compteur = compteurParEquipe.get(mission.equipe) ?? 0;
      compteurParEquipe.set(mission.equipe, compteur + 1);
      const refBinome = indicatifs[compteur % indicatifs.length];
      postes.push({
        Besoin: {_ref: refBesoin},
        Mission: {_ref: besoin.Mission._ref, _table: 'Missions'},
        SousCreneau: {_ref: besoin.SousCreneau._ref, _table: 'SousCreneaux'},
        Binome: {_ref: refBinome, _table: 'Binomes'},
        Places: binomes[refBinome].Taille,
        Notes: '',
      });
      places += binomes[refBinome].Taille;
    }
  });

  // --- Affectations ----------------------------------------------------
  // Remplissage glouton : il produit des données de test crédibles, il ne
  // prétend pas être l'algorithme d'affectation du projet.
  const affectations = [];
  const occupation = new Map(); // refBenevole -> Set de refSousCreneau déjà pris
  const indisponible = new Map(); // refBenevole -> Set de refSousCreneau non disponibles

  benevoles.forEach((_, refBenevole) => {
    occupation.set(refBenevole, new Set());
    indisponible.set(refBenevole, new Set());
  });
  // Un bénévole est considéré indisponible sur un sous-créneau dès qu'il l'est
  // sur au moins un quart d'heure de ce sous-créneau.
  const parBenevoleEtQuart = new Map();
  for (const dispo of disponibilites) {
    if (dispo.Statut !== 'Disponible') {
      parBenevoleEtQuart.set(`${dispo.Benevole._ref}@${dispo.Debut}`, true);
    }
  }
  sousCreneaux.forEach((sousCreneau, refSousCreneau) => {
    benevoles.forEach((_, refBenevole) => {
      for (let t = sousCreneau.Debut; t < sousCreneau.Fin; t += pasSecondes) {
        if (parBenevoleEtQuart.has(`${refBenevole}@${t}`)) {
          indisponible.get(refBenevole).add(refSousCreneau);
          return;
        }
      }
    });
  });

  const prefereePar = new Map(); // "refBenevole:refMission" -> 'Souhaite' | 'Refuse'
  for (const pref of preferences) {
    prefereePar.set(`${pref.Benevole._ref}:${pref.Mission._ref}`, pref.Souhait);
  }

  postes.forEach((poste, refPoste) => {
    const refSousCreneau = poste.SousCreneau._ref;
    const refMission = poste.Mission._ref;
    const refEquipe = binomes[poste.Binome._ref].Equipe._ref;
    for (let place = 1; place <= poste.Places; place++) {
      const candidats = benevoles
        .map((b, i) => ({b, i}))
        .filter(({b, i}) => b.Equipe._ref === refEquipe
          && !occupation.get(i).has(refSousCreneau)
          && !indisponible.get(i).has(refSousCreneau)
          && prefereePar.get(`${i}:${refMission}`) !== 'Refuse');
      const souhaite = candidats.filter(({i}) => prefereePar.get(`${i}:${refMission}`) === 'Souhaite');
      const pool = souhaite.length > 0 ? souhaite : candidats;
      const retenu = pool.length > 0 && aleatoire() < partAffectees
        ? pool[Math.floor(aleatoire() * pool.length)]
        : null;
      if (retenu) { occupation.get(retenu.i).add(refSousCreneau); }
      affectations.push({
        Poste: {_ref: refPoste},
        Place: place,
        Benevole: retenu ? {_ref: retenu.i, _table: 'Benevoles'} : 0,
        Statut: retenu ? 'Proposée' : 'Non pourvue',
        Origine: retenu ? 'Algorithme' : 'Manuel',
        Score: retenu
          ? Number((prefereePar.get(`${retenu.i}:${refMission}`) === 'Souhaite' ? 1 : 0.6).toFixed(2))
          : 0,
        Commentaire: '',
      });
    }
  });

  // Les champs techniques préfixés d'un souligné ne partent pas dans Grist.
  const sansChampsInternes = (lignes) => lignes.map((ligne) =>
    Object.fromEntries(Object.entries(ligne).filter(([cle]) => !cle.startsWith('_'))));

  return {
    Equipes: equipes,
    Missions: missions,
    Artistes: artistes,
    Benevoles: benevoles,
    MacroCreneaux: sansChampsInternes(macroCreneaux),
    SousCreneaux: sansChampsInternes(sousCreneaux),
    Besoins: besoins,
    Disponibilites: disponibilites,
    PreferencesMission: preferences,
    Binomes: binomes,
    Postes: sansChampsInternes(postes),
    Affectations: affectations,
  };
}
