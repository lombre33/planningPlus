/**
 * Vue « missions × sous-créneaux » : qui est où pour un jour donné (§8.2 du
 * cahier des charges — la vue des cheffes d'équipe). Cliquer une case ouvre
 * le détail du besoin et, pour chaque place vide, un classement de
 * candidats à affecter.
 */

import type {Groupe, Id, Mission, Place, SousCreneau} from '../domain/types';
import {
  type Candidat, type Index, classerCandidats, couvertureBesoin, indexer, regrouperParJour,
} from '../logic/derive';
import type {Magasin} from '../store';
import {fermerPanneau, h, ouvrirPanneau, vider} from '../ui/dom';

export function montrerGrille(container: HTMLElement, m: Magasin): () => void {
  let jourIndex = 0;
  let equipeFiltre: Id | 'toutes' = 'toutes';

  function rafraichir(): void {
    const ix = indexer(m);
    const jours = regrouperParJour(m.macroCreneaux);
    jourIndex = Math.min(jourIndex, Math.max(jours.length - 1, 0));
    const jour = jours[jourIndex];
    const sousCreneaux = jour
      ? m.sousCreneaux
        .filter((sc) => jour.macros.some((ma) => ma.id === sc.Macro_creneau))
        .sort((a, b) => a.Debut - b.Debut)
      : [];
    const missions = m.missions
      .filter((mi) => equipeFiltre === 'toutes' || mi.Equipe === equipeFiltre)
      .sort((a, b) => a.Equipe - b.Equipe || a.Nom.localeCompare(b.Nom, 'fr'));

    vider(container);
    container.append(
      h('div', {class: 'agenda__toolbar'},
        ...jours.map((j, i) => h('button', {
          class: `btn btn--sm${i === jourIndex ? ' btn--primary' : ''}`, type: 'button',
          onclick: () => { jourIndex = i; rafraichir(); },
        }, j.libelle.split(' ').slice(0, 1).join(' '))),
        h('select', {
          class: 'select',
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            equipeFiltre = v === 'toutes' ? 'toutes' : Number(v);
            rafraichir();
          },
        },
          h('option', {value: 'toutes'}, 'Toutes les équipes'),
          ...m.equipes.map((eq) => h(
            'option', {value: String(eq.id), selected: equipeFiltre === eq.id}, eq.Nom,
          )),
        ),
      ),
      sousCreneaux.length === 0
        ? h('p', {class: 'empty'}, 'Aucun sous-créneau ce jour.')
        : construireTable(ix, missions, sousCreneaux),
    );
  }

  function construireTable(ix: Index, missions: Mission[], sousCreneaux: SousCreneau[]): Node {
    const thead = h('thead', null, h('tr', null,
      h('th', {class: 'mission-cell'}, 'Mission'),
      ...sousCreneaux.map((sc) => h('th', null, sc.Libelle)),
    ));
    const tbody = h('tbody');
    for (const mission of missions) {
      const lieu = ix.lieu.get(mission.Lieu);
      const equipe = ix.equipe.get(mission.Equipe)!;
      const tr = h('tr', null,
        h('td', {class: 'mission-cell'},
          h('span', {class: 'dot', style: {background: equipe.Couleur, marginRight: '6px'}}),
          h('span', {class: 'nom'}, mission.Nom),
          h('span', {class: 'lieu'}, lieu?.Nom ?? ''),
        ),
      );
      for (const sc of sousCreneaux) {
        const besoin = m.besoins.find((b) => b.Mission === mission.id && b.Sous_creneau === sc.id);
        if (!besoin) {
          tr.append(h('td', {class: 'besoin-cell besoin-cell--vide'}));
          continue;
        }
        const c = couvertureBesoin(m, ix, besoin.id);
        const fourchette = besoin.Effectif_max > besoin.Effectif_min
          ? `${c.pourvues}/${besoin.Effectif_min}–${besoin.Effectif_max}` : `${c.pourvues}/${besoin.Effectif_min}`;
        tr.append(h('td', {class: 'besoin-cell'},
          h('button', {class: `besoin besoin--${c.statut}`, type: 'button', onclick: () => ouvrirDetailBesoin(besoin.id)},
            h('span', {class: 'besoin__effectif mono'}, fourchette),
            h('div', {class: 'besoin__groupes'}, ...c.groupesPositionnes.map((g) => h(
              'span', {class: 'chip-groupe', style: {background: ix.equipe.get(g.groupe.Equipe)?.Couleur ?? '#888'}},
              g.groupe.Code,
            ))),
          ),
        ));
      }
      tbody.append(tr);
    }
    const table = h('table', {class: 'grille'}, thead, tbody);
    return h('div', {class: 'grille-wrap'}, table);
  }

  function ouvrirDetailBesoin(besoinId: Id): void {
    const ix = indexer(m);
    const besoin = ix.besoin.get(besoinId);
    if (!besoin) { fermerPanneau(); return; }
    const mission = ix.mission.get(besoin.Mission)!;
    const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau)!;
    const c = couvertureBesoin(m, ix, besoinId);

    const panneau = h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
      h('div', {class: 'side-panel__head'},
        h('div', null,
          h('h3', null, mission.Nom),
          h('p', {class: 'topbar__subtitle'}, sousCreneau.Libelle),
        ),
        h('button', {class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => fermerPanneau()}, 'Fermer'),
      ),
      h('span', {class: `pill pill--${c.statut === 'ok' ? 'ok' : c.statut === 'partiel' ? 'warn' : 'danger'}`},
        `${c.pourvues} affecté${c.pourvues > 1 ? 's' : ''} sur un minimum de ${besoin.Effectif_min}`
        + (besoin.Effectif_max > besoin.Effectif_min ? ` (max ${besoin.Effectif_max})` : ''),
      ),
      c.groupesPositionnes.length === 0
        ? h('p', {class: 'empty'}, "Aucun indicatif n'est encore positionné sur ce besoin.")
        : h('div', null, ...c.groupesPositionnes.map((g) => carteGroupe(besoinId, g.groupe))),
    );
    ouvrirPanneau(panneau);
  }

  function carteGroupe(besoinId: Id, groupe: Groupe): Node {
    const ix = indexer(m);
    const places = m.places.filter((p) => p.Groupe === groupe.id).sort((a, b) => a.Rang - b.Rang);
    const equipe = ix.equipe.get(groupe.Equipe)!;
    return h('div', {class: 'card', style: {marginBottom: '10px'}},
      h('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}},
        h('span', {class: 'mono', style: {fontWeight: '700'}}, groupe.Code),
        h('span', {class: 'pill pill--neutral'}, equipe.Nom),
      ),
      ...places.map((place) => ligneMembre(besoinId, place)),
    );
  }

  function ligneMembre(besoinId: Id, place: Place): Node {
    const ix = indexer(m);
    const benevole = place.Benevole != null ? ix.benevole.get(place.Benevole) : null;
    return h('div', {class: 'membre'},
      h('span', {class: 'rang mono'}, `#${place.Rang}`),
      benevole
        ? h('span', {style: {flex: '1'}}, benevole.Nom)
        : h('span', {style: {flex: '1', color: 'var(--text-faint)'}}, 'Place non pourvue'),
      benevole
        ? h('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          onclick: () => { m.assignerPlace(place.id, null); ouvrirDetailBesoin(besoinId); },
        }, 'Vider')
        : h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => ouvrirChoixCandidat(besoinId, place),
        }, 'Affecter…'),
    );
  }

  function ouvrirChoixCandidat(besoinId: Id, place: Place): void {
    const ix = indexer(m);
    const groupe = ix.groupe.get(place.Groupe)!;
    const candidats = classerCandidats(m, ix, groupe.id);
    const panneau = h('div', {style: {display: 'flex', flexDirection: 'column', gap: '12px'}},
      h('div', {class: 'side-panel__head'},
        h('div', null,
          h('h3', null, `Place #${place.Rang} — ${groupe.Code}`),
          h('p', {class: 'topbar__subtitle'}, 'Vaut pour tous les créneaux de cet indicatif.'),
        ),
        h('button', {class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => ouvrirDetailBesoin(besoinId)}, '← Retour'),
      ),
      candidats.length === 0
        ? h('p', {class: 'empty'}, 'Aucun candidat ne satisfait les contraintes dures pour cet indicatif.')
        : h('div', {style: {display: 'flex', flexDirection: 'column', gap: '8px'}},
          ...candidats.map((c) => carteCandidat(c, () => {
            m.assignerPlace(place.id, c.benevoleId, 'Manuel');
            fermerPanneau();
          })),
        ),
    );
    ouvrirPanneau(panneau);
  }

  function carteCandidat(c: Candidat, retenir: () => void): Node {
    return h('div', {class: 'candidat'},
      h('div', {class: 'candidat__head'},
        h('span', {class: 'candidat__nom'}, c.nom),
        h('span', {class: 'candidat__score mono'}, c.score.toFixed(2)),
      ),
      h('div', {class: 'candidat__raisons'}, ...c.tags.map((t) => h(
        'span', {class: `tag tag--${t.sens}`}, t.texte,
      ))),
      h('button', {class: 'btn btn--primary btn--sm', type: 'button', onclick: retenir}, 'Retenir'),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
