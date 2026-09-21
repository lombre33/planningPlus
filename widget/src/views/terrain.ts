/**
 * Vue Terrain : à un instant donné, où doit être chaque bénévole et les
 * effectifs attendus par mission (cahier des charges §8.9, proche de la vue
 * tension §8.3 pour la partie effectifs). Pensée pour un téléphone, pendant
 * le festival — lecture seule, un seul curseur de temps, rien à faire
 * défiler horizontalement.
 */

import type {Id, Lieu, Mission} from '../domain/types';
import {indexer, regrouperParJour} from '../logic/derive';
import {
  affectationsAInstant, blocsDuJour, couvertureAInstant, indexerDisponibilitesDuQuart, statutBenevoleAInstant,
} from '../logic/dispos-terrain';
import type {Magasin} from '../store';
import {libelleHeure} from '../temps';
import {h, vider} from '../ui/dom';

interface GroupeEnPoste {
  mission: Mission;
  lieu: Lieu | null;
  benevoles: {nom: string; groupeCode: string}[];
}

const LIBELLE_ETAT_LIBRE: Record<string, string> = {
  disponible: 'Disponible, non affecté',
  'veut-voir-artiste': 'Veut voir un artiste',
  indisponible: 'Indisponible',
  absent: 'Absent',
};

export function montrerTerrain(container: HTMLElement, m: Magasin): () => void {
  let jourCle: string | null = null;
  let instant: number | null = null;

  function quartsDuJour(cle: string): number[] {
    const jour = regrouperParJour(m.macroCreneaux).find((j) => j.cle === cle);
    return jour ? blocsDuJour(jour).flatMap((b) => b.quarts) : [];
  }

  function rafraichir(): void {
    const ix = indexer(m);
    const jours = regrouperParJour(m.macroCreneaux);
    if (jourCle == null || !jours.some((j) => j.cle === jourCle)) {
      jourCle = jours[0]?.cle ?? null;
    }
    const quarts = jourCle ? quartsDuJour(jourCle) : [];
    if (instant == null || !quarts.includes(instant)) {
      instant = quarts[0] ?? null;
    }
    vider(container);

    const indexInstant = instant != null ? Math.max(0, quarts.indexOf(instant)) : 0;
    container.append(h('div', {class: 'terrain-barre'},
      h('div', {class: 'dispos-jours', role: 'tablist', 'aria-label': 'Jour'},
        ...jours.map((j) => h('button', {
          class: 'dispos-jour-tab', type: 'button', role: 'tab',
          'aria-selected': String(j.cle === jourCle),
          onclick: () => { jourCle = j.cle; instant = null; rafraichir(); },
        }, j.libelle)),
      ),
      quarts.length > 0 ? h('div', {class: 'terrain-curseur'},
        h('input', {
          class: 'terrain-curseur__range', type: 'range', min: '0', max: String(quarts.length - 1), step: '1',
          value: String(indexInstant), 'aria-label': 'Instant de la journée',
          oninput: (e: Event) => {
            instant = quarts[Number((e.target as HTMLInputElement).value)] ?? null;
            rafraichir();
          },
        }),
        h('span', {class: 'terrain-curseur__heure mono'}, instant != null ? libelleHeure(instant) : '—'),
      ) : null,
    ));

    if (instant == null) {
      container.append(h('p', {class: 'empty'}, 'Aucun créneau ce jour-là.'));
      return;
    }

    const affectations = affectationsAInstant(m, ix, instant);
    const dispoDuQuart = indexerDisponibilitesDuQuart(m, instant);

    // --- Où est chaque bénévole --------------------------------------------
    const enPoste = new Map<Id, GroupeEnPoste>();
    const libres = new Map<string, {nom: string; detail: string}[]>();

    for (const benevole of m.benevoles) {
      const statut = statutBenevoleAInstant(ix, dispoDuQuart, affectations, benevole.id, benevole.Statut);
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
      h('div', {class: 'section-title'}, h('h2', null, 'En poste maintenant'), h('span', {class: 'count'}, `${[...enPoste.values()].reduce((n, g) => n + g.benevoles.length, 0)} bénévole(s)`)),
      enPoste.size === 0
        ? h('p', {class: 'empty'}, 'Personne en poste à cet instant.')
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
      h('div', {class: 'section-title'}, h('h2', null, 'Pas en poste')),
      ...(['disponible', 'veut-voir-artiste', 'indisponible', 'absent'] as const)
        .filter((cle) => (libres.get(cle)?.length ?? 0) > 0)
        .map((cle) => {
          const liste = libres.get(cle)!;
          return h('p', {class: 'terrain-libres'},
            h('strong', null, `${LIBELLE_ETAT_LIBRE[cle]} (${liste.length}) : `),
            liste.map((b) => (b.detail ? `${b.nom} (${b.detail})` : b.nom)).join(', '),
          );
        }),
    );

    // --- Effectifs attendus --------------------------------------------------
    const couvertures = couvertureAInstant(m, ix, instant)
      .sort((a, b) => a.mission.Nom.localeCompare(b.mission.Nom, 'fr'));

    const sectionEffectifs = h('section', {class: 'terrain-section'},
      h('div', {class: 'section-title'}, h('h2', null, 'Effectifs attendus')),
      couvertures.length === 0
        ? h('p', {class: 'empty'}, 'Aucun besoin ouvert à cet instant.')
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
