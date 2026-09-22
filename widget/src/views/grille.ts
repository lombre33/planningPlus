/**
 * Vue « missions × sous-créneaux » : qui est où pour un jour donné (§8.2 du
 * cahier des charges — la vue des cheffes d'équipe). Cliquer une case ouvre
 * le détail du besoin et, pour chaque place vide, un classement de
 * candidats à affecter.
 */

import type {Groupe, Id, MacroCreneau, Mission, Place, SousCreneau} from '../domain/types';
import {TYPE_PLACE_DRAG} from '../logic/dnd-types';
import {
  type Candidat, type Index, type Jour, couvertureBesoin, indexer, regrouperParJour,
} from '../logic/derive';
import {apercuEchange, verifierDepot} from '../logic/glisser-deposer';
import {classerCandidats} from '../moteur/adaptateur-magasin';
import type {Magasin} from '../store';
import {epochJourFestivalEtHeure, libelleHeure, libelleHeurePlage, PAS_SECONDES} from '../temps';
import {fermerPanneau, h, icone, ICONES, ouvrirModal, ouvrirPanneau, vider} from '../ui/dom';
import {creerErreur} from '../ui/modalCreneau';

/** Couleur posée sur une équipe créée depuis cet écran minimal (pas de
 *  sélecteur de couleur ici — demande d'Antoine du 2026-09-22 : juste de
 *  quoi ne plus être bloqué). Une vraie page de gestion des équipes (V0.2)
 *  laissera la choisir. */
const COULEUR_EQUIPE_PAR_DEFAUT = '#94a3b8';

