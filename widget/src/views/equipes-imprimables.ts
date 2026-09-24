/**
 * Vue « plannings équipes imprimables » (demande d'Antoine du 2026-09-23,
 * point 2) : une table par équipe, listant les missions de cette équipe qui
 * tournent ce jour-là, avec au quart d'heure qui les tient (nom + rappel de
 * l'indicatif). Lecture seule stricte : aucune écriture, les seules
 * interactions sont le filtre par jour (global, `Magasin.macroCreneauSelectionne`,
 * posé par `app.ts`), le filtre par équipe (local à cette vue, voir plus
 * bas) et le bouton d'impression.
 *
 * Retour d'Antoine du 2026-09-24 (« sans zoomer c'est inutilisable ») : la
 * mise en page précédente (toutes les équipes empilées, pas de sélecteur,
 * chacune devenant sa propre page à l'impression) était un choix tranché
 * par le coordinateur faute de réponse la nuit précédente — jamais demandé
 * par Antoine, donc pas préservé ici. Deux changements : un filtre par
 * équipe (réduit d'un coup ce qui s'affiche à la fois, le principal levier
 * de lisibilité) et un aperçu à l'écran désormais décorrélé de
 * l'impression, avec sa propre largeur de quart d'heure et son propre
 * plancher de police — l'écran affichait jusqu'ici la mise en page pensée
 * pour une page A4 paysage, ce qui la rendait minuscule sur un moniteur.
 *
 * Retour d'Antoine du 2026-09-24, second passage (« c'est mieux, mais ce
 * n'est pas encore ça ») : deux changements supplémentaires, inconditionnels
 * (jamais gouvernés par le filtre équipe ni par un réglage à cocher).
 * D'abord, une entrée par indicatif positionné sur le besoin, jamais fondue
 * dans une seule ligne texte comme avant — quand plusieurs binômes couvrent
 * la même mission au même quart, chacun sa propre ligne dans la cellule, et
 * la ligne du tableau grandit en hauteur pour toutes les contenir (aucune
 * hauteur fixée sur `.impression-bloc`, donc la rangée HTML s'adapte
 * naturellement au nombre de lignes du bloc le plus chargé de la rangée).
 * Ensuite, l'indicatif d'un binôme s'affiche même sans personne dessus —
 * seul son nom disparaît, jamais son code — pour qu'un plan de construction
 * en cours reste lisible avant d'être entièrement pourvu.
 */

import type {Epoch, Equipe, Id, Mission} from '../domain/types';
import {type Index, indexer, regrouperParJour, sousCreneauxApplicables} from '../logic/derive';
import {type BlocMacro, blocsDuJour} from '../logic/dispos-terrain';
import {
  type AffectationMissionQuart, affectationsQuartParMission, segmenterQuarts,
} from '../logic/impression';
import type {Magasin} from '../store';
import {
  ajusterTexteBloc, ajusterTexteBlocAvecTroncature, cellulesEnTeteQuarts, imprimer, largeurQuartImpressionPx,
  PADDING_HORIZONTAL_BLOC_PX,
} from '../ui/impression';
import {h, vider} from '../ui/dom';

const LARGEUR_COLONNE_MISSION_PX = 190;

/** Largeur d'un quart d'heure à l'écran, PROPRE à cette vue — décorrélée de
 *  `LARGEUR_QUART_ECRAN_PX` (`ui/impression.ts`, 22px, partagée avec le
 *  roster imprimable, non touchée ici pour ne rien changer à une vue
 *  distincte non signalée). Plus généreuse pour que l'en-tête d'heure
 *  ("16:00") ne soit plus tronqué et qu'un nom tienne à une taille lisible
 *  sans avoir à zoomer le navigateur (retour d'Antoine, 2026-09-24).
 *  L'impression garde son propre calcul (`largeurQuartImpressionPx`), pensé
 *  pour tenir sur une page A4 paysage — jamais touché ici. */
