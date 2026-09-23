/**
 * Vue « missions × sous-créneaux » : qui est où pour un jour donné (§8.2 du
 * cahier des charges — la vue des cheffes d'équipe). Cliquer une case ouvre
 * le détail du besoin et, pour chaque place vide, un classement de
 * candidats à affecter.
 */

import type {Besoin, Epoch, Groupe, Id, MacroCreneau, Mission, Place, SousCreneau} from '../domain/types';
import {TYPE_PLACE_DRAG} from '../logic/dnd-types';
import {
  type Candidat, type Couverture, type Index, type Jour,
  couvertureBesoin, indexer, regrouperParJour, sousCreneauxApplicables,
} from '../logic/derive';
import {apercuEchange, verifierDepot} from '../logic/glisser-deposer';
import {classerCandidats} from '../moteur/adaptateur-magasin';
import type {Magasin} from '../store';
import {epochJourFestivalEtHeure, libelleHeure, libelleHeurePlage} from '../temps';
import {fermerPanneau, h, icone, ICONES, ouvrirModal, ouvrirPanneau, vider} from '../ui/dom';
import {type BlocFrise, construireFrise} from '../ui/frise';
import {creerErreur} from '../ui/modalCreneau';

/** Couleur posée sur une équipe créée depuis cet écran minimal (pas de
 *  sélecteur de couleur ici — demande d'Antoine du 2026-09-22 : juste de
 *  quoi ne plus être bloqué). Une vraie page de gestion des équipes (V0.2)
 *  laissera la choisir. */
const COULEUR_EQUIPE_PAR_DEFAUT = '#94a3b8';

/** Durée par défaut d'un créneau propre créé au clic sur la frise (même
 *  valeur que l'ancien redécoupage automatique par défaut). */
const DUREE_CRENEAU_PAR_DEFAUT_SECONDES = 90 * 60;

