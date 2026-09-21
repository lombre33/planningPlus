/**
 * Comparatif de dispositions de l'agenda : la même journée en vertical (axe
 * du temps de haut en bas, un jour par colonne — la disposition de la vue
 * Agenda existante, `views/agenda.ts`) et en horizontal (axe du temps de
 * gauche à droite, un jour par ligne), avec un simple bouton pour basculer
 * de l'une à l'autre.
 *
 * Demandé par Antoine pour trancher entre les deux avant que la vraie vue
 * Agenda ne soit reprise dans le langage visuel définitif (§8, vue 1) :
 * volontairement sans édition ni glisser-déposer, comme convenu — seule la
 * disposition est en jeu ici.
 *
 * Les deux dispositions partagent le même calcul de position
 * (`agenda-comparatif-disposition.ts`) : c'est ce qui garantit qu'elles
 * montrent exactement la même donnée, juste projetée différemment.
 */

import type {MacroCreneau, SousCreneau} from '../domain/types';
import type {Jour} from '../logic/derive';
import {regrouperParJour} from '../logic/derive';
import type {Magasin} from '../store';
import {epochMinuitLocal} from '../temps';
import {h, vider} from '../ui/dom';
import type {PlageJournaliere, PositionSurAxe} from './agenda-comparatif-disposition';
import {
  construirePlageJournaliere, graduationsHoraires, graduationsMinuit, longueurAxePx, positionCreneau,
} from './agenda-comparatif-disposition';

/** Même densité que la vue Agenda existante (`views/agenda.ts`), pour que le comparatif se lise à la même échelle. */
const PX_PAR_MINUTE = 52 / 60;
const LARGEUR_ENTETE_JOUR_PX = 120;
const HAUTEUR_LIGNE_HORIZONTALE_PX = 96;

type Disposition = 'vertical' | 'horizontal';

export function montrerComparatifAgenda(container: HTMLElement, m: Magasin): () => void {
  let disposition: Disposition = 'vertical';

  function rafraichir(): void {
    vider(container);

    const jours = regrouperParJour(m.macroCreneaux);
    const plage = construirePlageJournaliere(jours.map((jour) => jour.macros));

    container.append(
      h('div', {class: 'agenda'},
        h('div', {class: 'agenda__toolbar'},
          boutonDisposition('vertical', 'Vertical'),
          boutonDisposition('horizontal', 'Horizontal'),
          h('span', {class: 'view__intro', style: {margin: '0'}},
            "Même journée, deux dispositions, pour trancher laquelle garder — pas d'édition ici, voir la vue Agenda."),
        ),
        disposition === 'vertical'
          ? construireDispositionVerticale(jours, m, plage)
          : construireDispositionHorizontale(jours, m, plage),
      ),
    );
  }

  function boutonDisposition(valeur: Disposition, libelle: string): HTMLElement {
    return h('button', {
      class: `btn btn--sm${disposition === valeur ? ' btn--primary' : ''}`,
      type: 'button',
      'aria-pressed': String(disposition === valeur),
      onclick: () => { disposition = valeur; rafraichir(); },
    }, libelle);
  }

  rafraichir();
  return m.subscribe(rafraichir);
}

function construireDispositionVerticale(jours: Jour[], m: Magasin, plage: PlageJournaliere): HTMLElement {
  const hauteurTotale = longueurAxePx(plage, PX_PAR_MINUTE);

  const axe = h('div', {class: 'agenda__axis'}, h('div', {style: {height: '38px'}}));
  for (const graduation of graduationsHoraires(plage, PX_PAR_MINUTE)) {
    axe.append(h('div', {class: 'agenda__axis-cell'}, graduation.libelle));
  }

  const grille = h('div', {
    class: 'agenda__grid',
    style: {gridTemplateColumns: `56px repeat(${jours.length}, minmax(148px, 1fr))`},
  }, axe);

  for (const jour of jours) {
    const minuit = epochMinuitLocal(jour.macros[0]!.Debut);
    const track = h('div', {class: 'agenda__track', style: {height: `${hauteurTotale}px`}});
    for (const macro of jour.macros) {
      track.append(construireBlocMacro(macro, m, positionCreneau(macro, minuit, plage, PX_PAR_MINUTE), 'vertical'));
    }
    for (const decalagePx of graduationsMinuit(plage, PX_PAR_MINUTE)) {
      track.append(construireMarqueurMinuit(decalagePx, 'vertical'));
    }
    grille.append(
      h('div', {class: 'agenda__day'},
        h('div', {class: 'agenda__day-head'},
          h('span', {class: 'jour'}, jour.libelle.split(' ')[0]),
          h('span', {class: 'date'}, jour.libelle),
        ),
        track,
      ),
    );
  }

  return grille;
}