const LARGEUR_QUART_ECRAN_PX = 34;

/** Plancher de police à l'écran : plus haut que le plancher d'impression
 *  (`TAILLES_POLICE_BLOC_PX` dans `ui/impression.ts`, qui descend à 6px —
 *  lisible sur papier, pas sur un moniteur sans zoomer). Au-delà de ce
 *  plancher, on tronque en ellipse plutôt que de continuer à rapetisser
 *  (même principe que `ajusterTexteBlocAvecTroncature`, déjà appliqué
 *  ailleurs — le projet a déjà réglé ce compromis une fois). */
const TAILLES_POLICE_ECRAN_PX = [11, 10, 9, 8] as const;

interface ContenuQuart {
  cle: string;
  entrees: AffectationMissionQuart['entrees'];
}

function contenuQuart(parQuart: Map<Epoch, AffectationMissionQuart> | undefined, q: Epoch): ContenuQuart {
  const entrees = parQuart?.get(q)?.entrees ?? [];
  // Le regroupement se fait sur l'ensemble exact des indicatifs et de leurs
  // occupants : un changement de personne (ou un indicatif qui se vide ou se
  // pourvoit) en cours de créneau ouvre un nouveau segment, jamais fusionné
  // avec le précédent même si le nombre d'entrées reste le même.
  const cle = entrees.map((e) => `${e.groupeCode}#${e.benevoleNoms.slice().sort().join(',')}`).sort().join('|');
  return {cle, entrees};
}

/** Colonnes en pourcentage du total visé (`totalPx`), jamais en valeur
 *  fixe — même raison qu'au roster bénévoles (`roster-imprimable.ts`) : ça
 *  permet à la même table de tenir exactement dans `totalPx` à l'écran et
 *  de se redistribuer proportionnellement sur 100% de la page à
 *  l'impression. */
function construireColgroup(nbQuartsTotal: number, pxParQuart: number, totalPx: number): Node {
  const pct = (px: number) => `${(px / totalPx) * 100}%`;
  const cols: Node[] = [h('col', {style: {width: pct(LARGEUR_COLONNE_MISSION_PX)}})];
  for (let i = 0; i < nbQuartsTotal; i++) { cols.push(h('col', {style: {width: pct(pxParQuart)}})); }
  return h('colgroup', null, ...cols);
}

function construireLigneMission(
  mission: Mission, lieuNom: string, blocs: readonly BlocMacro[],
  parQuart: Map<Epoch, AffectationMissionQuart> | undefined, pxParQuart: number, pourEcran: boolean,
): Node {
  const cellules: Node[] = [
    h('th', {
      class: 'impression-table__entite', scope: 'row',
      title: lieuNom ? `${mission.Nom} · ${lieuNom}` : mission.Nom,
    },
      mission.Nom, lieuNom ? h('span', {class: 'lieu'}, ` · ${lieuNom}`) : null,
    ),
  ];

  blocs.forEach((bloc, iBloc) => {
    const segments = segmenterQuarts<ContenuQuart>(
      bloc.quarts, (q) => contenuQuart(parQuart, q), (c) => c.cle,
    );
    segments.forEach((segment, iSegment) => {
      const {entrees} = segment.valeur;
      const limiteMacro = iSegment === 0 && iBloc > 0;
      const largeurDisponible = Math.max(0, segment.quarts.length * pxParQuart - PADDING_HORIZONTAL_BLOC_PX);
      const taillesPx = pourEcran ? TAILLES_POLICE_ECRAN_PX : undefined;
      // Une entrée (indicatif) = une ligne, jamais fondues en une seule (retour
      // Antoine 2026-09-24) : le code reste toujours le candidat de secours, pour
      // qu'il ne disparaisse jamais même si le nom ne tient pas.
      const lignes = entrees.map((entree) => {
        const candidats = entree.benevoleNoms.length > 0
          ? [`${entree.benevoleNoms.join(', ')} (${entree.groupeCode})`, entree.groupeCode]
          : [entree.groupeCode];
        let ajuste = ajusterTexteBloc(candidats, largeurDisponible, taillesPx);
        if (!ajuste && pourEcran) {
          // Même le plancher écran ne suffit pas pour le code seul : tronque en
          // ellipse plutôt que de laisser cette ligne du bloc sans texte.
          ajuste = ajusterTexteBlocAvecTroncature(entree.groupeCode, largeurDisponible, TAILLES_POLICE_ECRAN_PX);
        }
        return ajuste;
      });
      const aBenevole = entrees.some((e) => e.benevoleNoms.length > 0);
      const titre = entrees.length > 0
        ? entrees.map((e) => (e.benevoleNoms.length > 0 ? `${e.benevoleNoms.join(', ')} (${e.groupeCode})` : e.groupeCode)).join(' · ')
        : undefined;
      cellules.push(h('td', {
        class: `impression-bloc impression-bloc--${aBenevole ? 'assignee' : 'libre'}${limiteMacro ? ' impression-bloc--limite-macro' : ''}`,
        colspan: segment.quarts.length,
        title: titre,
      },
        ...lignes.map((ajuste) => (
          ajuste
            ? h('span', {class: 'impression-bloc__texte', style: {fontSize: `${ajuste.taillePolicePx}px`}}, ajuste.texte)
            : null
        )),
      ));
    });
  });

  return h('tr', null, ...cellules);
}

