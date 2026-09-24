/**
 * Vue « roster imprimable » (demande d'Antoine du 2026-09-23, point 1) :
 * une ligne par bénévole disponible ce jour-là — même partiellement,
 * affecté ou non —, son indicatif du jour, puis ses affectations au quart
 * d'heure. Pensée pour être imprimée et distribuée aux bénévoles : lecture
 * seule stricte, la seule interaction est le filtre par jour (global,
 * `Magasin.macroCreneauSelectionne`, posé par `app.ts`) et le bouton
 * d'impression.
 */

import type {Benevole, Disponibilite, Epoch, Id} from '../domain/types';
import {type Index, benevolesDisponiblesCeJour, indexer, regrouperParJour} from '../logic/derive';
import {type BlocMacro, blocsDuJour, indexerDisponibilitesParBenevole} from '../logic/dispos-terrain';
import {
  type AffectationQuart, affectationsQuartParBenevole, creneauxVoirArtisteParBenevole,
  indicatifDuJour, segmenterQuarts,
} from '../logic/impression';
import type {Magasin} from '../store';
import {
  ajusterTexteBlocAvecTroncature, cellulesEnTeteQuarts, imprimer, LARGEUR_QUART_ECRAN_PX, largeurQuartImpressionPx,
  PADDING_HORIZONTAL_BLOC_PX,
} from '../ui/impression';
import {h, vider} from '../ui/dom';

export const LARGEUR_COLONNE_NOM_PX = 150;
export const LARGEUR_COLONNE_INDICATIF_PX = 50;

interface ContenuQuart {
  missionNom: string | null;
  artisteNom: string | null;
  disponible: boolean;
}

function cleContenu(c: ContenuQuart): string {
  if (c.missionNom != null) { return `A:${c.missionNom}`; }
  if (c.artisteNom != null) { return `V:${c.artisteNom}`; }
  return c.disponible ? 'L' : 'G';
}

/** Les colonnes en pourcentage du total visé (`totalPx`), jamais en valeur
 *  fixe : c'est ce qui permet à la même table de tenir exactement dans
 *  `totalPx` à l'écran (calculé au quart d'heure près, 22px, voir
 *  `LARGEUR_QUART_ECRAN_PX`) et de se redistribuer proportionnellement sur
 *  100% de la largeur de la page à l'impression (voir `impression.css`,
 *  `width: 100% !important` sur `table.impression-table`), sans jamais
 *  tronquer la colonne Bénévole comme le faisait un pourcentage fixe deviné
 *  au hasard (corrigé après vérification à l'écran, 2026-09-23). */
function construireColgroup(nbQuartsTotal: number, pxParQuart: number, totalPx: number): Node {
  const pct = (px: number) => `${(px / totalPx) * 100}%`;
  const cols: Node[] = [
    h('col', {style: {width: pct(LARGEUR_COLONNE_NOM_PX)}}),
    h('col', {style: {width: pct(LARGEUR_COLONNE_INDICATIF_PX)}}),
  ];
  for (let i = 0; i < nbQuartsTotal; i++) { cols.push(h('col', {style: {width: pct(pxParQuart)}})); }
  return h('colgroup', null, ...cols);
}

/** Une ligne de bénévole : segmente chaque bloc (macro-créneau) en blocs
 *  contigus de même contenu (même mission affectée, ou libre/indisponible),
 *  jamais fusionnés d'un bloc à l'autre — même limite qu'ailleurs (§6.2).
 *  `pxParQuart` choisit la taille de police visée (écran ou impression, voir
 *  `ui/impression.ts`). */
function construireLigneBenevole(
  benevole: Benevole, equipeCouleur: string, indicatif: string | null,
  blocs: readonly BlocMacro[], affectationsBenevole: Map<Epoch, AffectationQuart> | undefined,
  creneauxArtisteBenevole: Map<Epoch, string> | undefined,
  disponibleAuQuart: (q: Epoch) => boolean, pxParQuart: number,
): Node {
  const cellules: Node[] = [
    h('th', {class: 'impression-table__entite', scope: 'row', title: benevole.Nom},
      h('span', {class: 'dot', style: {background: equipeCouleur, marginRight: '6px'}}),
      benevole.Nom,
    ),
    h('td', {class: 'impression-table__indicatif'}, indicatif ?? '—'),
  ];

  blocs.forEach((bloc, iBloc) => {
    const segments = segmenterQuarts<ContenuQuart>(
      bloc.quarts,
      (q) => ({
        missionNom: affectationsBenevole?.get(q)?.missionNom ?? null,
        artisteNom: creneauxArtisteBenevole?.get(q) ?? null,
        disponible: disponibleAuQuart(q),
      }),
      cleContenu,
    );
    segments.forEach((segment, iSegment) => {
      const {missionNom, artisteNom, disponible} = segment.valeur;
      const classeEtat = missionNom != null ? 'assignee' : artisteNom != null ? 'artiste' : (disponible ? 'libre' : 'indisponible');
      const texteACaler = missionNom ?? artisteNom;
      const limiteMacro = iSegment === 0 && iBloc > 0;
      const largeurDisponible = Math.max(0, segment.quarts.length * pxParQuart - PADDING_HORIZONTAL_BLOC_PX);
      const ajuste = texteACaler != null ? ajusterTexteBlocAvecTroncature(texteACaler, largeurDisponible) : null;
      cellules.push(h('td', {
        class: `impression-bloc impression-bloc--${classeEtat}${limiteMacro ? ' impression-bloc--limite-macro' : ''}`,
        colspan: segment.quarts.length,
        title: texteACaler ?? undefined,
      },
        ajuste
          ? h('span', {class: 'impression-bloc__texte', style: {fontSize: `${ajuste.taillePolicePx}px`}}, ajuste.texte)
          : null,
      ));
    });
  });

  return h('tr', null, ...cellules);
}

