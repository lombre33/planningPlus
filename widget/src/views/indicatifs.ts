/**
 * Vue indicatifs : donne à trancher visuellement le §6.3 du cahier des
 * charges. Un indicatif (ex. « BA07 ») est positionné à l'avance sur
 * plusieurs besoins, y compris sur des missions différentes : c'est la
 * mission qui tourne d'un sous-créneau à l'autre, pas le binôme qui
 * l'occupe. Déplacer une position ne touche qu'une ligne `PositionGroupe`
 * (contrainte C : ajustement à chaud sans recalcul global).
 */

import type {Id} from '../domain/types';
import {classerCandidats, indexer, positionsDuGroupe} from '../logic/derive';
import type {Magasin} from '../store';
import {h, vider} from '../ui/dom';
import {libelleJourLong} from '../temps';

export function montrerIndicatifs(container: HTMLElement, m: Magasin): () => void {
  let equipeId: Id | null = null;
  let groupeId: Id | null = null;
  let uniquementRotatifs = true;

  function rafraichir(): void {
    const ix = indexer(m);
    if (equipeId == null) { equipeId = m.equipes[0]?.id ?? null; }
    vider(container);
    if (equipeId == null) { container.append(h('p', {class: 'empty'}, "Aucune équipe dans ce jeu de données.")); return; }

    const groupesEquipe = m.groupes
      .filter((g) => g.Equipe === equipeId)
      .map((g) => ({groupe: g, positions: positionsDuGroupe(m, ix, g.id)}))
      .filter((g) => !uniquementRotatifs || g.positions.length >= 2)
      .sort((a, b) => b.positions.length - a.positions.length || a.groupe.Code.localeCompare(b.groupe.Code));

    if (groupeId == null || !groupesEquipe.some((g) => g.groupe.id === groupeId)) {
      groupeId = groupesEquipe[0]?.groupe.id ?? null;
    }

    container.append(
      h('div', {class: 'agenda__toolbar'},
        ...m.equipes.map((eq) => h('button', {
          class: `btn btn--sm${eq.id === equipeId ? ' btn--primary' : ''}`, type: 'button',
          onclick: () => { equipeId = eq.id; groupeId = null; rafraichir(); },
        }, eq.Nom)),
        h('label', {style: {display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', marginLeft: '8px'}},
          h('input', {
            type: 'checkbox', checked: uniquementRotatifs,
            onchange: (e: Event) => { uniquementRotatifs = (e.target as HTMLInputElement).checked; groupeId = null; rafraichir(); },
          }),
          'Qui tournent sur ≥ 2 missions',
        ),
      ),
      h('p', {class: 'view__intro'},
        `${groupesEquipe.length} indicatif${groupesEquipe.length > 1 ? 's' : ''} pour cette équipe`
        + (uniquementRotatifs ? ' qui tournent sur au moins deux positions.' : '.'),
      ),
      groupesEquipe.length === 0
        ? h('p', {class: 'empty'}, 'Aucun indicatif ne correspond à ce filtre.')
        : h('div', {class: 'indicatif-picker'}, ...groupesEquipe.map(({groupe, positions}) => h('button', {
          class: 'indicatif-chip', type: 'button', 'aria-pressed': String(groupe.id === groupeId),
          onclick: () => { groupeId = groupe.id; rafraichir(); },
        }, `${groupe.Code} (${positions.length})`))),
    );

    if (groupeId != null) {
      container.append(detailIndicatif(ix, groupeId));
    }
  }

  function detailIndicatif(ix: ReturnType<typeof indexer>, id: Id): Node {
    const groupe = ix.groupe.get(id)!;
    const positions = positionsDuGroupe(m, ix, id);
    const places = m.places.filter((p) => p.Groupe === id).sort((a, b) => a.Rang - b.Rang);
    const candidats = classerCandidats(m, ix, id);

    return h('div', {style: {marginTop: '18px'}},
      h('div', {class: 'section-title'}, h('h2', null, `Trajectoire de ${groupe.Code}`)),
      h('div', {class: 'trajectoire'}, ...positions.flatMap(({position, besoin, sousCreneau}, i) => {
        const mission = ix.mission.get(besoin.Mission)!;
        const lieu = ix.lieu.get(mission.Lieu);
        const carte = h('div', {class: 'trajectoire__etape'},
          h('span', {class: 'heure mono'}, `${libelleJourLong(sousCreneau.Debut).split(' ')[0]} · ${sousCreneau.Libelle}`),
          h('div', {class: 'mission'}, mission.Nom),
          h('div', {style: {fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px'}}, lieu?.Nom ?? ''),
          selecteurBesoinCible(id, position.id, besoin.id),
        );
        return i === 0 ? [carte] : [h('span', {class: 'trajectoire__arrow'}, '→'), carte];
      })),
      h('div', {class: 'section-title', style: {marginTop: '18px'}},
        h('h2', null, 'Binôme'),
        h('span', {class: 'count mono'}, `taille ${groupe.Taille}`),
      ),
      h('p', {class: 'view__intro'}, 'Ce sont les mêmes personnes sur toutes les étapes ci-dessus : seule la mission change.'),
      h('div', {class: 'card'}, ...places.map((place) => h('div', {class: 'membre'},
        h('span', {class: 'rang mono'}, `#${place.Rang}`),
        h('select', {
          class: 'select',
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            m.assignerPlace(place.id, v === '' ? null : Number(v));
          },
        },
          h('option', {value: '', selected: place.Benevole == null}, '— place non pourvue —'),
          ...(place.Benevole != null && !candidats.some((c) => c.benevoleId === place.Benevole)
            ? [h('option', {value: String(place.Benevole), selected: true}, ix.benevole.get(place.Benevole)?.Nom ?? '?')]
            : []),
          ...candidats.map((c) => h(
            'option', {value: String(c.benevoleId), selected: c.benevoleId === place.Benevole},
            `${c.nom} (${c.score.toFixed(2)})`,
          )),
        ),
      ))),
    );
  }

  function selecteurBesoinCible(groupeIdActuel: Id, positionId: Id, besoinActuelId: Id): Node {
    const ix = indexer(m);
    const groupe = ix.groupe.get(groupeIdActuel)!;
    const dejaCouverts = new Set(positionsDuGroupe(m, ix, groupeIdActuel).map((p) => p.besoin.id));
    const autresBesoins = m.besoins
      .filter((b) => ix.mission.get(b.Mission)?.Equipe === groupe.Equipe && !dejaCouverts.has(b.id))
      .sort((a, b) => ix.sousCreneau.get(a.Sous_creneau)!.Debut - ix.sousCreneau.get(b.Sous_creneau)!.Debut)
      .slice(0, 60);
    return h('select', {
      class: 'select', style: {width: '100%', fontSize: '10.5px'},
      onchange: (e: Event) => {
        const v = Number((e.target as HTMLSelectElement).value);
        if (v) { m.deplacerPosition(positionId, v); }
      },
    },
      h('option', {value: String(besoinActuelId)}, 'Repositionner…'),
      ...autresBesoins.map((b) => h('option', {value: String(b.id)},
        `${ix.mission.get(b.Mission)!.Nom} — ${ix.sousCreneau.get(b.Sous_creneau)!.Libelle}`,
      )),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
