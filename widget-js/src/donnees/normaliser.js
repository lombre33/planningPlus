/**
 * Décode le jeu de données figé (`festival.json`, produit par
 * `dev/seed/export-json.mjs`) vers le modèle typé de `domain/types.d.ts`.
 *
 * `festival.json` garde les références sous forme locale `{_ref: n}` (index
 * dans le tableau de la table cible) puisqu'aucun document Grist réel n'existe
 * derrière : ce module leur assigne des identifiants numériques stables
 * (position + 1 dans chaque tableau, comme le ferait un document fraîchement
 * semé) et les résout.
 *
 * C'est la seule étape à remplacer pour brancher un vrai document : un
 * chargeur qui lirait `window.grist.docApi.fetchTable(...)` produirait le
 * même `Modele`, et rien dans `store.js` ni dans les vues n'aurait à changer.
 */

import brut from './festival.json' with {type: 'json'};

function estRef(valeur) {
  return typeof valeur === 'object' && valeur !== null && '_ref' in valeur;
}

/** Résout une référence locale `{_ref}` vers l'identifiant 1-based de la
 *  ligne visée. `0` ou absent vaut « pas de référence ». */
function resoudre(valeur) {
  if (valeur === 0 || valeur === null || valeur === undefined) { return null; }
  if (estRef(valeur)) { return valeur._ref + 1; }
  if (typeof valeur === 'number') { return valeur; }
  return null;
}

function resoudreObligatoire(valeur, contexte) {
  const id = resoudre(valeur);
  if (id === null) { throw new Error(`Référence obligatoire manquante (${contexte})`); }
  return id;
}

function chaine(valeur) {
  return typeof valeur === 'string' ? valeur : '';
}

function nombre(valeur) {
  return typeof valeur === 'number' ? valeur : 0;
}

function booleen(valeur) {
  return valeur === true;
}

function liste(valeur) {
  return Array.isArray(valeur) ? valeur.filter((v) => typeof v === 'string') : [];
}

