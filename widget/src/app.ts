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
import {montrerAgenda} from './views/agenda';
import {montrerComparatifAgenda} from './views/agenda-comparatif';
import {montrerAnomalies} from './views/anomalies';
import {montrerGrille} from './views/grille';
import {montrerIndicatifs} from './views/indicatifs';
import {montrerJourJ} from './views/jourJ';

type IdOnglet = 'agenda' | 'agenda-comparatif' | 'grille' | 'anomalies' | 'indicatifs' | 'jourj';

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
    id: 'jourj', libelle: 'Jour J', icone: ICONES.jourj,
    titre: 'Ajustement jour J',
    sousTitre: 'Une absence libère ses places. Remplaçants classés, permutation proposée avec aperçu avant validation (§7.3).',
    montrer: montrerJourJ,
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
}
