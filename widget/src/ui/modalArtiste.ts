/**
 * Fenêtre de création et d'édition d'un passage artiste (cahier des charges
 * §8.8). Un passage n'est pas rattaché à une colonne « jour » comme un
 * macro-créneau : deux champs date-heure libres (un par borne) suffisent,
 * sans case « après minuit » — on choisit directement le jour de la fin.
 * `epochDepuisDateEtHeure` (temps.ts) fait la conversion, comme pour
 * l'agenda ; rien n'est réinventé ici.
 */

import type {Artiste, Id} from '../domain/types';
import type {Magasin} from '../store';
import {epochDepuisDateEtHeure, libelleHeurePlage} from '../temps';
import {h, ouvrirModal} from './dom';
import {creerErreur} from './modalCreneau';

/** Découpe la valeur d'un `<input type="datetime-local">` ("AAAA-MM-JJTHH:MM")
 *  dans le format attendu par `epochDepuisDateEtHeure`. */
function epochDepuisDatetimeLocal(valeur: string): number | null {
  const [dateISO, heureTexte] = valeur.split('T');
  if (!dateISO || !heureTexte) { return null; }
  return epochDepuisDateEtHeure(dateISO, heureTexte);
}

function versDatetimeLocal(epochSecondes: number): string {
  // Reconstruit "AAAA-MM-JJTHH:MM" en heure locale à partir de l'epoch, sans
  // passer par UTC (Date#toISOString bascule en UTC et décalerait l'heure
  // affichée par rapport au fuseau du festival).
  const d = new Date(epochSecondes * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formulaire(
  m: Magasin, titre: string, texteBouton: string, artisteExistant: Artiste | null,
  onValider: (patch: Omit<Artiste, 'id'> & {id?: Id}) => Promise<unknown>,
): void {
  const champNom = h('input', {
    class: 'input', type: 'text', placeholder: 'Nom de l’artiste', value: artisteExistant?.Nom ?? '',
  }) as HTMLInputElement;

  const champLieu = h('select', {class: 'select'},
    ...m.lieux.map((l) => h('option', {value: String(l.id), selected: l.id === artisteExistant?.Lieu}, l.Nom)),
  ) as HTMLSelectElement;

  const champDebut = h('input', {
    class: 'input', type: 'datetime-local',
    value: artisteExistant ? versDatetimeLocal(artisteExistant.Debut) : '',
  }) as HTMLInputElement;
  const champFin = h('input', {
    class: 'input', type: 'datetime-local',
    value: artisteExistant ? versDatetimeLocal(artisteExistant.Fin) : '',
  }) as HTMLInputElement;

  const erreur = creerErreur();

  ouvrirModal(titre, (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
    h('div', {class: 'field'}, h('label', null, 'Nom'), champNom),
    h('div', {class: 'field'}, h('label', null, 'Lieu'), champLieu),
    h('div', {class: 'modal__row'},
      h('div', {class: 'field'}, h('label', null, 'Début'), champDebut),
      h('div', {class: 'field'}, h('label', null, 'Fin'), champFin),
    ),
    erreur.noeud,
    h('div', {class: 'modal__actions'},
      h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const nom = champNom.value.trim();
          const lieuId = Number(champLieu.value);
          const debut = epochDepuisDatetimeLocal(champDebut.value);
          const fin = epochDepuisDatetimeLocal(champFin.value);
          if (!nom) { erreur.afficher('Merci de renseigner un nom.'); return; }
          if (!champLieu.value) { erreur.afficher('Merci de choisir un lieu (aucun lieu disponible pour l’instant).'); return; }
          if (debut == null || fin == null) { erreur.afficher('Merci de renseigner un début et une fin.'); return; }
          if (fin <= debut) { erreur.afficher('La fin doit être après le début.'); return; }
          erreur.effacer();
          const patch = {Nom: nom, Lieu: lieuId, Debut: debut, Fin: fin};
          try {
            await onValider(artisteExistant ? {...patch, id: artisteExistant.id} : patch);
            fermer();
          } catch {
            erreur.afficher("Échec de l'écriture dans le document Grist connecté. Réessayez.");
          }
        },
      }, texteBouton),
    ),
  ));
}

export function ouvrirModalCreationArtiste(m: Magasin): void {
  formulaire(m, 'Nouveau passage', 'Créer', null, (patch) => m.enregistrerArtiste(patch));
}

export function ouvrirModalEditionArtiste(m: Magasin, artiste: Artiste): void {
  formulaire(
    m, `Modifier « ${artiste.Nom} » (${libelleHeurePlage(artiste.Debut, artiste.Fin)})`, 'Enregistrer', artiste,
    (patch) => m.enregistrerArtiste(patch),
  );
}
