/**
 * Fenêtres de création et d'édition d'un macro-créneau — module à part de
 * la vue Agenda (qui n'a pas vocation à gérer ces horaires, cf. le fil
 * dédié au comparatif vertical/horizontal) pour que les deux évoluent sans
 * se marcher dessus.
 *
 * Remplace les champs "HH:MM" en texte libre (relégués côté cahier des
 * charges comme trop proches d'un vieux logiciel métier) par des champs
 * horaires natifs, avec une case à cocher explicite pour un macro-créneau
 * qui franchit minuit plutôt que de demander de taper « 25:30 ».
 */

import type {MacroCreneau} from '../domain/types';
import type {Magasin} from '../store';
import {epochDepuisDateEtHeure, epochMinuitLocal, libelleHeure, libelleHeurePlage} from '../temps';
import {h, ouvrirModal} from './dom';

/** Texte "HH:MM", éventuellement décalé de 24 h si la case "après minuit"
 *  est cochée, pour rester compatible avec epochDepuisDateEtHeure. */
function texteHeure(champ: HTMLInputElement, apresMinuit: boolean): string {
  if (!apresMinuit) { return champ.value; }
  const [heures, minutes] = champ.value.split(':');
  return `${Number(heures) + 24}:${minutes}`;
}

function creerErreur(): {noeud: HTMLElement; afficher: (texte: string) => void; effacer: () => void} {
  const noeud = h('p', {class: 'field-erreur', hidden: true}) as HTMLElement;
  return {
    noeud,
    afficher: (texte: string) => { noeud.textContent = texte; noeud.hidden = false; },
    effacer: () => { noeud.hidden = true; },
  };
}

function champHoraires(
  labelDebut: string, valeurDebut: string, labelFin: string, valeurFin: string, finApresMinuit: boolean,
): {ligne: Node; champDebut: HTMLInputElement; champFin: HTMLInputElement; caseApresMinuit: HTMLInputElement} {
  const champDebut = h('input', {class: 'input', type: 'time', step: '900', value: valeurDebut}) as HTMLInputElement;
  const champFin = h('input', {class: 'input', type: 'time', step: '900', value: valeurFin}) as HTMLInputElement;
  const caseApresMinuit = h('input', {type: 'checkbox', checked: finApresMinuit}) as HTMLInputElement;

  const ligne = h('div', {style: {display: 'flex', flexDirection: 'column', gap: '10px'}},
    h('div', {class: 'modal__row'},
      h('div', {class: 'field'}, h('label', null, labelDebut), champDebut),
      h('div', {class: 'field'}, h('label', null, labelFin), champFin),
    ),
    h('label', {class: 'horaire-apres-minuit'},
      caseApresMinuit,
      'Se termine après minuit',
    ),
  );
  return {ligne, champDebut, champFin, caseApresMinuit};
}

export function ouvrirModalEditionCreneau(m: Magasin, macro: MacroCreneau): void {
  const dateISO = new Date(epochMinuitLocal(macro.Debut) * 1000).toISOString().slice(0, 10);
  const minuit = epochMinuitLocal(macro.Debut);
  const finApresMinuitInitial = macro.Fin - minuit >= 24 * 3600;
  const champNom = h('input', {class: 'input', type: 'text', value: macro.Nom}) as HTMLInputElement;
  const {ligne, champDebut, champFin, caseApresMinuit} = champHoraires(
    'Début', libelleHeure(macro.Debut), 'Fin', libelleHeure(macro.Fin), finApresMinuitInitial,
  );

  const erreur = creerErreur();

  ouvrirModal('Modifier le macro-créneau', (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
    h('div', {class: 'field'}, h('label', null, 'Nom'), champNom),
    ligne,
    erreur.noeud,
    h('div', {class: 'modal__actions'},
      h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: () => {
          const debut = epochDepuisDateEtHeure(dateISO, champDebut.value);
          const finBrute = epochDepuisDateEtHeure(dateISO, texteHeure(champFin, caseApresMinuit.checked));
          if (debut == null || finBrute == null) { erreur.afficher('Merci de renseigner des horaires valides.'); return; }
          if (finBrute <= debut) { erreur.afficher("L'heure de fin doit être après l'heure de début."); return; }
          erreur.effacer();
          m.enregistrerMacroCreneau({id: macro.id, Nom: champNom.value.trim() || macro.Nom, Debut: debut, Fin: finBrute});
          fermer();
        },
      }, 'Enregistrer'),
    ),
  ));
}

export function ouvrirModalCreationCreneau(m: Magasin, jourCle: string | null, dureeSousCreneauParDefautMinutes = 90): void {
  const aujourdhui = jourCle ?? new Date().toISOString().slice(0, 10);
  const champDate = h('input', {class: 'input', type: 'date', value: aujourdhui}) as HTMLInputElement;
  const champNom = h('input', {class: 'input', type: 'text', placeholder: 'Journée vendredi'}) as HTMLInputElement;
  const {ligne, champDebut, champFin, caseApresMinuit} = champHoraires('Début', '10:00', 'Fin', '18:00', false);
  const champDuree = h('select', {class: 'select'},
    h('option', {value: '60'}, '1 h par sous-créneau'),
    h('option', {value: '90', selected: dureeSousCreneauParDefautMinutes === 90}, '1 h 30 par sous-créneau'),
    h('option', {value: '120'}, '2 h par sous-créneau'),
  ) as HTMLSelectElement;

  const erreur = creerErreur();

  ouvrirModal('Nouveau macro-créneau', (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
    h('div', {class: 'field'}, h('label', null, 'Jour'), champDate),
    h('div', {class: 'field'}, h('label', null, 'Nom'), champNom),
    ligne,
    h('div', {class: 'field'}, h('label', null, 'Sous-créneaux générés automatiquement'), champDuree),
    erreur.noeud,
    h('div', {class: 'modal__actions'},
      h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: () => {
          const debut = epochDepuisDateEtHeure(champDate.value, champDebut.value);
          const fin = epochDepuisDateEtHeure(champDate.value, texteHeure(champFin, caseApresMinuit.checked));
          if (debut == null || fin == null) { erreur.afficher('Merci de renseigner un jour et des horaires valides.'); return; }
          if (fin <= debut) { erreur.afficher("L'heure de fin doit être après l'heure de début."); return; }
          erreur.effacer();
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
