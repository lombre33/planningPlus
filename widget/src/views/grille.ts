/**
 * Vue « missions × sous-créneaux » : qui est où pour un jour donné (§8.2 du
 * cahier des charges — la vue des cheffes d'équipe). Cliquer une case ouvre
 * le détail du besoin et, pour chaque place vide, un classement de
 * candidats à affecter.
 */

import type {Groupe, Id, Mission, Place, SousCreneau} from '../domain/types';
import {TYPE_PLACE_DRAG} from '../logic/dnd-types';
import {
  type Candidat, type Index, classerCandidats, couvertureBesoin, indexer, regrouperParJour,
} from '../logic/derive';
import {apercuEchange, verifierDepot} from '../logic/glisser-deposer';
import type {Magasin} from '../store';
import {fermerPanneau, h, ouvrirPanneau, vider} from '../ui/dom';

export function montrerGrille(container: HTMLElement, m: Magasin): () => void {
  let jourIndex = 0;
  let equipeFiltre: Id | 'toutes' = 'toutes';
  let dernierMessage: {texte: string; ton: 'ok' | 'danger'} | null = null;

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
        const etatCase = c.statut === 'sous' ? 'sous' : 'ok';
        tr.append(h('td', {class: 'besoin-cell'},
          h('button', {
            class: `besoin besoin--${etatCase}`, type: 'button',
            onclick: () => { dernierMessage = null; ouvrirDetailBesoin(besoin.id); },
          },
            h('span', {class: 'besoin__effectif mono'}, `${c.pourvues}/${besoin.Effectif_min}`),
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
      dernierMessage ? h('span', {class: `pill pill--${dernierMessage.ton}`}, dernierMessage.texte) : null,
      h('span', {class: `pill pill--${c.statut === 'sous' ? 'danger' : 'ok'}`},
        `${c.pourvues} affecté${c.pourvues > 1 ? 's' : ''} sur un minimum de ${besoin.Effectif_min}`,
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

  /** Échange (ou déplace, si l'une des deux places est vide) les occupants
   *  de deux places — le même geste que la vue Affectation manuelle
   *  (`views/affectation.ts`), disponible ici aussi (§7.5 : le parcours
   *  d'affectation vaut où qu'il s'affiche, y compris dans cette grille). */
  function deposerEchange(besoinId: Id, placeSourceId: Id, placeCibleId: Id): void {
    const source = m.places.find((p) => p.id === placeSourceId);
    const cible = m.places.find((p) => p.id === placeCibleId);
    if (!source || !cible || source.Benevole == null) { return; }
    if (source.Verrouillee || cible.Verrouillee) {
      dernierMessage = {texte: 'Place verrouillée : déverrouillez-la avant de la modifier.', ton: 'danger'};
      ouvrirDetailBesoin(besoinId);
      return;
    }
    if (source.Benevole != null) {
      const verdict = verifierDepot(m, source.Benevole, placeCibleId, [placeSourceId]);
      if (!verdict.ok) { dernierMessage = {texte: verdict.motif, ton: 'danger'}; ouvrirDetailBesoin(besoinId); return; }
    }
    if (cible.Benevole != null) {
      const verdict = verifierDepot(m, cible.Benevole, placeSourceId, [placeCibleId]);
      if (!verdict.ok) { dernierMessage = {texte: verdict.motif, ton: 'danger'}; ouvrirDetailBesoin(besoinId); return; }
    }

    const diff = apercuEchange(m, placeSourceId, placeCibleId);
    const benevoleSource = source.Benevole;
    const benevoleCible = cible.Benevole;
    m.assignerPlace(placeSourceId, benevoleCible, 'Manuel');
    m.assignerPlace(placeCibleId, benevoleSource, 'Manuel');
    const base = benevoleCible != null ? 'Échange effectué.' : 'Déplacé.';
    dernierMessage = diff.creees.length > 0
      ? {texte: `${base} ${diff.creees.length} anomalie${diff.creees.length > 1 ? 's' : ''} créée${diff.creees.length > 1 ? 's' : ''}.`, ton: 'danger'}
      : {texte: base, ton: 'ok'};
    ouvrirDetailBesoin(besoinId);
  }

  function ligneMembre(besoinId: Id, place: Place): Node {
    const ix = indexer(m);
    const benevole = place.Benevole != null ? ix.benevole.get(place.Benevole) : null;
    const ligne: HTMLElement = h('div', {
      class: 'membre',
      draggable: benevole && !place.Verrouillee ? 'true' : 'false',
      ondragstart: benevole ? (e: Event) => {
        const dt = (e as DragEvent).dataTransfer;
        dt?.setData(TYPE_PLACE_DRAG, String(place.id));
        if (dt) { dt.effectAllowed = 'move'; }
      } : undefined,
      ondragover: (e: Event) => {
        const de = e as DragEvent;
        if (!(de.dataTransfer?.types ?? []).includes(TYPE_PLACE_DRAG)) { return; }
        de.preventDefault();
        ligne.style.background = 'var(--brand-tint)';
      },
      ondragleave: () => { ligne.style.background = ''; },
      ondrop: (e: Event) => {
        const de = e as DragEvent;
        de.preventDefault();
        ligne.style.background = '';
        const placeRaw = de.dataTransfer?.getData(TYPE_PLACE_DRAG);
        if (placeRaw && Number(placeRaw) !== place.id) { deposerEchange(besoinId, Number(placeRaw), place.id); }
      },
    },
      h('span', {class: 'rang mono'}, `#${place.Rang}`),
      benevole
        ? h('span', {style: {flex: '1'}}, benevole.Nom)
        : h('span', {style: {flex: '1', color: 'var(--text-faint)'}}, 'Place non pourvue — glissez un occupant ici, ou :'),
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
    return ligne;
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
