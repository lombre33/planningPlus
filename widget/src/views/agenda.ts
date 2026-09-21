/**
 * Vue agenda : création et édition des macro-créneaux et sous-créneaux, par
 * jours ajoutés librement (§8, vue 1). Un macro-créneau se déplace en le
 * glissant ; son horaire et son nom se corrigent par un formulaire, comme
 * la création — le glisser-déposer pour redimensionner n'est pas encore
 * couvert par cette maquette (voir la réponse qui l'accompagne).
 */

import type {MacroCreneau, SousCreneau} from '../domain/types';
import {regrouperParJour} from '../logic/derive';
import type {Magasin} from '../store';
import {epochDepuisDateEtHeure, epochMinuitLocal, libelleHeure, libelleHeurePlage} from '../temps';
import {h, ouvrirModal, vider} from '../ui/dom';

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
            onclick: () => ouvrirModalCreation(jour.cle),
          }, '+ créneau'),
        ),
        track,
      );
      grille.append(colonne);
    }

    container.append(
      h('div', {class: 'agenda'},
        h('div', {class: 'agenda__toolbar'},
          h('button', {class: 'btn btn--primary btn--sm', type: 'button', onclick: () => ouvrirModalCreation(null)}, '+ Nouveau jour'),
          h('span', {class: 'view__intro', style: {margin: '0'}}, "Glissez l'en-tête d'un macro-créneau pour le déplacer dans le temps ; l'icône ✎ ouvre le détail."),
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
        onclick: (e: Event) => { e.stopPropagation(); ouvrirModalEdition(macro); },
      }, '✎'),
    );

    const bloc = h('div', {
      class: 'macro-bloc', style: {top: `${top}px`, height: `${hauteur}px`},
    },
      entete,
      h('div', {class: 'macro-bloc__sous'}, ...sousCreneaux.map((sc) => construireChipSousCreneau(sc))),
    );

    rendreDeplacable(bloc, entete, macro, jourDebutEpoch, minMinute);
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

  function ouvrirModalEdition(macro: MacroCreneau): void {
    const dateISO = new Date(epochMinuitLocal(macro.Debut) * 1000).toISOString().slice(0, 10);
    const champNom = h('input', {class: 'input', type: 'text', value: macro.Nom}) as HTMLInputElement;
    const champDebut = h('input', {class: 'input', type: 'text', value: libelleHeure(macro.Debut)}) as HTMLInputElement;
    const champFin = h('input', {class: 'input', type: 'text', value: libelleHeureApresMinuitPossible(macro)}) as HTMLInputElement;

    ouvrirModal('Modifier le macro-créneau', (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '10px'}},
      h('div', {class: 'field'}, h('label', null, 'Nom'), champNom),
      h('div', {class: 'modal__row'},
        h('div', {class: 'field'}, h('label', null, 'Début (HH:MM)'), champDebut),
        h('div', {class: 'field'}, h('label', null, 'Fin (HH:MM, > 24:00 si après minuit)'), champFin),
      ),
      h('div', {class: 'modal__actions'},
        h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => {
            const debut = epochDepuisDateEtHeure(dateISO, champDebut.value);
            const finBrute = epochDepuisDateEtHeure(dateISO, champFin.value);
            if (debut == null || finBrute == null || finBrute <= debut) { return; }
            m.enregistrerMacroCreneau({id: macro.id, Nom: champNom.value.trim() || macro.Nom, Debut: debut, Fin: finBrute});
            fermer();
          },
        }, 'Enregistrer'),
      ),
    ));
  }

  function libelleHeureApresMinuitPossible(macro: MacroCreneau): string {
    const minuit = epochMinuitLocal(macro.Debut);
    const minutes = Math.round((macro.Fin - minuit) / 60);
    const h24 = Math.floor(minutes / 60);
    const min = minutes % 60;
    return `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  function ouvrirModalCreation(jourCle: string | null): void {
    const aujourdhui = jourCle ?? new Date().toISOString().slice(0, 10);
    const champDate = h('input', {class: 'input', type: 'date', value: aujourdhui}) as HTMLInputElement;
    const champNom = h('input', {class: 'input', type: 'text', placeholder: 'Journée vendredi'}) as HTMLInputElement;
    const champDebut = h('input', {class: 'input', type: 'text', value: '10:00'}) as HTMLInputElement;
    const champFin = h('input', {class: 'input', type: 'text', value: '18:00'}) as HTMLInputElement;
    const champDuree = h('select', {class: 'select'},
      h('option', {value: '60'}, '1 h par sous-créneau'),
      h('option', {value: '90', selected: true}, '1 h 30 par sous-créneau'),
      h('option', {value: '120'}, '2 h par sous-créneau'),
    ) as HTMLSelectElement;

    ouvrirModal('Nouveau macro-créneau', (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '10px'}},
      h('div', {class: 'field'}, h('label', null, 'Jour'), champDate),
      h('div', {class: 'field'}, h('label', null, 'Nom'), champNom),
      h('div', {class: 'modal__row'},
        h('div', {class: 'field'}, h('label', null, 'Début (HH:MM)'), champDebut),
        h('div', {class: 'field'}, h('label', null, 'Fin (HH:MM, > 24:00 si après minuit)'), champFin),
      ),
      h('div', {class: 'field'}, h('label', null, 'Sous-créneaux générés automatiquement'), champDuree),
      h('div', {class: 'modal__actions'},
        h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => {
            const debut = epochDepuisDateEtHeure(champDate.value, champDebut.value);
            const fin = epochDepuisDateEtHeure(champDate.value, champFin.value);
            if (debut == null || fin == null || fin <= debut) { return; }
            const nom = champNom.value.trim() || `Créneau du ${champDate.value}`;
            const idMacro = m.enregistrerMacroCreneau({Nom: nom, Debut: debut, Fin: fin});
            const dureeSec = Number(champDuree.value) * 60;
            for (let t = debut; t < fin; t += dureeSec) {
              const finSous = Math.min(t + dureeSec, fin);
              m.enregistrerSousCreneau({
                Macro_creneau: idMacro, Mission: null, Libelle: libelleHeurePlage(t, finSous), Debut: t, Fin: finSous,
              });
            }
            fermer();
          },
        }, 'Créer'),
      ),
    ));
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
