#!/usr/bin/env node
/**
 * Exporte le jeu de données de test en JSON statique, sans toucher à Grist.
 *
 * Sert de jonction avec la maquette interactive (fil séparé) : les mêmes
 * formes de tables, réutilisables sans dépendre d'une instance Grist qui
 * tourne.
 *
 * Deux différences avec ce que `seed.mjs` écrit dans Grist :
 * - les références inter-tables restent sous la forme locale `{_ref: n}`
 *   (index dans le tableau de la table cible) plutôt que des identifiants de
 *   ligne Grist réels, puisqu'aucun document n'est créé ici ;
 * - les colonnes ChoiceList sont de simples tableaux JS ; l'encodage
 *   `['L', ...]` qu'attend l'API Grist (voir `listeGrist` dans generate.mjs)
 *   est retiré, il n'a de sens que pour cette API.
 *
 * Utilisation :
 *   node dev/seed/export-json.mjs --sortie=dev/seed/festival.json
 */

import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {genererFestival} from './generate.mjs';
import {TABLES} from './schema.mjs';

function lireArguments(argv) {
  return Object.fromEntries(
    argv.filter((a) => a.startsWith('--')).map((a) => {
      const separateur = a.indexOf('=');
      return separateur === -1
        ? [a.slice(2), 'true']
        : [a.slice(2, separateur), a.slice(separateur + 1)];
    }),
  );
}

const args = lireArguments(process.argv.slice(2));

const config = {
  chemin: args.sortie ?? 'dev/seed/festival.json',
  nbJours: Number(args.jours ?? 5),
  nbBenevoles: Number(args.benevoles ?? 70),
  nbEquipes: Number(args.equipes ?? 3),
  nbArtistes: Number(args.artistes ?? 20),
  dureeSousCreneauMinutes: Number(args['duree-sous-creneau'] ?? 90),
  graine: Number(args.graine ?? 20260717),
};

const champsListeParTable = new Map(TABLES.map((t) => [
  t.id, new Set(t.colonnes.filter((c) => c.type === 'ChoiceList').map((c) => c.id)),
]));

/** Retire l'encodage `['L', ...]` des colonnes ChoiceList, sans autre transformation. */
function despecialiserChoiceList(tableId, lignes) {
  const champsListe = champsListeParTable.get(tableId) ?? new Set();
  return lignes.map((ligne) => Object.fromEntries(
    Object.entries(ligne).map(([col, valeur]) => (
      champsListe.has(col) && Array.isArray(valeur) && valeur[0] === 'L'
        ? [col, valeur.slice(1)]
        : [col, valeur]
    )),
  ));
}

const donnees = genererFestival({
  graine: config.graine,
  nbJours: config.nbJours,
  nbBenevoles: config.nbBenevoles,
  nbEquipes: config.nbEquipes,
  nbArtistes: config.nbArtistes,
  dureeSousCreneauMinutes: config.dureeSousCreneauMinutes,
});

const nettoye = Object.fromEntries(
  Object.entries(donnees).map(([table, lignes]) => [table, despecialiserChoiceList(table, lignes)]),
);

const chemin = resolve(config.chemin);
writeFileSync(chemin, JSON.stringify(nettoye, null, 2) + '\n');

const totalLignes = Object.values(nettoye).reduce((n, lignes) => n + lignes.length, 0);
console.log(`Export écrit : ${chemin}`);
console.log(`${Object.keys(nettoye).length} tables, ${totalLignes} lignes au total.`);
