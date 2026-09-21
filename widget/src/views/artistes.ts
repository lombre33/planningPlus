/**
 * Vue artistes : qui joue quand, et combien de bénévoles veulent le voir
 * (cahier des charges §8.8). Valeur métier au-delà de l'information brute :
 * le souhait de voir un artiste est la deuxième priorité de l'algorithme
 * d'affectation juste après la disponibilité (§7.2), donc une forte demande
 * sur un créneau explique directement pourquoi une mission voisine peine à
 * se remplir. La colonne « en conflit » montre où cette préférence est déjà
 * contrariée par une affectation existante.
 */

import {type LigneArtiste, indexer, ligneArtistes, regrouperParJourFestival} from '../logic/derive';
import type {Magasin} from '../store';
import {libelleHeurePlage} from '../temps';
import {h, vider} from '../ui/dom';

function ligne(l: LigneArtiste): Node {
  return h('tr', null,
    h('td', null, l.artiste.Nom),
    h('td', {class: 'mono'}, libelleHeurePlage(l.artiste.Debut, l.artiste.Fin)),
    h('td', null, l.lieuNom),
    h('td', null, h('span', {class: 'pill pill--neutral'}, `${l.demande} intéressé${l.demande > 1 ? 's' : ''}`)),
    h('td', null, l.conflits > 0
      ? h('span', {class: 'pill pill--warn'}, `${l.conflits} en conflit`)
      : h('span', {class: 'pill pill--ok'}, 'aucun conflit')),
  );
}

export function montrerArtistes(container: HTMLElement, m: Magasin): () => void {
  function rafraichir(): void {
    const ix = indexer(m);
    const lignes = ligneArtistes(m, ix);
    vider(container);

    if (lignes.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Aucun artiste dans ce jeu de données.'));
      return;
    }

    container.append(
      h('p', {class: 'view__intro'},
        `${lignes.length} passage${lignes.length > 1 ? 's' : ''}. « En conflit » compte les bénévoles qui veulent voir `
        + "l'artiste mais tiennent déjà une place sur ce créneau (préférence forte non respectée, §7.2).",
      ),
      // Regroupé par jour de festival (§6.2) : les concerts de fin de soirée
      // (les plus demandés) restent rattachés à la bonne soirée.
      ...regrouperParJourFestival(lignes, (l) => l.artiste.Debut).map((jour) => h('div', {style: {marginBottom: '18px'}},
        h('div', {class: 'section-title'}, h('h2', null, jour.libelle)),
        h('table', {class: 'tableau-simple'},
          h('thead', null, h('tr', null,
            h('th', null, 'Artiste'), h('th', null, 'Horaire'),
            h('th', null, 'Lieu'), h('th', null, 'Demande'), h('th', null, 'Conflits'),
          )),
          h('tbody', null, ...jour.items.map(ligne)),
        ),
      )),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
