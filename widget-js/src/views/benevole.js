/**
 * Vue bénévole : la feuille de route individuelle, imprimable (cahier des
 * charges §8.6). C'est le document que l'on met entre les mains d'un
 * bénévole le jour du festival — la mise en page d'impression compte donc
 * autant que l'écran. Vue de consultation pure : aucune écriture ici, la
 * correction des affectations se fait depuis les vues Indicatifs / Jour J.
 */

import {t, tn, traductions} from '../i18n.js';
import {
  feuilleBenevole, indexer, regrouperParJourFestival,
} from '../logic/derive.js';
import {libelleHeurePlage} from '../temps.js';
import {formatHeures, h, vider} from '../ui/dom.js';

traductions({
  chevauche: 'overlaps',
  'Équipe {equipe}': 'Team {equipe}',
  '{n} étape': '{n} shift',
  '{n} étapes': '{n} shifts',
  '{heures} au total': '{heures} in total',
  "Aucune affectation pour l'instant.": 'No assignments yet.',
  Horaire: 'Time',
  Mission: 'Task',
  Lieu: 'Location',
  Indicatif: 'Call sign',
  Coéquipiers: 'Teammates',
  'Rechercher un bénévole…': 'Search volunteers…',
  'Imprimer toutes les feuilles': 'Print all sheets',
  'Imprimer cette feuille': 'Print this sheet',
  'Aucun bénévole ne correspond à cette recherche.': 'No volunteer matches this search.',
});

function ligneEtape(etape) {
  return h('tr', {class: etape.chevaucheLaPrecedente ? 'feuille-benevole__ligne--chevauche' : undefined},
    h('td', {class: 'mono'}, libelleHeurePlage(etape.debut, etape.fin)),
    h('td', null,
      etape.missionNom,
      etape.chevaucheLaPrecedente
        ? h('span', {class: 'pill pill--warn', style: {marginLeft: '6px'}}, t('chevauche'))
        : null,
    ),
    h('td', null, etape.lieuNom),
    h('td', {class: 'mono'}, etape.groupeCode),
    h('td', null, etape.coequipiers.length > 0 ? etape.coequipiers.join(', ') : '—'),
  );
}

/** Le contenu d'une feuille, partagé entre l'aperçu à l'écran et l'impression.
 *  Regroupée par jour de festival (§6.2) : une soirée qui franchit minuit
 *  reste un seul bloc, au lieu d'être scindée sur la date civile. */
function construireFeuille(feuille) {
  const jours = regrouperParJourFestival(feuille.etapes, (e) => e.debut);
  return h('section', {class: 'feuille-benevole'},
    h('header', {class: 'feuille-benevole__entete'},
      h('h2', null, feuille.benevole.Nom),
      h('p', null, [
        t('Équipe {equipe}', {equipe: feuille.equipeNom}),
        tn(feuille.etapes.length, '{n} étape', '{n} étapes'),
        t('{heures} au total', {heures: formatHeures(feuille.totalHeures)}),
      ].join(' · ')),
    ),
    feuille.etapes.length === 0
      ? h('p', {class: 'empty'}, t("Aucune affectation pour l'instant."))
      : h('div', null, ...jours.map((jour) => h('div', {class: 'feuille-benevole__jour'},
        h('h3', {class: 'feuille-benevole__jour-titre'}, jour.libelle),
        h('table', {class: 'tableau-simple feuille-benevole__table'},
          h('thead', null, h('tr', null,
            h('th', null, t('Horaire')), h('th', null, t('Mission')),
            h('th', null, t('Lieu')), h('th', null, t('Indicatif')), h('th', null, t('Coéquipiers')),
          )),
          h('tbody', null, ...jour.items.map(ligneEtape)),
        ),
      ))),
  );
}

function imprimer(contenu) {
  const zone = document.getElementById('zone-impression');
  if (!zone) { return; }
  vider(zone);
  zone.append(...contenu);
  document.body.classList.add('impression-active');
  const nettoyer = () => {
    document.body.classList.remove('impression-active');
    vider(zone);
    window.removeEventListener('afterprint', nettoyer);
  };
  window.addEventListener('afterprint', nettoyer);
  window.print();
}

export function montrerBenevole(container, m) {
  let recherche = '';
  let benevoleId = null;

  function rafraichir() {
    const ix = indexer(m);
    vider(container);

    const benevoles = m.benevoles
      .filter((b) => recherche.trim() === '' || b.Nom.toLowerCase().includes(recherche.trim().toLowerCase()))
      .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'));

    if (benevoleId == null || !benevoles.some((b) => b.id === benevoleId)) {
      benevoleId = benevoles[0]?.id ?? null;
    }

    const colonneGauche = h('div', null,
      h('input', {
        class: 'input', type: 'search', placeholder: t('Rechercher un bénévole…'), value: recherche,
        style: {width: '100%', marginBottom: '10px'},
        oninput: (e) => { recherche = e.target.value; rafraichir(); },
      }),
      h('button', {
        class: 'btn btn--sm', type: 'button', style: {width: '100%', marginBottom: '10px'},
        onclick: () => imprimerToutes(),
      }, t('Imprimer toutes les feuilles')),
      ...benevoles.map((b) => {
        // Équipe orpheline possible (même défaut corrigé ailleurs le 2026-09-23) : ne doit pas planter la liste.
        const equipe = ix.equipe.get(b.Equipe);
        const nbEtapes = feuilleBenevole(m, ix, b.id)?.etapes.length ?? 0;
        return h('div', {
          class: `benevole-row${b.id === benevoleId ? ' benevole-row--actif' : ''}`,
          onclick: () => { benevoleId = b.id; rafraichir(); },
        },
          h('div', null,
            h('span', {class: 'dot', style: {background: equipe?.Couleur ?? 'var(--text-faint)', marginRight: '6px'}}),
            h('span', {class: 'nom'}, b.Nom),
            h('br'),
            h('span', {class: 'equipe'}, `${equipe?.Nom ?? '?'} · ${tn(nbEtapes, '{n} étape', '{n} étapes')}`),
          ),
        );
      }),
    );

    const colonneDroite = h('div', null);
    if (benevoleId != null) {
      const feuille = feuilleBenevole(m, ix, benevoleId);
      if (feuille) {
        colonneDroite.append(
          h('div', {class: 'section-title'},
            h('div', null),
            h('button', {
              class: 'btn btn--sm', type: 'button',
              onclick: () => imprimer([construireFeuille(feuille)]),
            }, t('Imprimer cette feuille')),
          ),
          h('div', {class: 'card papier'}, construireFeuille(feuille)),
        );
      }
    } else {
      colonneDroite.append(h('p', {class: 'empty'}, t('Aucun bénévole ne correspond à cette recherche.')));
    }

    container.append(h('div', {class: 'jourj-layout'}, colonneGauche, colonneDroite));
  }

  function imprimerToutes() {
    const ix = indexer(m);
    const feuilles = m.benevoles
      .slice()
      .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'))
      .map((b) => feuilleBenevole(m, ix, b.id))
      .filter((f) => f != null);
    imprimer(feuilles.map((f) => construireFeuille(f)));
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
