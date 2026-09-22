/**
 * Vue agenda : création et édition des macro-créneaux et sous-créneaux, par
 * jours ajoutés librement (§8, vue 1) — le premier écran du parcours
 * qu'Antoine veut dérouler (macro-créneaux → sous-créneaux/missions →
 * indicatifs → disponibilités → algorithme).
 *
 * Disposition horizontale (jours en lignes, temps de gauche à droite),
 * choisie par Antoine après comparaison avec une disposition verticale
 * (fil dédié). Un macro-créneau se déplace en glissant son en-tête, se
 * redimensionne en tirant son bord gauche ou droit ; son nom et ses
 * horaires se corrigent par le formulaire (icône ✎). Un document sans
 * aucun macro-créneau encore créé affiche un cadre 9h-18h vide plutôt
 * qu'une grille dégénérée (`construirePlageJournaliere`).
 */

import type {MacroCreneau, SousCreneau} from '../domain/types';
import {regrouperParJour} from '../logic/derive';
import type {Magasin} from '../store';
import {epochMinuitLocal} from '../temps';
import {h, vider} from '../ui/dom';
import {ouvrirModalCreationCreneau, ouvrirModalEditionCreneau} from '../ui/modalCreneau';
import type {PlageJournaliere} from './agenda-disposition';
import {
  construirePlageJournaliere, graduationsHoraires, graduationsMinuit, longueurAxePx, positionCreneau,
} from './agenda-disposition';

const PX_PAR_MINUTE = 52 / 60;
const LARGEUR_ENTETE_JOUR_PX = 120;
const HAUTEUR_LIGNE_PX = 96;
const DUREE_MIN_MINUTES = 15;

