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
import {epochDepuisDateEtHeure, epochMinuitLocal, libelleHeure} from '../temps';
import {h, ouvrirModal} from './dom';

/** Texte "HH:MM", éventuellement décalé de 24 h si la case "après minuit"
 *  est cochée, pour rester compatible avec epochDepuisDateEtHeure. */
function texteHeure(champ: HTMLInputElement, apresMinuit: boolean): string {
  if (!apresMinuit) { return champ.value; }
  const [heures, minutes] = champ.value.split(':');
  return `${Number(heures) + 24}:${minutes}`;
}

export function creerErreur(): {noeud: HTMLElement; afficher: (texte: string) => void; effacer: () => void} {
  const noeud = h('p', {class: 'field-erreur', hidden: true}) as HTMLElement;
  return {
    noeud,
    afficher: (texte: string) => { noeud.textContent = texte; noeud.hidden = false; },
    effacer: () => { noeud.hidden = true; },
  };
}

function texteCompteurSousCreneaux(n: number): string {
  if (n === 0) { return 'Aucun sous-créneau pour le moment.'; }
  return n === 1 ? '1 sous-créneau.' : `${n} sous-créneaux.`;
}

/** Durée la plus fréquente parmi des sous-créneaux existants, en minutes ;
 *  90 par défaut s'il n'y en a aucun (même valeur que la création). */
function dureeDominanteMinutes(sousCreneaux: readonly {Debut: number; Fin: number}[]): number {
  if (sousCreneaux.length === 0) { return 90; }
  const comptes = new Map<number, number>();
  for (const s of sousCreneaux) {
    const minutes = Math.round((s.Fin - s.Debut) / 60);
    comptes.set(minutes, (comptes.get(minutes) ?? 0) + 1);
  }
  return [...comptes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

function champDureeSousCreneau(dureeInitiale: number): HTMLSelectElement {
  return h('select', {class: 'select'},
    h('option', {value: '60', selected: dureeInitiale === 60}, '1 h par sous-créneau'),
    h('option', {value: '90', selected: dureeInitiale === 90}, '1 h 30 par sous-créneau'),
    h('option', {value: '120', selected: dureeInitiale === 120}, '2 h par sous-créneau'),
  ) as HTMLSelectElement;
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

  const sousActuels = () => m.sousCreneaux.filter((s) => s.Macro_creneau === macro.id);
  const compteurSous = h('p', {class: 'modal__section-compteur'}, texteCompteurSousCreneaux(sousActuels().length)) as HTMLElement;
  const champDureeSous = champDureeSousCreneau(dureeDominanteMinutes(sousActuels()));
  const erreurSous = creerErreur();

  ouvrirModal('Modifier le macro-créneau', (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
    h('div', {class: 'field'}, h('label', null, 'Nom'), champNom),
    ligne,
    erreur.noeud,
    h('div', {class: 'modal__section'},
      h('p', {class: 'modal__section-titre'}, 'Sous-créneaux'),
      compteurSous,
      h('div', {class: 'modal__row'},
        champDureeSous,
        h('button', {
          class: 'btn btn--ghost', type: 'button',
          onclick: async () => {
            erreurSous.effacer();
            let resultat;
            try {
              resultat = await m.redecouperSousCreneaux(macro.id, Number(champDureeSous.value));
            } catch {
              erreurSous.afficher("Échec de l'écriture dans le document Grist connecté. Réessayez.");
              return;
            }
            if (!resultat.ok) { erreurSous.afficher(resultat.raison); return; }
            compteurSous.textContent = texteCompteurSousCreneaux(sousActuels().length);
          },
        }, 'Redécouper automatiquement'),
      ),
      erreurSous.noeud,
    ),
    h('div', {class: 'modal__actions'},
      h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const debut = epochDepuisDateEtHeure(dateISO, champDebut.value);
          const finBrute = epochDepuisDateEtHeure(dateISO, texteHeure(champFin, caseApresMinuit.checked));
          if (debut == null || finBrute == null) { erreur.afficher('Merci de renseigner des horaires valides.'); return; }
          if (finBrute <= debut) { erreur.afficher("L'heure de fin doit être après l'heure de début."); return; }
          erreur.effacer();
          try {
            await m.enregistrerMacroCreneau({id: macro.id, Nom: champNom.value.trim() || macro.Nom, Debut: debut, Fin: finBrute});
            fermer();
          } catch {
            erreur.afficher("Échec de l'écriture dans le document Grist connecté. Réessayez.");
          }
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
  const champDuree = champDureeSousCreneau(dureeSousCreneauParDefautMinutes);

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
        onclick: async () => {
          const debut = epochDepuisDateEtHeure(champDate.value, champDebut.value);
          const fin = epochDepuisDateEtHeure(champDate.value, texteHeure(champFin, caseApresMinuit.checked));
          if (debut == null || fin == null) { erreur.afficher('Merci de renseigner un jour et des horaires valides.'); return; }
          if (fin <= debut) { erreur.afficher("L'heure de fin doit être après l'heure de début."); return; }
          erreur.effacer();
          const nom = champNom.value.trim() || `Créneau du ${champDate.value}`;
          try {
            // Deux allers-retours liés : `redecouperSousCreneaux` a besoin de
            // l'id réel rendu par Grist, jamais d'un id local provisoire.
            const idMacro = await m.enregistrerMacroCreneau({Nom: nom, Debut: debut, Fin: fin});
            await m.redecouperSousCreneaux(idMacro, Number(champDuree.value));
            fermer();
          } catch {
            erreur.afficher("Échec de l'écriture dans le document Grist connecté. Réessayez.");
          }
        },
      }, 'Créer'),
    ),
  ));
}
