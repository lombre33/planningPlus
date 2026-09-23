/**
 * Fenêtre de création et d'édition d'un passage artiste (cahier des charges
 * §8.8). Un passage n'est pas rattaché à une colonne « jour » comme un
 * macro-créneau : deux champs date-heure libres (un par borne) suffisent,
 * sans case « après minuit » — on choisit directement le jour de la fin.
 * `epochDepuisDateEtHeure` (temps.ts) fait la conversion, comme pour
 * l'agenda ; rien n'est réinventé ici.
 */

import type {Artiste, Epoch, Id} from '../domain/types';
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

export interface ValeursInitialesArtiste {
  readonly nom?: string;
  /** Champ Nom désactivé — cas du clic sur la piste d'une ligne déjà
   *  associée à un artiste (§8.8) : le nom est déterminé par la ligne
   *  cliquée, pas à ressaisir ni à modifier par erreur. */
  readonly nomVerrouille?: boolean;
  readonly lieu?: Id;
  readonly debut?: Epoch;
  readonly fin?: Epoch;
}

function formulaire(
  m: Magasin, titre: string, texteBouton: string, artisteExistant: Artiste | null,
  valeursInitiales: ValeursInitialesArtiste | null,
  onValider: (patch: Omit<Artiste, 'id'> & {id?: Id}) => Promise<unknown>,
): void {
  const champNom = h('input', {
    class: 'input', type: 'text', placeholder: 'Nom de l’artiste',
    value: artisteExistant?.Nom ?? valeursInitiales?.nom ?? '',
    disabled: valeursInitiales?.nomVerrouille ?? false,
  }) as HTMLInputElement;

  // Facultatif : « les lieux ne servent pas pour l'instant » (Antoine,
  // 2026-09-23), même geste que le lieu d'une mission dans
  // `ouvrirCreationMission` (views/grille.ts) — l'option « — aucun — » vaut
  // `Lieu: 0`, qu'`enregistrerArtiste` convertit déjà en `lieuId: null` côté
  // écriture, et que `ligneArtistes` (logic/derive.ts) affiche déjà comme un
  // lieu vide (`?? ''`) : rien d'autre à changer pour que l'absence de lieu
  // ne bloque ni la création ni l'affichage.
  const lieuInitial = artisteExistant?.Lieu ?? valeursInitiales?.lieu;
  const champLieu = h('select', {class: 'select'},
    h('option', {value: ''}, '— aucun —'),
    ...m.lieux.map((l) => h('option', {value: String(l.id), selected: l.id === lieuInitial}, l.Nom)),
  ) as HTMLSelectElement;

  const debutInitial = artisteExistant?.Debut ?? valeursInitiales?.debut;
  const finInitial = artisteExistant?.Fin ?? valeursInitiales?.fin;
  const champDebut = h('input', {
    class: 'input', type: 'datetime-local',
    value: debutInitial != null ? versDatetimeLocal(debutInitial) : '',
  }) as HTMLInputElement;
  const champFin = h('input', {
    class: 'input', type: 'datetime-local',
    value: finInitial != null ? versDatetimeLocal(finInitial) : '',
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
          const debut = epochDepuisDatetimeLocal(champDebut.value);
          const fin = epochDepuisDatetimeLocal(champFin.value);
          if (!nom) { erreur.afficher('Merci de renseigner un nom.'); return; }
          if (debut == null || fin == null) { erreur.afficher('Merci de renseigner un début et une fin.'); return; }
          if (fin <= debut) { erreur.afficher('La fin doit être après le début.'); return; }
          erreur.effacer();
          const patch = {Nom: nom, Lieu: champLieu.value ? Number(champLieu.value) : 0, Debut: debut, Fin: fin};
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

/** Crée un artiste dans le référentiel — le "qui" (nom, lieu), pas encore le
 *  "où/quand" : ça, c'est `ouvrirModalCreationPassagePourArtiste`, posé
 *  ensuite d'un clic sur sa ligne (même séparation identité/horaire que
 *  `ouvrirCreationMission`, `views/grille.ts`). Demande d'Antoine du
 *  2026-09-23, en réponse directe à la modale précédente qui demandait déjà
 *  un horaire ici : « je n'ai pas besoin de sélectionner un jour/heure dans
 *  cette modale-là, ça n'a aucun sens » → ajouter une ligne.
 *
 *  La table `Artistes` reste un passage par ligne (§6, aucun changement de
 *  modèle) : cette ligne sans passage encore posé s'écrit avec une borne
 *  nulle, `Debut === Fin` (voir `estPlaceholder`, `views/artistes.ts`), que
 *  `ouvrirModalCreationPassagePourArtiste` remplace en place au premier
 *  horaire donné plutôt que d'ajouter une seconde ligne. */
export function ouvrirModalCreationArtiste(m: Magasin): void {
  const champNom = h('input', {class: 'input', type: 'text', placeholder: 'Nom de l’artiste'}) as HTMLInputElement;
  const champLieu = h('select', {class: 'select'},
    h('option', {value: ''}, '— aucun —'),
    ...m.lieux.map((l) => h('option', {value: String(l.id)}, l.Nom)),
  ) as HTMLSelectElement;
  const erreur = creerErreur();

  ouvrirModal('Nouvel artiste', (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
    h('div', {class: 'field'}, h('label', null, 'Nom'), champNom),
    h('div', {class: 'field'}, h('label', null, 'Lieu'), champLieu),
    erreur.noeud,
    h('div', {class: 'modal__actions'},
      h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
      h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const nom = champNom.value.trim();
          if (!nom) { erreur.afficher('Merci de renseigner un nom.'); return; }
          erreur.effacer();
          try {
            await m.enregistrerArtiste({
              Nom: nom, Lieu: champLieu.value ? Number(champLieu.value) : 0, Debut: 0, Fin: 0,
            });
            fermer();
          } catch {
            erreur.afficher("Échec de l'écriture dans le document Grist connecté. Réessayez.");
          }
        },
      }, 'Créer'),
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
  m: Magasin, nom: string, valeursInitiales: Omit<ValeursInitialesArtiste, 'nom' | 'nomVerrouille'>,
  idPlaceholder?: Id,
): void {
  formulaire(
    m, `Nouveau passage — ${nom}`, 'Créer', null, {...valeursInitiales, nom, nomVerrouille: true},
    (patch) => m.enregistrerArtiste(idPlaceholder != null ? {...patch, id: idPlaceholder} : patch),
  );
}

export function ouvrirModalEditionArtiste(m: Magasin, artiste: Artiste): void {
  formulaire(
    m, `Modifier « ${artiste.Nom} » (${libelleHeurePlage(artiste.Debut, artiste.Fin)})`, 'Enregistrer', artiste,
    null, (patch) => m.enregistrerArtiste(patch),
  );
}
