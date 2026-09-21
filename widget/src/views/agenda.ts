/**
 * Vue agenda : création et édition des macro-créneaux et sous-créneaux, par
 * jours ajoutés librement (§8, vue 1). Un macro-créneau se déplace en le
 * glissant par son en-tête, et se redimensionne en tirant son bord haut ou
 * bas (comme un agenda classique) ; son nom se corrige par le formulaire.
 */

import type {MacroCreneau, SousCreneau} from '../domain/types';
import {regrouperParJour} from '../logic/derive';
import type {Magasin} from '../store';
import {epochMinuitLocal} from '../temps';
import {h, vider} from '../ui/dom';
import {ouvrirModalCreationCreneau, ouvrirModalEditionCreneau} from '../ui/modalCreneau';

const PX_PAR_MINUTE = 52 / 60;

export function montrerAgenda(container: HTMLElement, m: Magasin): () => void {
  function rafraichir(): void {
    vider(container);
    const jours = regrouperParJour(m.macroCreneaux);

    let minMinute = 9 * 60;
    let maxMinute = 18 * 60;
    for (const jour of jours) {
      for (const macro of jour.macros) {
        const debutMin = minutesDepuisMinuit(macro.Debut, jour.macros[0]!.Debut);
        const finMin = minutesDepuisMinuit(macro.Fin, jour.macros[0]!.Debut);
        minMinute = Math.min(minMinute, debutMin);
        maxMinute = Math.max(maxMinute, finMin);
      }
    }
    minMinute = Math.floor(minMinute / 60) * 60;
    maxMinute = Math.ceil(maxMinute / 60) * 60;
    const hauteurTotale = (maxMinute - minMinute) * PX_PAR_MINUTE;

    const grille = h('div', {
      class: 'agenda__grid',
      style: {gridTemplateColumns: `56px repeat(${jours.length}, minmax(148px, 1fr))`},
    });

    const axe = h('div', {class: 'agenda__axis'}, h('div', {style: {height: '38px'}}));
    for (let t = minMinute; t < maxMinute; t += 60) {
      axe.append(h('div', {class: 'agenda__axis-cell'}, `${String(Math.floor(t / 60) % 24).padStart(2, '0')}h`));
    }
    grille.append(axe);

    for (const jour of jours) {
      const track = h('div', {class: 'agenda__track', style: {height: `${hauteurTotale}px`}});
      const jourDebut = epochMinuitLocal(jour.macros[0]!.Debut);
      for (const macro of jour.macros) {
        track.append(construireBlocMacro(macro, jourDebut, minMinute));
      }
      const colonne = h('div', {class: 'agenda__day'},
        h('div', {class: 'agenda__day-head'},
          h('span', {class: 'jour'}, jour.libelle.split(' ')[0]),
          h('span', {class: 'date'}, jour.libelle),
          h('button', {
            class: 'btn btn--ghost btn--sm', type: 'button', style: {alignSelf: 'flex-start', padding: '0'},
            onclick: () => ouvrirModalCreationCreneau(m, jour.cle),
          }, '+ créneau'),
        ),
        track,
      );
      grille.append(colonne);
    }

    container.append(
      h('div', {class: 'agenda'},
        h('div', {class: 'agenda__toolbar'},
          h('button', {class: 'btn btn--primary btn--sm', type: 'button', onclick: () => ouvrirModalCreationCreneau(m, null)}, '+ Nouveau jour'),
          h('span', {class: 'view__intro', style: {margin: '0'}}, "Glissez l'en-tête d'un macro-créneau pour le déplacer, ses bords haut/bas pour le redimensionner ; l'icône ✎ ouvre le détail."),
        ),
        grille,
      ),
    );
  }

  function minutesDepuisMinuit(epoch: number, referenceJour: number): number {
    const minuit = epochMinuitLocal(referenceJour);
    return (epoch - minuit) / 60;
  }

  function construireBlocMacro(macro: MacroCreneau, jourDebutEpoch: number, minMinute: number): HTMLElement {
    const debutMin = (macro.Debut - jourDebutEpoch) / 60;
    const finMin = (macro.Fin - jourDebutEpoch) / 60;
    const top = (debutMin - minMinute) * PX_PAR_MINUTE;
    const hauteur = Math.max(28, (finMin - debutMin) * PX_PAR_MINUTE);

    const sousCreneaux = m.sousCreneaux.filter((s) => s.Macro_creneau === macro.id).sort((a, b) => a.Debut - b.Debut);

    const entete = h('div', {class: 'macro-bloc__head'},
      h('span', null, macro.Nom),
      h('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', style: {padding: '0 2px'}, title: 'Modifier',
        onclick: (e: Event) => { e.stopPropagation(); ouvrirModalEditionCreneau(m, macro); },
      }, '✎'),
    );
    const poigneeHaut = h('div', {class: 'macro-bloc__resize macro-bloc__resize--haut', title: 'Glisser pour changer le début'});
    const poigneeBas = h('div', {class: 'macro-bloc__resize macro-bloc__resize--bas', title: 'Glisser pour changer la fin'});

    const bloc = h('div', {
      class: 'macro-bloc', style: {top: `${top}px`, height: `${hauteur}px`},
    },
      poigneeHaut,
      entete,
      h('div', {class: 'macro-bloc__sous'}, ...sousCreneaux.map((sc) => construireChipSousCreneau(sc))),
      poigneeBas,
    );

    rendreDeplacable(bloc, entete, macro, jourDebutEpoch, minMinute);
    rendreRedimensionnable(bloc, poigneeHaut, poigneeBas, macro, jourDebutEpoch, minMinute);
    return bloc;
  }

  function construireChipSousCreneau(sc: SousCreneau): HTMLElement {
    return h('div', {class: 'sous-bloc', title: sc.Libelle}, h('span', {class: 'lib'}, sc.Libelle));
  }

  function rendreDeplacable(
    bloc: HTMLElement, poignee: HTMLElement, macro: MacroCreneau, jourDebutEpoch: number, minMinute: number,
  ): void {
    let enCours = false;
    let yDepart = 0;
    let topDepart = 0;

    const onMouseMove = (e: MouseEvent) => {
      if (!enCours) { return; }
      const delta = e.clientY - yDepart;
      bloc.style.top = `${Math.max(0, topDepart + delta)}px`;
    };
    const onMouseUp = () => {
      if (!enCours) { return; }
      enCours = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const topFinal = parseFloat(bloc.style.top || '0');
      const minutesBrutes = topFinal / PX_PAR_MINUTE + minMinute;
      const minutesAjustees = Math.round(minutesBrutes / 15) * 15;
      const nouveauDebut = jourDebutEpoch + minutesAjustees * 60;
      const duree = macro.Fin - macro.Debut;
      m.enregistrerMacroCreneau({...macro, id: macro.id, Debut: nouveauDebut, Fin: nouveauDebut + duree});
    };
    poignee.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') { return; }
      enCours = true;
      yDepart = e.clientY;
      topDepart = parseFloat(bloc.style.top || '0');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });
  }

  const DUREE_MIN_MINUTES = 15;

  function rendreRedimensionnable(
    bloc: HTMLElement, poigneeHaut: HTMLElement, poigneeBas: HTMLElement,
    macro: MacroCreneau, jourDebutEpoch: number, minMinute: number,
  ): void {
    const hauteurMin = Math.max(28, DUREE_MIN_MINUTES * PX_PAR_MINUTE);

    function demarrer(depuisHaut: boolean): (e: MouseEvent) => void {
      return (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const yDepart = e.clientY;
        const topDepart = parseFloat(bloc.style.top || '0');
        const hauteurDepart = parseFloat(bloc.style.height || '0');

        const onMouseMove = (ev: MouseEvent) => {
          const delta = ev.clientY - yDepart;
          if (depuisHaut) {
            const nouvelleHauteur = Math.max(hauteurMin, hauteurDepart - delta);
            bloc.style.top = `${topDepart + (hauteurDepart - nouvelleHauteur)}px`;
            bloc.style.height = `${nouvelleHauteur}px`;
          } else {
            bloc.style.height = `${Math.max(hauteurMin, hauteurDepart + delta)}px`;
          }
        };
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          const topFinal = parseFloat(bloc.style.top || '0');
          const hauteurFinale = parseFloat(bloc.style.height || '0');
          if (depuisHaut) {
            const debutBrut = topFinal / PX_PAR_MINUTE + minMinute;
            const debutAjuste = Math.round(debutBrut / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
            const nouveauDebut = jourDebutEpoch + debutAjuste * 60;
            if (macro.Fin - nouveauDebut < DUREE_MIN_MINUTES * 60) { return; }
            m.enregistrerMacroCreneau({...macro, Debut: nouveauDebut});
          } else {
            const finBrute = (topFinal + hauteurFinale) / PX_PAR_MINUTE + minMinute;
            const finAjustee = Math.round(finBrute / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
            const nouveauFin = jourDebutEpoch + finAjustee * 60;
            if (nouveauFin - macro.Debut < DUREE_MIN_MINUTES * 60) { return; }
            m.enregistrerMacroCreneau({...macro, Fin: nouveauFin});
          }
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };
    }

    poigneeHaut.addEventListener('mousedown', demarrer(true));
    poigneeBas.addEventListener('mousedown', demarrer(false));
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
