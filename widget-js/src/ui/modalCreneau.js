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

import {t, tn, traductions} from '../i18n.js';
import {epochJourFestivalEtHeure, epochMinuitLocal, libelleHeure} from '../temps.js';
import {h, ouvrirModal} from './dom.js';

traductions({
  'Aucun sous-créneau pour le moment.': 'No slots yet.',
  '{n} sous-créneau.': '{n} slot.',
  '{n} sous-créneaux.': '{n} slots.',
  '1 h par sous-créneau': '1 h per slot',
  '1 h 30 par sous-créneau': '1 h 30 min per slot',
  '2 h par sous-créneau': '2 h per slot',
  'Se termine après minuit': 'Ends after midnight',
  Début: 'Start',
  Fin: 'End',
  'Modifier le macro-créneau': 'Edit time block',
  Nom: 'Name',
  'Sous-créneaux': 'Slots',
  "Échec de l'écriture dans le document Grist connecté. Réessayez.": 'Could not write to the connected Grist document. Try again.',
  'Redécouper automatiquement': 'Re-split automatically',
  Annuler: 'Cancel',
  'Merci de renseigner des horaires valides.': 'Please enter valid times.',
  "L'heure de fin doit être après l'heure de début.": 'The end time must be after the start time.',
  Enregistrer: 'Save',
  'Journée vendredi': 'Friday daytime',
  'Nouveau macro-créneau': 'New time block',
  Jour: 'Day',
  'Sous-créneaux générés automatiquement': 'Automatically generated slots',
  'Merci de renseigner un jour et des horaires valides.': 'Please enter a valid day and times.',
  'Créneau du {date}': 'Time block of {date}',
  Créer: 'Create',
});

export function creerErreur() {
  const noeud = h('p', {class: 'field-erreur', hidden: true});
  return {
    noeud,
    afficher: (texte) => { noeud.textContent = texte; noeud.hidden = false; },
    effacer: () => { noeud.hidden = true; },
  };
}

function texteCompteurSousCreneaux(n) {
  if (n === 0) { return t('Aucun sous-créneau pour le moment.'); }
  return tn(n, '{n} sous-créneau.', '{n} sous-créneaux.');
}

/** Durée la plus fréquente parmi des sous-créneaux existants, en minutes ;
 *  90 par défaut s'il n'y en a aucun (même valeur que la création). */