function construireTableEquipe(
  ix: Index, missions: readonly Mission[], blocs: readonly BlocMacro[],
  affectationsParMission: Map<Id, Map<Epoch, AffectationMissionQuart>>, pxParQuart: number, pourEcran: boolean,
): HTMLTableElement {
  const nbQuartsTotal = blocs.reduce((n, b) => n + b.quarts.length, 0);
  const totalPx = LARGEUR_COLONNE_MISSION_PX + nbQuartsTotal * pxParQuart;
  return h('table', {class: 'impression-table', style: {width: `${totalPx}px`}},
    construireColgroup(nbQuartsTotal, pxParQuart, totalPx),
    h('thead', null, h('tr', null,
      h('th', {class: 'impression-table__coin', scope: 'col'}, 'Mission'),
      ...cellulesEnTeteQuarts(blocs),
    )),
    h('tbody', null, ...missions.map((mission) => construireLigneMission(
      mission, ix.lieu.get(mission.Lieu)?.Nom ?? '', blocs, affectationsParMission.get(mission.id), pxParQuart,
      pourEcran,
    ))),
  );
}

function construireSectionEquipe(
  ix: Index, equipe: Equipe, missions: readonly Mission[], blocs: readonly BlocMacro[],
  affectationsParMission: Map<Id, Map<Epoch, AffectationMissionQuart>>, pxParQuart: number, pourEcran: boolean,
): Node {
  const table = construireTableEquipe(ix, missions, blocs, affectationsParMission, pxParQuart, pourEcran);
  return h('section', {class: 'impression-equipes__equipe'},
    h('h2', {class: 'impression-equipes__titre'}, equipe.Nom),
    h('div', {class: 'impression-scroll'}, table),
  );
}

