/**
 * Scénarios de la table d'affectation (maquette B, validée par Antoine le
 * 2026-09-29) : tous les moyens de couvrir une place, ou de déplacer une
 * personne, classés dans son ordre de priorité du 2026-09-25 —
 * disponibilité (dure : un scénario qui la viole n'existe pas), puis
 * binômes souhaités, puis 30 minutes de chaque artiste souhaité, puis
 * restauration, puis le moins de changements.
 *
 * Remplace la permutation unique de Jour J (`proposerPermutation`, la
 * première trouvée, seulement sans remplaçant direct) : ici chaque
 * remplaçant direct, chaque chaîne d'un déplacement et chaque échange est
 * listé, avec ce qu'il gagne et ce qu'il sacrifie.
 *
 * Aucune règle d'éligibilité n'est réécrite : le moteur juge (`moteur/`
 * `evaluerEligibilite`, mêmes contraintes dures que l'algorithme, appel
 * compris). Rien ici ne mute le magasin : un scénario n'est qu'une liste de
 * mouvements `{benevoleId, de, vers}` que le brouillon applique ensuite.
 */

import {versDonneesPlanning} from '../moteur/adaptateur-magasin.js';
import {construireContexte} from '../moteur/contexte.js';
import {construireEtatOccupation, evaluerEligibilite, liberer, occuper} from '../moteur/eligibilite.js';
import {PARAMETRES_PAR_DEFAUT} from '../moteur/types.js';
import {estACouvrir, evaluerMouvements} from './journee.js';

export const LIBELLE_INELIGIBILITE = {
  indisponible: 'pas disponible sur tous ses créneaux',
  competence_manquante: 'n’a pas la compétence requise',
  deja_occupe: 'déjà pris·e sur ces créneaux',
  autre_indicatif_meme_jour: 'tient déjà un autre indicatif sur ce créneau du jour',
  refus_mission: 'a refusé une de ses missions',
  statut_absent: 'marqué·e absent·e pour tout le festival',
  absent_appel: 'pointé·e absent·e à l’appel ce jour-là',
};

/** Contexte du moteur pour un état du planning (réel ou brouillon), construit une fois par rendu. */
export function preparerMoteur(m) {
  const ctx = construireContexte(versDonneesPlanning(m), PARAMETRES_PAR_DEFAUT);
  return {ctx, etat: construireEtatOccupation(ctx)};
}

/** Éligibilité d'un bénévole à un groupe, comme si les places `liberations` étaient d'abord quittées. */
function eligibilite(moteur, groupeId, benevoleId, liberations = []) {
  for (const l of liberations) { liberer(moteur.etat, moteur.ctx, l.groupeId, l.benevoleId); }
  try {
    return evaluerEligibilite(moteur.ctx, moteur.etat, groupeId, benevoleId);
  } finally {
    for (const l of liberations) { occuper(moteur.etat, moteur.ctx, l.groupeId, l.benevoleId); }
  }
}

const raisonLisible = (statut) => LIBELLE_INELIGIBILITE[statut.raison] ?? statut.raison;

/** Clé de tri, dans l'ordre d'Antoine (voir l'en-tête). */
export function cleTri(scenario) {
  const e = scenario.eval;
  return [
    -(e.binomesGagnes.length - e.binomesPerdus.length),
    -(e.artistesGagnes.length - e.artistesPerdus.length),
    -(e.restauGagnee.length - e.restauPerdue.length),
    e.dACouvrir,
    scenario.mouvements.length,
  ];
}

function comparer(x, y) {
  const a = cleTri(x);
  const b = cleTri(y);
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { return a[i] - b[i]; } }
  return 0;
}

/** Vrai si le scénario améliore au moins un critère sans rien découvrir. */
export function ameliore(scenario) {
  const e = scenario.eval;
  const gain = (e.binomesGagnes.length - e.binomesPerdus.length) * 100
    + (e.artistesGagnes.length - e.artistesPerdus.length) * 10
    + (e.restauGagnee.length - e.restauPerdue.length)
    - e.dACouvrir * 1000;
  return gain > 0;
}

