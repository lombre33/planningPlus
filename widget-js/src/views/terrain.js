/**
 * Vue Terrain : à un instant donné, où doit être chaque bénévole et les
 * effectifs attendus par mission (cahier des charges §8.9, proche de la vue
 * tension §8.3 pour la partie effectifs). Pensée pour un téléphone, pendant
 * le festival — lecture seule, un seul curseur de temps, rien à faire
 * défiler horizontalement. Le jour est celui du bandeau commun.
 *
 * Un bénévole pointé absent à l'appel du jour, ou désisté pour tout le
 * festival, n'est jamais « en poste » : l'appel ne libère aucune place
 * (choix d'Antoine du 2026-09-24), mais sa place ne compte pas dans les
 * effectifs, comme dans la table du jour où elle est « à couvrir ».
 */

import {t, traductions} from '../i18n.js';
import {indexer, regrouperParJour} from '../logic/derive.js';
import {
  affectationsAInstant, blocsDuJour, couvertureAInstant, indexerDisponibilitesDuQuart, statutBenevoleAInstant,
} from '../logic/dispos-terrain.js';
import {jourAffiche} from '../logic/journee.js';
import {libelleHeure} from '../temps.js';
import {h, vider} from '../ui/dom.js';

traductions({
  'Disponible, non affecté': 'Available, unassigned',
  'Veut voir un artiste': 'Wants to see an artist',
  Indisponible: 'Unavailable',
  'Absent·e': 'Absent',
  'Instant de la journée': 'Time of day',
  'Aucun créneau ce jour-là.': 'No slots that day.',
  'En poste maintenant': 'On duty now',
  '{n} bénévole(s)': '{n} volunteer(s)',
  'Personne en poste à cet instant.': 'Nobody on duty at this time.',
  'Pas en poste': 'Not on duty',
  '{etat} ({n}) : ': '{etat} ({n}): ',
  'Effectifs attendus': 'Expected headcount',
  'Aucun besoin ouvert à cet instant.': 'No active need at this time.',
});

/** Libellé de chaque état « pas en poste », dans la langue du moment. */
const LIBELLE_ETAT_LIBRE = {
  disponible: () => t('Disponible, non affecté'),
  'veut-voir-artiste': () => t('Veut voir un artiste'),
  indisponible: () => t('Indisponible'),
  absent: () => t('Absent·e'),
};

/** Absents du jour : pointés absents à l'appel de ce jour, ou désistés. */
function absentsDuJour(m, jourCle) {
  const absents = new Set(m.benevoles.filter((b) => b.Statut === 'Absent').map((b) => b.id));
  for (const p of m.presences ?? []) {
    if (p.Jour === jourCle && p.Present === false) { absents.add(p.Benevole); }
  }
  return absents;
}

