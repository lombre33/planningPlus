/**
 * Carte compacte d'un candidat classé (`Candidat`, §7.5.3), partagée entre
 * Jour J (remplaçants proposés) et Affectation (retravail manuel d'une
 * place vide, 2026-09-23) : même geste, même lisibilité des deux côtés.
 * `avecScore` reste réglable — Affectation ne montre jamais de score
 * (consigne explicite du coordinateur : « ce qu'il voudra savoir, ce n'est
 * pas le score, c'est ce qui a été sacrifié et pourquoi »), Jour J le
 * montrait déjà et continue de le faire.
 */

import type {Candidat} from '../logic/derive';
import {h} from './dom';

export function carteCandidatCompacte(c: Candidat, retenir: () => void, options: {avecScore?: boolean} = {}): Node {
  const avecScore = options.avecScore ?? true;
  return h('div', {class: 'candidat', style: {marginBottom: '6px'}},
    h('div', {class: 'candidat__head'},
      h('span', {class: 'candidat__nom'}, c.nom),
      avecScore ? h('span', {class: 'candidat__score mono'}, c.score.toFixed(2)) : null,
    ),
    h('div', {class: 'candidat__raisons'}, ...c.tags.map((t) => h('span', {class: `tag tag--${t.sens}`}, t.texte))),
    h('button', {class: 'btn btn--primary btn--sm', type: 'button', onclick: retenir}, 'Retenir'),
  );
}
