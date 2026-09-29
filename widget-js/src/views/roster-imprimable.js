/**
 * Vue « roster imprimable » (demande d'Antoine du 2026-09-23, point 1) :
 * une ligne par bénévole disponible ce jour-là — même partiellement,
 * affecté ou non —, son indicatif du jour, puis ses affectations au quart
 * d'heure. Pensée pour être imprimée et distribuée aux bénévoles : lecture
 * seule stricte, les seules interactions sont le filtre par jour (global,
 * `Magasin.macroCreneauSelectionne`, posé par `app.js`), la case à cocher
 * ci-dessous et le bouton d'impression.
 *
 * Retour d'Antoine du 2026-09-24 : le rouge des créneaux à problème
 * (`.impression-bloc--conflit`, voir plus bas) est un mode pour lui, pas
 * pour les bénévoles — décoché par défaut, écran ET impression, pour
 * qu'un roster imprimé sans y penser ne montre jamais ce diagnostic
 * interne. Le bleu (affecté) et le violet (peut voir son artiste) restent
 * visibles dans les deux états : ce sont des informations utiles au
 * bénévole, la case ne les touche pas.
 */

import {t, tn, traductions} from '../i18n.js';
import {
  benevolesDisponiblesCeJour, estVraimentDisponibleAuQuart, indexer, indexerDisponibilites,
  regrouperParJour,
} from '../logic/derive.js';
import {blocsDuJour, indexerDisponibilitesParBenevole} from '../logic/dispos-terrain.js';
import {
  affectationsQuartParBenevole, creneauxConflitArtisteParBenevole,
  creneauxVoirArtisteParBenevole, indicatifDuJour, segmenterQuarts,
} from '../logic/impression.js';
import {nomsCompletsDepuisSource} from '../logic/noms-complets.js';
import {
  ajusterTexteBlocAvecTroncature, cellulesEnTeteQuarts, imprimer, jourDansUnePhrase, LARGEUR_QUART_ECRAN_PX,
  largeurQuartImpressionPx, PADDING_HORIZONTAL_BLOC_PX,
} from '../ui/impression.js';
import {h, vider} from '../ui/dom.js';

traductions({
  'hors de sa disponibilité déclarée': 'outside their declared availability',
  "l'empêche de voir {artiste}": 'keeps them from seeing {artiste}',
  Bénévole: 'Volunteer',
  Indicatif: 'Call sign',
  Équipe: 'Team',
  'Aucun macro-créneau : rien à afficher.': 'No time blocks: nothing to show.',
  'Ce jour ne couvre aucun quart d’heure.': 'This day covers no quarter hours.',
  "Aucun bénévole disponible ce jour-là — importez ou déclarez des disponibilités (vue Disponibilités) pour qu'un roster apparaisse ici.":
    'No volunteers available that day — import or enter availability (Availability view) for a roster to appear here.',
  '{n} bénévole disponible {jour}.': '{n} volunteer available on {jour}.',
  '{n} bénévoles disponibles {jour}.': '{n} volunteers available on {jour}.',
  'Rouge visible à l’écran et à l’impression tant que la case est cochée — jamais pour les bénévoles par défaut.':
    'Red shown on screen and in print while the box is checked — never for volunteers by default.',
  'Signaler les créneaux à problème': 'Flag problem slots',
  'Roster bénévoles — {jour}': 'Volunteer roster — {jour}',
  'Imprimer ce roster': 'Print this roster',
});

export const LARGEUR_COLONNE_NOM_PX = 150;
// Assez pour l'en-tête « Indicatif » (« Call sign ») en entier, marges comprises.
export const LARGEUR_COLONNE_INDICATIF_PX = 66;
export const LARGEUR_COLONNE_EQUIPE_PX = 100;

