/**
 * Vue indicatifs : donne à trancher visuellement le §6.3 du cahier des
 * charges. Reprise de zéro (première version jugée inutilisable par Antoine)
 * — l'ancienne vue montrait un indicatif hors de tout contexte, dans une
 * liste plate puis une rangée de cartes reliées par des flèches. Celle-ci
 * réutilise au contraire la même frise que la vue Missions (`ui/frise.ts`,
 * retour d'Antoine du 2026-09-23 : un tableau à colonnes communes explose
 * dès que plusieurs missions divergent sur des créneaux propres à des
 * bornes différentes — la plupart des colonnes deviennent alors « non
 * applicable » pour la plupart des missions, noyant les binômes réellement
 * positionnés) : chaque ligne de mission montre directement ses propres
 * créneaux, positionnés dans le temps, sans jamais avoir besoin d'aligner
 * ses bornes sur celles d'une autre mission. Sélectionner une puce ouvre le
 * détail (composition, trajectoire) et permet de repositionner une étape
 * (§7.5 point 4) en la glissant vers une autre case, ou par un clic
 * classer/cibler pour l'accessibilité clavier.
 *
 * Ce que cette vue ne fait pas : affecter un·e bénévole à une place, ni
 * déplacer/redimensionner un créneau. C'est le rôle de la vue Missions (et,
 * à terme, de l'outil d'affectation dédié) — ici, une place se lit et se
 * verrouille, mais ne se pourvoit pas ; un créneau se positionne dans le
 * temps, mais n'est jamais glissable depuis cette vue.
 */

import type {Besoin, Epoch, Groupe, Id, Mission, SousCreneau} from '../domain/types';
import {
  type Index, type Jour, couvertureBesoin, indexer, placesDuGroupe, positionsDuGroupe, regrouperParJour,
  sousCreneauxApplicables,
} from '../logic/derive';
import type {Magasin} from '../store';
import {fermerPanneau, h, ouvrirPanneau, vider} from '../ui/dom';
import {type BlocFrise, construireFrise} from '../ui/frise';

type ModeCible = {groupeId: Id; positionId: Id | null; mode: 'deplacer' | 'ajouter'};

