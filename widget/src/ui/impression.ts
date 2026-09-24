/**
 * Éléments d'écran partagés par les deux vues imprimables (roster bénévoles,
 * plannings par équipe — demande d'Antoine du 2026-09-23) : lancement de
 * l'impression (même mécanisme que `views/benevole.ts`, jamais modifié —
 * `#zone-impression` / `.impression-active`, posés par `app.ts`), en-tête de
 * timeline au quart d'heure partagé entre les deux vues, et ajustement de la
 * taille du texte d'un bloc pour qu'il tienne dans son créneau.
 */

import type {Epoch} from '../domain/types';
import type {BlocMacro} from '../logic/dispos-terrain';
import {estHeurePleine} from '../logic/dispos-terrain';
import {libelleHeure} from '../temps';
import {h, vider} from './dom';
import './impression.css';

/** Même largeur qu'ailleurs dans le widget (`ui/frise.ts` `LARGEUR_QUART_PX`,
 *  `.dispos-table__heure`) — reprise volontaire pour que l'aperçu à l'écran
 *  de ces deux vues se lise comme les autres grilles au quart d'heure. */
export const LARGEUR_QUART_ECRAN_PX = 22;

/** Largeur de page d'impression estimée (A4 paysage, marges de 10mm
 *  déduites) : sert uniquement à choisir une taille de police plausible
 *  (`ajusterTexteBloc`) — les colonnes elles-mêmes sont posées en
 *  pourcentage (voir `impression.css`), donc une estimation légèrement
 *  fausse ne fait que sur- ou sous-évaluer la police, jamais déborder la
 *  page réelle. */
const LARGEUR_PAGE_IMPRESSION_PX = 1050;

/** Marge intérieure d'une cellule de bloc (`.impression-bloc`, voir
 *  `impression.css`) à déduire de la largeur disponible avant d'ajuster la
 *  taille du texte — sans quoi un texte calculé pour tenir pile dans la
 *  largeur du bloc déborde du padding et se fait tronquer à l'affichage
 *  (constaté à l'écran, 2026-09-23 : "Bar" coupé en "Ba" sur un seul quart
 *  d'heure). */
export const PADDING_HORIZONTAL_BLOC_PX = 6;

export function largeurQuartImpressionPx(nbQuartsTotal: number, colonnesFixesPx: number): number {
  if (nbQuartsTotal === 0) { return 0; }
  return Math.max(1, (LARGEUR_PAGE_IMPRESSION_PX - colonnesFixesPx) / nbQuartsTotal);
}

/** Lance l'impression d'un contenu construit pour l'occasion, dans la zone
 *  dédiée déjà posée par `app.ts` (`#zone-impression`, jamais touchée ici).
 *  `classePage` porte l'orientation paysage (page CSS nommée, voir
 *  `impression.css`) sans jamais changer l'orientation par défaut (portrait)
 *  de la feuille de route bénévole, qui partage le même mécanisme. */
export function imprimer(contenu: Node[], classePage: string): void {
  const zone = document.getElementById('zone-impression');
  if (!zone) { return; }
  vider(zone);
  zone.append(h('div', {class: classePage}, ...contenu));
  document.body.classList.add('impression-active');
  const nettoyer = () => {
    document.body.classList.remove('impression-active');
    vider(zone);
    window.removeEventListener('afterprint', nettoyer);
  };
  window.addEventListener('afterprint', nettoyer);
  window.print();
}

/** Les <th> de l'en-tête de timeline (un par quart d'heure de chaque bloc,
 *  séparés visuellement à chaque limite de macro-créneau) — partagés entre
 *  le roster bénévoles et les plannings par équipe, qui posent tous deux la
 *  même trame au quart d'heure au-dessus de leurs lignes. */
export function cellulesEnTeteQuarts(blocs: readonly BlocMacro[]): Node[] {
  const cellules: Node[] = [];
  blocs.forEach((bloc, iBloc) => {
    bloc.quarts.forEach((q: Epoch, iQuart: number) => {
      const limiteMacro = iQuart === 0 && iBloc > 0;
      cellules.push(h('th', {
        class: `impression-table__heure${limiteMacro ? ' impression-table__heure--limite-macro' : ''}`,
        scope: 'col',
        title: iQuart === 0 ? bloc.macro.Nom : undefined,
      }, estHeurePleine(q) ? libelleHeure(q) : ''));
    });
  });
  return cellules;
}

const TAILLES_POLICE_BLOC_PX = [11, 10, 9, 8, 7, 6.5, 6] as const;
/** Largeur moyenne d'un caractère pour les polices système utilisées ici
 *  (`--font-body`), en fraction de la taille de police — estimation
 *  volontairement approximative (pas de mesure canvas, coûteuse à refaire
 *  sur des centaines de cellules et indisponible en test) : suffisante pour
 *  choisir une taille plausible, jamais pour garantir un ajustement au
 *  pixel près. */
const RATIO_LARGEUR_CARACTERE = 0.56;

/**
 * Choisit, parmi `candidats` (du plus complet au plus court — ex.
 * `["Comptage entrée Village partenaire"]`, ou `["Marie (A1)", "Marie"]`),
 * le premier qui tient dans `largeurDisponiblePx` à la plus grande taille de
 * police possible. Aucun ne tient même au plancher : retourne `null` plutôt
 * que de tronquer au hasard (demande d'Antoine, 2026-09-23 : « coupure quand
 * le bloc est vraiment trop court ») — l'appelant garde alors le bloc
 * coloré, sans texte, avec le nom complet en infobulle à l'écran.
 */
export function ajusterTexteBloc(
  candidats: readonly string[], largeurDisponiblePx: number,
): {texte: string; taillePolicePx: number} | null {
  for (const texte of candidats) {
    for (const taille of TAILLES_POLICE_BLOC_PX) {
      if (texte.length * taille * RATIO_LARGEUR_CARACTERE <= largeurDisponiblePx) {
        return {texte, taillePolicePx: taille};
      }
    }
  }
  return null;
}

/**
 * Comme `ajusterTexteBloc`, mais pour un texte unique (pas de candidat plus
 * court à essayer — le roster n'a pas de code court à proposer à la place
 * du nom de mission) : si même le plancher ne suffit pas, tronque au
 * plancher plutôt que de laisser le bloc coloré sans aucune information.
 * Ajouté après retour d'Antoine (2026-09-24) : beaucoup de créneaux réels
 * durent 30 à 45 minutes, plus courts que ce qu'il faut pour un nom de
 * mission d'une vingtaine de caractères même au plancher — le bloc restait
 * bleu sans rien dessus, illisible sur une feuille imprimée où l'infobulle
 * du survol n'existe plus. Ne retourne `null` que si même un seul
 * caractère plus l'ellipse ne tient pas (créneau de quelques pixels).
 */
export function ajusterTexteBlocAvecTroncature(
  texte: string, largeurDisponiblePx: number,
): {texte: string; taillePolicePx: number} | null {
  const exact = ajusterTexteBloc([texte], largeurDisponiblePx);
  if (exact) { return exact; }
  const taillePlancher = TAILLES_POLICE_BLOC_PX[TAILLES_POLICE_BLOC_PX.length - 1]!;
  const maxCaracteres = Math.floor(largeurDisponiblePx / (taillePlancher * RATIO_LARGEUR_CARACTERE)) - 1;
  if (maxCaracteres < 1) { return null; }
  return {texte: `${texte.slice(0, maxCaracteres)}…`, taillePolicePx: taillePlancher};
}
