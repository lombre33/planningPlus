/**
 * Coquille de l'application : menu (§9.2, un widget unique avec navigation
 * interne) et montage de la vue active.
 *
 * Menu de sept entrées (« B + ménage », choisi par Antoine le 2026-09-29),
 * rangées en trois temps : le parcours de construction, numéroté ; le jour
 * J ; la diffusion. Deux entrées regroupent plusieurs vues, choisies sous la
 * barre de titre : Bénévoles (disponibilités, artistes, désistements) et
 * Impressions (par bénévole ou par équipe, un jour ou tout le festival).
 * Jour J et Anomalies ne sont plus des entrées : l'appel, les remplacements
 * et les signalements vivent dans la table du jour (étape 5), le
 * désistement pour tout le festival dans Bénévoles.
 *
 * Un seul jour pour toutes les vues : le bandeau commun, affiché pour
 * chaque vue qui porte sur un jour (`filtreJour`). Aucune vue n'a plus son
 * propre sélecteur de jour.
 *
 * Chaque vue gère elle-même son état local (filtre, sélection…) et se
 * réabonne au magasin pour se redessiner ; la coquille se contente de
 * démonter proprement la vue précédente à chaque changement.
 */

import {regrouperParJour} from './logic/derive.js';
import {cleJourFestival} from './temps.js';
import {construireBandeauJours} from './ui/bandeauJours.js';
import {h, ICONES, icone, vider} from './ui/dom.js';
import {marqueEtReglages} from './ui/reglages.js';
import {montrerAffectation} from './views/affectation.js';
import {montrerAgenda} from './views/agenda.js';
import {montrerArtistes} from './views/artistes.js';
import {montrerBenevole} from './views/benevole.js';
import {montrerDesistements} from './views/desistements.js';
import {montrerDisponibilites} from './views/disponibilites.js';
import {montrerEquipe} from './views/equipe.js';
import {montrerEquipesImprimables} from './views/equipes-imprimables.js';
import {montrerGrille} from './views/grille.js';
import {montrerIndicatifs} from './views/indicatifs.js';
import {montrerRosterImprimable} from './views/roster-imprimable.js';
import {montrerTerrain} from './views/terrain.js';

const SECTIONS = [
  {id: 'parcours', libelle: 'Parcours'},
  {id: 'jour-j', libelle: 'Le jour J'},
  {id: 'diffuser', libelle: 'Diffuser'},
];

/**
 * Une entrée du menu montre une vue, ou plusieurs quand elle porte des
 * `choix` : chaque choix est un groupe de boutons sous la barre de titre,
 * et la vue montrée est celle dont `quand` correspond aux options retenues.
 */