function evaluerEtTrier(journee, scenarios) {
  for (const sc of scenarios) { sc.eval = evaluerMouvements(journee, journee.occupantParPlace, sc.mouvements); }
  return scenarios.sort(comparer);
}

function placesTenues(journee, benevoleId) {
  const ids = [];
  for (const [placeId, b] of journee.occupantParPlace) { if (b === benevoleId) { ids.push(placeId); } }
  return ids;
}

/** Bénévoles du jour qui peuvent entrer dans un scénario : ni absents, ni exclus. */
function candidatsDuJour(journee, exclus) {
  return [...journee.duJour].filter((b) => !journee.absents.has(b) && !exclus.has(b)).sort((a, b) => a - b);
}

/**
 * Tous les moyens de couvrir une place vide ou tenue par un absent : un
 * remplaçant direct, ou une chaîne d'un déplacement (quelqu'un d'un autre
 * indicatif la prend, et un autre reprend la sienne). Une place verrouillée
 * n'est jamais touchée : `verrouillee` le dit, sans scénario.
 */
export function scenariosPourPlace(journee, moteur, placeId) {
  const place = journee.placeParId.get(placeId);
  const groupeCible = journee.groupeDePlace.get(placeId);
  if (!place || !groupeCible) { return {scenarios: [], ecartes: [], verrouillee: false}; }
  if (place.Verrouillee) { return {scenarios: [], ecartes: [], verrouillee: true}; }
  const occupant = journee.occupantParPlace.get(placeId);
  const scenarios = [];
  const raisons = new Map();

  for (const w of candidatsDuJour(journee, new Set([occupant]))) {
    const statut = eligibilite(moteur, groupeCible.groupe.id, w);
    if (statut.eligible) {
      scenarios.push({mouvements: [{benevoleId: w, de: null, vers: placeId}]});
    } else {
      raisons.set(w, raisonLisible(statut));
    }
  }

  // Remplaçants possibles de chaque autre indicatif, calculés une fois.
  const remplacantsPar = new Map();
  const remplacantsDe = (g) => {
    if (!remplacantsPar.has(g)) {
      remplacantsPar.set(g, candidatsDuJour(journee, new Set([occupant]))
        .filter((w) => eligibilite(moteur, g.groupe.id, w).eligible));
    }
    return remplacantsPar.get(g);
  };

  for (const [autrePlaceId, d] of journee.occupantParPlace) {
    const g = journee.groupeDePlace.get(autrePlaceId);
    if (d == null || g === groupeCible || journee.absents.has(d) || d === occupant) { continue; }
    const autrePlace = journee.placeParId.get(autrePlaceId);
    // Pour qui tient déjà une place, la raison de la chaîne prime sur celle du
    // remplacement direct (« déjà pris·e ») : c'est elle qui dit quoi changer.
    if (autrePlace.Verrouillee) {
      raisons.set(d, `sa place ${g.groupe.Code} #${autrePlace.Rang} est verrouillée`);
      continue;
    }
    const statut = eligibilite(moteur, groupeCible.groupe.id, d, [{groupeId: g.groupe.id, benevoleId: d}]);
    if (!statut.eligible) {
      raisons.set(d, raisonLisible(statut));
      continue;
    }
    // Pour chaque personne qui peut venir, la meilleure façon de reprendre sa
    // place : sans ce tri, les chaînes se compteraient en centaines.
    let meilleure = null;
    for (const w of remplacantsDe(g)) {
      if (w === d) { continue; }
      const sc = {mouvements: [{benevoleId: d, de: autrePlaceId, vers: placeId}, {benevoleId: w, de: null, vers: autrePlaceId}]};
      sc.eval = evaluerMouvements(journee, journee.occupantParPlace, sc.mouvements);
      if (meilleure == null || comparer(sc, meilleure) < 0) { meilleure = sc; }
    }
    if (meilleure) {
      scenarios.push(meilleure);
    } else {
      raisons.set(d, `personne ne pourrait reprendre sa place en ${g.groupe.Code}`);
    }
  }

  evaluerEtTrier(journee, scenarios);
  const impliques = new Set(scenarios.flatMap((sc) => sc.mouvements.map((mv) => mv.benevoleId)));
  const ecartes = [...raisons].filter(([b]) => !impliques.has(b)).map(([benevoleId, raison]) => ({benevoleId, raison}));
  for (const b of journee.absents) {
    if (b !== occupant && journee.duJour.has(b)) { ecartes.push({benevoleId: b, raison: LIBELLE_INELIGIBILITE.absent_appel}); }
  }
  return {scenarios, ecartes, verrouillee: false};
}