function dureeDominanteMinutes(sousCreneaux) {
  if (sousCreneaux.length === 0) { return 90; }
  const comptes = new Map();
  for (const s of sousCreneaux) {
    const minutes = Math.round((s.Fin - s.Debut) / 60);
    comptes.set(minutes, (comptes.get(minutes) ?? 0) + 1);
  }
  return [...comptes.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function champDureeSousCreneau(dureeInitiale) {
  return h('select', {class: 'select'},
    h('option', {value: '60', selected: dureeInitiale === 60}, t('1 h par sous-créneau')),
    h('option', {value: '90', selected: dureeInitiale === 90}, t('1 h 30 par sous-créneau')),
    h('option', {value: '120', selected: dureeInitiale === 120}, t('2 h par sous-créneau')),
  );
}

function champHoraires(
  labelDebut, valeurDebut, labelFin, valeurFin, finApresMinuit,
) {
  const champDebut = h('input', {class: 'input', type: 'time', step: '900', value: valeurDebut});
  const champFin = h('input', {class: 'input', type: 'time', step: '900', value: valeurFin});
  const caseApresMinuit = h('input', {type: 'checkbox', checked: finApresMinuit});

  const ligne = h('div', {style: {display: 'flex', flexDirection: 'column', gap: '10px'}},
    h('div', {class: 'modal__row'},
      h('div', {class: 'field'}, h('label', null, labelDebut), champDebut),
      h('div', {class: 'field'}, h('label', null, labelFin), champFin),
    ),
    h('label', {class: 'horaire-apres-minuit'},
      caseApresMinuit,
      t('Se termine après minuit'),
    ),
  );
  return {ligne, champDebut, champFin, caseApresMinuit};
}

export function ouvrirModalEditionCreneau(m, macro) {
  const dateISO = new Date(epochMinuitLocal(macro.Debut) * 1000).toISOString().slice(0, 10);
  const minuit = epochMinuitLocal(macro.Debut);
  const finApresMinuitInitial = macro.Fin - minuit >= 24 * 3600;
  const champNom = h('input', {class: 'input', type: 'text', value: macro.Nom});
  const {ligne, champDebut, champFin, caseApresMinuit} = champHoraires(
    t('Début'), libelleHeure(macro.Debut), t('Fin'), libelleHeure(macro.Fin), finApresMinuitInitial,
  );

  const erreur = creerErreur();

  const sousActuels = () => m.sousCreneaux.filter((s) => s.Macro_creneau === macro.id);
  const compteurSous = h('p', {class: 'modal__section-compteur'}, texteCompteurSousCreneaux(sousActuels().length));
  const champDureeSous = champDureeSousCreneau(dureeDominanteMinutes(sousActuels()));
  const erreurSous = creerErreur();

  ouvrirModal(t('Modifier le macro-créneau'), (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
    h('div', {class: 'field'}, h('label', null, t('Nom')), champNom),
    ligne,
    erreur.noeud,
    h('div', {class: 'modal__section'},
      h('p', {class: 'modal__section-titre'}, t('Sous-créneaux')),
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
              erreurSous.afficher(t("Échec de l'écriture dans le document Grist connecté. Réessayez."));
              return;
            }
            if (!resultat.ok) { erreurSous.afficher(resultat.raison); return; }
            compteurSous.textContent = texteCompteurSousCreneaux(sousActuels().length);
          },
        }, t('Redécouper automatiquement')),
      ),
      erreurSous.noeud,
    ),
    h('div', {class: 'modal__actions'},
      h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, t('Annuler')),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const debut = epochJourFestivalEtHeure(dateISO, champDebut.value);
          const finBrute = epochJourFestivalEtHeure(dateISO, champFin.value, caseApresMinuit.checked);
          if (debut == null || finBrute == null) { erreur.afficher(t('Merci de renseigner des horaires valides.')); return; }
          if (finBrute <= debut) { erreur.afficher(t("L'heure de fin doit être après l'heure de début.")); return; }
          erreur.effacer();
          try {
            await m.enregistrerMacroCreneau({id: macro.id, Nom: champNom.value.trim() || macro.Nom, Debut: debut, Fin: finBrute});
            fermer();
          } catch {
            erreur.afficher(t("Échec de l'écriture dans le document Grist connecté. Réessayez."));
          }
        },
      }, t('Enregistrer')),
    ),
  ));
}

export function ouvrirModalCreationCreneau(m, jourCle, dureeSousCreneauParDefautMinutes = 90) {
  const aujourdhui = jourCle ?? new Date().toISOString().slice(0, 10);
  const champDate = h('input', {class: 'input', type: 'date', value: aujourdhui});
  const champNom = h('input', {class: 'input', type: 'text', placeholder: t('Journée vendredi')});
  const {ligne, champDebut, champFin, caseApresMinuit} = champHoraires(t('Début'), '10:00', t('Fin'), '18:00', false);
  const champDuree = champDureeSousCreneau(dureeSousCreneauParDefautMinutes);

  const erreur = creerErreur();

  ouvrirModal(t('Nouveau macro-créneau'), (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
    h('div', {class: 'field'}, h('label', null, t('Jour')), champDate),
    h('div', {class: 'field'}, h('label', null, t('Nom')), champNom),
    ligne,
    h('div', {class: 'field'}, h('label', null, t('Sous-créneaux générés automatiquement')), champDuree),
    erreur.noeud,
    h('div', {class: 'modal__actions'},
      h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, t('Annuler')),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const debut = epochJourFestivalEtHeure(champDate.value, champDebut.value);
          const fin = epochJourFestivalEtHeure(champDate.value, champFin.value, caseApresMinuit.checked);
          if (debut == null || fin == null) { erreur.afficher(t('Merci de renseigner un jour et des horaires valides.')); return; }
          if (fin <= debut) { erreur.afficher(t("L'heure de fin doit être après l'heure de début.")); return; }
          erreur.effacer();
          const nom = champNom.value.trim() || t('Créneau du {date}', {date: champDate.value});
          try {
            // Deux allers-retours liés : `redecouperSousCreneaux` a besoin de
            // l'id réel rendu par Grist, jamais d'un id local provisoire.
            const idMacro = await m.enregistrerMacroCreneau({Nom: nom, Debut: debut, Fin: fin});
            await m.redecouperSousCreneaux(idMacro, Number(champDuree.value));
            fermer();
          } catch {
            erreur.afficher(t("Échec de l'écriture dans le document Grist connecté. Réessayez."));
          }
        },
      }, t('Créer')),
    ),
  ));
}