function cleContenu(c) {
  if (c.missionNom != null) {
    return c.horsDispoReelle || c.conflitArtisteNom != null
      ? `X:${c.missionNom}:${c.horsDispoReelle ? 1 : 0}:${c.conflitArtisteNom ?? ''}`
      : `A:${c.missionNom}`;
  }
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
function construireColgroup(nbQuartsTotal, pxParQuart, totalPx) {
  const pct = (px) => `${(px / totalPx) * 100}%`;
  const cols = [
    h('col', {style: {width: pct(LARGEUR_COLONNE_NOM_PX)}}),
    h('col', {style: {width: pct(LARGEUR_COLONNE_INDICATIF_PX)}}),
    h('col', {style: {width: pct(LARGEUR_COLONNE_EQUIPE_PX)}}),
  ];
  for (let i = 0; i < nbQuartsTotal; i++) { cols.push(h('col', {style: {width: pct(pxParQuart)}})); }
  return h('colgroup', null, ...cols);
}

/** Une ligne de bénévole : segmente chaque bloc (macro-créneau) en blocs
 *  contigus de même contenu (même mission affectée, ou libre/indisponible),
 *  jamais fusionnés d'un bloc à l'autre — même limite qu'ailleurs (§6.2).
 *  `pxParQuart` choisit la taille de police visée (écran ou impression, voir
 *  `ui/impression.js`). `nomAffiche` et `nomEquipeIndicatif` sont déjà
 *  résolus par l'appelant (noms complets, équipe de l'indicatif tenu) —
 *  cette fonction ne fait que les poser, jamais de jointure ici. */
function construireLigneBenevole(
  nomAffiche, equipeCouleur, indicatif,
  nomEquipeIndicatif,
  blocs, affectationsBenevole,
  creneauxArtisteBenevole,
  conflitArtisteBenevole,
  disponibleAuQuart, horsDispoReelleAuQuart,
  afficherConflits, pxParQuart,
) {
  const cellules = [
    h('th', {class: 'impression-table__entite', scope: 'row', title: nomAffiche},
      h('span', {class: 'dot', style: {background: equipeCouleur, marginRight: '6px'}}),
      nomAffiche,
    ),
    h('td', {class: 'impression-table__indicatif'}, indicatif ?? '—'),
    h('td', {class: 'impression-table__equipe', title: nomEquipeIndicatif}, nomEquipeIndicatif),
  ];

  blocs.forEach((bloc, iBloc) => {
    const segments = segmenterQuarts(
      bloc.quarts,
      (q) => ({
        missionNom: affectationsBenevole?.get(q)?.missionNom ?? null,
        artisteNom: creneauxArtisteBenevole?.get(q) ?? null,
        // Motifs de conflit ignorés quand la case est décochée : le bloc redevient un
        // simple « assignee » bleu, indiscernable d'un roster sans ce diagnostic interne.
        conflitArtisteNom: afficherConflits ? conflitArtisteBenevole?.get(q) ?? null : null,
        horsDispoReelle: afficherConflits
          && affectationsBenevole?.get(q)?.missionNom != null && horsDispoReelleAuQuart(q),
        disponible: disponibleAuQuart(q),
      }),
      cleContenu,
    );
    segments.forEach((segment, iSegment) => {
      const {missionNom, artisteNom, conflitArtisteNom, horsDispoReelle, disponible} = segment.valeur;
      const enConflit = horsDispoReelle || conflitArtisteNom != null;
      const classeEtat = missionNom != null
        ? (enConflit ? 'conflit' : 'assignee')
        : artisteNom != null ? 'artiste' : (disponible ? 'libre' : 'indisponible');
      const texteACaler = missionNom ?? artisteNom;
      const motifs = [];
      if (horsDispoReelle) { motifs.push(t('hors de sa disponibilité déclarée')); }
      if (conflitArtisteNom != null) { motifs.push(t("l'empêche de voir {artiste}", {artiste: conflitArtisteNom})); }
      const titre = missionNom != null && motifs.length > 0
        ? `${missionNom} — ${motifs.join(' · ')}`
        : (texteACaler ?? undefined);
      const limiteMacro = iSegment === 0 && iBloc > 0;
      const largeurDisponible = Math.max(0, segment.quarts.length * pxParQuart - PADDING_HORIZONTAL_BLOC_PX);
      const ajuste = texteACaler != null ? ajusterTexteBlocAvecTroncature(texteACaler, largeurDisponible) : null;
      cellules.push(h('td', {
        class: `impression-bloc impression-bloc--${classeEtat}${limiteMacro ? ' impression-bloc--limite-macro' : ''}`,
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

function construireTable(
  ix, benevoles, nomsComplets, groupes,
  blocs,
  affectations, creneauxArtiste,
  conflitArtiste,
  indexDispos, indexDispoReelle,
  afficherConflits, pxParQuart,
) {
  const nbQuartsTotal = blocs.reduce((n, b) => n + b.quarts.length, 0);
  const totalPx = LARGEUR_COLONNE_NOM_PX + LARGEUR_COLONNE_INDICATIF_PX + LARGEUR_COLONNE_EQUIPE_PX
    + nbQuartsTotal * pxParQuart;
  const table = h('table', {class: 'impression-table', style: {width: `${totalPx}px`}},
    construireColgroup(nbQuartsTotal, pxParQuart, totalPx),
    h('thead', null, h('tr', null,
      h('th', {class: 'impression-table__coin', scope: 'col'}, t('Bénévole')),
      h('th', {class: 'impression-table__entete', scope: 'col'}, t('Indicatif')),
      h('th', {class: 'impression-table__entete', scope: 'col'}, t('Équipe')),
      ...cellulesEnTeteQuarts(blocs),
    )),
    h('tbody', null, ...benevoles.map((b) => {
      // Équipe orpheline possible (même défaut corrigé ailleurs le 2026-09-23) : ne doit pas planter la ligne.
      const equipeCouleur = ix.equipe.get(b.Equipe)?.Couleur ?? 'var(--text-faint)';
      const affectationsBenevole = affectations.get(b.id);
      const dispoBenevole = indexDispos.get(b.id);
      const indicatif = indicatifDuJour(affectationsBenevole);
      // Équipe associée à l'indicatif tenu (retour Antoine 2026-09-24), pas forcément la même
      // que l'équipe d'appartenance du bénévole (déjà montrée par le point de couleur) : un
      // code d'indicatif est unique sur tout le document (nomenclature A1→Z1, §22/09).
      const groupeIndicatif = indicatif != null ? groupes.find((g) => g.Code === indicatif) : undefined;
      const nomEquipeIndicatif = groupeIndicatif ? ix.equipe.get(groupeIndicatif.Equipe)?.Nom ?? '—' : '—';
      return construireLigneBenevole(
        nomsComplets.get(b.id) ?? b.Nom, equipeCouleur, indicatif, nomEquipeIndicatif, blocs, affectationsBenevole,
        creneauxArtiste.get(b.id), conflitArtiste.get(b.id),
        (q) => {
          const d = dispoBenevole?.get(q);
          return d !== undefined && d.Statut !== 'Indisponible';
        },
        (q) => !estVraimentDisponibleAuQuart(indexDispoReelle, b.id, q),
        afficherConflits, pxParQuart,
      );
    })),
  );
  return table;
}

export function montrerRosterImprimable(container, m) {
  // Mode diagnostic d'Antoine (case décochée par défaut, retour 2026-09-24) : local à
  // cette vue, jamais dans `Magasin` — gouverne le rouge à l'écran ET à l'impression.
  let afficherConflits = false;
  // Noms complets lus depuis la table externe d'Antoine (§ demande du 2026-09-24 : il refuse
  // de relancer l'import, lecture seule à l'affichage) — mêmes règles que la vue équipes.
  let nomsComplets = new Map();
  let vueActive = true;
  nomsCompletsDepuisSource(m).then((trouves) => {
    if (!vueActive || trouves.size === 0) { return; }
    nomsComplets = trouves;
    rafraichir();
  }).catch(() => { /* jamais bloquant : la vue garde Benevole.Nom */ });

  function rafraichir() {
    const ix = indexer(m);
    const jours = regrouperParJour(m.macroCreneaux);
    const jour = jours.find((j) => j.macros.some((ma) => ma.id === m.macroCreneauSelectionne)) ?? jours[0];
    vider(container);

    if (!jour) {
      container.append(h('p', {class: 'empty'}, t('Aucun macro-créneau : rien à afficher.')));
      return;
    }
    const blocs = blocsDuJour(jour).filter((b) => b.quarts.length > 0);
    if (blocs.length === 0) {
      container.append(h('p', {class: 'empty'}, t('Ce jour ne couvre aucun quart d’heure.')));
      return;
    }
    const quartsDuJour = blocs.flatMap((b) => b.quarts);
    const quartsDuJourSet = new Set(quartsDuJour);
    const indexDispos = indexerDisponibilitesParBenevole(m.disponibilites);
    // Seule source pour « qui est vraiment là ce jour » (logic/derive.js) : un souhait
    // « voir un artiste » n'est pas une vraie disponibilité (retour d'Antoine, 2026-09-24).
    const idsDisponibles = benevolesDisponiblesCeJour(m, quartsDuJourSet);
    // Même source, mais au quart d'heure précis (logic/derive.js) : sert à signaler en
    // rouge un créneau affecté qui dépasse la disponibilité réellement déclarée.
    const indexDispoReelle = indexerDisponibilites(m);
    const nomAffiche = (b) => nomsComplets.get(b.id) ?? b.Nom;
    const benevoles = m.benevoles
      .filter((b) => idsDisponibles.has(b.id))
      .sort((a, b) => nomAffiche(a).localeCompare(nomAffiche(b), 'fr'));

    if (benevoles.length === 0) {
      container.append(h('p', {class: 'empty'},
        t("Aucun bénévole disponible ce jour-là — importez ou déclarez des disponibilités (vue Disponibilités) pour qu'un roster apparaisse ici."),
      ));
      return;
    }

    const affectations = affectationsQuartParBenevole(m, ix, quartsDuJourSet);
    const creneauxArtiste = creneauxVoirArtisteParBenevole(m, ix, quartsDuJourSet, affectations);
    const conflitArtiste = creneauxConflitArtisteParBenevole(m, ix, quartsDuJourSet, affectations);

    const barre = h('div', {class: 'impression-barre'},
      h('p', {class: 'view__intro', style: {margin: '0'}},
        tn(benevoles.length, '{n} bénévole disponible {jour}.', '{n} bénévoles disponibles {jour}.',
          {jour: jourDansUnePhrase(jour.libelle)}),
      ),
      h('label', {
        style: {display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px'},
        title: t('Rouge visible à l’écran et à l’impression tant que la case est cochée — jamais pour les bénévoles par défaut.'),
      },
        h('input', {
          type: 'checkbox', checked: afficherConflits,
          onchange: (e) => {
            afficherConflits = e.target.checked;
            rafraichir();
          },
        }),
        t('Signaler les créneaux à problème'),
      ),
      h('button', {
        class: 'btn btn--primary btn--sm', type: 'button',
        onclick: () => {
          const pxImpression = largeurQuartImpressionPx(
            quartsDuJour.length, LARGEUR_COLONNE_NOM_PX + LARGEUR_COLONNE_INDICATIF_PX + LARGEUR_COLONNE_EQUIPE_PX,
          );
          const table = construireTable(
            ix, benevoles, nomsComplets, m.groupes, blocs, affectations, creneauxArtiste, conflitArtiste,
            indexDispos, indexDispoReelle, afficherConflits, pxImpression,
          );
          imprimer(
            [h('h2', null, t('Roster bénévoles — {jour}', {jour: jour.libelle})), table],
            'impression-roster',
          );
        },
      }, t('Imprimer ce roster')),
    );

    const table = construireTable(
      ix, benevoles, nomsComplets, m.groupes, blocs, affectations, creneauxArtiste, conflitArtiste,
      indexDispos, indexDispoReelle, afficherConflits, LARGEUR_QUART_ECRAN_PX,
    );

    container.append(barre, h('div', {class: 'impression-scroll papier'}, table));
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return () => { vueActive = false; desabonner(); };
}
