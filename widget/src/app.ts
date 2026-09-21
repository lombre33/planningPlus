/**
 * Coquille de l'application : sélecteur de vue (§9.2, un widget unique avec
 * navigation interne) et montage de la vue active.
 *
 * Chaque vue gère elle-même son état local (jour sélectionné, filtre…) et se
 * réabonne au magasin pour se redessiner ; la coquille se contente de
 * démonter proprement la vue précédente à chaque changement d'onglet.
 */

import type {Magasin} from './store';
import {h, ICONES, icone, vider} from './ui/dom';
import {montrerAffectation} from './views/affectation';
import {montrerAgenda} from './views/agenda';
import {montrerComparatifAgenda} from './views/agenda-comparatif';
import {montrerAnomalies} from './views/anomalies';
import {montrerArtistes} from './views/artistes';
import {montrerBenevole} from './views/benevole';
import {montrerDisponibilites} from './views/disponibilites';
import {montrerEquipe} from './views/equipe';
import {montrerGrille} from './views/grille';
import {montrerIndicatifs} from './views/indicatifs';
import {montrerJourJ} from './views/jourJ';
import {montrerTerrain} from './views/terrain';

type IdOnglet =
  | 'agenda' | 'agenda-comparatif' | 'grille' | 'affectation' | 'anomalies' | 'indicatifs'
  | 'disponibilites' | 'terrain' | 'jourj'
  | 'benevole' | 'equipe' | 'artistes';

interface DefinitionOnglet {
  id: IdOnglet;
  libelle: string;
  icone: string;
  titre: string;
  sousTitre: string;
  montrer: (container: HTMLElement, m: Magasin) => () => void;
}

const ONGLETS: DefinitionOnglet[] = [
  {
    id: 'agenda', libelle: 'Agenda', icone: ICONES.agenda,
    titre: 'Agenda du festival',
    sousTitre: 'Macro-créneaux et sous-créneaux. Glissez pour déplacer, redimensionnez par les bords, ou ajoutez un macro-créneau.',
    montrer: montrerAgenda,
  },
  {
    id: 'agenda-comparatif', libelle: 'Agenda (comparatif)', icone: ICONES.agenda,
    titre: 'Comparatif agenda : vertical ou horizontal',
    sousTitre: 'Même journée, deux dispositions, pour trancher laquelle garder — pas d’édition ici. Onglet temporaire, à retirer une fois la disposition choisie.',
    montrer: montrerComparatifAgenda,
  },
  {
    id: 'grille', libelle: 'Missions', icone: ICONES.grille,
    titre: 'Missions × sous-créneaux',
    sousTitre: 'Qui est où. Cliquez une case pour voir la couverture et affecter un candidat classé.',
    montrer: montrerGrille,
  },
  {
    id: 'affectation', libelle: 'Affectation', icone: ICONES.affectation,
    titre: 'Affectation manuelle',
    sousTitre: 'Glissez un bénévole vers une place, ou une place vers une autre pour l’échanger. Chaque dépôt montre aussitôt ce qu’il répare ou casse (§7.5).',
    montrer: montrerAffectation,
  },
  {
    id: 'anomalies', libelle: 'Anomalies', icone: ICONES.anomalies,
    titre: 'Anomalies',
    sousTitre: 'Places vides, souhaits contrariés, quotas dépassés — rien de tout ça n’est masqué (objectif O3).',
    montrer: montrerAnomalies,
  },
  {
    id: 'indicatifs', libelle: 'Indicatifs', icone: ICONES.equipes,
    titre: 'Indicatifs et équipes',
    sousTitre: 'Un indicatif est positionné à l’avance sur plusieurs missions : c’est la mission qui tourne, pas le binôme (§6.3).',
    montrer: montrerIndicatifs,
  },
  {
    id: 'disponibilites', libelle: 'Disponibilités', icone: ICONES.disponibilites,
    titre: 'Disponibilités des bénévoles',
    sousTitre: 'Qui est disponible, indisponible ou veut voir un artiste, au quart d’heure, un jour de festival à la fois.',
    montrer: montrerDisponibilites,
  },
  {
    id: 'terrain', libelle: 'Terrain', icone: ICONES.terrain,
    titre: 'Terrain',
    sousTitre: 'Qui doit être où à un instant donné, et les effectifs attendus par mission face à leur minimum.',
    montrer: montrerTerrain,
  },
  {
    id: 'jourj', libelle: 'Jour J', icone: ICONES.jourj,
    titre: 'Ajustement jour J',
    sousTitre: 'Une absence libère ses places. Remplaçants classés, permutation proposée avec aperçu avant validation (§7.3).',
    montrer: montrerJourJ,
  },
  {
    id: 'benevole', libelle: 'Bénévole', icone: ICONES.personne,
    titre: 'Feuille de route bénévole',
    sousTitre: "La feuille individuelle d'un bénévole sur toute la durée, imprimable pour le jour J.",
    montrer: montrerBenevole,
  },
  {
    id: 'equipe', libelle: 'Équipe', icone: ICONES.groupe,
    titre: 'Vue équipe',
    sousTitre: 'Une équipe sur toute la durée, par indicatif. Vue de consultation pour les cheffes d’équipe : on repère, on ne modifie pas ici.',
    montrer: montrerEquipe,
  },
  {
    id: 'artistes', libelle: 'Artistes', icone: ICONES.artiste,
    titre: 'Artistes',
    sousTitre: 'Qui joue quand, et combien de bénévoles veulent le voir — et parmi eux, combien sont déjà en conflit.',
    montrer: montrerArtistes,
  },
];