/**
 * Pour une personne présente sur une place : les échanges deux à deux avec
 * un autre indicatif du jour, et « un bénévole libre la remplace ». Une place
 * verrouillée n'est jamais déplacée.
 */
export function echangesPourPlace(journee, moteur, placeId) {
  const place = journee.placeParId.get(placeId);
  const groupe = journee.groupeDePlace.get(placeId);
  const p = journee.occupantParPlace.get(placeId);
  if (!place || !groupe || p == null) { return {scenarios: [], ecartes: [], verrouillee: false}; }
  if (place.Verrouillee) { return {scenarios: [], ecartes: [], verrouillee: true}; }
  const scenarios = [];
  const ecartes = [];

  for (const [autrePlaceId, q] of journee.occupantParPlace) {
    const g = journee.groupeDePlace.get(autrePlaceId);
    if (q == null || q === p || g === groupe || journee.absents.has(q)) { continue; }
    const autrePlace = journee.placeParId.get(autrePlaceId);
    const etiquette = `${g.groupe.Code} #${autrePlace.Rang}`;
    if (autrePlace.Verrouillee) { ecartes.push({benevoleId: q, raison: `place ${etiquette} verrouillée`}); continue; }
    const liberations = [{groupeId: groupe.groupe.id, benevoleId: p}, {groupeId: g.groupe.id, benevoleId: q}];
    const pVersG = eligibilite(moteur, g.groupe.id, p, liberations);
    if (!pVersG.eligible) { ecartes.push({benevoleId: q, raison: `en ${g.groupe.Code}, la personne choisie : ${raisonLisible(pVersG)}`}); continue; }
    const qVersGroupe = eligibilite(moteur, groupe.groupe.id, q, liberations);
    if (!qVersGroupe.eligible) { ecartes.push({benevoleId: q, raison: `en ${groupe.groupe.Code} : ${raisonLisible(qVersGroupe)}`}); continue; }
    scenarios.push({mouvements: [{benevoleId: p, de: placeId, vers: autrePlaceId}, {benevoleId: q, de: autrePlaceId, vers: placeId}]});
  }

  for (const w of candidatsDuJour(journee, new Set([p]))) {
    if (eligibilite(moteur, groupe.groupe.id, w).eligible) {
      scenarios.push({mouvements: [{benevoleId: w, de: null, vers: placeId}, {benevoleId: p, de: placeId, vers: null}]});
    }
  }

  evaluerEtTrier(journee, scenarios);
  return {scenarios, ecartes, verrouillee: false};
}

/** Pour une personne présente sans indicatif ce jour : les places à couvrir qu'elle peut prendre. */
export function placesPourBenevole(journee, moteur, benevoleId) {
  const scenarios = [];
  const ecartes = [];
  for (const [placeId, occupant] of journee.occupantParPlace) {
    if (!estACouvrir(journee, occupant)) { continue; }
    const place = journee.placeParId.get(placeId);
    const g = journee.groupeDePlace.get(placeId);
    const etiquette = `${g.groupe.Code} #${place.Rang}`;
    if (place.Verrouillee) { ecartes.push({etiquette, raison: 'place verrouillée'}); continue; }
    const statut = eligibilite(moteur, g.groupe.id, benevoleId);
    if (statut.eligible) {
      scenarios.push({mouvements: [{benevoleId, de: null, vers: placeId}]});
    } else {
      ecartes.push({etiquette, raison: raisonLisible(statut)});
    }
  }
  evaluerEtTrier(journee, scenarios);
  return {scenarios, ecartes, verrouillee: false, tenues: placesTenues(journee, benevoleId)};
}