function construireDispositionHorizontale(jours: Jour[], m: Magasin, plage: PlageJournaliere): HTMLElement {
  const largeurTotale = longueurAxePx(plage, PX_PAR_MINUTE);

  const ligneAxe = h('div', {class: 'agenda-cmp__h-row agenda-cmp__h-row--axe'},
    h('div', {class: 'agenda-cmp__h-corner', style: {width: `${LARGEUR_ENTETE_JOUR_PX}px`}}),
    h('div', {class: 'agenda-cmp__h-axis', style: {width: `${largeurTotale}px`}},
      ...graduationsHoraires(plage, PX_PAR_MINUTE).map((g) => (
        h('span', {class: 'agenda-cmp__h-axis-tick', style: {left: `${g.decalagePx}px`}}, g.libelle)
      )),
    ),
  );

  const lignesJours = jours.map((jour) => {
    const minuit = epochMinuitLocal(jour.macros[0]!.Debut);
    const track = h('div', {
      class: 'agenda-cmp__h-track',
      style: {width: `${largeurTotale}px`, height: `${HAUTEUR_LIGNE_HORIZONTALE_PX}px`},
    });
    for (const macro of jour.macros) {
      track.append(construireBlocMacro(macro, m, positionCreneau(macro, minuit, plage, PX_PAR_MINUTE), 'horizontal'));
    }
    for (const decalagePx of graduationsMinuit(plage, PX_PAR_MINUTE)) {
      track.append(construireMarqueurMinuit(decalagePx, 'horizontal'));
    }
    return h('div', {class: 'agenda-cmp__h-row'},
      h('div', {class: 'agenda-cmp__h-day-head', style: {width: `${LARGEUR_ENTETE_JOUR_PX}px`}},
        h('span', {class: 'jour'}, jour.libelle.split(' ')[0]),
        h('span', {class: 'date'}, jour.libelle),
      ),
      track,
    );
  });

  return h('div', {class: 'agenda-cmp__h'}, ligneAxe, ...lignesJours);
}

function construireBlocMacro(
  macro: MacroCreneau, m: Magasin, position: PositionSurAxe, axe: Disposition,
): HTMLElement {
  const sousCreneaux = m.sousCreneaux
    .filter((s) => s.Macro_creneau === macro.id)
    .sort((a, b) => a.Debut - b.Debut);
  const style = axe === 'vertical'
    ? {top: `${position.decalagePx}px`, height: `${position.longueurPx}px`}
    : {left: `${position.decalagePx}px`, width: `${position.longueurPx}px`};

  return h('div', {
    class: `macro-bloc${axe === 'horizontal' ? ' macro-bloc--horizontal' : ''}`,
    style,
  },
    h('div', {class: 'macro-bloc__head'}, h('span', null, macro.Nom)),
    h('div', {class: 'macro-bloc__sous'}, ...sousCreneaux.map((sc) => construireChipSousCreneau(sc))),
  );
}

function construireChipSousCreneau(sc: SousCreneau): HTMLElement {
  return h('div', {class: 'sous-bloc', title: sc.Libelle}, h('span', {class: 'lib'}, sc.Libelle));
}

function construireMarqueurMinuit(decalagePx: number, axe: Disposition): HTMLElement {
  const style = axe === 'vertical' ? {top: `${decalagePx}px`} : {left: `${decalagePx}px`};
  return h('div', {
    class: `agenda-cmp__minuit${axe === 'horizontal' ? ' agenda-cmp__minuit--horizontal' : ''}`,
    style,
  }, h('span', null, 'minuit'));
}