export function demarrerApp(racine: HTMLElement, magasin: Magasin, sourceLibelle: string): void {
  let ongletActif: IdOnglet | null = null;
  let detruireVue: () => void = () => {};

  const boutons = new Map<IdOnglet, HTMLButtonElement>();
  const rail = h('nav', {class: 'rail', 'aria-label': 'Vues du planning'},
    h('div', {class: 'rail__brand'}, 'Planning+'),
  );
  for (const def of ONGLETS) {
    const bouton = h('button', {
      class: 'rail__item', type: 'button',
      onclick: () => activer(def.id),
    }, icone(def.icone), def.libelle) as HTMLButtonElement;
    boutons.set(def.id, bouton);
    rail.append(bouton);
  }

  const topbar = h('header', {class: 'topbar'});
  const vue = h('div', {class: 'view'});
  const main = h('div', {class: 'main'}, topbar, vue);
  const shell = h('div', {class: 'app-shell'}, rail, main);

  function activer(id: IdOnglet): void {
    if (id === ongletActif) {
      // La vue reste déjà montée et abonnée au magasin : rien à refaire.
      return;
    }
    ongletActif = id;
    detruireVue();
    for (const [idBouton, bouton] of boutons) {
      bouton.setAttribute('aria-current', String(idBouton === id));
    }
    const def = ONGLETS.find((o) => o.id === id)!;
    vider(topbar);
    topbar.append(
      h('div', {class: 'topbar__title'},
        h('h1', null, def.titre),
        h('p', {class: 'topbar__subtitle'}, def.sousTitre),
      ),
      h('div', {class: 'topbar__actions'},
        h('span', {class: 'pill pill--neutral'}, sourceLibelle),
      ),
    );
    vider(vue);
    detruireVue = def.montrer(vue, magasin);
  }

  racine.replaceChildren(shell);
  activer('grille');

  // Zone d'impression : un enfant direct de <body>, pas de #app, pour que
  // masquer « tout sauf elle » (`.impression-active` dans style.css) au
  // moment d'imprimer masque bien tout le reste (rail, topbar) d'un coup,
  // #app compris. Vidée et remplie ponctuellement par la vue Bénévole.
  if (!document.getElementById('zone-impression')) {
    document.body.append(h('div', {id: 'zone-impression'}));
  }
}