export function montrerEquipesImprimables(container: HTMLElement, m: Magasin): () => void {
  // Filtre par équipe, local à cette vue (pas dans `Magasin` : rien d'autre n'en a besoin) —
  // `null` veut dire « toutes les équipes ». Survit aux rafraîchissements déclenchés par
  // `m.subscribe`, remis à `null` si l'équipe sélectionnée n'a plus de mission ce jour-là.
  let equipeFiltreeId: Id | null = null;

  function rafraichir(): void {
    const ix = indexer(m);
    const jours = regrouperParJour(m.macroCreneaux);
    const jour = jours.find((j) => j.macros.some((ma) => ma.id === m.macroCreneauSelectionne)) ?? jours[0];
    vider(container);

    if (m.equipes.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Aucune équipe dans ce jeu de données.'));
      return;
    }
    if (!jour) {
      container.append(h('p', {class: 'empty'}, 'Aucun macro-créneau : rien à afficher.'));
      return;
    }
    const blocs = blocsDuJour(jour).filter((b) => b.quarts.length > 0);
    if (blocs.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Ce jour ne couvre aucun quart d’heure.'));
      return;
    }

    const sousCreneauxDuJour = m.sousCreneaux.filter((sc) => jour.macros.some((ma) => ma.id === sc.Macro_creneau));
    const quartsDuJour = new Set(blocs.flatMap((b) => b.quarts));
    const affectationsParMission = affectationsQuartParMission(m, ix, quartsDuJour);

    const equipesAvecMissions = m.equipes
      .slice()
      .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'))
      .map((equipe) => ({
        equipe,
        missions: m.missions
          .filter((mi) => mi.Equipe === equipe.id && sousCreneauxApplicables(mi, sousCreneauxDuJour).length > 0)
          .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr')),
      }))
      .filter(({missions}) => missions.length > 0);

    if (equipesAvecMissions.length === 0) {
      container.append(h('p', {class: 'empty'}, "Aucune équipe n'a de mission ce jour-là."));
      return;
    }

    // L'équipe filtrée peut avoir disparu (changement de jour) : retombe sur « toutes »
    // plutôt que d'afficher un écran vide sans expliquer pourquoi.
    if (equipeFiltreeId != null && !equipesAvecMissions.some(({equipe}) => equipe.id === equipeFiltreeId)) {
      equipeFiltreeId = null;
    }
    const equipeFiltree = equipeFiltreeId == null
      ? null
      : equipesAvecMissions.find(({equipe}) => equipe.id === equipeFiltreeId) ?? null;
    const equipesAffichees = equipeFiltree ? [equipeFiltree] : equipesAvecMissions;

    const filtreEquipe = h('div', {class: 'agenda__toolbar'},
      h('button', {
        class: `btn btn--sm${equipeFiltreeId == null ? ' btn--primary' : ''}`,
        type: 'button',
        onclick: () => { equipeFiltreeId = null; rafraichir(); },
      }, 'Toutes les équipes'),
      ...equipesAvecMissions.map(({equipe}) => h('button', {
        class: `btn btn--sm${equipeFiltreeId === equipe.id ? ' btn--primary' : ''}`,
        type: 'button',
        onclick: () => { equipeFiltreeId = equipe.id; rafraichir(); },
      }, equipe.Nom)),
    );

    const barre = h('div', {class: 'impression-barre'},
      h('p', {class: 'view__intro', style: {margin: '0'}},
        `${equipesAvecMissions.length} équipe${equipesAvecMissions.length > 1 ? 's' : ''} avec mission ${jour.libelle.toLowerCase()}.`,
      ),
      h('button', {
        class: 'btn btn--primary btn--sm', type: 'button',
        onclick: () => {
          const nbQuartsTotal = blocs.reduce((n, b) => n + b.quarts.length, 0);
          const pxImpression = largeurQuartImpressionPx(nbQuartsTotal, LARGEUR_COLONNE_MISSION_PX);
          const sections = equipesAffichees.map(({equipe, missions}) => construireSectionEquipe(
            ix, equipe, missions, blocs, affectationsParMission, pxImpression, false,
          ));
          imprimer([h('h1', null, `Plannings équipes — ${jour.libelle}`), ...sections], 'impression-equipes');
        },
      }, equipeFiltree ? `Imprimer le planning ${equipeFiltree.equipe.Nom}` : 'Imprimer tous les plannings équipe'),
    );

    const sectionsEcran = equipesAffichees.map(({equipe, missions}) => construireSectionEquipe(
      ix, equipe, missions, blocs, affectationsParMission, LARGEUR_QUART_ECRAN_PX, true,
    ));

    container.append(filtreEquipe, barre, ...sectionsEcran);
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
