/**
 * Vue « missions × sous-créneaux » : qui est où pour un jour donné (§8.2 du
 * cahier des charges — la vue des cheffes d'équipe). Cliquer une case ouvre
 * sa couverture : les indicatifs positionnés et qui tient chaque place.
 * Elle ne pourvoit plus rien (ménage choisi par Antoine le 2026-09-29) :
 * les places se pourvoient, s'échangent et se verrouillent dans la table
 * du jour, à l'étape 5.
 */

import {t, tn, traductions} from '../i18n.js';
import {
  couvertureBesoin, indexer, regrouperParJour, sousCreneauxApplicables,
} from '../logic/derive.js';
import {epochJourFestivalEtHeure, libelleHeure, libelleHeurePlage} from '../temps.js';
import {fermerPanneau, h, icone, ICONES, ouvrirModal, ouvrirPanneau, vider} from '../ui/dom.js';
import {construireFrise} from '../ui/frise.js';
import {creerErreur} from '../ui/modalCreneau.js';

traductions({
  '+ Nouvelle mission': '+ New task',
  "Copier les créneaux d'un autre jour…": 'Copy slots from another day…',
  'Le référentiel des missions — pas encore où ni quand : ça se joue case par case, ci-dessous.':
    'The task catalog — not yet where or when: that is decided cell by cell, below.',
  'Toutes les équipes': 'All teams',
  'Aucun sous-créneau ce jour.': 'No slots on this day.',
  'Donner à cette mission un créneau à elle, décalé ou en pause par rapport à la trame commune':
    'Give this task a slot of its own, shifted or paused relative to the shared grid',
  '+ créneau': '+ slot',
  'Cliquer pour donner à cette mission un créneau à elle, décalé ou en pause par rapport à la trame commune':
    'Click to give this task a slot of its own, shifted or paused relative to the shared grid',
  'Créer un besoin ici — facultatif, laissez vide pour une zone volontairement non couverte':
    'Create a need here — optional, leave it empty for an area deliberately left uncovered',
  'Contrôle des bracelets': 'Wristband check',
  Bars: 'Bars',
  '— aucun —': '— none —',
  Normale: 'Normal',
  Critique: 'Critical',
  Confort: 'Nice to have',
  'Nouvelle mission': 'New task',
  'Merci de renseigner un nom.': 'Please enter a name.',
  "Ce document n'a encore aucune équipe : merci de la nommer.": 'This document has no team yet: please name one.',
  "Échec de l'écriture dans le document Grist connecté. Réessayez.": 'Could not write to the connected Grist document. Try again.',
  Créer: 'Create',
  Nom: 'Name',
  Équipe: 'Team',
  Lieu: 'Location',
  "Ce document n'a encore aucune équipe : elle sera créée avec cette mission.":
    'This document has no team yet: it will be created along with this task.',
  Priorité: 'Priority',
  Annuler: 'Cancel',
  'Taille du binôme': 'Buddy pair size',
  'Effectif minimum': 'Minimum headcount',
  "Aucun indicatif n'est positionné automatiquement : vous les créerez depuis la vue Indicatifs.":
    'No call sign is placed automatically: you will create them from the Call signs view.',
  'Merci de renseigner des effectifs valides (au moins 1).': 'Please enter valid headcounts (at least 1).',
  '{mission} — créneau propre': '{mission} — own slot',
  Début: 'Start',
  Fin: 'End',
  'Se termine après minuit': 'Ends after midnight',
  'Merci de renseigner des horaires valides.': 'Please enter valid times.',
  "L'heure de fin doit être après l'heure de début.": 'The end time must be after the start time.',
  "Copier les créneaux d'un autre jour": 'Copy slots from another day',
  'Merci de choisir un jour.': 'Please choose a day.',
  'Rien à copier depuis {source} : tout y était déjà présent sur {cible}.':
    'Nothing to copy from {source}: everything there was already on {cible}.',
  '{n} besoin copié depuis {jour}': '{n} need copied from {jour}',
  '{n} besoins copiés depuis {jour}': '{n} needs copied from {jour}',
  '{n} créneau créé': '{n} slot created',
  '{n} créneaux créés': '{n} slots created',
  '{n} indicatif repositionné': '{n} call sign placed again',
  '{n} indicatifs repositionnés': '{n} call signs placed again',
  Copier: 'Copy',
  "Reproduit sur {jour} les besoins déjà construits sur le jour choisi ci-dessous, avec leurs indicatifs déjà positionnés le cas échéant. N'écrase jamais ce qui existe déjà sur {jour}.":
    'Recreates on {jour} the needs already built on the day chosen below, along with their call signs already placed, if any. Never overwrites what already exists on {jour}.',
  'Copier depuis': 'Copy from',
  Fermer: 'Close',
  '{n} affecté sur un minimum de {min}': '{n} assigned out of a minimum of {min}',
  '{n} affectés sur un minimum de {min}': '{n} assigned out of a minimum of {min}',
  "Aucun indicatif n'est encore positionné sur ce besoin.": 'No call sign is placed on this need yet.',
  'Pour pourvoir, échanger ou verrouiller une place : étape 5, Affectation.': 'To fill, swap or lock a spot: step 5, Assignment.',
  'Place à pourvoir': 'Open spot',
  'Corrigée à la main : ni les scénarios ni l’algorithme n’y touchent.': 'Set by hand: neither the scenarios nor the algorithm touch it.',
  Verrouillée: 'Locked',
});

