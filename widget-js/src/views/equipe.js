/**
 * Vue équipe : une équipe sur toute la durée, par indicatif (cahier des
 * charges §8.7). C'est la vue des cheffes d'équipe (§4) : elles consultent
 * et repèrent les problèmes (place vacante, sous-effectif), mais ne
 * modifient rien ici — la correction reste dans Indicatifs / Jour J, pour
 * éviter les conflits d'édition entre plusieurs personnes sur le même
 * planning.
 */

import {t, tn, traductions} from '../i18n.js';
import {
  indexer, indicatifsDeLEquipe, regrouperParJourFestival,
} from '../logic/derive.js';
import {libelleHeurePlage} from '../temps.js';
import {h, vider} from '../ui/dom.js';

traductions({
  'place vacante': 'vacant spot',
  '{pourvues} / {min} min': '{pourvues} / {min} min',
  '{n} place vacante': '{n} vacant spot',
  '{n} places vacantes': '{n} vacant spots',
  complet: 'full',
  'Pas encore positionné sur un besoin.': 'Not yet placed on a need.',
  Horaire: 'Time',
  Mission: 'Task',
  Lieu: 'Location',
  Couverture: 'Coverage',
  'Aucune équipe dans ce jeu de données.': 'No teams in this dataset.',
  '{n} indicatif pour cette équipe, sur toute la durée du festival.': '{n} call sign for this team, over the whole festival.',
  '{n} indicatifs pour cette équipe, sur toute la durée du festival.': '{n} call signs for this team, over the whole festival.',
  'Aucun indicatif pour cette équipe.': 'No call signs for this team.',
});

const PILL_COUVERTURE = {
  ok: 'pill--ok', partiel: 'pill--warn', sous: 'pill--danger',
};

function ligneMembre(membre) {
  return h('div', {class: 'membre'},
    h('span', {class: 'rang mono'}, `#${membre.rang}`),
    membre.nom == null
      ? h('span', {class: 'pill pill--danger'}, t('place vacante'))
      : h('span', null, membre.nom),
  );
}

function lignePosition(position) {
  const c = position.couverture;
  return h('tr', null,
    h('td', {class: 'mono'}, libelleHeurePlage(position.debut, position.fin)),
    h('td', null, position.missionNom),
    h('td', null, position.lieuNom),
    h('td', null, h('span', {class: `pill ${PILL_COUVERTURE[c.statut]}`},
      t('{pourvues} / {min} min', {pourvues: c.pourvues, min: c.besoin.Effectif_min}))),
  );
}

function carteIndicatif(indicatif) {
  const vacantes = indicatif.membres.filter((mb) => mb.nom == null).length;
  return h('div', {class: 'card', style: {marginBottom: '14px'}},
    h('div', {class: 'section-title'},
      h('h2', {class: 'mono', style: {fontSize: '15px'}}, indicatif.groupe.Code),
      vacantes > 0
        ? h('span', {class: 'pill pill--danger'}, tn(vacantes, '{n} place vacante', '{n} places vacantes'))
        : h('span', {class: 'pill pill--ok'}, t('complet')),
    ),
    h('div', {style: {display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '10px'}},
      ...indicatif.membres.map(ligneMembre),
    ),
    indicatif.positions.length === 0
      ? h('p', {class: 'empty'}, t('Pas encore positionné sur un besoin.'))
      // Regroupé par jour de festival (§6.2) : une position 22h-2h reste
      // rattachée à la soirée qui l'a vue commencer.
      : h('div', null, ...regrouperParJourFestival(indicatif.positions, (p) => p.debut).map((jour) => h('div', {style: {marginBottom: '10px'}},
        h('div', {class: 'mono', style: {fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 3px'}}, jour.libelle),
        h('table', {class: 'tableau-simple'},
          h('thead', null, h('tr', null,
            h('th', null, t('Horaire')), h('th', null, t('Mission')), h('th', null, t('Lieu')), h('th', null, t('Couverture')),
          )),
          h('tbody', null, ...jour.items.map(lignePosition)),
        ),
      ))),
  );
}

export function montrerEquipe(container, m) {
  let equipeId = null;

  function rafraichir() {
    const ix = indexer(m);
    if (equipeId == null || !m.equipes.some((e) => e.id === equipeId)) {
      equipeId = m.equipes[0]?.id ?? null;
    }
    vider(container);

    const indicatifs = equipeId == null ? [] : indicatifsDeLEquipe(m, ix, equipeId);

    container.append(
      h('div', {class: 'agenda__toolbar', style: {marginBottom: '14px'}},
        ...m.equipes.map((eq) => h('button', {
          class: `btn btn--sm${eq.id === equipeId ? ' btn--primary' : ''}`, type: 'button',
          onclick: () => { equipeId = eq.id; rafraichir(); },
        }, eq.Nom)),
      ),
      equipeId == null
        ? h('p', {class: 'empty'}, t('Aucune équipe dans ce jeu de données.'))
        : h('p', {class: 'view__intro'}, tn(indicatifs.length,
          '{n} indicatif pour cette équipe, sur toute la durée du festival.',
          '{n} indicatifs pour cette équipe, sur toute la durée du festival.')),
      ...(equipeId != null && indicatifs.length === 0
        ? [h('p', {class: 'empty'}, t('Aucun indicatif pour cette équipe.'))]
        : []),
      ...(indicatifs.length > 0 ? [h('div', null, ...indicatifs.map(carteIndicatif))] : []),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
