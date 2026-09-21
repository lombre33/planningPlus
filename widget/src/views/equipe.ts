/**
 * Vue équipe : une équipe sur toute la durée, par indicatif (cahier des
 * charges §8.7). C'est la vue des cheffes d'équipe (§4) : elles consultent
 * et repèrent les problèmes (place vacante, sous-effectif), mais ne
 * modifient rien ici — la correction reste dans Indicatifs / Jour J, pour
 * éviter les conflits d'édition entre plusieurs personnes sur le même
 * planning.
 */

import type {Id} from '../domain/types';
import {
  type IndicatifEquipe, type PositionIndicatifEquipe, indexer, indicatifsDeLEquipe, regrouperParJourFestival,
} from '../logic/derive';
import type {Magasin} from '../store';
import {libelleHeurePlage} from '../temps';
import {h, vider} from '../ui/dom';

const PILL_COUVERTURE: Record<PositionIndicatifEquipe['couverture']['statut'], string> = {
  ok: 'pill--ok', partiel: 'pill--warn', sous: 'pill--danger',
};

function ligneMembre(membre: IndicatifEquipe['membres'][number]): Node {
  return h('div', {class: 'membre'},
    h('span', {class: 'rang mono'}, `#${membre.rang}`),
    membre.nom == null
      ? h('span', {class: 'pill pill--danger'}, 'place vacante')
      : h('span', null, membre.nom),
  );
}

function lignePosition(position: PositionIndicatifEquipe): Node {
  const c = position.couverture;
  return h('tr', null,
    h('td', {class: 'mono'}, libelleHeurePlage(position.debut, position.fin)),
    h('td', null, position.missionNom),
    h('td', null, position.lieuNom),
    h('td', null, h('span', {class: `pill ${PILL_COUVERTURE[c.statut]}`}, `${c.pourvues} / ${c.besoin.Effectif_min} min`)),
  );
}

function carteIndicatif(indicatif: IndicatifEquipe): Node {
  const vacantes = indicatif.membres.filter((mb) => mb.nom == null).length;
  return h('div', {class: 'card', style: {marginBottom: '14px'}},
    h('div', {class: 'section-title'},
      h('h2', {class: 'mono', style: {fontSize: '15px'}}, indicatif.groupe.Code),
      vacantes > 0
        ? h('span', {class: 'pill pill--danger'}, `${vacantes} place${vacantes > 1 ? 's' : ''} vacante${vacantes > 1 ? 's' : ''}`)
        : h('span', {class: 'pill pill--ok'}, 'complet'),
    ),
    h('div', {style: {display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '10px'}},
      ...indicatif.membres.map(ligneMembre),
    ),
    indicatif.positions.length === 0
      ? h('p', {class: 'empty'}, "Pas encore positionné sur un besoin.")
      // Regroupé par jour de festival (§6.2) : une position 22h-2h reste
      // rattachée à la soirée qui l'a vue commencer.
      : h('div', null, ...regrouperParJourFestival(indicatif.positions, (p) => p.debut).map((jour) => h('div', {style: {marginBottom: '10px'}},
        h('div', {class: 'mono', style: {fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 3px'}}, jour.libelle),
        h('table', {class: 'tableau-simple'},
          h('thead', null, h('tr', null,
            h('th', null, 'Horaire'), h('th', null, 'Mission'), h('th', null, 'Lieu'), h('th', null, 'Couverture'),
          )),
          h('tbody', null, ...jour.items.map(lignePosition)),
        ),
      ))),
  );
}

export function montrerEquipe(container: HTMLElement, m: Magasin): () => void {
  let equipeId: Id | null = null;

  function rafraichir(): void {
    const ix = indexer(m);
    if (equipeId == null || !m.equipes.some((e) => e.id === equipeId)) {
      equipeId = m.equipes[0]?.id ?? null;
    }
    vider(container);

    if (equipeId == null) {
      container.append(h('p', {class: 'empty'}, 'Aucune équipe dans ce jeu de données.'));
      return;
    }

    const indicatifs = indicatifsDeLEquipe(m, ix, equipeId);

    container.append(
      h('div', {class: 'agenda__toolbar', style: {marginBottom: '14px'}},
        ...m.equipes.map((eq) => h('button', {
          class: `btn btn--sm${eq.id === equipeId ? ' btn--primary' : ''}`, type: 'button',
          onclick: () => { equipeId = eq.id; rafraichir(); },
        }, eq.Nom)),
      ),
      h('p', {class: 'view__intro'},
        `${indicatifs.length} indicatif${indicatifs.length > 1 ? 's' : ''} pour cette équipe, sur toute la durée du festival.`,
      ),
      indicatifs.length === 0
        ? h('p', {class: 'empty'}, 'Aucun indicatif pour cette équipe.')
        : h('div', null, ...indicatifs.map(carteIndicatif)),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
