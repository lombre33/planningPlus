/**
 * Coquille de l'application : sélecteur de vue (§9.2, un widget unique avec
 * navigation interne) et montage de la vue active.
 *
 * Chaque vue gère elle-même son état local (jour sélectionné, filtre…) et se
 * réabonne au magasin pour se redessiner ; la coquille se contente de
 * démonter proprement la vue précédente à chaque changement d'onglet.
 */

import {regrouperParJour} from './logic/derive';
import type {Magasin} from './store';
import {cleJourFestival} from './temps';
import {construireBandeauJours} from './ui/bandeauJours';
import {h, ICONES, icone, vider} from './ui/dom';
import {montrerAffectation} from './views/affectation';
import {montrerAgenda} from './views/agenda';
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
  | 'agenda' | 'grille' | 'affectation' | 'anomalies' | 'indicatifs'
  | 'disponibilites' | 'terrain' | 'jourj'
  | 'benevole' | 'equipe' | 'artistes';

interface DefinitionOnglet {
  id: IdOnglet;
  libelle: string;
  icone: string;
  titre: string;
  sousTitre: string;
  montrer: (container: HTMLElement, m: Magasin) => () => void;
  /** Cette vue s'accroche au filtre global par jour de festival
   *  (`Magasin.macroCreneauSelectionne`), monté par `demarrerApp` juste
   *  au-dessus d'elle — Missions et Artistes pour l'instant, les autres
   *  vues s'y accrocheront une par une (demande d'Antoine du 2026-09-23). */
  filtreJour?: boolean;
  /** Rang dans le parcours utilisateur de référence (§1.1 du cahier des
   *  charges, cf. Antoine, 2026-09-21) : 1 créneaux, 2 sous-créneaux/
   *  missions, 3 indicatifs, 4 disponibilités, 5 lancer l'algorithme et
   *  corriger (onglet Affectation — lancement et correction manuelle sur le
   *  même écran, décision du fil Interface d'affectation). Les vues de
   *  consultation qui n'en font pas partie (Anomalies, Terrain, Jour J,
   *  Bénévole, Équipe, Artistes) restent groupées à part, sans numéro. */
  etape?: number;
}

const ONGLETS: DefinitionOnglet[] = [
  {
    id: 'agenda', libelle: 'Agenda', icone: ICONES.agenda,
    titre: 'Agenda du festival',
    sousTitre: 'Macro-créneaux et sous-créneaux. Glissez pour déplacer, redimensionnez par les bords, ou ajoutez un macro-créneau.',
    montrer: montrerAgenda,
    etape: 1,
  },
  {
    id: 'grille', libelle: 'Missions', icone: ICONES.grille,
    titre: 'Missions × sous-créneaux',
    sousTitre: 'Qui est où. Cliquez une case pour voir la couverture et affecter un candidat classé.',
    montrer: montrerGrille,
    filtreJour: true,
    etape: 2,
  },
  {
    id: 'indicatifs', libelle: 'Indicatifs', icone: ICONES.equipes,
    titre: 'Indicatifs et équipes',
    sousTitre: 'Un indicatif est positionné à l’avance sur plusieurs missions : c’est la mission qui tourne, pas le binôme (§6.3).',
    montrer: montrerIndicatifs,
    etape: 3,
  },
  {
    id: 'disponibilites', libelle: 'Disponibilités', icone: ICONES.disponibilites,
    titre: 'Disponibilités des bénévoles',
    sousTitre: 'Qui est disponible, indisponible ou veut voir un artiste, au quart d’heure, un jour de festival à la fois.',
    montrer: montrerDisponibilites,
    filtreJour: true,
    etape: 4,
  },
  {
    id: 'affectation', libelle: 'Affectation', icone: ICONES.affectation,
    titre: 'Lancer l’algorithme et affecter',
    sousTitre: 'Lancez l’algorithme sur tout ce qui n’est pas verrouillé, puis corrigez à la main juste en dessous : glissez un bénévole vers une place, ou une place vers une autre pour l’échanger (§7.5).',
    montrer: montrerAffectation,
    etape: 5,
  },
  {
    id: 'anomalies', libelle: 'Anomalies', icone: ICONES.anomalies,
    titre: 'Anomalies',
    sousTitre: 'Places vides, souhaits contrariés, quotas dépassés — rien de tout ça n’est masqué (objectif O3).',
    montrer: montrerAnomalies,
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
    filtreJour: true,
  },
];