export function montrerIndicatifs(container: HTMLElement, m: Magasin): () => void {
  let jourIndex = 0;
  let equipeFiltre: Id | 'toutes' = 'toutes';
  let groupeSelectionne: Id | null = null;
  let modeCible: ModeCible | null = null;
  let dernierMessage: {texte: string; ton: 'ok' | 'danger'} | null = null;

  // État transitoire du glisser-déposer natif (pas dans le magasin : ça ne
  // survit pas à un rafraîchissement, et n'a pas à le faire).
  let groupeDeplace: Id | null = null;
  let besoinOrigineDeplace: Id | null = null;

  /** Écrit vers le magasin (mode connecté : vers Grist, voir `EcritureGrist`)
   *  sans jamais laisser un échec silencieux : la case ou la puce reste
   *  telle quelle et un message rouge apparaît, plutôt que de laisser
   *  croire à un déplacement ou une création qui n'a pas eu lieu. */
  async function ecrire(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      dernierMessage = null;
    } catch {
      dernierMessage = {texte: "Échec de l'écriture dans le document Grist connecté. Réessayez.", ton: 'danger'};
    }
    // `action` notifie déjà les abonnés sur un succès (`Magasin.notifier`),
    // donc ce rafraîchissement peut sembler redondant dans ce cas — mais un
    // échec, lui, interrompt `action` avant tout `notifier`, et c'est ce
    // second cas qui a besoin de ce rafraîchissement explicite pour que le
    // message d'erreur s'affiche.
    rafraichir();
  }

  function rafraichir(): void {
    const ix = indexer(m);
    const jours = regrouperParJour(m.macroCreneaux);
    jourIndex = Math.min(jourIndex, Math.max(jours.length - 1, 0));
    const jour = jours[jourIndex];
    const tousSousCreneaux = jour
      ? m.sousCreneaux.filter((sc) => jour.macros.some((ma) => ma.id === sc.Macro_creneau))
      : [];
    const missions = m.missions
      .filter((mi) => equipeFiltre === 'toutes' || mi.Equipe === equipeFiltre)
      .sort((a, b) => a.Equipe - b.Equipe || a.Nom.localeCompare(b.Nom, 'fr'));

    vider(container);
    container.append(
      h('div', {class: 'indicatifs-layout'},
        barreOutils(jours),
        dernierMessage ? h('span', {class: `pill pill--${dernierMessage.ton}`}, dernierMessage.texte) : null,
        modeCible ? bandeauCible() : null,
        jours.length === 0
          ? h('p', {class: 'empty'}, "Aucun macro-créneau défini pour l'instant. Commencez par l'étape 1 (Agenda), puis définissez des sous-créneaux, avant de positionner des indicatifs ici.")
          : tousSousCreneaux.length === 0
            ? h('p', {class: 'empty'}, 'Aucun sous-créneau ce jour. Définissez-en depuis l’agenda avant de positionner des indicatifs.')
            : missions.length === 0
              ? h('p', {class: 'empty'}, equipeFiltre === 'toutes'
                ? 'Aucune mission définie. Créez vos missions avant de positionner des indicatifs.'
                : 'Aucune mission pour cette équipe. Changez de filtre ou créez-en une.')
              : construireTimelineIndicatifs(ix, missions, jour!, tousSousCreneaux),
      ),
    );

    if (groupeSelectionne != null && ix.groupe.has(groupeSelectionne)) {
      panneauIndicatif(ix, groupeSelectionne);
    } else {
      fermerPanneau();
    }
  }

  /** Axe commun du jour affiché — mêmes bornes que la frise Missions (même
   *  calcul, non exporté de `grille.ts` : trois lignes d'arithmétique, pas
   *  une règle métier susceptible de diverger comme l'était
   *  `sousCreneauxApplicables`). */
  function axeJour(jour: Jour): {debut: Epoch; fin: Epoch} {
    const debut = Math.min(...jour.macros.map((ma) => ma.Debut));
    const fin = Math.max(...jour.macros.map((ma) => ma.Fin));
    return {debut, fin};
  }

  // --- Barre d'outils : jour + équipe (mêmes contrôles que la vue Missions) --

  function barreOutils(jours: ReturnType<typeof regrouperParJour>): Node {
    return h('div', {class: 'agenda__toolbar'},
      ...jours.map((j, i) => h('button', {
        class: `btn btn--sm${i === jourIndex ? ' btn--primary' : ''}`, type: 'button',
        onclick: () => { jourIndex = i; groupeSelectionne = null; modeCible = null; rafraichir(); },
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
        ...m.equipes.map((eq) => h('option', {value: String(eq.id), selected: equipeFiltre === eq.id}, eq.Nom)),
      ),
    );
  }

  function bandeauCible(): Node {
    const mode = modeCible!;
    const groupe = m.groupes.find((g) => g.id === mode.groupeId);
    const texte = mode.mode === 'deplacer'
      ? `Choisissez la case où repositionner ${groupe?.Code ?? ''}.`
      : `Choisissez la case où ajouter une nouvelle position pour ${groupe?.Code ?? ''}.`;
    return h('div', {class: 'mode-bandeau'},
      h('span', null, texte),
      h('button', {class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { modeCible = null; rafraichir(); }}, 'Annuler'),
    );
  }

  // --- Frise : une ligne par mission, ses créneaux positionnés dans le temps

  /** Un bloc de la frise Indicatifs : un sous-créneau applicable à la
   *  mission (commun ou propre, §6.2), avec son besoin éventuel déjà résolu.
   *  Jamais `deplacable` (voir l'en-tête du fichier) : la frise n'attache
   *  alors aucun écouteur de glisser à elle, laissant le champ libre à nos
   *  propres `dragover`/`dragleave`/`drop` posés directement par
   *  `celluleIndicatifs` sur le contenu du bloc — un binôme se glisse
   *  toujours entre besoins, jamais un créneau dans le temps. */
  interface BlocIndicatif extends BlocFrise {
    readonly sc: SousCreneau;
    readonly mission: Mission;
    readonly besoin: Besoin | null;
  }

  function construireTimelineIndicatifs(
    ix: Index, missions: Mission[], jour: Jour, tousSousCreneaux: SousCreneau[],
  ): Node {
    const axe = axeJour(jour);
    const lignes = missions.map((mission) => {
      const lieu = ix.lieu.get(mission.Lieu);
      const equipe = ix.equipe.get(mission.Equipe)!;
      const blocs: BlocIndicatif[] = sousCreneauxApplicables(mission, tousSousCreneaux).map((sc) => {
        const besoin = m.besoins.find((b) => b.Mission === mission.id && b.Sous_creneau === sc.id) ?? null;
        return {
          // Un besoin a un id global unique : réutilisé tel quel, il retrouve
          // le bon bloc dans le DOM sans jamais confondre deux missions qui
          // partagent encore le même commun. Une case sans besoin n'a besoin
          // d'aucune interaction (glisser exclu) : un identifiant synthétique
          // hors de la plage des besoins réels suffit.
          id: besoin ? besoin.id : -(sc.id * 100_000 + mission.id),
          debut: sc.Debut, fin: sc.Fin, deplacable: false,
          sc, mission, besoin,
        };
      });
      return {
        id: mission.id,
        libelle: h('span', null,
          h('span', {class: 'dot', style: {background: equipe.Couleur, marginRight: '6px'}}),
          h('span', {class: 'nom'}, mission.Nom),
          h('span', {class: 'lieu'}, lieu?.Nom ?? ''),
        ),
        blocs,
      };
    });

    return construireFrise(lignes, {
      axeDebut: axe.debut,
      axeFin: axe.fin,
      classesBloc: (bloc) => (bloc.besoin ? '' : 'besoin-cell--vide'),
      titreBloc: (bloc) => (bloc.besoin ? undefined : bloc.sc.Libelle),
      rendreBloc: (bloc) => (bloc.besoin ? [celluleIndicatifs(ix, bloc.besoin.id)] : []),
      // Le clic utile (sélectionner une puce, cibler un besoin en mode
      // cible) est déjà géré par les écouteurs posés sur le contenu du bloc
      // dans `celluleIndicatifs` ; un clic hors de tout contenu (rare, une
      // case sans besoin) n'a rien à déclencher.
      onClicBloc: () => {},
      onClicPiste: () => {},
      // Jamais appelés : tous les blocs sont `deplacable: false` (voir plus
      // haut), mais le type de `construireFrise` les exige.
      onDeplacer: async () => ({ok: false, raison: 'Indicatifs ne déplace pas les créneaux — utilisez la vue Missions.'}),
      onRedimensionner: async () => (
        {ok: false, raison: 'Indicatifs ne redimensionne pas les créneaux — utilisez la vue Missions.'}
      ),
      surErreur: () => {},
    });
  }

  function celluleIndicatifs(ix: Index, besoinId: Id): HTMLElement {
    const c = couvertureBesoin(m, ix, besoinId);
    const sc = ix.sousCreneau.get(c.besoin.Sous_creneau)!;
    const sousEffectif = c.pourvues < c.besoin.Effectif_min;
    const surEffectif = c.pourvues > c.besoin.Effectif_max;
    const surlignee = groupeSelectionne != null && c.groupesPositionnes.some((g) => g.groupe.id === groupeSelectionne);
    // Indication, jamais une création automatique ni un blocage (retour
    // Antoine 2026-09-22, point 3) : deux places par binôme, arrondi au-dessus.
    const binomesRecommandes = Math.ceil(c.besoin.Effectif_min / 2);

    const cellule = h('div', {
      class: `indicatif-cell${modeCible ? ' indicatif-cell--cible' : ''}${surlignee ? ' indicatif-cell--surlignee' : ''}`,
    },
      // L'horaire n'a plus d'en-tête de colonne partagé (frise, retour
      // Antoine 2026-09-23) : chaque bloc porte le sien, comme la vue
      // Missions le fait déjà pour ses propres blocs.
      h('span', {class: 'besoin-cell__libelle'}, sc.Libelle),
      h('div', {class: `indicatif-cell__eff${sousEffectif ? ' indicatif-cell__eff--sous' : ''}`},
        h('span', null, `min ${c.besoin.Effectif_min}`),
        h('span', {
          class: 'indicatif-cell__reco',
          title: `Indication : ${c.besoin.Effectif_min} places ÷ 2, arrondi au-dessus — pas une création automatique`,
        }, `≈${binomesRecommandes} binôme${binomesRecommandes > 1 ? 's' : ''}`),
        surEffectif ? h('span', {class: 'flag', title: 'Dépasse le maximum — signalé, pas bloquant'}, '⚑') : null,
      ),
      ...c.groupesPositionnes.map((g) => puceGroupe(ix, g.groupe, besoinId)),
    );

    cellule.append(h('button', {
      class: 'ajouter-binome', type: 'button',
      style: c.groupesPositionnes.length === 0 ? {opacity: '1'} : undefined,
      title: c.groupesPositionnes.length === 0 ? undefined : 'Ajouter un binôme supplémentaire sur ce besoin (§6.3)',
      onclick: (e: Event) => { e.stopPropagation(); selectionnerNouveauGroupe(besoinId); },
    }, c.groupesPositionnes.length === 0 ? '+ positionner un binôme' : '+ binôme'));

    cellule.addEventListener('dragover', (e: DragEvent) => {
      if (groupeDeplace == null || besoinOrigineDeplace === besoinId) { return; }
      e.preventDefault();
      cellule.classList.add('indicatif-cell--dropzone');
      // Repère visuel pendant le survol (retour Antoine 2026-09-23) : sans
      // lui, glisser normal et Alt+glisser sont indiscernables avant même de
      // relâcher. L'état d'Alt est relu à chaque survol, donc suit la touche
      // en temps réel.
      cellule.classList.toggle('indicatif-cell--dropzone-copie', e.altKey);
    });
    cellule.addEventListener('dragleave', () => {
      cellule.classList.remove('indicatif-cell--dropzone', 'indicatif-cell--dropzone-copie');
    });
    cellule.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      cellule.classList.remove('indicatif-cell--dropzone', 'indicatif-cell--dropzone-copie');
      if (groupeDeplace == null || besoinOrigineDeplace == null || besoinOrigineDeplace === besoinId) { return; }
      // Alt tenu au moment de relâcher (pas au moment de saisir) tranche
      // entre les deux gestes — même convention que la frise Missions/
      // Artistes (`ui/frise.ts`, `ev.altKey` relu au dépôt). Alt+glisser
      // ajoute une position sans retirer l'origine, exactement comme le
      // bouton « + Ajouter une position » (même écriture, `ajouterPosition`).
      if (e.altKey) {
        const groupeACopier = groupeDeplace;
        void ecrire(async () => { await m.ajouterPosition(groupeACopier, besoinId); });
        return;
      }
      const position = m.positionsGroupe.find((p) => p.Groupe === groupeDeplace && p.Besoin === besoinOrigineDeplace);
      if (position) { void ecrire(() => m.deplacerPosition(position.id, besoinId)); }
    });

    if (modeCible) {
      cellule.addEventListener('click', () => executerCible(besoinId));
    }

    return cellule;
  }

  async function selectionnerNouveauGroupe(besoinId: Id): Promise<void> {
    await ecrire(async () => {
      const id = await m.creerGroupeSurBesoin(besoinId);
      if (id === -1) { return; }
      groupeSelectionne = id;
    });
  }

  function puceGroupe(ix: Index, groupe: Groupe, besoinId: Id): HTMLElement {
    const equipe = ix.equipe.get(groupe.Equipe)!;
    const places = placesDuGroupe(m, groupe.id);
    const vide = places.every((p) => p.Benevole == null);
    const incomplete = places.some((p) => p.Benevole == null);
    const noms = places.map((p) => (p.Benevole != null ? courtNom(ix.benevole.get(p.Benevole)!.Nom) : '—')).join(' · ');

    let ordre: number | null = null;
    if (groupeSelectionne === groupe.id) {
      const positions = positionsDuGroupe(m, ix, groupe.id);
      if (positions.length > 1) { ordre = positions.findIndex((p) => p.besoin.id === besoinId) + 1; }
    }

    const chip = h('button', {
      class: `groupe-chip${vide ? ' groupe-chip--vide' : ''}`
        + `${groupeSelectionne === groupe.id ? ' groupe-chip--selectionnee' : ''}`
        + `${groupeSelectionne != null && groupeSelectionne !== groupe.id ? ' groupe-chip--estompee' : ''}`
        + `${incomplete ? ' groupe-chip--sous-effectif' : ''}`,
      type: 'button',
      draggable: 'true',
      title: `${groupe.Code} · ${equipe.Nom}`,
    },
      h('span', {class: 'dot', style: {background: equipe.Couleur}}),
      h('span', {class: 'groupe-chip__code mono'}, groupe.Code),
      h('span', {class: 'groupe-chip__noms'}, noms),
      ordre != null ? h('span', {class: 'groupe-chip__ordre'}, String(ordre)) : null,
    );

    chip.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      if (modeCible) { return; }
      groupeSelectionne = groupeSelectionne === groupe.id ? null : groupe.id;
      rafraichir();
    });
    chip.addEventListener('dragstart', () => {
      groupeDeplace = groupe.id;
      besoinOrigineDeplace = besoinId;
    });
    chip.addEventListener('dragend', () => {
      groupeDeplace = null;
      besoinOrigineDeplace = null;
    });

    return chip;
  }

  // --- Panneau latéral : composition + trajectoire --------------------------

  function panneauIndicatif(ix: Index, groupeId: Id): void {
    const groupe = ix.groupe.get(groupeId)!;
    const equipe = ix.equipe.get(groupe.Equipe)!;
    const places = placesDuGroupe(m, groupeId);
    const positions = positionsDuGroupe(m, ix, groupeId);
    const tailleLibelle = groupe.Taille === 2 ? 'binôme' : groupe.Taille === 1 ? 'place seule' : `${groupe.Taille}-uplet`;

    const panneau = h('div', {style: {display: 'flex', flexDirection: 'column', gap: '16px'}},
      h('div', {class: 'side-panel__head'},
        h('div', null,
          h('h3', {class: 'mono'}, groupe.Code),
          h('p', {class: 'topbar__subtitle'}, `${equipe.Nom} · ${tailleLibelle}`),
        ),
        h('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          onclick: () => { groupeSelectionne = null; rafraichir(); },
        }, 'Fermer'),
      ),

      h('div', null,
        h('div', {class: 'section-title'}, h('h2', null, 'Composition')),
        h('div', {class: 'card', style: {display: 'flex', flexDirection: 'column', gap: '6px'}},
          ...places.map((place) => h('div', {class: 'membre'},
            h('span', {class: 'rang mono'}, `#${place.Rang}`),
            place.Benevole != null
              ? h('span', {style: {flex: '1'}}, ix.benevole.get(place.Benevole)!.Nom)
              : h('span', {style: {flex: '1', color: 'var(--text-faint)'}}, 'Non pourvue'),
            h('button', {
              class: 'btn btn--ghost btn--sm', type: 'button',
              title: place.Verrouillee ? 'Déverrouiller' : 'Verrouiller',
              onclick: () => m.basculerVerrouillage(place.id),
            }, place.Verrouillee ? '🔒' : '🔓'),
          )),
        ),
        h('p', {class: 'view__intro', style: {marginTop: '8px', marginBottom: '0'}},
          "L'affectation des bénévoles se fait depuis la vue Missions — ici, une place se verrouille mais ne se pourvoit pas.",
        ),
      ),

      h('div', null,
        h('div', {class: 'section-title'},
          h('h2', null, 'Trajectoire du jour'),
          h('span', {class: 'count mono'}, String(positions.length)),
        ),
        positions.length === 0
          ? h('p', {class: 'empty'}, "Pas encore positionné sur ce jour.")
          : h('ol', {class: 'trajectoire-liste'}, ...positions.map(({position, besoin, sousCreneau}, i) => h(
            'li', {class: 'trajectoire-etape'},
            positions.length > 1 ? h('span', {class: 'trajectoire-etape__badge'}, String(i + 1)) : null,
            h('span', {class: 'trajectoire-etape__info'},
              h('span', {class: 'trajectoire-etape__mission'}, ix.mission.get(besoin.Mission)!.Nom),
              h('span', {class: 'trajectoire-etape__creneau'}, sousCreneau.Libelle),
            ),
            h('button', {
              class: 'btn btn--ghost btn--sm', type: 'button',
              onclick: () => { modeCible = {groupeId, positionId: position.id, mode: 'deplacer'}; rafraichir(); },
            }, 'Déplacer…'),
          ))),
        h('button', {
          class: 'ajouter-binome', type: 'button', style: {opacity: '1', width: '100%', marginTop: '8px'},
          onclick: () => { modeCible = {groupeId, positionId: null, mode: 'ajouter'}; rafraichir(); },
        }, '+ Ajouter une position'),
        h('p', {class: 'view__intro', style: {marginTop: '8px', marginBottom: '0'}},
          'Glissez une puce vers une autre case du planning pour la repositionner directement.',
        ),
      ),
    );
    ouvrirPanneau(panneau);
  }

  function executerCible(besoinId: Id): void {
    if (!modeCible) { return; }
    const cible = modeCible;
    modeCible = null;
    void ecrire(async () => {
      if (cible.mode === 'deplacer' && cible.positionId != null) {
        await m.deplacerPosition(cible.positionId, besoinId);
      } else {
        await m.ajouterPosition(cible.groupeId, besoinId);
      }
    });
  }

  function courtNom(nomComplet: string): string {
    const parties = nomComplet.split(' ');
    return parties.length < 2 ? nomComplet : `${parties[0]} ${parties[1]![0]}.`;
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return () => { desabonner(); fermerPanneau(); };
}