/** Couleur posée sur une équipe créée depuis cet écran minimal (pas de
 *  sélecteur de couleur ici — demande d'Antoine du 2026-09-22 : juste de
 *  quoi ne plus être bloqué). Une vraie page de gestion des équipes (V0.2)
 *  laissera la choisir. */
const COULEUR_EQUIPE_PAR_DEFAUT = '#94a3b8';

/** Durée par défaut d'un créneau propre créé au clic sur la frise (même
 *  valeur que l'ancien redécoupage automatique par défaut). */
const DUREE_CRENEAU_PAR_DEFAUT_SECONDES = 90 * 60;

export function montrerGrille(container, m) {
  let equipeFiltre = 'toutes';
  let dernierMessage = null;

  function rafraichir() {
    const ix = indexer(m);
    // Le jour affiché vient du filtre global par macro-créneau
    // (`Magasin.macroCreneauSelectionne`, monté par `app.js` au-dessus de
    // cette vue) — plus une sélection propre à cet écran depuis le
    // 2026-09-23 (demande d'Antoine : « un filtre macro qui va servir pour
    // tout »). Retombe sur le premier jour si rien n'est encore sélectionné
    // ou si la sélection ne correspond plus à aucun macro-créneau existant
    // (cas transitoire : `app.js` corrige la sélection au prochain rendu).
    const jours = regrouperParJour(m.macroCreneaux);
    const jour = jours.find((j) => j.macros.some((ma) => ma.id === m.macroCreneauSelectionne)) ?? jours[0];
    const sousCreneaux = jour
      ? m.sousCreneaux.filter((sc) => jour.macros.some((ma) => ma.id === sc.Macro_creneau))
      : [];
    const missions = m.missions
      .filter((mi) => equipeFiltre === 'toutes' || mi.Equipe === equipeFiltre)
      .sort((a, b) => a.Equipe - b.Equipe || a.Nom.localeCompare(b.Nom, 'fr'));

    vider(container);
    container.append(
      h('div', {class: 'agenda__toolbar'},
        h('button', {
          class: 'btn btn--primary btn--sm', type: 'button', onclick: () => ouvrirCreationMission(),
        }, '+ Nouvelle mission'),
        jour && jours.length > 1
          ? h('button', {
            class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => ouvrirCopieDepuisJour(jour, jours),
          }, "Copier les créneaux d'un autre jour…")
          : null,
        h('span', {class: 'view__intro', style: {margin: '0'}},
          "Le référentiel des missions — pas encore où ni quand : ça se joue case par case, ci-dessous."),
      ),
      h('div', {class: 'agenda__toolbar'},
        h('select', {
          class: 'select',
          onchange: (e) => {
            const v = e.target.value;
            equipeFiltre = v === 'toutes' ? 'toutes' : Number(v);
            rafraichir();
          },
        },
          h('option', {value: 'toutes'}, 'Toutes les équipes'),
          ...m.equipes.map((eq) => h(
            'option', {value: String(eq.id), selected: equipeFiltre === eq.id}, eq.Nom,
          )),
        ),
      ),
      !jour
        ? h('p', {class: 'empty'}, 'Aucun sous-créneau ce jour.')
        : construireTimeline(ix, missions, jour, sousCreneaux),
    );
  }

  /** Axe commun du jour affiché : une trame régulière au quart d'heure, de
   *  la première borne à la dernière de ses macro-créneaux (demande
   *  d'Antoine du 2026-09-22, en suite de l'option B — missions décalées ou
   *  en pause — pour qu'une mission puisse se positionner comme elle veut,
   *  pas seulement sur la trame commune à 1h30). L'en-tête se cale sur cet
   *  axe ; chaque sous-créneau, commun ou propre à une mission, s'y
   *  positionne ensuite par colspan plutôt que de répéter une colonne par
   *  sous-créneau — sans quoi une soirée de dix-huit heures à deux heures
   *  ferait trente-deux colonnes identiques. */
  function axeJour(jour) {
    const debut = Math.min(...jour.macros.map((ma) => ma.Debut));
    const fin = Math.max(...jour.macros.map((ma) => ma.Fin));
    return {debut, fin};
  }

  /** Le macro-créneau du jour dans lequel tombe un horodatage, pour y
   *  rattacher un nouveau sous-créneau propre à une mission (FK obligatoire).
   *  Un jour n'a le plus souvent qu'un seul macro-créneau ; s'il y en a
   *  plusieurs et qu'aucun ne couvre l'horaire saisi, retombe sur le premier
   *  plutôt que de bloquer sur un choix que rien ne demande encore. */
  function macroPourEpoch(jour, epoch) {
    return jour.macros.find((ma) => epoch >= ma.Debut && epoch < ma.Fin) ?? jour.macros[0];
  }

  /** La frise Missions (demande d'Antoine du 2026-09-22, généralisée le
   *  même jour dans `ui/frise.js` pour que la vue Artistes la réutilise
   *  avec son propre modèle) : une seule trame au quart d'heure, commune à
   *  toutes les missions ; les sous-créneaux de chaque mission (communs ou
   *  propres, §6.2) sont ses blocs, et son geste de glisser est branché sur
   *  `Magasin.deplacerCreneauxMission`/`redimensionnerCreneauMission` — le
   *  regroupement « toute la suite qui suit » reste une affaire du Magasin,
   *  pas de la frise générique. */
  function construireTimeline(ix, missions, jour, tousSousCreneaux) {
    const axe = axeJour(jour);
    const lignes = missions.map((mission) => {
      const lieu = ix.lieu.get(mission.Lieu);
      // Même défaut que `rosterCard` dans `views/affectation.js`, corrigé
      // le 2026-09-23 (équipe orpheline) : `equipe` peut être absente.
      const equipe = ix.equipe.get(mission.Equipe);
      const applicables = sousCreneauxApplicables(mission, tousSousCreneaux);
      const blocs = applicables.map((sc) => {
        const besoin = m.besoins.find((b) => b.Mission === mission.id && b.Sous_creneau === sc.id) ?? null;
        return {
          // Glissable même commun (retour d'Antoine du 2026-09-23) :
          // `Magasin.deplacerCreneauxMission`/`redimensionnerCreneauMission`
          // le rend propre à cette mission avant de le déplacer, sans jamais
          // toucher les autres missions qui le partagent encore.
          id: sc.id, debut: sc.Debut, fin: sc.Fin, deplacable: true,
          sc, mission, besoin, couverture: besoin ? couvertureBesoin(m, ix, besoin.id) : null,
        };
      });
      return {
        id: mission.id,
        libelle: h('span', null,
          h('span', {class: 'dot', style: {background: equipe?.Couleur ?? 'var(--text-faint)', marginRight: '6px'}}),
          h('span', {class: 'nom'}, mission.Nom),
          h('span', {class: 'lieu'}, lieu?.Nom ?? ''),
          // Un découpage automatique tapisse le jour de communs bord à bord
          // (repéré à l'écran le 2026-09-23, en écho au retour d'Antoine
          // « je ne vois pas la fonctionnalité de glisser/redimensionner » :
          // sans le moindre quart d'heure vide, la piste n'a nulle part où
          // recevoir un clic pour un créneau EN PLUS de la trame commune.
          // Glisser un bloc existant (`deplacable: true` ci-dessus) le rend
          // désormais propre au passage si besoin, mais ça ne crée jamais de
          // quart d'heure supplémentaire : ce bouton reste le seul chemin
          // vers un créneau qui déborde la trame commune, tiling complet ou
          // non.
          h('button', {
            class: 'btn btn--ghost btn--sm timeline__label__bouton-propre', type: 'button',
            title: 'Donner à cette mission un créneau à elle, décalé ou en pause par rapport à la trame commune',
            onclick: () => ouvrirCreationCreneauMission(mission, jour, axe.debut),
          }, '+ créneau'),
        ),
        blocs,
      };
    });

    return construireFrise(lignes, {
      axeDebut: axe.debut,
      axeFin: axe.fin,
      titrePiste: 'Cliquer pour donner à cette mission un créneau à elle, décalé ou en pause par rapport à la trame commune',
      // Seuls les modificateurs de couleur (besoin--*/besoin-cell--vide) sont
      // repris de la vue Indicatifs, jamais la classe de base `.besoin` :
      // elle pose une bordure sur les quatre côtés qui écraserait le
      // border-bottom seul voulu ici (case de frise, pas case de tableau).
      classesBloc: (bloc) => (bloc.couverture ? `besoin--${bloc.couverture.statut}` : 'besoin-cell--vide'),
      titreBloc: (bloc) => (
        bloc.besoin ? undefined : 'Créer un besoin ici — facultatif, laissez vide pour une zone volontairement non couverte'
      ),
      rendreBloc: (bloc) => [
        h('span', {class: 'besoin-cell__libelle'}, bloc.sc.Libelle),
        bloc.couverture
          ? h('span', {class: 'besoin__effectif mono'}, `${bloc.couverture.pourvues}/${bloc.besoin.Effectif_min}`)
          : h('span', {class: 'besoin-cell__ajouter-icone'}, '+'),
        bloc.couverture ? h('div', {class: 'besoin__groupes'}, ...bloc.couverture.groupesPositionnes.map((g) => {
          const incomplet = g.places.some((p) => p.Benevole == null);
          return h('span', {
            class: `chip-groupe${incomplet ? ' chip-groupe--incomplet' : ''}`,
            style: {background: ix.equipe.get(g.groupe.Equipe)?.Couleur ?? '#888'},
          }, g.groupe.Code);
        })) : null,
      ],
      onClicBloc: (bloc) => {
        dernierMessage = null;
        if (bloc.besoin) { ouvrirDetailBesoin(bloc.besoin.id); } else { ouvrirCreationBesoin(bloc.mission, bloc.sc); }
      },
      onClicPiste: (ligne, debutSuggere) => {
        const mission = ix.mission.get(ligne.id);
        ouvrirCreationCreneauMission(mission, jour, debutSuggere);
      },
      onDeplacer: (bloc, deltaSecondes) => m.deplacerCreneauxMission(bloc.id, bloc.mission.id, deltaSecondes),
      onRedimensionner: (bloc, depuisDebut, deltaSecondes) => (
        m.redimensionnerCreneauMission(bloc.id, bloc.mission.id, depuisDebut, deltaSecondes)
      ),
      surErreur: (raison) => { dernierMessage = {texte: raison, ton: 'danger'}; rafraichir(); },
    });
  }

  /** Crée une mission dans le référentiel — le "quoi" (nom, équipe, lieu,
   *  priorité), pas encore le "où/quand" : ça, c'est `ouvrirCreationBesoin`,
   *  sur une case de la grille. En mode connecté, `m.creerMission` écrit
   *  réellement dans le document Grist et attend l'id qu'il attribue avant
   *  de fermer la fenêtre — pas de fermeture optimiste, pour ne jamais
   *  laisser croire qu'une mission est créée si l'écriture a échoué.
   *
   *  Sur un document sans aucune équipe (premier jour, demande d'Antoine du
   *  2026-09-22) : pas de blocage vers la table Grist ni de page de gestion
   *  — un champ nomme l'équipe à créer, créée juste avant la mission qui
   *  l'utilise. `equipeCreeId` retient l'id réel une fois obtenu pour qu'un
   *  nouvel essai après un échec de la mission ne recrée pas l'équipe. */
  function ouvrirCreationMission() {
    const champNom = h('input', {class: 'input', type: 'text', placeholder: 'Contrôle des bracelets'});
    const pasDEquipe = m.equipes.length === 0;
    const champEquipe = pasDEquipe ? null : h('select', {class: 'select'},
      ...m.equipes.map((eq) => h('option', {value: String(eq.id)}, eq.Nom)),
    );
    const champNouvelleEquipe = pasDEquipe
      ? h('input', {class: 'input', type: 'text', placeholder: 'Bars'})
      : null;
    let equipeCreeId = null;
    const champLieu = h('select', {class: 'select'},
      h('option', {value: ''}, '— aucun —'),
      ...m.lieux.map((l) => h('option', {value: String(l.id)}, l.Nom)),
    );
    const champPriorite = h('select', {class: 'select'},
      h('option', {value: 'Normale', selected: true}, 'Normale'),
      h('option', {value: 'Critique'}, 'Critique'),
      h('option', {value: 'Confort'}, 'Confort'),
    );
    const erreur = creerErreur();

    ouvrirModal('Nouvelle mission', (fermer) => {
      const boutonCreer = h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const nom = champNom.value.trim();
          if (!nom) {
            erreur.afficher('Merci de renseigner un nom.');
            return;
          }
          const nomEquipe = champNouvelleEquipe?.value.trim() ?? '';
          if (champNouvelleEquipe && equipeCreeId == null && !nomEquipe) {
            erreur.afficher("Ce document n'a encore aucune équipe : merci de la nommer.");
            return;
          }
          boutonCreer.setAttribute('disabled', 'true');
          erreur.effacer();
          try {
            if (champNouvelleEquipe && equipeCreeId == null) {
              equipeCreeId = await m.creerEquipe({
                Nom: nomEquipe, Couleur: COULEUR_EQUIPE_PAR_DEFAUT, Notes: '',
              });
            }
            await m.creerMission({
              Nom: nom,
              Description: '',
              Lieu: champLieu.value ? Number(champLieu.value) : 0,
              Equipe: equipeCreeId ?? Number(champEquipe.value),
              Priorite: champPriorite.value,
              Competences_requises: [],
            });
            fermer();
          } catch {
            erreur.afficher("Échec de l'écriture dans le document Grist connecté. Réessayez.");
            boutonCreer.removeAttribute('disabled');
          }
        },
      }, 'Créer');

      return h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
        h('div', {class: 'field'}, h('label', null, 'Nom'), champNom),
        h('div', {class: 'modal__row'},
          h('div', {class: 'field'}, h('label', null, 'Équipe'), champNouvelleEquipe ?? champEquipe),
          h('div', {class: 'field'}, h('label', null, 'Lieu'), champLieu),
        ),
        champNouvelleEquipe && h('p', {class: 'topbar__subtitle'},
          "Ce document n'a encore aucune équipe : elle sera créée avec cette mission."),
        h('div', {class: 'field'}, h('label', null, 'Priorité'), champPriorite),
        erreur.noeud,
        h('div', {class: 'modal__actions'},
          h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
          boutonCreer,
        ),
      );
    });
  }

  /** Crée un besoin sur une case volontairement vide jusque-là (étape 2 du
   *  parcours). Ne rien faire ici — fermer la fenêtre sans valider — est le
   *  geste normal pour une zone qu'on laisse sans couverture : la case
   *  hachurée reste l'état par défaut, ce bouton n'est qu'une offre. */
  function ouvrirCreationBesoin(mission, sc) {
    const champTaille = h('input', {class: 'input', type: 'number', min: '1', value: '2'});
    const champMin = h('input', {class: 'input', type: 'number', min: '1', value: '2'});
    const erreur = creerErreur();

    ouvrirModal(mission.Nom, (fermer) => h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
      h('p', {class: 'topbar__subtitle'}, sc.Libelle),
      h('div', {class: 'modal__row'},
        h('div', {class: 'field'}, h('label', null, 'Taille du binôme'), champTaille),
        h('div', {class: 'field'}, h('label', null, 'Effectif minimum'), champMin),
      ),
      erreur.noeud,
      h('p', {class: 'topbar__subtitle'},
        "Aucun indicatif n'est positionné automatiquement : vous les créerez depuis la vue Indicatifs.",
      ),
      h('div', {class: 'modal__actions'},
        h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => {
            const taille = Number(champTaille.value);
            const min = Number(champMin.value);
            if (!Number.isFinite(taille) || taille < 1 || !Number.isFinite(min) || min < 1) {
              erreur.afficher('Merci de renseigner des effectifs valides (au moins 1).');
              return;
            }
            m.creerBesoin(mission.id, sc.id, {tailleGroupe: Math.round(taille), effectifMin: Math.round(min)});
            fermer();
          },
        }, 'Créer'),
      ),
    ));
  }

  /** Donne à une mission un sous-créneau à elle sur le jour affiché (option
   *  B retenue par Antoine le 2026-09-22 pour les missions dont les
   *  horaires ou les pauses sortent de la trame commune) : dès qu'elle a un
   *  sous-créneau à elle, `sousCreneauxApplicables` l'affiche à la place des
   *  sous-créneaux communs. Ouverte par un clic sur la piste hors cadre de
   *  la frise (2026-09-22, suite du retour d'Antoine) : `debutSuggere`
   *  vient du point cliqué, pré-remplit les champs (durée par défaut
   *  1h30), et reste modifiable avant validation. `epochJourFestivalEtHeure`
   *  calcule les bornes en gardant le jour de festival saisi, pas le jour
   *  civil littéral (même règle que le début/la fin d'un macro-créneau).
   *  Pas de geste de suppression dans cette première version — la vue
   *  Grist native reste le filet de rattrapage pour une ligne mal créée. */
  function ouvrirCreationCreneauMission(mission, jour, debutSuggere) {
    const champDebut = h(
      'input', {class: 'input', type: 'time', step: '900', value: libelleHeure(debutSuggere)},
    );
    const champFin = h('input', {
      class: 'input', type: 'time', step: '900',
      value: libelleHeure(debutSuggere + DUREE_CRENEAU_PAR_DEFAUT_SECONDES),
    });
    const caseApresMinuit = h('input', {type: 'checkbox'});
    const erreur = creerErreur();

    ouvrirModal(`${mission.Nom} — créneau propre`, (fermer) => h(
      'div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
      h('p', {class: 'topbar__subtitle'}, jour.libelle),
      h('div', {class: 'modal__row'},
        h('div', {class: 'field'}, h('label', null, 'Début'), champDebut),
        h('div', {class: 'field'}, h('label', null, 'Fin'), champFin),
      ),
      h('label', {class: 'horaire-apres-minuit'}, caseApresMinuit, 'Se termine après minuit'),
      erreur.noeud,
      h('div', {class: 'modal__actions'},
        h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: async () => {
            const debut = epochJourFestivalEtHeure(jour.cle, champDebut.value);
            const fin = epochJourFestivalEtHeure(jour.cle, champFin.value, caseApresMinuit.checked);
            if (debut == null || fin == null) { erreur.afficher('Merci de renseigner des horaires valides.'); return; }
            if (fin <= debut) { erreur.afficher("L'heure de fin doit être après l'heure de début."); return; }
            erreur.effacer();
            try {
              const macro = macroPourEpoch(jour, debut);
              await m.creerSousCreneauMission(macro.id, mission.id, {libelle: libelleHeurePlage(debut, fin), debut, fin});
              fermer();
            } catch {
              erreur.afficher("Échec de l'écriture dans le document Grist connecté. Réessayez.");
            }
          },
        }, 'Créer'),
      ),
    ));
  }

  /** Reproduit sur `jourCible` les besoins déjà construits sur un autre jour
   *  (demande d'Antoine du 2026-09-23 : « une fois que j'ai créé les
   *  éléments pour un jour, les importer/copier sur un autre »), avec leurs
   *  indicatifs déjà positionnés « le cas échéant ». Un « jour » peut
   *  grouper plusieurs macro-créneaux (`Jour.macros`, très rare en pratique
   *  — le cas courant reste un macro-créneau par jour de festival) : on les
   *  apparie dans l'ordre chronologique et on copie chaque paire via
   *  `Magasin.copierCreneauxJour`, qui fait tout le travail (dédup des
   *  communs, non-régression, indicatifs) pour une seule paire de
   *  macro-créneaux. N'écrase jamais rien côté jour cible — voir le
   *  commentaire de `copierCreneauxJour` dans `store.js`. */
  function ouvrirCopieDepuisJour(jourCible, jours) {
    const autresJours = jours.filter((j) => j.cle !== jourCible.cle);
    const champJour = h('select', {class: 'select'},
      ...autresJours.map((j) => h('option', {value: j.cle}, j.libelle)),
    );
    const erreur = creerErreur();
    let resultatTexte = null;
    const zoneResultat = h('div');
    const rafraichirResultat = () => {
      vider(zoneResultat);
      if (resultatTexte) { zoneResultat.append(h('span', {class: `pill pill--${resultatTexte.ton}`}, resultatTexte.texte)); }
    };

    ouvrirModal("Copier les créneaux d'un autre jour", (fermer) => {
      const boutonCopier = h('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: async () => {
          const jourSource = autresJours.find((j) => j.cle === champJour.value);
          if (!jourSource) { erreur.afficher('Merci de choisir un jour.'); return; }
          erreur.effacer();
          boutonCopier.setAttribute('disabled', 'true');
          const paires = jourSource.macros
            .map((source, i) => [source, jourCible.macros[i]])
            .filter((p) => p[1] != null);
          let sousCreneauxCrees = 0;
          let besoinsCrees = 0;
          let indicatifsRepositionnes = 0;
          for (const [source, cible] of paires) {
            const resultat = await m.copierCreneauxJour(source.id, cible.id);
            if (!resultat.ok) {
              resultatTexte = {texte: resultat.raison, ton: 'danger'};
              rafraichirResultat();
              boutonCopier.removeAttribute('disabled');
              return;
            }
            sousCreneauxCrees += resultat.sousCreneauxCrees;
            besoinsCrees += resultat.besoinsCrees;
            indicatifsRepositionnes += resultat.indicatifsRepositionnes;
          }
          resultatTexte = besoinsCrees === 0
            ? {texte: `Rien à copier depuis ${jourSource.libelle} : tout y était déjà présent sur ${jourCible.libelle}.`, ton: 'ok'}
            : {
              texte: `${besoinsCrees} besoin${besoinsCrees > 1 ? 's' : ''} copié${besoinsCrees > 1 ? 's' : ''} depuis ${jourSource.libelle}`
                + (sousCreneauxCrees > 0 ? ` (${sousCreneauxCrees} créneau${sousCreneauxCrees > 1 ? 'x' : ''} créé${sousCreneauxCrees > 1 ? 's' : ''})` : '')
                + (indicatifsRepositionnes > 0 ? `, ${indicatifsRepositionnes} indicatif${indicatifsRepositionnes > 1 ? 's' : ''} repositionné${indicatifsRepositionnes > 1 ? 's' : ''}` : '')
                + '.',
              ton: 'ok',
            };
          rafraichirResultat();
          boutonCopier.removeAttribute('disabled');
        },
      }, 'Copier');

      return h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
        h('p', {class: 'topbar__subtitle'},
          `Reproduit sur ${jourCible.libelle} les besoins déjà construits sur le jour choisi ci-dessous, avec leurs indicatifs déjà positionnés le cas échéant. N'écrase jamais ce qui existe déjà sur ${jourCible.libelle}.`),
        h('div', {class: 'field'}, h('label', null, 'Copier depuis'), champJour),
        erreur.noeud,
        zoneResultat,
        h('div', {class: 'modal__actions'},
          h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Fermer'),
          boutonCopier,
        ),
      );
    });
  }

  function ouvrirDetailBesoin(besoinId) {
    const ix = indexer(m);
    const besoin = ix.besoin.get(besoinId);
    if (!besoin) { fermerPanneau(); return; }
    const mission = ix.mission.get(besoin.Mission);
    const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau);
    const c = couvertureBesoin(m, ix, besoinId);

    const panneau = h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
      h('div', {class: 'side-panel__head'},
        h('div', null,
          h('h3', null, mission.Nom),
          h('p', {class: 'topbar__subtitle'}, sousCreneau.Libelle),
        ),
        h('button', {class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => fermerPanneau()}, 'Fermer'),
      ),
      dernierMessage ? h('span', {class: `pill pill--${dernierMessage.ton}`}, dernierMessage.texte) : null,
      h('span', {class: `pill pill--${c.statut === 'sous' ? 'danger' : c.statut === 'partiel' ? 'warn' : 'ok'}`},
        `${c.pourvues} affecté${c.pourvues > 1 ? 's' : ''} sur un minimum de ${besoin.Effectif_min}`,
      ),
      c.groupesPositionnes.length === 0
        ? h('p', {class: 'empty'}, "Aucun indicatif n'est encore positionné sur ce besoin.")
        : h('div', null, ...c.groupesPositionnes.map((g) => carteGroupe(g.groupe))),
      h('p', {class: 'view__intro', style: {margin: '0'}}, 'Pour pourvoir, échanger ou verrouiller une place : étape 5, Affectation.'),
    );
    ouvrirPanneau(panneau);
  }

  function carteGroupe(groupe) {
    const ix = indexer(m);
    const places = m.places.filter((p) => p.Groupe === groupe.id).sort((a, b) => a.Rang - b.Rang);
    // Même défaut que `rosterCard` dans `views/affectation.js`, corrigé
    // le 2026-09-23 (équipe orpheline) : `equipe` peut être absente.
    const equipe = ix.equipe.get(groupe.Equipe);
    return h('div', {class: 'card', style: {marginBottom: '10px'}},
      h('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}},
        h('span', {class: 'mono', style: {fontWeight: '700'}}, groupe.Code),
        h('span', {class: 'pill pill--neutral'}, equipe?.Nom ?? '?'),
      ),
      ...places.map((place) => ligneMembre(ix, place)),
    );
  }

  /** Une place, en lecture seule : qui la tient, et si elle est verrouillée. */
  function ligneMembre(ix, place) {
    const benevole = place.Benevole != null ? ix.benevole.get(place.Benevole) : null;
    return h('div', {class: `membre${place.Verrouillee ? ' membre--verrouillee' : ''}`},
      h('span', {class: 'rang mono'}, `#${place.Rang}`),
      benevole
        ? h('span', {style: {flex: '1'}}, benevole.Nom)
        : h('span', {style: {flex: '1', color: 'var(--text-faint)'}}, 'Place à pourvoir'),
      place.Verrouillee
        ? h('span', {class: 'pill pill--neutral', title: 'Corrigée à la main : ni les scénarios ni l’algorithme n’y touchent.'}, icone(ICONES.cadenas, 'icone-texte'), ' Verrouillée')
        : null,
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
