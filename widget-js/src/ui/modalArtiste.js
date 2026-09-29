/**
 * Fenêtre de création et d'édition d'un passage artiste (cahier des charges
 * §8.8). Un passage n'est pas rattaché à une colonne « jour » comme un
 * macro-créneau : deux champs date-heure libres (un par borne) suffisent,
 * sans case « après minuit » — on choisit directement le jour de la fin.
 * `epochDepuisDateEtHeure` (temps.js) fait la conversion, comme pour
 * l'agenda ; rien n'est réinventé ici.
 */

import {t, traductions} from '../i18n.js';
import {epochDepuisDateEtHeure, libelleHeurePlage} from '../temps.js';
import {h, ouvrirModal} from './dom.js';
import {creerErreur} from './modalCreneau.js';

traductions({
  'Nom de l’artiste': 'Artist name',
  '— aucun —': '— none —',
  Nom: 'Name',
  Lieu: 'Location',
  Début: 'Start',
  Fin: 'End',
  Annuler: 'Cancel',
  'Merci de renseigner un nom.': 'Please enter a name.',
  'Merci de renseigner un début et une fin.': 'Please enter a start and an end.',
  'La fin doit être après le début.': 'The end must be after the start.',
  "Échec de l'écriture dans le document Grist connecté. Réessayez.": 'Could not write to the connected Grist document. Try again.',
  'Nouvel artiste': 'New artist',
  Créer: 'Create',
  'Nouveau passage — {nom}': 'New set — {nom}',
  'Modifier « {nom} » ({horaire})': 'Edit “{nom}” ({horaire})',
  Enregistrer: 'Save',
});

/** Découpe la valeur d'un `<input type="datetime-local">` ("AAAA-MM-JJTHH:MM")
 *  dans le format attendu par `epochDepuisDateEtHeure`. */
function epochDepuisDatetimeLocal(valeur) {
  const [dateISO, heureTexte] = valeur.split('T');
  if (!dateISO || !heureTexte) { return null; }
  return epochDepuisDateEtHeure(dateISO, heureTexte);
}

function versDatetimeLocal(epochSecondes) {
  // Reconstruit "AAAA-MM-JJTHH:MM" en heure locale à partir de l'epoch, sans
  // passer par UTC (Date#toISOString bascule en UTC et décalerait l'heure
  // affichée par rapport au fuseau du festival).
  const d = new Date(epochSecondes * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formulaire(
  m, titre, texteBouton, artisteExistant,
  valeursInitiales,
  onValider,
) {
  const champNom = h('input', {
    class: 'input', type: 'text', placeholder: t('Nom de l’artiste'),
    value: artisteExistant?.Nom ?? valeursInitiales?.nom ?? '',
    disabled: valeursInitiales?.nomVerrouille ?? false,
  });

  // Facultatif : « les lieux ne servent pas pour l'instant » (Antoine,
  // 2026-09-23), même geste que le lieu d'une mission dans
  // `ouvrirCreationMission` (views/grille.js) — l'option « — aucun — » vaut
  // `Lieu: 0`, qu'`enregistrerArtiste` convertit déjà en `lieuId: null` côté
  // écriture, et que `ligneArtistes` (logic/derive.js) affiche déjà comme un
  // lieu vide (`?? ''`) : rien d'autre à changer pour que l'absence de lieu
  // ne bloque ni la création ni l'affichage.
  const lieuInitial = artisteExistant?.Lieu ?? valeursInitiales?.lieu;
  const champLieu = h('select', {class: 'select'},
    h('option', {value: ''}, t('— aucun —')),
    ...m.lieux.map((l) => h('option', {value: String(l.id), selected: l.id === lieuInitial}, l.Nom)),
  );

  const debutInitial = artisteExistant?.Debut ?? valeursInitiales?.debut;
  const finInitial = artisteExistant?.Fin ?? valeursInitiales?.fin;
  const champDebut = h('input', {
    class: 'input', type: 'datetime-local',
    value: debutInitial != null ? versDatetimeLocal(debutInitial) : '',
  });
  const champFin = h('input', {
    class: 'input', type: 'datetime-local',
    value: finInitial != null ? versDatetimeLocal(finInitial) : '',
  });

  const erreur = creerErreur();

  ouvrirModal(titre, (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
    h('div', {class: 'field'}, h('label', null, t('Nom')), champNom),
    h('div', {class: 'field'}, h('label', null, t('Lieu')), champLieu),
    h('div', {class: 'modal__row'},
      h('div', {class: 'field'}, h('label', null, t('Début')), champDebut),
      h('div', {class: 'field'}, h('label', null, t('Fin')), champFin),
    ),
    erreur.noeud,
    h('div', {class: 'modal__actions'},
      h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, t('Annuler')),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const nom = champNom.value.trim();
          const debut = epochDepuisDatetimeLocal(champDebut.value);
          const fin = epochDepuisDatetimeLocal(champFin.value);
          if (!nom) { erreur.afficher(t('Merci de renseigner un nom.')); return; }
          if (debut == null || fin == null) { erreur.afficher(t('Merci de renseigner un début et une fin.')); return; }
          if (fin <= debut) { erreur.afficher(t('La fin doit être après le début.')); return; }
          erreur.effacer();
          const patch = {Nom: nom, Lieu: champLieu.value ? Number(champLieu.value) : 0, Debut: debut, Fin: fin};
          try {
            await onValider(artisteExistant ? {...patch, id: artisteExistant.id} : patch);
            fermer();
          } catch {
            erreur.afficher(t("Échec de l'écriture dans le document Grist connecté. Réessayez."));
          }
        },
      }, texteBouton),
    ),
  ));
}