export function montrerTerrain(container, m) {
  let instant = null;

  function rafraichir() {
    const ix = indexer(m);
    const jour = jourAffiche(regrouperParJour(m.macroCreneaux), m.macroCreneauSelectionne);
    const quarts = jour ? blocsDuJour(jour).flatMap((b) => b.quarts) : [];
    if (instant == null || !quarts.includes(instant)) {
      instant = quarts[0] ?? null;
    }
    vider(container);

    const indexInstant = instant != null ? Math.max(0, quarts.indexOf(instant)) : 0;
    container.append(h('div', {class: 'terrain-barre'},
      quarts.length > 0 ? h('div', {class: 'terrain-curseur'},
        h('input', {
          class: 'terrain-curseur__range', type: 'range', min: '0', max: String(quarts.length - 1), step: '1',
          value: String(indexInstant), 'aria-label': t('Instant de la journée'),
          oninput: (e) => {
            instant = quarts[Number(e.target.value)] ?? null;
            rafraichir();
          },
        }),
        h('span', {class: 'terrain-curseur__heure mono'}, instant != null ? libelleHeure(instant) : '—'),
      ) : null,
    ));

    if (instant == null) {
      container.append(h('p', {class: 'empty'}, t('Aucun créneau ce jour-là.')));
      return;
    }

    // Le planning tel qu'il se vit ce jour-là : la place d'un absent reste
    // à son nom dans le document, mais personne ne la tient sur le terrain.
    const absents = absentsDuJour(m, jour.cle);
    const planning = {...m.data, places: m.places.map((p) => (absents.has(p.Benevole) ? {...p, Benevole: null} : p))};
    const affectations = affectationsAInstant(planning, ix, instant);
    const dispoDuQuart = indexerDisponibilitesDuQuart(m, instant);

    // --- Où est chaque bénévole --------------------------------------------
    const enPoste = new Map();
    const libres = new Map();

    for (const benevole of m.benevoles) {
      const statut = statutBenevoleAInstant(ix, dispoDuQuart, affectations, benevole.id, absents.has(benevole.id) ? 'Absent' : benevole.Statut);
      if (statut.etat === 'en-poste') {
        const {mission, lieu, groupeCode} = statut.affectation;
        const groupe = enPoste.get(mission.id) ?? {mission, lieu, benevoles: []};
        groupe.benevoles.push({nom: benevole.Nom, groupeCode});
        enPoste.set(mission.id, groupe);
        continue;
      }
      const cleEtat = statut.etat;
      const detail = statut.etat === 'veut-voir-artiste' ? (statut.artisteNom ?? '') : '';
      const liste = libres.get(cleEtat) ?? [];
      liste.push({nom: benevole.Nom, detail});
      libres.set(cleEtat, liste);
    }

    const sectionEnPoste = h('section', {class: 'terrain-section'},
      h('div', {class: 'section-title'}, h('h2', null, t('En poste maintenant')), h('span', {class: 'count'}, t('{n} bénévole(s)', {n: [...enPoste.values()].reduce((n, g) => n + g.benevoles.length, 0)}))),
      enPoste.size === 0
        ? h('p', {class: 'empty'}, t('Personne en poste à cet instant.'))
        : h('div', null, ...[...enPoste.values()]
          .sort((a, b) => a.mission.Nom.localeCompare(b.mission.Nom, 'fr'))
          .map((g) => h('div', {class: 'card terrain-mission'},
            h('div', {class: 'terrain-mission__titre'},
              h('strong', null, g.mission.Nom),
              g.lieu ? h('span', {class: 'terrain-mission__lieu'}, g.lieu.Nom) : null,
            ),
            h('div', {class: 'terrain-mission__benevoles'},
              ...g.benevoles.map((b) => h('span', {class: 'pill pill--neutral'}, `${b.nom} · ${b.groupeCode}`)),
            ),
          ))),
    );

    const sectionLibres = h('section', {class: 'terrain-section'},
      h('div', {class: 'section-title'}, h('h2', null, t('Pas en poste'))),
      ...(['disponible', 'veut-voir-artiste', 'indisponible', 'absent'])
        .filter((cle) => (libres.get(cle)?.length ?? 0) > 0)
        .map((cle) => {
          const liste = libres.get(cle);
          return h('p', {class: 'terrain-libres'},
            h('strong', null, t('{etat} ({n}) : ', {etat: LIBELLE_ETAT_LIBRE[cle](), n: liste.length})),
            liste.map((b) => (b.detail ? `${b.nom} (${b.detail})` : b.nom)).join(', '),
          );
        }),
    );

    // --- Effectifs attendus --------------------------------------------------
    const couvertures = couvertureAInstant(planning, ix, instant)
      .sort((a, b) => a.mission.Nom.localeCompare(b.mission.Nom, 'fr'));

    const sectionEffectifs = h('section', {class: 'terrain-section'},
      h('div', {class: 'section-title'}, h('h2', null, t('Effectifs attendus'))),
      couvertures.length === 0
        ? h('p', {class: 'empty'}, t('Aucun besoin ouvert à cet instant.'))
        : h('div', {class: 'terrain-effectifs'}, ...couvertures.map((c) => h('div', {class: 'terrain-effectif-ligne'},
          h('div', null,
            h('span', {class: 'terrain-effectif-ligne__mission'}, c.mission.Nom),
            h('span', {class: 'terrain-effectif-ligne__lieu'}, c.mission.Lieu != null ? ix.lieu.get(c.mission.Lieu)?.Nom ?? '' : ''),
          ),
          h('span', {class: `pill pill--${c.couverture.pourvues < c.besoin.Effectif_min ? 'danger' : 'ok'}`},
            `${c.couverture.pourvues} / ${c.besoin.Effectif_min}`),
        ))),
    );

    container.append(sectionEnPoste, sectionEffectifs, sectionLibres);
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
