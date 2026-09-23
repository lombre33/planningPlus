/**
 * Vue jour J : une absence libère ses places (§7.4), qui reçoivent aussitôt
 * une liste de remplaçants classés (§7.2). Quand aucun remplaçant direct
 * n'est propre, une permutation à un cran est proposée — toujours avec un
 * aperçu, rien n'est écrit avant validation (§7.3, §6.5).
 */

import type {Id} from '../domain/types';
import {type Candidat, indexer} from '../logic/derive';
import {type EtapePermutation, classerCandidats, proposerPermutation} from '../moteur/adaptateur-magasin';
import type {Magasin} from '../store';
import {h, vider} from '../ui/dom';

export function montrerJourJ(container: HTMLElement, m: Magasin): () => void {
  let recherche = '';
  let benevoleSelectionne: Id | null = null;
  let placesAVerifier: Id[] = [];

  function rafraichir(): void {
    const ix = indexer(m);
    vider(container);

    const benevoles = m.benevoles
      .filter((b) => recherche.trim() === '' || b.Nom.toLowerCase().includes(recherche.trim().toLowerCase()))
      .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'));

    const colonneGauche = h('div', null,
      h('input', {
        class: 'input', type: 'search', placeholder: 'Rechercher un bénévole…', value: recherche,
        style: {width: '100%', marginBottom: '10px'},
        oninput: (e: Event) => { recherche = (e.target as HTMLInputElement).value; rafraichir(); },
      }),
      ...benevoles.map((b) => {
        const equipe = ix.equipe.get(b.Equipe)!;
        const nbPlaces = m.places.filter((p) => p.Benevole === b.id).length;
        return h('div', {class: 'benevole-row'},
          h('div', null,
            h('span', {class: 'dot', style: {background: equipe.Couleur, marginRight: '6px'}}),
            h('span', {class: 'nom'}, b.Nom),
            h('br'),
            h('span', {class: 'equipe'}, `${equipe.Nom} · ${nbPlaces} place${nbPlaces > 1 ? 's' : ''}`),
          ),
          h('div', {style: {display: 'flex', gap: '6px', alignItems: 'center'}},
            h('span', {class: `pill pill--${b.Statut === 'Actif' ? 'ok' : 'danger'}`}, b.Statut),
            b.Statut === 'Actif'
              ? h('button', {
                class: 'btn btn--sm', type: 'button',
                onclick: () => { void (async () => {
                  const resultat = await m.definirAbsence(b.id, true);
                  if (resultat.ok) {
                    benevoleSelectionne = b.id;
                    placesAVerifier = resultat.placesLiberees;
                  }
                  rafraichir();
                })(); },
              }, 'Marquer absent')
              : h('button', {
                class: 'btn btn--sm', type: 'button',
                onclick: () => { void (async () => { await m.definirAbsence(b.id, false); rafraichir(); })(); },
              }, 'De retour'),
          ),
        );
      }),
    );

    const colonneDroite = h('div', null);
    if (benevoleSelectionne != null) {
      const benevole = ix.benevole.get(benevoleSelectionne);
      if (benevole) {
        colonneDroite.append(
          h('div', {class: 'section-title'}, h('h2', null, `Places à repourvoir — ${benevole.Nom}`)),
          placesAVerifier.length === 0
            ? h('p', {class: 'empty'}, "Cette personne ne tenait aucune place, ou tout a déjà été repourvu.")
            : h('div', null, ...placesAVerifier.map((placeId) => cartePlaceAVerifier(ix, placeId))),
        );
      }
    } else {
      colonneDroite.append(h('p', {class: 'empty'}, 'Sélectionnez un bénévole et marquez-le absent pour voir les places libérées et leurs remplaçants proposés.'));
    }

    container.append(h('div', {class: 'jourj-layout'}, colonneGauche, colonneDroite));
  }

  function cartePlaceAVerifier(ix: ReturnType<typeof indexer>, placeId: Id): Node {
    const place = m.places.find((p) => p.id === placeId);
    if (!place || place.Benevole != null) {
      // déjà repourvue entre-temps (par la permutation ci-dessous, ou manuellement)
      return h('div', {class: 'card', style: {marginBottom: '12px'}},
        h('span', {class: 'pill pill--ok'}, 'Repourvue'),
      );
    }
    const groupe = ix.groupe.get(place.Groupe)!;
    const positions = m.positionsGroupe.filter((p) => p.Groupe === groupe.id);
    const missions = [...new Set(positions.map((p) => ix.besoin.get(p.Besoin)!.Mission))]
      .map((id) => ix.mission.get(id)!.Nom).join(', ');

    const candidats = classerCandidats(m, ix, groupe.id).slice(0, 5);
    const permutation = proposerPermutation(m, ix, placeId);

    const carte = h('div', {class: 'card', style: {marginBottom: '14px'}},
      h('div', {style: {marginBottom: '8px'}},
        h('span', {class: 'mono', style: {fontWeight: '700'}}, groupe.Code),
        h('span', {style: {color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px'}}, missions),
      ),
    );

    if (candidats.length > 0) {
      carte.append(h('p', {class: 'view__intro', style: {margin: '0 0 8px'}}, 'Remplaçants classés :'));
      for (const c of candidats) {
        carte.append(carteCandidatCompacte(c, () => { void (async () => {
          const resultat = await m.assignerPlace(placeId, c.benevoleId, 'Manuel');
          if (resultat.ok) { retirerDeLaListe(placeId); } else { rafraichir(); }
        })(); }));
      }
    } else {
      carte.append(h('p', {class: 'empty'}, 'Aucun remplaçant direct ne satisfait les contraintes dures.'));
    }

    if (permutation) {
      carte.append(permutationCard(permutation, () => { void (async () => {
        for (const etape of permutation) {
          const resultat = await m.assignerPlace(etape.place.id, etape.benevoleId, 'Manuel');
          if (!resultat.ok) { rafraichir(); return; }
        }
        retirerDeLaListe(placeId);
      })(); }));
    }

    return carte;
  }

  function carteCandidatCompacte(c: Candidat, retenir: () => void): Node {
    return h('div', {class: 'candidat', style: {marginBottom: '6px'}},
      h('div', {class: 'candidat__head'},
        h('span', {class: 'candidat__nom'}, c.nom),
        h('span', {class: 'candidat__score mono'}, c.score.toFixed(2)),
      ),
      h('div', {class: 'candidat__raisons'}, ...c.tags.map((t) => h('span', {class: `tag tag--${t.sens}`}, t.texte))),
      h('button', {class: 'btn btn--primary btn--sm', type: 'button', onclick: retenir}, 'Retenir'),
    );
  }

  function permutationCard(chaine: EtapePermutation[], valider: () => void): Node {
    return h('div', {class: 'permutation'},
      h('strong', {style: {fontSize: '12.5px'}}, 'Proposition avec permutation'),
      h('p', {class: 'view__intro', style: {margin: '4px 0'}},
        "Aucun remplaçant direct sans compromis : ce schéma déplace une personne déjà affectée sur un besoin qui reste couvert sans elle, et cherche un candidat frais pour la place qu'elle libère à son tour.",
      ),
      h('div', {class: 'permutation__chaine'}, ...chaine.map((etape) => h('span', {class: 'permutation__etape'},
        h('span', null, etape.benevoleNom),
        h('span', {class: 'place'}, etape.depuisMissionNom ? `${etape.depuisMissionNom} → ${etape.versMissionNom}` : `nouveau sur ${etape.versMissionNom}`),
      ))),
      h('button', {class: 'btn btn--primary btn--sm', type: 'button', onclick: valider}, 'Valider cette permutation'),
    );
  }

  function retirerDeLaListe(placeId: Id): void {
    placesAVerifier = placesAVerifier.filter((id) => id !== placeId);
    rafraichir();
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