/** Crée un artiste dans le référentiel — le "qui" (nom, lieu), pas encore le
 *  "où/quand" : ça, c'est `ouvrirModalCreationPassagePourArtiste`, posé
 *  ensuite d'un clic sur sa ligne (même séparation identité/horaire que
 *  `ouvrirCreationMission`, `views/grille.js`). Demande d'Antoine du
 *  2026-09-23, en réponse directe à la modale précédente qui demandait déjà
 *  un horaire ici : « je n'ai pas besoin de sélectionner un jour/heure dans
 *  cette modale-là, ça n'a aucun sens » → ajouter une ligne.
 *
 *  La table `Artistes` reste un passage par ligne (§6, aucun changement de
 *  modèle) : cette ligne sans passage encore posé s'écrit avec une borne
 *  nulle, `Debut === Fin` (voir `estPlaceholder`, `views/artistes.js`), que
 *  `ouvrirModalCreationPassagePourArtiste` remplace en place au premier
 *  horaire donné plutôt que d'ajouter une seconde ligne. */
export function ouvrirModalCreationArtiste(m) {
  const champNom = h('input', {class: 'input', type: 'text', placeholder: t('Nom de l’artiste')});
  const champLieu = h('select', {class: 'select'},
    h('option', {value: ''}, t('— aucun —')),
    ...m.lieux.map((l) => h('option', {value: String(l.id)}, l.Nom)),
  );
  const erreur = creerErreur();

  ouvrirModal(t('Nouvel artiste'), (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
    h('div', {class: 'field'}, h('label', null, t('Nom')), champNom),
    h('div', {class: 'field'}, h('label', null, t('Lieu')), champLieu),
    erreur.noeud,
    h('div', {class: 'modal__actions'},
      h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, t('Annuler')),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const nom = champNom.value.trim();
          if (!nom) { erreur.afficher(t('Merci de renseigner un nom.')); return; }
          erreur.effacer();
          try {
            await m.enregistrerArtiste({
              Nom: nom, Lieu: champLieu.value ? Number(champLieu.value) : 0, Debut: 0, Fin: 0,
            });
            fermer();
          } catch {
            erreur.afficher(t("Échec de l'écriture dans le document Grist connecté. Réessayez."));
          }
        },
      }, t('Créer')),
    ),
  ));
}

/** Un nouveau passage pour un artiste qui a déjà au moins une ligne dans la
 *  frise (clic sur sa piste, §8.8) : nom verrouillé sur celui de la ligne,
 *  horaires suggérés à partir du point cliqué. `idPlaceholder`, quand
 *  fourni, est l'id de la ligne « sans passage » créée par
 *  `ouvrirModalCreationArtiste` (`Debut === Fin`) : ce premier horaire la
 *  remplace en place (édition) plutôt que de créer une ligne de plus à
 *  côté d'une ligne vide désormais inutile. */
export function ouvrirModalCreationPassagePourArtiste(
  m, nom, valeursInitiales,
  idPlaceholder,
) {
  formulaire(
    m, t('Nouveau passage — {nom}', {nom}), t('Créer'), null, {...valeursInitiales, nom, nomVerrouille: true},
    (patch) => m.enregistrerArtiste(idPlaceholder != null ? {...patch, id: idPlaceholder} : patch),
  );
}

export function ouvrirModalEditionArtiste(m, artiste) {
  formulaire(
    m, t('Modifier « {nom} » ({horaire})', {nom: artiste.Nom, horaire: libelleHeurePlage(artiste.Debut, artiste.Fin)}),
    t('Enregistrer'), artiste, null, (patch) => m.enregistrerArtiste(patch),
  );
}