export function montrerGrille(container: HTMLElement, m: Magasin): () => void {
  let equipeFiltre: Id | 'toutes' = 'toutes';
  let dernierMessage: {texte: string; ton: 'ok' | 'danger'} | null = null;

  function rafraichir(): void {
    const ix = indexer(m);
    // Le jour affiché vient du filtre global par macro-créneau
    // (`Magasin.macroCreneauSelectionne`, monté par `app.ts` au-dessus de
    // cette vue) — plus une sélection propre à cet écran depuis le
    // 2026-09-23 (demande d'Antoine : « un filtre macro qui va servir pour
    // tout »). Retombe sur le premier jour si rien n'est encore sélectionné
    // ou si la sélection ne correspond plus à aucun macro-créneau existant
    // (cas transitoire : `app.ts` corrige la sélection au prochain rendu).
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
        h('span', {class: 'view__intro', style: {margin: '0'}},
          "Le référentiel des missions — pas encore où ni quand : ça se joue case par case, ci-dessous."),
      ),
      h('div', {class: 'agenda__toolbar'},
        h('select', {
          class: 'select',
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
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
  function axeJour(jour: Jour): {debut: number; fin: number} {
    const debut = Math.min(...jour.macros.map((ma) => ma.Debut));
    const fin = Math.max(...jour.macros.map((ma) => ma.Fin));
    return {debut, fin};
  }

  /** Le macro-créneau du jour dans lequel tombe un horodatage, pour y
   *  rattacher un nouveau sous-créneau propre à une mission (FK obligatoire).
   *  Un jour n'a le plus souvent qu'un seul macro-créneau ; s'il y en a
   *  plusieurs et qu'aucun ne couvre l'horaire saisi, retombe sur le premier
   *  plutôt que de bloquer sur un choix que rien ne demande encore. */
  function macroPourEpoch(jour: Jour, epoch: number): MacroCreneau {
    return jour.macros.find((ma) => epoch >= ma.Debut && epoch < ma.Fin) ?? jour.macros[0]!;
  }

  /** Un bloc de la frise Missions : un sous-créneau applicable (commun ou
   *  propre), avec la mission et le besoin qu'il porte éventuellement déjà
   *  résolus — pour que le rendu et le clic n'aient plus besoin de
   *  chercher dans le magasin à chaque fois. */
  interface BlocMission extends BlocFrise {
    readonly sc: SousCreneau;
    readonly mission: Mission;
    readonly besoin: Besoin | null;
    readonly couverture: Couverture | null;
  }

  /** La frise Missions (demande d'Antoine du 2026-09-22, généralisée le
   *  même jour dans `ui/frise.ts` pour que la vue Artistes la réutilise
   *  avec son propre modèle) : une seule trame au quart d'heure, commune à
   *  toutes les missions ; les sous-créneaux de chaque mission (communs ou
   *  propres, §6.2) sont ses blocs, et son geste de glisser est branché sur
   *  `Magasin.deplacerCreneauxMission`/`redimensionnerCreneauMission` — le
   *  regroupement « toute la suite qui suit » reste une affaire du Magasin,
   *  pas de la frise générique. */
  function construireTimeline(ix: Index, missions: Mission[], jour: Jour, tousSousCreneaux: SousCreneau[]): Node {
    const axe = axeJour(jour);
    const lignes = missions.map((mission) => {
      const lieu = ix.lieu.get(mission.Lieu);
      const equipe = ix.equipe.get(mission.Equipe)!;
      const applicables = sousCreneauxApplicables(mission, tousSousCreneaux);
      const blocs: BlocMission[] = applicables.map((sc) => {
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
          h('span', {class: 'dot', style: {background: equipe.Couleur, marginRight: '6px'}}),
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
          ? h('span', {class: 'besoin__effectif mono'}, `${bloc.couverture.pourvues}/${bloc.besoin!.Effectif_min}`)
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
        const mission = ix.mission.get(ligne.id)!;
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
  function ouvrirCreationMission(): void {
    const champNom = h('input', {class: 'input', type: 'text', placeholder: 'Contrôle des bracelets'}) as HTMLInputElement;
    const pasDEquipe = m.equipes.length === 0;
    const champEquipe = pasDEquipe ? null : h('select', {class: 'select'},
      ...m.equipes.map((eq) => h('option', {value: String(eq.id)}, eq.Nom)),
    ) as HTMLSelectElement;
    const champNouvelleEquipe = pasDEquipe
      ? h('input', {class: 'input', type: 'text', placeholder: 'Bars'}) as HTMLInputElement
      : null;
    let equipeCreeId: Id | null = null;
    const champLieu = h('select', {class: 'select'},
      h('option', {value: ''}, '— aucun —'),
      ...m.lieux.map((l) => h('option', {value: String(l.id)}, l.Nom)),
    ) as HTMLSelectElement;
    const champPriorite = h('select', {class: 'select'},
      h('option', {value: 'Normale', selected: true}, 'Normale'),
      h('option', {value: 'Critique'}, 'Critique'),
      h('option', {value: 'Confort'}, 'Confort'),
    ) as HTMLSelectElement;
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
              Equipe: equipeCreeId ?? Number(champEquipe!.value),
              Priorite: champPriorite.value as Mission['Priorite'],
              Competences_requises: [],
            });
            fermer();
          } catch {
            erreur.afficher("Échec de l'écriture dans le document Grist connecté. Réessayez.");
            boutonCreer.removeAttribute('disabled');
          }
        },
      }, 'Créer') as HTMLButtonElement;

      return h('div', {style: {display: 'flex', flexDirection: 'column', gap: '14px'}},
        h('div', {class: 'field'}, h('label', null, 'Nom'), champNom),
        h('div', {class: 'modal__row'},
          h('div', {class: 'field'}, h('label', null, 'Équipe'), champNouvelleEquipe ?? champEquipe!),
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
  function ouvrirCreationBesoin(mission: Mission, sc: SousCreneau): void {
    const champTaille = h('input', {class: 'input', type: 'number', min: '1', value: '2'}) as HTMLInputElement;
    const champMin = h('input', {class: 'input', type: 'number', min: '1', value: '2'}) as HTMLInputElement;
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
  function ouvrirCreationCreneauMission(mission: Mission, jour: Jour, debutSuggere: Epoch): void {
    const champDebut = h(
      'input', {class: 'input', type: 'time', step: '900', value: libelleHeure(debutSuggere)},
    ) as HTMLInputElement;
    const champFin = h('input', {
      class: 'input', type: 'time', step: '900',
      value: libelleHeure(debutSuggere + DUREE_CRENEAU_PAR_DEFAUT_SECONDES),
    }) as HTMLInputElement;
    const caseApresMinuit = h('input', {type: 'checkbox'}) as HTMLInputElement;
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

  function ouvrirDetailBesoin(besoinId: Id): void {
    const ix = indexer(m);
    const besoin = ix.besoin.get(besoinId);
    if (!besoin) { fermerPanneau(); return; }
    const mission = ix.mission.get(besoin.Mission)!;
    const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau)!;
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
        : h('div', null, ...c.groupesPositionnes.map((g) => carteGroupe(besoinId, g.groupe))),
    );
    ouvrirPanneau(panneau);
  }

  function carteGroupe(besoinId: Id, groupe: Groupe): Node {
    const ix = indexer(m);
    const places = m.places.filter((p) => p.Groupe === groupe.id).sort((a, b) => a.Rang - b.Rang);
    const equipe = ix.equipe.get(groupe.Equipe)!;
    return h('div', {class: 'card', style: {marginBottom: '10px'}},
      h('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}},
        h('span', {class: 'mono', style: {fontWeight: '700'}}, groupe.Code),
        h('span', {class: 'pill pill--neutral'}, equipe.Nom),
      ),
      ...places.map((place) => ligneMembre(besoinId, place)),
    );
  }

  /** Échange (ou déplace, si l'une des deux places est vide) les occupants
   *  de deux places — le même geste que la vue Affectation manuelle
   *  (`views/affectation.ts`), disponible ici aussi (§7.5 : le parcours
   *  d'affectation vaut où qu'il s'affiche, y compris dans cette grille). */
  async function deposerEchange(besoinId: Id, placeSourceId: Id, placeCibleId: Id): Promise<void> {
    const source = m.places.find((p) => p.id === placeSourceId);
    const cible = m.places.find((p) => p.id === placeCibleId);
    if (!source || !cible || source.Benevole == null) { return; }
    if (source.Verrouillee || cible.Verrouillee) {
      dernierMessage = {texte: 'Place verrouillée : déverrouillez-la avant de la modifier.', ton: 'danger'};
      ouvrirDetailBesoin(besoinId);
      return;
    }
    if (source.Benevole != null) {
      const verdict = verifierDepot(m, source.Benevole, placeCibleId, [placeSourceId]);
      if (!verdict.ok) { dernierMessage = {texte: verdict.motif, ton: 'danger'}; ouvrirDetailBesoin(besoinId); return; }
    }
    if (cible.Benevole != null) {
      const verdict = verifierDepot(m, cible.Benevole, placeSourceId, [placeCibleId]);
      if (!verdict.ok) { dernierMessage = {texte: verdict.motif, ton: 'danger'}; ouvrirDetailBesoin(besoinId); return; }
    }

    const diff = apercuEchange(m, placeSourceId, placeCibleId);
    const benevoleSource = source.Benevole;
    const benevoleCible = cible.Benevole;
    const resultat1 = await m.assignerPlace(placeSourceId, benevoleCible, 'Manuel');
    if (!resultat1.ok) { dernierMessage = {texte: resultat1.raison, ton: 'danger'}; ouvrirDetailBesoin(besoinId); return; }
    const resultat2 = await m.assignerPlace(placeCibleId, benevoleSource, 'Manuel');
    if (!resultat2.ok) { dernierMessage = {texte: resultat2.raison, ton: 'danger'}; ouvrirDetailBesoin(besoinId); return; }
    const base = benevoleCible != null ? 'Échange effectué.' : 'Déplacé.';
    dernierMessage = diff.creees.length > 0
      ? {texte: `${base} ${diff.creees.length} anomalie${diff.creees.length > 1 ? 's' : ''} créée${diff.creees.length > 1 ? 's' : ''}.`, ton: 'danger'}
      : {texte: base, ton: 'ok'};
    ouvrirDetailBesoin(besoinId);
  }

  function ligneMembre(besoinId: Id, place: Place): Node {
    const ix = indexer(m);
    const benevole = place.Benevole != null ? ix.benevole.get(place.Benevole) : null;
    const refuserVerrouillage = (): void => {
      dernierMessage = {texte: 'Place verrouillée : déverrouillez-la avant de la modifier.', ton: 'danger'};
      ouvrirDetailBesoin(besoinId);
    };
    const ligne: HTMLElement = h('div', {
      class: `membre${place.Verrouillee ? ' membre--verrouillee' : ''}`,
      draggable: benevole && !place.Verrouillee ? 'true' : 'false',
      ondragstart: benevole ? (e: Event) => {
        const dt = (e as DragEvent).dataTransfer;
        dt?.setData(TYPE_PLACE_DRAG, String(place.id));
        if (dt) { dt.effectAllowed = 'move'; }
      } : undefined,
      ondragover: (e: Event) => {
        const de = e as DragEvent;
        if (!(de.dataTransfer?.types ?? []).includes(TYPE_PLACE_DRAG)) { return; }
        de.preventDefault();
        ligne.style.background = 'var(--brand-tint)';
      },
      ondragleave: () => { ligne.style.background = ''; },
      ondrop: (e: Event) => {
        const de = e as DragEvent;
        de.preventDefault();
        ligne.style.background = '';
        const placeRaw = de.dataTransfer?.getData(TYPE_PLACE_DRAG);
        if (placeRaw && Number(placeRaw) !== place.id) { deposerEchange(besoinId, Number(placeRaw), place.id); }
      },
    },
      h('span', {class: 'rang mono'}, `#${place.Rang}`),
      benevole
        ? h('span', {style: {flex: '1'}}, benevole.Nom)
        : h('span', {style: {flex: '1', color: 'var(--text-faint)'}}, 'Place non pourvue — glissez un occupant ici, ou :'),
      place.Verrouillee
        ? h('span', {class: 'pill pill--neutral'}, icone(ICONES.cadenas), 'Verrouillée')
        : null,
      h('button', {
        class: 'btn btn--ghost btn--sm', type: 'button',
        title: place.Verrouillee ? 'Déverrouiller cette place' : 'Verrouiller cette place',
        onclick: () => { void (async () => {
          const resultat = await m.basculerVerrouillage(place.id);
          if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; }
          ouvrirDetailBesoin(besoinId);
        })(); },
      }, icone(ICONES.cadenas)),
      benevole
        ? h('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          onclick: () => { void (async () => {
            if (place.Verrouillee) { refuserVerrouillage(); return; }
            const resultat = await m.assignerPlace(place.id, null);
            if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; }
            ouvrirDetailBesoin(besoinId);
          })(); },
        }, 'Vider')
        : h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => {
            if (place.Verrouillee) { refuserVerrouillage(); return; }
            ouvrirChoixCandidat(besoinId, place);
          },
        }, 'Affecter…'),
    );
    return ligne;
  }

  function ouvrirChoixCandidat(besoinId: Id, place: Place): void {
    const ix = indexer(m);
    const groupe = ix.groupe.get(place.Groupe)!;
    const candidats = classerCandidats(m, ix, groupe.id);
    const panneau = h('div', {style: {display: 'flex', flexDirection: 'column', gap: '12px'}},
      h('div', {class: 'side-panel__head'},
        h('div', null,
          h('h3', null, `Place #${place.Rang} — ${groupe.Code}`),
          h('p', {class: 'topbar__subtitle'}, 'Vaut pour tous les créneaux de cet indicatif.'),
        ),
        h('button', {class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => ouvrirDetailBesoin(besoinId)}, '← Retour'),
      ),
      candidats.length === 0
        ? h('p', {class: 'empty'}, 'Aucun candidat ne satisfait les contraintes dures pour cet indicatif.')
        : h('div', {style: {display: 'flex', flexDirection: 'column', gap: '8px'}},
          ...candidats.map((c) => carteCandidat(c, () => { void (async () => {
            const resultat = await m.assignerPlace(place.id, c.benevoleId, 'Manuel');
            if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; ouvrirDetailBesoin(besoinId); return; }
            fermerPanneau();
          })(); })),
        ),
    );
    ouvrirPanneau(panneau);
  }

  function carteCandidat(c: Candidat, retenir: () => void): Node {
    return h('div', {class: 'candidat'},
      h('div', {class: 'candidat__head'},
        h('span', {class: 'candidat__nom'}, c.nom),
        h('span', {class: 'candidat__score mono'}, c.score.toFixed(2)),
      ),
      h('div', {class: 'candidat__raisons'}, ...c.tags.map((t) => h(
        'span', {class: `tag tag--${t.sens}`}, t.texte,
      ))),
      h('button', {class: 'btn btn--primary btn--sm', type: 'button', onclick: retenir}, 'Retenir'),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
