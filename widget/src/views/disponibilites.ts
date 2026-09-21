/**
 * Vue Disponibilités : une grille bénévoles × quart d'heure, un jour à la
 * fois (cahier des charges §8.10). Lecture seule — la saisie et la
 * correction des disponibilités vivent ailleurs.
 *
 * Densité assumée (jusqu'à 70 lignes × quelques dizaines de colonnes) :
 * en-tête et colonne des noms fixes au défilement, une teinte par état
 * (disponible / indisponible / veut voir un artiste), infobulle pour le
 * détail exact (heure, artiste souhaité).
 */

import type {Id} from '../domain/types';
import {indexer, regrouperParJour} from '../logic/derive';
import {
  blocsDuJour, estHeurePleine, indexerDisponibilitesParBenevole, statutCellule,
} from '../logic/dispos-terrain';
import type {Magasin} from '../store';
import {libelleHeure} from '../temps';
import {h, vider} from '../ui/dom';

const LIBELLE_STATUT: Record<'Disponible' | 'Indisponible' | 'Artiste', string> = {
  Disponible: 'disponible',
  Indisponible: 'indisponible',
  Artiste: 'veut voir un artiste',
};

export function montrerDisponibilites(container: HTMLElement, m: Magasin): () => void {
  let jourCle: string | null = null;
  let equipeFiltre: Id | 'toutes' = 'toutes';
  let recherche = '';

  function rafraichir(): void {
    const ix = indexer(m);
    const jours = regrouperParJour(m.macroCreneaux);
    if (jourCle == null || !jours.some((j) => j.cle === jourCle)) {
      jourCle = jours[0]?.cle ?? null;
    }
    vider(container);

    const barre = h('div', {class: 'dispos-barre'},
      h('div', {class: 'dispos-jours', role: 'tablist', 'aria-label': 'Jour'},
        ...jours.map((j) => h('button', {
          class: 'dispos-jour-tab', type: 'button', role: 'tab',
          'aria-selected': String(j.cle === jourCle),
          onclick: () => { jourCle = j.cle; rafraichir(); },
        }, j.libelle)),
      ),
      h('div', {class: 'dispos-barre__filtres'},
        h('select', {
          class: 'select', 'aria-label': 'Filtrer par équipe',
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            equipeFiltre = v === 'toutes' ? 'toutes' : Number(v);
            rafraichir();
          },
        },
          h('option', {value: 'toutes', selected: equipeFiltre === 'toutes'}, 'Toutes les équipes'),
          ...m.equipes.map((eq) => h('option', {value: String(eq.id), selected: equipeFiltre === eq.id}, eq.Nom)),
        ),
        h('input', {
          class: 'input', type: 'search', placeholder: 'Rechercher un bénévole…', value: recherche,
          oninput: (e: Event) => { recherche = (e.target as HTMLInputElement).value; rafraichir(); },
        }),
      ),
      h('div', {class: 'dispos-legende'},
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--disponible'}), 'Disponible'),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--artiste'}), 'Veut voir un artiste'),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--indisponible'}), 'Indisponible'),
      ),
    );
    container.append(barre);

    if (!jourCle) {
      container.append(h('p', {class: 'empty'}, 'Aucun macro-créneau : rien à afficher.'));
      return;
    }
    const jour = jours.find((j) => j.cle === jourCle)!;
    const blocs = blocsDuJour(jour).filter((b) => b.quarts.length > 0);

    const benevoles = m.benevoles
      .filter((b) => equipeFiltre === 'toutes' || b.Equipe === equipeFiltre)
      .filter((b) => recherche.trim() === '' || b.Nom.toLowerCase().includes(recherche.trim().toLowerCase()))
      .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'));

    if (blocs.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Ce jour ne couvre aucun quart d’heure.'));
      return;
    }
    if (benevoles.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Aucun bénévole ne correspond à ce filtre.'));
      return;
    }

    const indexDispos = indexerDisponibilitesParBenevole(m.disponibilites);

    const theadCellules: Node[] = [h('th', {class: 'dispos-table__coin', scope: 'col'}, 'Bénévole')];
    blocs.forEach((bloc, iBloc) => {
      bloc.quarts.forEach((q, iQuart) => {
        const limiteMacro = iQuart === 0 && iBloc > 0;
        theadCellules.push(h('th', {
          class: `dispos-table__heure${limiteMacro ? ' dispos-table__heure--limite-macro' : ''}`,
          scope: 'col',
          title: iQuart === 0 ? bloc.macro.Nom : undefined,
        }, estHeurePleine(q) ? libelleHeure(q) : ''));
      });
    });

    const lignes = benevoles.map((b) => {
      const equipe = ix.equipe.get(b.Equipe)!;
      const cellules = blocs.flatMap((bloc, iBloc) => bloc.quarts.map((q, iQuart) => {
        const {statut, artisteId} = statutCellule(indexDispos, b.id, q);
        const artisteNom = artisteId != null ? ix.artiste.get(artisteId)?.Nom : undefined;
        const classe = statut === 'Disponible' ? 'disponible' : statut === 'Artiste' ? 'artiste' : 'indisponible';
        const limiteMacro = iQuart === 0 && iBloc > 0;
        const detail = artisteNom ? `veut voir ${artisteNom}` : LIBELLE_STATUT[statut];
        return h('td', {
          class: `dispos-cellule dispos-cellule--${classe}${limiteMacro ? ' dispos-cellule--limite-macro' : ''}`,
          title: `${b.Nom} · ${libelleHeure(q)} · ${detail}`,
        });
      }));
      return h('tr', null,
        h('th', {class: 'dispos-table__benevole', scope: 'row'},
          h('span', {class: 'dot', style: {background: equipe.Couleur}}),
          b.Nom,
        ),
        ...cellules,
      );
    });

    container.append(
      h('div', {class: 'dispos-scroll'},
        h('table', {class: 'dispos-table'},
          h('thead', null, h('tr', null, ...theadCellules)),
          h('tbody', null, ...lignes),
        ),
      ),
      h('p', {class: 'view__intro', style: {marginTop: '10px', marginBottom: '0'}},
        `${benevoles.length} bénévole${benevoles.length > 1 ? 's' : ''} affiché${benevoles.length > 1 ? 's' : ''}. Une case sans donnée vaut indisponible (§6.4 du cahier des charges) : seule une disponibilité déclarée ouvre la possibilité d'une affectation.`,
      ),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