const ENTREES = [
  {
    id: 'agenda', libelle: 'Agenda', icone: ICONES.agenda, section: 'parcours', etape: 1,
    vues: [{
      titre: 'Agenda du festival',
      sousTitre: 'Macro-créneaux et sous-créneaux. Glissez pour déplacer, redimensionnez par les bords, ou ajoutez un macro-créneau.',
      montrer: montrerAgenda,
    }],
  },
  {
    id: 'missions', libelle: 'Missions', icone: ICONES.grille, section: 'parcours', etape: 2,
    vues: [{
      titre: 'Missions × sous-créneaux',
      sousTitre: 'Les missions et leurs créneaux du jour. Cliquez une case pour voir sa couverture ; les places se pourvoient à l’étape 5.',
      montrer: montrerGrille,
      filtreJour: true,
    }],
  },
  {
    id: 'indicatifs', libelle: 'Indicatifs', icone: ICONES.equipes, section: 'parcours', etape: 3,
    vues: [{
      titre: 'Indicatifs et équipes',
      sousTitre: 'Un indicatif est positionné à l’avance sur plusieurs missions : c’est la mission qui tourne, pas le binôme (§6.3).',
      montrer: montrerIndicatifs,
      filtreJour: true,
    }],
  },
  {
    id: 'benevoles', libelle: 'Bénévoles', icone: ICONES.groupe, section: 'parcours', etape: 4,
    choix: [{
      cle: 'vue', libelle: 'Vue',
      options: [['disponibilites', 'Disponibilités'], ['artistes', 'Artistes'], ['desistements', 'Désistements']],
    }],
    vues: [
      {
        quand: {vue: 'disponibilites'},
        titre: 'Disponibilités des bénévoles',
        sousTitre: 'Qui est disponible, indisponible ou veut voir un artiste, au quart d’heure, un jour de festival à la fois.',
        montrer: montrerDisponibilites,
        filtreJour: true,
      },
      {
        quand: {vue: 'artistes'},
        titre: 'Artistes',
        sousTitre: 'Qui joue quand, et combien de bénévoles veulent le voir — et parmi eux, combien sont déjà en conflit.',
        montrer: montrerArtistes,
        filtreJour: true,
      },
      {
        quand: {vue: 'desistements'},
        titre: 'Désistements',
        sousTitre: 'Un bénévole qui ne viendra pas du tout : ses places se libèrent sur tout le festival, après confirmation. Une absence d’un jour se pointe à l’appel, à l’étape 5.',
        montrer: montrerDesistements,
      },
    ],
  },
  {
    id: 'affectation', libelle: 'Affectation', icone: ICONES.affectation, section: 'parcours', etape: 5,
    vues: [{
      titre: 'Affectation · table du jour',
      sousTitre: 'Une ligne par place, sur les heures du jour. Cliquez une ligne pour voir ses options ; tout passe par le brouillon avant d’être écrit.',
      montrer: montrerAffectation,
      filtreJour: true,
    }],
  },
  {
    id: 'terrain', libelle: 'Terrain', icone: ICONES.terrain, section: 'jour-j',
    vues: [{
      titre: 'Terrain',
      sousTitre: 'Qui doit être où à un instant du jour, et les effectifs attendus par mission face à leur minimum.',
      montrer: montrerTerrain,
      filtreJour: true,
    }],
  },
  {
    id: 'impressions', libelle: 'Impressions', icone: ICONES.imprimante, section: 'diffuser',
    choix: [
      {cle: 'qui', libelle: 'Pour qui', options: [['benevole', 'Par bénévole'], ['equipe', 'Par équipe']]},
      {cle: 'duree', libelle: 'Sur quelle durée', options: [['jour', 'Un jour'], ['festival', 'Tout le festival']]},
    ],
    vues: [
      {
        quand: {qui: 'benevole', duree: 'jour'},
        titre: 'Roster bénévoles imprimable',
        sousTitre: 'Une ligne par bénévole disponible ce jour, son indicatif et ses affectations au quart d’heure — lecture seule, pensé pour être imprimé et distribué.',
        montrer: montrerRosterImprimable,
        filtreJour: true,
      },
      {
        quand: {qui: 'benevole', duree: 'festival'},
        titre: 'Feuille de route bénévole',
        sousTitre: "La feuille individuelle d'un bénévole sur toute la durée, imprimable pour le jour J.",
        montrer: montrerBenevole,
      },
      {
        quand: {qui: 'equipe', duree: 'jour'},
        titre: 'Plannings équipes imprimables',
        sousTitre: 'Une table par équipe : ses missions du jour au quart d’heure, qui les tient et leur indicatif — lecture seule, une page par équipe à l’impression.',
        montrer: montrerEquipesImprimables,
        filtreJour: true,
      },
      {
        quand: {qui: 'equipe', duree: 'festival'},
        titre: 'Planning d’équipe sur tout le festival',
        sousTitre: 'Une équipe sur toute la durée, par indicatif : pour les cheffes d’équipe, qui repèrent sans modifier.',
        montrer: montrerEquipe,
      },
    ],
  },
];

/** La vue d'une entrée pour les options retenues (la première à défaut). */
function vueRetenue(entree, options) {
  return entree.vues.find((v) => Object.entries(v.quand ?? {}).every(([cle, valeur]) => options[cle] === valeur))
    ?? entree.vues[0];
}