export function montrerAgenda(container: HTMLElement, m: Magasin): () => void {
  let dernierMessage: {texte: string; ton: 'ok' | 'danger'} | null = null;

  /** Écrit vers le magasin (mode connecté : vers Grist, voir `EcritureGrist`)
   *  sans jamais laisser un échec silencieux — même contrat que la vue
   *  Indicatifs : sur un échec, le bloc glissé/redimensionné reprend sa
   *  position réelle au rafraîchissement plutôt que de rester affiché à
   *  l'endroit où la souris l'a laissé sans que rien n'ait été écrit. */
  async function ecrire(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
      dernierMessage = null;
    } catch {
      dernierMessage = {texte: "Échec de l'écriture dans le document Grist connecté. Réessayez.", ton: 'danger'};
    }
    rafraichir();
  }

  /** Confirmation puis suppression d'un macro-créneau (§8, retour Antoine
   *  2026-09-22 : rien ne permettait de le faire depuis l'agenda). Même
   *  garde-fou côté Magasin que `redecouperSousCreneaux` : un refus porte sa
   *  raison plutôt que d'orpheliner silencieusement un besoin déjà posé. */
  async function demanderSuppressionMacro(macro: MacroCreneau): Promise<void> {
    const nSous = m.sousCreneaux.filter((s) => s.Macro_creneau === macro.id).length;
    const message = nSous === 0
      ? `Supprimer « ${macro.Nom} » ?`
      : `Supprimer « ${macro.Nom} » et ${nSous === 1 ? 'son sous-créneau' : `ses ${nSous} sous-créneaux`} ?`;
    if (!window.confirm(message)) { return; }
    const resultat = await m.supprimerMacroCreneau(macro.id);
    if (!resultat.ok) {
      dernierMessage = {texte: resultat.raison, ton: 'danger'};
      rafraichir();
      return;
    }
    rafraichir();
  }

  function rafraichir(): void {
    vider(container);
    const jours = regrouperParJour(m.macroCreneaux);
    const plage = construirePlageJournaliere(jours.map((jour) => jour.macros));
    const largeurTotale = longueurAxePx(plage, PX_PAR_MINUTE);

    const grille = h('div', {class: 'agenda__grid'},
      h('div', {class: 'agenda__row agenda__row--axe'},
        h('div', {class: 'agenda__corner', style: {width: `${LARGEUR_ENTETE_JOUR_PX}px`}}),
        h('div', {class: 'agenda__axis', style: {width: `${largeurTotale}px`}},
          ...graduationsHoraires(plage, PX_PAR_MINUTE).map((g) => (
            h('span', {class: 'agenda__axis-tick', style: {left: `${g.decalagePx}px`}}, g.libelle)
          )),
        ),
      ),
    );

    for (const jour of jours) {
      const jourDebut = epochMinuitLocal(jour.macros[0]!.Debut);
      const track = h('div', {
        class: 'agenda__track',
        style: {width: `${largeurTotale}px`, height: `${HAUTEUR_LIGNE_PX}px`},
      });
      for (const macro of jour.macros) {
        track.append(construireBlocMacro(macro, jourDebut, plage));
      }
      for (const decalagePx of graduationsMinuit(plage, PX_PAR_MINUTE)) {
        track.append(h('div', {class: 'agenda__minuit', style: {left: `${decalagePx}px`}}, h('span', null, 'minuit')));
      }

      grille.append(
        h('div', {class: 'agenda__row'},
          h('div', {class: 'agenda__day-head', style: {width: `${LARGEUR_ENTETE_JOUR_PX}px`}},
            h('span', {class: 'jour'}, jour.libelle.split(' ')[0]),
            h('span', {class: 'date'}, jour.libelle),
            h('button', {
              class: 'btn btn--ghost btn--sm', type: 'button', style: {alignSelf: 'flex-start', padding: '0'},
              onclick: () => ouvrirModalCreationCreneau(m, jour.cle),
            }, '+ créneau'),
          ),
          track,
        ),
      );
    }

    container.append(
      h('div', {class: 'agenda'},
        h('div', {class: 'agenda__toolbar'},
          h('button', {class: 'btn btn--primary btn--sm', type: 'button', onclick: () => ouvrirModalCreationCreneau(m, null)}, '+ Nouveau jour'),
          h('span', {class: 'view__intro', style: {margin: '0'}},
            "Glissez l'en-tête d'un macro-créneau pour le déplacer, ses bords gauche/droit pour le redimensionner ; l'icône ✎ ouvre le détail."),
        ),
        dernierMessage ? h('span', {class: `pill pill--${dernierMessage.ton}`}, dernierMessage.texte) : null,
        grille,
      ),
    );
  }

  function construireBlocMacro(macro: MacroCreneau, jourDebutEpoch: number, plage: PlageJournaliere): HTMLElement {
    const position = positionCreneau(macro, jourDebutEpoch, plage, PX_PAR_MINUTE);
    const largeur = Math.max(28, position.longueurPx);

    const sousCreneaux = m.sousCreneaux
      .filter((s) => s.Macro_creneau === macro.id)
      .sort((a, b) => a.Debut - b.Debut);

    const entete = h('div', {class: 'macro-bloc__head'},
      h('span', null, macro.Nom),
      h('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', style: {padding: '0 2px'}, title: 'Modifier',
        onclick: (e: Event) => { e.stopPropagation(); ouvrirModalEditionCreneau(m, macro); },
      }, '✎'),
      h('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', style: {padding: '0 2px'}, title: 'Supprimer',
        onclick: (e: Event) => { e.stopPropagation(); void demanderSuppressionMacro(macro); },
      }, '🗑'),
    );
    const poigneeGauche = h('div', {class: 'macro-bloc__resize macro-bloc__resize--gauche', title: 'Glisser pour changer le début'});
    const poigneeDroite = h('div', {class: 'macro-bloc__resize macro-bloc__resize--droite', title: 'Glisser pour changer la fin'});

    const bloc = h('div', {
      class: 'macro-bloc', style: {left: `${position.decalagePx}px`, width: `${largeur}px`},
    },
      poigneeGauche,
      entete,
      h('div', {class: 'macro-bloc__sous'}, ...sousCreneaux.map((sc) => construireChipSousCreneau(sc))),
      poigneeDroite,
    );

    rendreDeplacable(bloc, entete, macro, jourDebutEpoch, plage);
    rendreRedimensionnable(bloc, poigneeGauche, poigneeDroite, macro, jourDebutEpoch, plage);
    return bloc;
  }

  function construireChipSousCreneau(sc: SousCreneau): HTMLElement {
    return h('div', {class: 'sous-bloc', title: sc.Libelle}, h('span', {class: 'lib'}, sc.Libelle));
  }

  function rendreDeplacable(
    bloc: HTMLElement, poignee: HTMLElement, macro: MacroCreneau, jourDebutEpoch: number, plage: PlageJournaliere,
  ): void {
    let enCours = false;
    let xDepart = 0;
    let leftDepart = 0;

    const onMouseMove = (e: MouseEvent) => {
      if (!enCours) { return; }
      const delta = e.clientX - xDepart;
      bloc.style.left = `${Math.max(0, leftDepart + delta)}px`;
    };
    const onMouseUp = () => {
      if (!enCours) { return; }
      enCours = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const leftFinal = parseFloat(bloc.style.left || '0');
      const minutesBrutes = leftFinal / PX_PAR_MINUTE + plage.minMinute;
      const minutesAjustees = Math.round(minutesBrutes / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
      const nouveauDebut = jourDebutEpoch + minutesAjustees * 60;
      const duree = macro.Fin - macro.Debut;
      void ecrire(() => m.enregistrerMacroCreneau({...macro, id: macro.id, Debut: nouveauDebut, Fin: nouveauDebut + duree}));
    };
    poignee.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') { return; }
      enCours = true;
      xDepart = e.clientX;
      leftDepart = parseFloat(bloc.style.left || '0');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });
  }

  function rendreRedimensionnable(
    bloc: HTMLElement, poigneeGauche: HTMLElement, poigneeDroite: HTMLElement,
    macro: MacroCreneau, jourDebutEpoch: number, plage: PlageJournaliere,
  ): void {
    const largeurMin = Math.max(28, DUREE_MIN_MINUTES * PX_PAR_MINUTE);

    function demarrer(depuisGauche: boolean): (e: MouseEvent) => void {
      return (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const xDepart = e.clientX;
        const leftDepart = parseFloat(bloc.style.left || '0');
        const largeurDepart = parseFloat(bloc.style.width || '0');

        const onMouseMove = (ev: MouseEvent) => {
          const delta = ev.clientX - xDepart;
          if (depuisGauche) {
            const nouvelleLargeur = Math.max(largeurMin, largeurDepart - delta);
            bloc.style.left = `${leftDepart + (largeurDepart - nouvelleLargeur)}px`;
            bloc.style.width = `${nouvelleLargeur}px`;
          } else {
            bloc.style.width = `${Math.max(largeurMin, largeurDepart + delta)}px`;
          }
        };
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          const leftFinal = parseFloat(bloc.style.left || '0');
          const largeurFinale = parseFloat(bloc.style.width || '0');
          if (depuisGauche) {
            const debutBrut = leftFinal / PX_PAR_MINUTE + plage.minMinute;
            const debutAjuste = Math.round(debutBrut / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
            const nouveauDebut = jourDebutEpoch + debutAjuste * 60;
            if (macro.Fin - nouveauDebut < DUREE_MIN_MINUTES * 60) { return; }
            void ecrire(() => m.enregistrerMacroCreneau({...macro, Debut: nouveauDebut}));
          } else {
            const finBrute = (leftFinal + largeurFinale) / PX_PAR_MINUTE + plage.minMinute;
            const finAjustee = Math.round(finBrute / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
            const nouveauFin = jourDebutEpoch + finAjustee * 60;
            if (nouveauFin - macro.Debut < DUREE_MIN_MINUTES * 60) { return; }
            void ecrire(() => m.enregistrerMacroCreneau({...macro, Fin: nouveauFin}));
          }
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };
    }

    poigneeGauche.addEventListener('mousedown', demarrer(true));
    poigneeDroite.addEventListener('mousedown', demarrer(false));
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
