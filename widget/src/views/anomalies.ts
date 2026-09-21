/**
 * Vue anomalies (objectif O3 : « toute place non pourvue est listée avec sa
 * cause »). Rien n'est masqué : sous-effectifs, souhaits contrariés,
 * indisponibilités non respectées, quotas dépassés.
 */

import {type Anomalie, calculerAnomalies, indexer} from '../logic/derive';
import type {Magasin} from '../store';
import {formatHeures, h, vider} from '../ui/dom';

function titreAnomalie(a: Anomalie): string {
  switch (a.type) {
    case 'sous-effectif': return `${a.missionNom} — ${a.sousCreneauLibelle}`;
    case 'souhait-refuse': return `${a.benevoleNom} sur ${a.missionNom}`;
    case 'indisponibilite': return `${a.benevoleNom} — ${a.sousCreneauLibelle}`;
    case 'conflit-artiste': return `${a.benevoleNom} veut voir ${a.artisteNom}`;
    case 'hors-quota': return a.benevoleNom;
  }
}

function detailAnomalie(a: Anomalie): string {
  switch (a.type) {
    case 'sous-effectif':
      return `Il manque ${a.manque} bénévole${a.manque > 1 ? 's' : ''} pour atteindre le minimum. On ne force personne contre son souhait pour boucler l'effectif (§7.2).`;
    case 'souhait-refuse':
      return `${a.benevoleNom} a explicitement refusé cette mission mais occupe une place de l'indicatif ${a.groupeCode} qui la couvre.`;
    case 'indisponibilite':
      return `${a.benevoleNom} a déclaré ne pas être disponible sur ce créneau mais occupe une place de l'indicatif ${a.groupeCode}.`;
    case 'conflit-artiste':
      return `Préférence forte non respectée : ${a.benevoleNom} sera sur l'indicatif ${a.groupeCode} pendant le passage de ${a.artisteNom}.`;
    case 'hors-quota':
      return `${formatHeures(a.heures)} affectées pour un quota maximum de ${formatHeures(a.quotaMax)}.`;
  }
}

const LIBELLE_TYPE: Record<Anomalie['type'], string> = {
  'sous-effectif': 'Sous-effectif',
  'souhait-refuse': 'Souhait refusé',
  'indisponibilite': 'Indisponibilité',
  'conflit-artiste': 'Conflit artiste',
  'hors-quota': 'Quota dépassé',
};

export function montrerAnomalies(container: HTMLElement, m: Magasin): () => void {
  function rafraichir(): void {
    const ix = indexer(m);
    const anomalies = calculerAnomalies(m, ix);
    vider(container);

    if (anomalies.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Aucune anomalie détectée sur ce jeu de données.'));
      return;
    }

    const parGravite = {
      danger: anomalies.filter((a) => a.gravite === 'danger'),
      warn: anomalies.filter((a) => a.gravite === 'warn'),
    };

    container.append(
      h('div', {style: {display: 'flex', gap: '10px', marginBottom: '16px'}},
        h('span', {class: 'pill pill--danger'}, `${parGravite.danger.length} à corriger`),
        h('span', {class: 'pill pill--warn'}, `${parGravite.warn.length} à surveiller`),
      ),
      h('div', {class: 'anomalies-cols'},
        colonne('À corriger', parGravite.danger),
        colonne('À surveiller', parGravite.warn),
      ),
    );
  }

  function colonne(titre: string, liste: Anomalie[]): Node {
    return h('div', null,
      h('div', {class: 'section-title'}, h('h2', null, titre), h('span', {class: 'count mono'}, String(liste.length))),
      liste.length === 0
        ? h('p', {class: 'empty'}, 'Rien ici.')
        : h('div', null, ...liste.map((a) => carteAnomalie(a))),
    );
  }

  function carteAnomalie(a: Anomalie): Node {
    const carte = h('div', {class: `anomalie${a.gravite === 'warn' ? ' anomalie--warn' : ''}`},
      h('span', {class: 'anomalie__titre'}, `${LIBELLE_TYPE[a.type]} — ${titreAnomalie(a)}`),
      h('span', {class: 'anomalie__detail'}, detailAnomalie(a)),
    );
    if (a.type === 'souhait-refuse' || a.type === 'indisponibilite') {
      carte.append(h('div', {class: 'anomalie__actions'},
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => m.assignerPlace(a.place.id, null),
        }, 'Vider cette place'),
      ));
    }
    return carte;
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