export function demarrerApp(racine: HTMLElement, magasin: Magasin, sourceLibelle: string): void {
  let ongletActif: IdOnglet | null = null;
  let detruireVue: () => void = () => {};

  const boutons = new Map<IdOnglet, HTMLButtonElement>();
  const rail = h('nav', {class: 'rail', 'aria-label': 'Vues du planning'},
    h('div', {class: 'rail__brand'}, 'Planning+'),
  );

  function creerBouton(def: DefinitionOnglet): HTMLButtonElement {
    const bouton = h('button', {
      class: 'rail__item', type: 'button',
      onclick: () => activer(def.id),
    },
      h('span', {class: 'rail__icone'},
        icone(def.icone),
        def.etape != null ? h('span', {class: 'rail__etape'}, String(def.etape)) : null,
      ),
      def.libelle,
    ) as HTMLButtonElement;
    boutons.set(def.id, bouton);
    return bouton;
  }

  // Le parcours de référence (§1.1) d'abord, dans son ordre, numéroté ; puis
  // les vues de consultation et de correction qui n'en font pas partie,
  // séparées par un intitulé — pas un onglet de plus parmi d'autres, un
  // chemin à suivre.
  const etapes = ONGLETS.filter((o) => o.etape != null).sort((a, b) => a.etape! - b.etape!);
  const autres = ONGLETS.filter((o) => o.etape == null);
  rail.append(
    h('div', {class: 'rail__section'}, 'Parcours'),
    ...etapes.map(creerBouton),
    h('div', {class: 'rail__section'}, 'Autres vues'),
    ...autres.map(creerBouton),
  );

  const topbar = h('header', {class: 'topbar'});
  const bandeauJours = h('div', {class: 'app-bandeau-jours'});
  const vue = h('div', {class: 'view'});
  const main = h('div', {class: 'main'}, topbar, bandeauJours, vue);
  const shell = h('div', {class: 'app-shell'}, rail, main);

  /** Redessine le filtre global par jour de festival, pour l'onglet actif
   *  seulement s'il s'y accroche (`filtreJour`) — voir `DefinitionOnglet`.
   *  Rappelée à chaque changement d'onglet et à chaque notification du
   *  magasin (un macro-créneau ajouté ou supprimé pendant que l'onglet est
   *  déjà ouvert doit mettre le bandeau à jour sans y toucher soi-même). */
  function redessinerBandeauJours(): void {
    const def = ONGLETS.find((o) => o.id === ongletActif);
    vider(bandeauJours);
    if (!def?.filtreJour) { return; }
    const jours = regrouperParJour(magasin.macroCreneaux);
    const selectionValide = jours.some((j) => j.macros.some((ma) => ma.id === magasin.macroCreneauSelectionne));
    if (jours.length > 0 && !selectionValide) {
      // Sélection absente ou devenue invalide (aucun macro-créneau encore
      // choisi, ou celui choisi a disparu) : retombe sur le jour courant
      // s'il existe, sinon le premier jour disponible. `selectionnerMacroCreneau`
      // notifie, ce qui rappelle cette même fonction — elle s'arrête alors
      // ici, la sélection étant désormais valide.
      const cleAujourdhui = cleJourFestival(Math.floor(Date.now() / 1000));
      const jourParDefaut = jours.find((j) => j.cle === cleAujourdhui) ?? jours[0]!;
      magasin.selectionnerMacroCreneau(jourParDefaut.macros[0]!.id);
      return;
    }
    if (jours.length === 0 && magasin.macroCreneauSelectionne !== null) {
      // Plus aucun macro-créneau (dernier supprimé) : ne pas laisser un id
      // fantôme en mémoire, même si son absence de conséquence visible
      // (le cas `jour` indéfini est déjà géré par la vue) le rendait inoffensif.
      magasin.selectionnerMacroCreneau(null);
      return;
    }
    bandeauJours.append(
      construireBandeauJours(jours, magasin.macroCreneauSelectionne, (id) => magasin.selectionnerMacroCreneau(id)),
    );
  }

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
    redessinerBandeauJours();
    vider(vue);
    detruireVue = def.montrer(vue, magasin);
  }

  racine.replaceChildren(shell);
  activer('agenda');
  magasin.subscribe(redessinerBandeauJours);

  // Zone d'impression : un enfant direct de <body>, pas de #app, pour que
  // masquer « tout sauf elle » (`.impression-active` dans style.css) au
  // moment d'imprimer masque bien tout le reste (rail, topbar) d'un coup,
  // #app compris. Vidée et remplie ponctuellement par la vue Bénévole.
  if (!document.getElementById('zone-impression')) {
    document.body.append(h('div', {id: 'zone-impression'}));
  }
}
