/**
 * Vue « plannings équipes imprimables » (demande d'Antoine du 2026-09-23,
 * point 2) : une table par équipe, listant les missions de cette équipe qui
 * tournent ce jour-là, avec au quart d'heure qui les tient (nom + rappel de
 * l'indicatif). Toutes les équipes s'affichent à la suite (pas de
 * sélecteur : chacune devient sa propre page à l'impression). Lecture seule
 * stricte : aucune écriture, la seule interaction est le filtre par jour
 * (global, `Magasin.macroCreneauSelectionne`, posé par `app.ts`) et le
 * bouton d'impression.
 */

import type {Epoch, Equipe, Id, Mission} from '../domain/types';
import {type Index, indexer, regrouperParJour, sousCreneauxApplicables} from '../logic/derive';
import {type BlocMacro, blocsDuJour} from '../logic/dispos-terrain';
import {
  type AffectationMissionQuart, affectationsQuartParMission, segmenterQuarts,
} from '../logic/impression';
import type {Magasin} from '../store';
import {
  ajusterTexteBloc, cellulesEnTeteQuarts, imprimer, LARGEUR_QUART_ECRAN_PX, largeurQuartImpressionPx,
  PADDING_HORIZONTAL_BLOC_PX,
} from '../ui/impression';
import {h, vider} from '../ui/dom';

const LARGEUR_COLONNE_MISSION_PX = 190;

interface ContenuQuart {
  cle: string;
  entrees: AffectationMissionQuart['entrees'];
}

function contenuQuart(parQuart: Map<Epoch, AffectationMissionQuart> | undefined, q: Epoch): ContenuQuart {
  const entrees = parQuart?.get(q)?.entrees ?? [];
  // Le regroupement se fait sur l'ensemble exact des personnes présentes :
  // un changement de personne en cours de créneau ouvre un nouveau segment,
  // jamais fusionné avec le précédent même si le nombre de personnes reste
  // le même.
  const cle = entrees.map((e) => `${e.benevoleNom}#${e.groupeCode}`).sort().join('|');
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
  parQuart: Map<Epoch, AffectationMissionQuart> | undefined, pxParQuart: number,
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
      const candidats = entrees.length > 0 ? [
        entrees.map((e) => `${e.benevoleNom} (${e.groupeCode})`).join(', '),
        entrees.map((e) => e.benevoleNom).join(', '),
        entrees.map((e) => e.groupeCode).join(', '),
      ] : [];
      const ajuste = candidats.length > 0 ? ajusterTexteBloc(candidats, largeurDisponible) : null;
      const titre = entrees.length > 0 ? entrees.map((e) => `${e.benevoleNom} (${e.groupeCode})`).join(', ') : undefined;
      cellules.push(h('td', {
        class: `impression-bloc impression-bloc--${entrees.length > 0 ? 'assignee' : 'libre'}${limiteMacro ? ' impression-bloc--limite-macro' : ''}`,
        colspan: segment.quarts.length,
        title: titre,
      },
        ajuste
          ? h('span', {class: 'impression-bloc__texte', style: {fontSize: `${ajuste.taillePolicePx}px`}}, ajuste.texte)
          : null,
      ));
    });
  });

  return h('tr', null, ...cellules);
}

function construireTableEquipe(
  ix: Index, missions: readonly Mission[], blocs: readonly BlocMacro[],
  affectationsParMission: Map<Id, Map<Epoch, AffectationMissionQuart>>, pxParQuart: number,
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
    ))),
  );
}

function construireSectionEquipe(
  ix: Index, equipe: Equipe, missions: readonly Mission[], blocs: readonly BlocMacro[],
  affectationsParMission: Map<Id, Map<Epoch, AffectationMissionQuart>>, pxParQuart: number,
): Node {
  const table = construireTableEquipe(ix, missions, blocs, affectationsParMission, pxParQuart);
  return h('section', {class: 'impression-equipes__equipe'},
    h('h2', {class: 'impression-equipes__titre'}, equipe.Nom),
    h('div', {class: 'impression-scroll'}, table),
  );
}

export function montrerEquipesImprimables(container: HTMLElement, m: Magasin): () => void {
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

    const barre = h('div', {class: 'impression-barre'},
      h('p', {class: 'view__intro', style: {margin: '0'}},
        `${equipesAvecMissions.length} équipe${equipesAvecMissions.length > 1 ? 's' : ''} avec mission ${jour.libelle.toLowerCase()}.`,
      ),
      h('button', {
        class: 'btn btn--primary btn--sm', type: 'button',
        onclick: () => {
          const nbQuartsTotal = blocs.reduce((n, b) => n + b.quarts.length, 0);
          const pxImpression = largeurQuartImpressionPx(nbQuartsTotal, LARGEUR_COLONNE_MISSION_PX);
          const sections = equipesAvecMissions.map(({equipe, missions}) => construireSectionEquipe(
            ix, equipe, missions, blocs, affectationsParMission, pxImpression,
          ));
          imprimer([h('h1', null, `Plannings équipes — ${jour.libelle}`), ...sections], 'impression-equipes');
        },
      }, 'Imprimer tous les plannings équipe'),
    );

    const sectionsEcran = equipesAvecMissions.map(({equipe, missions}) => construireSectionEquipe(
      ix, equipe, missions, blocs, affectationsParMission, LARGEUR_QUART_ECRAN_PX,
    ));

    container.append(barre, ...sectionsEcran);
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