export function normaliser() {
  const equipes = brut.Equipes.map((e, i) => ({
    id: i + 1, Nom: chaine(e.Nom), Couleur: chaine(e.Couleur),
    Referent: resoudre(e.Referent), Notes: chaine(e.Notes),
  }));

  const lieux = brut.Lieux.map((l, i) => ({
    id: i + 1, Nom: chaine(l.Nom), Description: chaine(l.Description),
  }));

  const benevoles = brut.Benevoles.map((b, i) => ({
    id: i + 1, Nom: chaine(b.Nom), Contact: chaine(b.Contact),
    Equipe: resoudreObligatoire(b.Equipe, `Benevoles[${i}].Equipe`),
    Competences: liste(b.Competences),
    Quota_heures_min: nombre(b.Quota_heures_min), Quota_heures_max: nombre(b.Quota_heures_max),
    Statut: b.Statut, Notes: chaine(b.Notes),
  }));

  const missions = brut.Missions.map((m, i) => ({
    id: i + 1, Nom: chaine(m.Nom), Description: chaine(m.Description),
    Lieu: resoudreObligatoire(m.Lieu, `Missions[${i}].Lieu`),
    Equipe: resoudreObligatoire(m.Equipe, `Missions[${i}].Equipe`),
    Priorite: m.Priorite, Competences_requises: liste(m.Competences_requises),
  }));

  const artistes = brut.Artistes.map((a, i) => ({
    id: i + 1, Nom: chaine(a.Nom),
    Lieu: resoudreObligatoire(a.Lieu, `Artistes[${i}].Lieu`),
    Debut: nombre(a.Debut), Fin: nombre(a.Fin),
  }));

  const macroCreneaux = brut.Macro_creneaux.map((m, i) => ({
    id: i + 1, Nom: chaine(m.Nom), Debut: nombre(m.Debut), Fin: nombre(m.Fin),
  }));

  const sousCreneaux = brut.Sous_creneaux.map((s, i) => ({
    id: i + 1, Macro_creneau: resoudreObligatoire(s.Macro_creneau, `Sous_creneaux[${i}].Macro_creneau`),
    Mission: resoudre(s.Mission), Libelle: chaine(s.Libelle),
    Debut: nombre(s.Debut), Fin: nombre(s.Fin),
  }));

  const besoins = brut.Besoins.map((b, i) => ({
    id: i + 1, Mission: resoudreObligatoire(b.Mission, `Besoins[${i}].Mission`),
    Sous_creneau: resoudreObligatoire(b.Sous_creneau, `Besoins[${i}].Sous_creneau`),
    Effectif_min: nombre(b.Effectif_min), Effectif_max: nombre(b.Effectif_max),
    Taille_groupe: nombre(b.Taille_groupe),
  }));

  const groupes = brut.Groupes.map((g, i) => ({
    id: i + 1, Code: chaine(g.Code), Taille: nombre(g.Taille),
    Equipe: resoudreObligatoire(g.Equipe, `Groupes[${i}].Equipe`), Notes: chaine(g.Notes),
  }));

  const positionsGroupe = brut.Positions_groupe.map((p, i) => ({
    id: i + 1, Groupe: resoudreObligatoire(p.Groupe, `Positions_groupe[${i}].Groupe`),
    Besoin: resoudreObligatoire(p.Besoin, `Positions_groupe[${i}].Besoin`),
  }));

  const places = brut.Places.map((p, i) => ({
    id: i + 1, Groupe: resoudreObligatoire(p.Groupe, `Places[${i}].Groupe`),
    Rang: nombre(p.Rang), Benevole: resoudre(p.Benevole),
    Origine: p.Origine, Verrouillee: booleen(p.Verrouillee),
    Score: nombre(p.Score),
  }));

  // Le générateur ne crée une ligne `Places` que pour les rangs effectivement
  // pourvus au tirage : un groupe dont le tirage a échoué pour un rang n'a
  // donc pas de ligne pour ce rang. On complète pour que chaque groupe ait
  // exactement `Taille` places, y compris vides (« place non pourvue »,
  // cahier des charges §6.3) — nécessaire pour avoir un emplacement cliquable
  // dans la grille même quand le jeu de données n'a affecté personne.
  let prochainIdPlace = places.length + 1;
  groupes.forEach((groupe) => {
    const rangsExistants = new Set(places.filter((p) => p.Groupe === groupe.id).map((p) => p.Rang));
    for (let rang = 1; rang <= groupe.Taille; rang++) {
      if (!rangsExistants.has(rang)) {
        places.push({
          id: prochainIdPlace++, Groupe: groupe.id, Rang: rang,
          Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0,
        });
      }
    }
  });

  const disponibilites = brut.Disponibilites.map((d, i) => ({
    Benevole: resoudreObligatoire(d.Benevole, `Disponibilites[${i}].Benevole`),
    Quart_heure: nombre(d.Quart_heure), Statut: d.Statut,
    Artiste: resoudre(d.Artiste),
  }));

  const souhaitsMissions = brut.Souhaits_missions.map((s, i) => ({
    id: i + 1, Benevole: resoudreObligatoire(s.Benevole, `Souhaits_missions[${i}].Benevole`),
    Mission: resoudreObligatoire(s.Mission, `Souhaits_missions[${i}].Mission`),
    Preference: s.Preference,
  }));

  const affinites = brut.Affinites.map((a, i) => ({
    id: i + 1, Benevole_A: resoudreObligatoire(a.Benevole_A, `Affinites[${i}].Benevole_A`),
    Benevole_B: resoudreObligatoire(a.Benevole_B, `Affinites[${i}].Benevole_B`),
    Type: a.Type,
  }));

  return {
    equipes, lieux, benevoles, missions, artistes, macroCreneaux, sousCreneaux,
    besoins, groupes, positionsGroupe, places, disponibilites, souhaitsMissions, affinites,
    presences: [],
  };
}