export function montrerGrille(container: HTMLElement, m: Magasin): () => void {
  let jourIndex = 0;
  let equipeFiltre: Id | 'toutes' = 'toutes';
  let dernierMessage: {texte: string; ton: 'ok' | 'danger'} | null = null;

  function rafraichir(): void {
    const ix = indexer(m);
    const jours = regrouperParJour(m.macroCreneaux);
    jourIndex = Math.min(jourIndex, Math.max(jours.length - 1, 0));
    const jour = jours[jourIndex];
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
        ...jours.map((j, i) => h('button', {
          class: `btn btn--sm${i === jourIndex ? ' btn--primary' : ''}`, type: 'button',
          onclick: () => { jourIndex = i; rafraichir(); },
        }, j.libelle.split(' ').slice(0, 1).join(' '))),
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
        : construireTable(ix, missions, jour, sousCreneaux),
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
  function axeJour(jour: Jour): {debut: number; fin: number; nbColonnes: number} {
    const debut = Math.min(...jour.macros.map((ma) => ma.Debut));
    const fin = Math.max(...jour.macros.map((ma) => ma.Fin));
    return {debut, fin, nbColonnes: Math.max(1, Math.round((fin - debut) / PAS_SECONDES))};
  }

  /** Sous-créneaux qu'une mission voit sur le jour affiché (§6.2 du cahier
   *  des charges, « communs, avec exceptions ») : dès qu'elle a au moins un
   *  sous-créneau à elle, ceux-ci remplacent entièrement les sous-créneaux
   *  communs pour elle — jamais un mélange des deux. */
  function sousCreneauxApplicables(mission: Mission, tousSousCreneaux: SousCreneau[]): SousCreneau[] {
    const propres = tousSousCreneaux.filter((sc) => sc.Mission === mission.id);
    const base = propres.length > 0 ? propres : tousSousCreneaux.filter((sc) => sc.Mission === null);
    return base.slice().sort((a, b) => a.Debut - b.Debut);
  }

  /** Le macro-créneau du jour dans lequel tombe un horodatage, pour y
   *  rattacher un nouveau sous-créneau propre à une mission (FK obligatoire).
   *  Un jour n'a le plus souvent qu'un seul macro-créneau ; s'il y en a
   *  plusieurs et qu'aucun ne couvre l'horaire saisi, retombe sur le premier
   *  plutôt que de bloquer sur un choix que rien ne demande encore. */
  function macroPourEpoch(jour: Jour, epoch: number): MacroCreneau {
    return jour.macros.find((ma) => epoch >= ma.Debut && epoch < ma.Fin) ?? jour.macros[0]!;
  }

  function celluleHorsCadre(nbColonnes: number): Node {
    return h('td', {class: 'besoin-cell besoin-cell--horscadre', colspan: String(nbColonnes)});
  }

  function celluleBesoin(ix: Index, mission: Mission, sc: SousCreneau, nbColonnes: number): Node {
    const colspan = String(nbColonnes);
    const besoin = m.besoins.find((b) => b.Mission === mission.id && b.Sous_creneau === sc.id);
    if (!besoin) {
      return h('td', {class: 'besoin-cell besoin-cell--vide', colspan},
        h('span', {class: 'besoin-cell__libelle'}, sc.Libelle),
        h('button', {
          class: 'besoin-cell__ajouter', type: 'button',
          title: 'Créer un besoin ici — facultatif, laissez vide pour une zone volontairement non couverte',
          onclick: () => ouvrirCreationBesoin(mission, sc),
        }, '+'),
      );
    }
    const c = couvertureBesoin(m, ix, besoin.id);
    return h('td', {class: 'besoin-cell', colspan},
      h('span', {class: 'besoin-cell__libelle'}, sc.Libelle),
      h('button', {
        class: `besoin besoin--${c.statut}`, type: 'button',
        onclick: () => { dernierMessage = null; ouvrirDetailBesoin(besoin.id); },
      },
        h('span', {class: 'besoin__effectif mono'}, `${c.pourvues}/${besoin.Effectif_min}`),
        h('div', {class: 'besoin__groupes'}, ...c.groupesPositionnes.map((g) => {
          const incomplet = g.places.some((p) => p.Benevole == null);
          return h('span', {
            class: `chip-groupe${incomplet ? ' chip-groupe--incomplet' : ''}`,
            style: {background: ix.equipe.get(g.groupe.Equipe)?.Couleur ?? '#888'},
          }, g.groupe.Code);
        })),
      ),
    );
  }

  /** Cellules d'une ligne mission, alignées sur l'axe commun : un bloc par
   *  sous-créneau applicable (colspan = sa durée en quarts d'heure), et une
   *  case neutre — hors cadre, pas « volontairement vide » puisqu'aucun
   *  sous-créneau n'existe ici pour cette mission — sur le reste de l'axe. */
  function construireCellulesLigne(
    ix: Index, mission: Mission, axe: {debut: number; fin: number}, applicables: SousCreneau[],
  ): Node[] {
    const cellules: Node[] = [];
    let curseur = axe.debut;
    for (const sc of applicables) {
      const debutSc = Math.max(sc.Debut, curseur);
      if (debutSc > curseur) { cellules.push(celluleHorsCadre(Math.round((debutSc - curseur) / PAS_SECONDES))); }
      const finSc = Math.max(sc.Fin, debutSc);
      cellules.push(celluleBesoin(ix, mission, sc, Math.max(1, Math.round((finSc - debutSc) / PAS_SECONDES))));
      curseur = finSc;
    }
    if (curseur < axe.fin) { cellules.push(celluleHorsCadre(Math.round((axe.fin - curseur) / PAS_SECONDES))); }
    return cellules;
  }

  function construireTable(ix: Index, missions: Mission[], jour: Jour, tousSousCreneaux: SousCreneau[]): Node {
    const axe = axeJour(jour);
    const colonnesEntete: Node[] = [];
    for (let i = 0; i < axe.nbColonnes; i++) {
      const texte = libelleHeure(axe.debut + i * PAS_SECONDES);
      const surLHeure = texte.endsWith(':00');
      colonnesEntete.push(h(
        'th', {class: `axe-quart${surLHeure ? ' axe-quart--heure' : ''}`}, surLHeure ? texte : '',
      ));
    }
    const thead = h('thead', null, h('tr', null, h('th', {class: 'mission-cell'}, 'Mission'), ...colonnesEntete));

    const tbody = h('tbody');
    for (const mission of missions) {
      const lieu = ix.lieu.get(mission.Lieu);
      const equipe = ix.equipe.get(mission.Equipe)!;
      const applicables = sousCreneauxApplicables(mission, tousSousCreneaux);
      const tr = h('tr', null,
        h('td', {class: 'mission-cell'},
          h('span', {class: 'dot', style: {background: equipe.Couleur, marginRight: '6px'}}),
          h('span', {class: 'nom'}, mission.Nom),
          h('span', {class: 'lieu'}, lieu?.Nom ?? ''),
          h('button', {
            class: 'mission-cell__creneau-propre', type: 'button',
            title: 'Donner à cette mission un créneau à elle, décalé ou en pause par rapport à la trame commune',
            onclick: () => ouvrirCreationCreneauMission(mission, jour),
          }, '+ créneau'),
        ),
        ...construireCellulesLigne(ix, mission, axe, applicables),
      );
      tbody.append(tr);
    }
    const table = h('table', {class: 'grille'}, thead, tbody);
    return h('div', {class: 'grille-wrap'}, table);
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
   *  sous-créneaux communs. `epochJourFestivalEtHeure` calcule les bornes en
   *  gardant le jour de festival saisi, pas le jour civil littéral (même
   *  règle que le début/la fin d'un macro-créneau). Pas de geste de
   *  suppression ou d'édition dans cette première version — la vue Grist
   *  native reste le filet de rattrapage pour une ligne mal créée. */
  function ouvrirCreationCreneauMission(mission: Mission, jour: Jour): void {
    const champDebut = h('input', {class: 'input', type: 'time', step: '900', value: '10:00'}) as HTMLInputElement;
    const champFin = h('input', {class: 'input', type: 'time', step: '900', value: '11:30'}) as HTMLInputElement;
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
  function deposerEchange(besoinId: Id, placeSourceId: Id, placeCibleId: Id): void {
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
    m.assignerPlace(placeSourceId, benevoleCible, 'Manuel');
    m.assignerPlace(placeCibleId, benevoleSource, 'Manuel');
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
        onclick: () => { m.basculerVerrouillage(place.id); ouvrirDetailBesoin(besoinId); },
      }, icone(ICONES.cadenas)),
      benevole
        ? h('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          onclick: () => {
            if (place.Verrouillee) { refuserVerrouillage(); return; }
            m.assignerPlace(place.id, null);
            ouvrirDetailBesoin(besoinId);
          },
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
          ...candidats.map((c) => carteCandidat(c, () => {
            m.assignerPlace(place.id, c.benevoleId, 'Manuel');
            fermerPanneau();
          })),
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