export function demarrerApp(racine, magasin, sourceLibelle) {
  let entreeActive = null;
  let detruireVue = () => {};
  /** Options retenues par entrée, gardées d'un passage à l'autre. */
  const optionsParEntree = new Map(ENTREES.map((e) => [
    e.id, Object.fromEntries((e.choix ?? []).map((c) => [c.cle, c.options[0][0]])),
  ]));

  const boutons = new Map();
  const rail = h('nav', {class: 'rail', 'aria-label': 'Vues du planning'},
    h('div', {class: 'rail__brand'}, 'Planning+'),
  );

  function creerBouton(entree) {
    const bouton = h('button', {
      class: 'rail__item', type: 'button',
      onclick: () => activer(entree.id),
    },
      h('span', {class: 'rail__icone'},
        icone(entree.icone),
        entree.etape != null ? h('span', {class: 'rail__etape'}, String(entree.etape)) : null,
      ),
      entree.libelle,
    );
    boutons.set(entree.id, bouton);
    return bouton;
  }

  // Le parcours de référence (§1.1) d'abord, dans son ordre et numéroté :
  // un chemin à suivre, pas un onglet de plus parmi d'autres.
  for (const section of SECTIONS) {
    const entrees = ENTREES.filter((e) => e.section === section.id);
    rail.append(h('div', {class: 'rail__section'}, section.libelle), ...entrees.map(creerBouton));
  }

  const topbar = h('header', {class: 'topbar'});
  const sousVues = h('div', {class: 'app-sous-vues'});
  const bandeauJours = h('div', {class: 'app-bandeau-jours'});
  const vue = h('div', {class: 'view'});
  const main = h('div', {class: 'main'}, topbar, sousVues, bandeauJours, vue);
  const shell = h('div', {class: 'app-shell'}, rail, main);

  const vueActive = () => {
    const entree = ENTREES.find((e) => e.id === entreeActive);
    return entree ? vueRetenue(entree, optionsParEntree.get(entree.id)) : null;
  };

  /** Redessine le filtre global par jour de festival, pour la vue active
   *  seulement si elle porte sur un jour (`filtreJour`). Rappelée à chaque
   *  changement de vue et à chaque notification du magasin (un
   *  macro-créneau ajouté ou supprimé pendant que la vue est déjà ouverte
   *  doit mettre le bandeau à jour sans y toucher soi-même). */
  function redessinerBandeauJours() {
    vider(bandeauJours);
    if (!vueActive()?.filtreJour) { return; }
    const jours = regrouperParJour(magasin.macroCreneaux);
    const selectionValide = jours.some((j) => j.macros.some((ma) => ma.id === magasin.macroCreneauSelectionne));
    if (jours.length > 0 && !selectionValide) {
      // Sélection absente ou devenue invalide (aucun macro-créneau encore
      // choisi, ou celui choisi a disparu) : retombe sur le jour courant
      // s'il existe, sinon le premier jour disponible. `selectionnerMacroCreneau`
      // notifie, ce qui rappelle cette même fonction — elle s'arrête alors
      // ici, la sélection étant désormais valide.
      const cleAujourdhui = cleJourFestival(Math.floor(Date.now() / 1000));
      const jourParDefaut = jours.find((j) => j.cle === cleAujourdhui) ?? jours[0];
      magasin.selectionnerMacroCreneau(jourParDefaut.macros[0].id);
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

  /** Les groupes de boutons d'une entrée à plusieurs vues. */
  function dessinerChoix(entree) {
    vider(sousVues);
    if (!entree.choix) { return; }
    const options = optionsParEntree.get(entree.id);
    sousVues.append(...entree.choix.map((choix) => h('div', {class: 'segmente', role: 'group', 'aria-label': choix.libelle},
      ...choix.options.map(([valeur, libelle]) => h('button', {
        class: 'segmente__option', type: 'button', 'aria-pressed': String(options[choix.cle] === valeur),
        onclick: () => {
          if (options[choix.cle] === valeur) { return; }
          options[choix.cle] = valeur;
          monter();
        },
      }, libelle)),
    )));
  }

  function monter() {
    detruireVue();
    const entree = ENTREES.find((e) => e.id === entreeActive);
    const def = vueRetenue(entree, optionsParEntree.get(entree.id));
    for (const [id, bouton] of boutons) {
      bouton.setAttribute('aria-current', String(id === entree.id));
    }
    vider(topbar);
    topbar.append(
      h('div', {class: 'topbar__title'},
        h('h1', null, def.titre),
        h('p', {class: 'topbar__subtitle'}, def.sousTitre),
      ),
      h('div', {class: 'topbar__actions'},
        h('span', {class: 'pill pill--neutral'}, sourceLibelle),
        ...marqueEtReglages(),
      ),
    );
    dessinerChoix(entree);
    redessinerBandeauJours();
    vider(vue);
    detruireVue = def.montrer(vue, magasin) ?? (() => {});
  }

  function activer(id) {
    if (id === entreeActive) {
      // La vue reste déjà montée et abonnée au magasin : rien à refaire.
      return;
    }
    entreeActive = id;
    monter();
  }

  racine.replaceChildren(shell);
  activer('agenda');
  magasin.subscribe(redessinerBandeauJours);

  // Zone d'impression : un enfant direct de <body>, pas de #app, pour que
  // masquer « tout sauf elle » (`.impression-active` dans style.css) au
  // moment d'imprimer masque bien tout le reste (rail, topbar) d'un coup,
  // #app compris. Vidée et remplie ponctuellement par les vues imprimables.
  if (!document.getElementById('zone-impression')) {
    document.body.append(h('div', {id: 'zone-impression'}));
  }
}