function construireTable(
  ix: Index, benevoles: readonly Benevole[], blocs: readonly BlocMacro[],
  affectations: Map<Id, Map<Epoch, AffectationQuart>>, creneauxArtiste: Map<Id, Map<Epoch, string>>,
  indexDispos: Map<Id, Map<Epoch, Disponibilite>>, pxParQuart: number,
): HTMLTableElement {
  const nbQuartsTotal = blocs.reduce((n, b) => n + b.quarts.length, 0);
  const totalPx = LARGEUR_COLONNE_NOM_PX + LARGEUR_COLONNE_INDICATIF_PX + nbQuartsTotal * pxParQuart;
  const table = h('table', {class: 'impression-table', style: {width: `${totalPx}px`}},
    construireColgroup(nbQuartsTotal, pxParQuart, totalPx),
    h('thead', null, h('tr', null,
      h('th', {class: 'impression-table__coin', scope: 'col'}, 'Bénévole'),
      h('th', {class: 'impression-table__entete', scope: 'col'}, 'Indicatif'),
      ...cellulesEnTeteQuarts(blocs),
    )),
    h('tbody', null, ...benevoles.map((b) => {
      // Équipe orpheline possible (même défaut corrigé ailleurs le 2026-09-23) : ne doit pas planter la ligne.
      const equipeCouleur = ix.equipe.get(b.Equipe)?.Couleur ?? 'var(--text-faint)';
      const affectationsBenevole = affectations.get(b.id);
      const dispoBenevole = indexDispos.get(b.id);
      return construireLigneBenevole(
        b, equipeCouleur, indicatifDuJour(affectationsBenevole), blocs, affectationsBenevole,
        creneauxArtiste.get(b.id),
        (q) => {
          const d = dispoBenevole?.get(q);
          return d !== undefined && d.Statut !== 'Indisponible';
        },
        pxParQuart,
      );
    })),
  );
  return table;
}

export function montrerRosterImprimable(container: HTMLElement, m: Magasin): () => void {
  function rafraichir(): void {
    const ix = indexer(m);
    const jours = regrouperParJour(m.macroCreneaux);
    const jour = jours.find((j) => j.macros.some((ma) => ma.id === m.macroCreneauSelectionne)) ?? jours[0];
    vider(container);

    if (!jour) {
      container.append(h('p', {class: 'empty'}, 'Aucun macro-créneau : rien à afficher.'));
      return;
    }
    const blocs = blocsDuJour(jour).filter((b) => b.quarts.length > 0);
    if (blocs.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Ce jour ne couvre aucun quart d’heure.'));
      return;
    }
    const quartsDuJour = blocs.flatMap((b) => b.quarts);
    const quartsDuJourSet = new Set(quartsDuJour);
    const indexDispos = indexerDisponibilitesParBenevole(m.disponibilites);
    // Seule source pour « qui est vraiment là ce jour » (logic/derive.ts) : un souhait
    // « voir un artiste » n'est pas une vraie disponibilité (retour d'Antoine, 2026-09-24).
    const idsDisponibles = benevolesDisponiblesCeJour(m, quartsDuJourSet);
    const benevoles = m.benevoles
      .filter((b) => idsDisponibles.has(b.id))
      .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'));

    if (benevoles.length === 0) {
      container.append(h('p', {class: 'empty'},
        "Aucun bénévole disponible ce jour-là — importez ou déclarez des disponibilités (vue Disponibilités) pour qu'un roster apparaisse ici.",
      ));
      return;
    }

    const affectations = affectationsQuartParBenevole(m, ix, quartsDuJourSet);
    const creneauxArtiste = creneauxVoirArtisteParBenevole(m, ix, quartsDuJourSet, affectations);

    const barre = h('div', {class: 'impression-barre'},
      h('p', {class: 'view__intro', style: {margin: '0'}},
        `${benevoles.length} bénévole${benevoles.length > 1 ? 's' : ''} disponible${benevoles.length > 1 ? 's' : ''} ${jour.libelle.toLowerCase()}.`,
      ),
      h('button', {
        class: 'btn btn--primary btn--sm', type: 'button',
        onclick: () => {
          const pxImpression = largeurQuartImpressionPx(quartsDuJour.length, LARGEUR_COLONNE_NOM_PX + LARGEUR_COLONNE_INDICATIF_PX);
          const table = construireTable(ix, benevoles, blocs, affectations, creneauxArtiste, indexDispos, pxImpression);
          imprimer(
            [h('h2', null, `Roster bénévoles — ${jour.libelle}`), table],
            'impression-roster',
          );
        },
      }, 'Imprimer ce roster'),
    );

    const table = construireTable(ix, benevoles, blocs, affectations, creneauxArtiste, indexDispos, LARGEUR_QUART_ECRAN_PX);

    container.append(barre, h('div', {class: 'impression-scroll'}, table));
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
