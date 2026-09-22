/**
 * Frise commune au quart d'heure, réutilisable par toute vue qui pose des
 * blocs (créneaux de mission, passages d'artiste…) sur des lignes empilées
 * (extraite de la vue Missions le 2026-09-22, à la demande du coordinateur,
 * pour que la vue Artistes s'en serve aussi sans dupliquer le geste). Un axe
 * du temps en en-tête, une piste cliquable par ligne, des blocs positionnés
 * par CSS Grid plutôt qu'en table — qui répétait sa frise en boucle au
 * défilement, le défaut d'origine signalé par Antoine.
 *
 * Ce module ne connaît ni mission, ni artiste, ni besoin : juste des blocs
 * {id, début, fin, déplaçable} posés sur des lignes {id, libellé, blocs}. Le
 * rendu d'un bloc, son style de statut, et ce qui se passe à l'écriture
 * (déplacer, redimensionner, créer) restent entièrement à l'appelant —
 * chaque vue pose son propre adaptateur.
 */
import type {Epoch, Id} from '../domain/types';
import {libelleHeure, PAS_SECONDES} from '../temps';
import {h} from './dom';

/** Largeur d'un quart d'heure dans la frise (px) — sert à la fois à poser
 *  les colonnes CSS Grid et à convertir un déplacement en pixels (glisser)
 *  en un nombre de quarts d'heure. */
export const LARGEUR_QUART_PX = 22;

export interface BlocFrise {
  readonly id: Id;
  readonly debut: Epoch;
  readonly fin: Epoch;
  /** Glissable et redimensionnable à la souris. Toujours `false` pour un
   *  bloc partagé entre plusieurs lignes : le déplacer affecterait les
   *  autres lignes qui le partagent. */
  readonly deplacable: boolean;
}

export interface LigneFrise<B extends BlocFrise> {
  readonly id: Id;
  readonly libelle: Node;
  readonly blocs: readonly B[];
}

export type ResultatEcritureFrise = {ok: true} | {ok: false; raison: string};

export interface OptionsFrise<B extends BlocFrise> {
  readonly axeDebut: Epoch;
  readonly axeFin: Epoch;
  readonly titrePiste?: string;
  /** Contenu intérieur du bouton d'un bloc (libellé, effectif, etc) — un
   *  seul nœud ou plusieurs enfants directs (jamais enveloppés dans un
   *  conteneur supplémentaire, qui casserait la mise en page flex du
   *  bouton). */
  readonly rendreBloc: (bloc: B) => Node | (Node | null)[];
  /** Classes ajoutées à `timeline__bloc`/`timeline__bloc--propre` — les
   *  modificateurs de statut (couleur), jamais un box-model : voir la note
   *  dans `style.css` sur `.besoin` et `.timeline__bloc`. */
  readonly classesBloc?: (bloc: B) => string;
  readonly titreBloc?: (bloc: B) => string | undefined;
  /** Un vrai clic (jamais la fin d'un glisser, filtré avant d'arriver ici). */
  readonly onClicBloc: (bloc: B) => void;
  /** Un clic sur la piste d'une ligne, hors de tout bloc — horaire suggéré
   *  au point cliqué. */
  readonly onClicPiste: (ligne: LigneFrise<B>, debutSuggere: Epoch) => void;
  readonly onDeplacer: (bloc: B, deltaSecondes: number) => Promise<ResultatEcritureFrise>;
  readonly onRedimensionner: (bloc: B, depuisDebut: boolean, deltaSecondes: number) => Promise<ResultatEcritureFrise>;
  /** Le déplacement/redimensionnement a échoué : côté appelant, le Magasin
   *  n'a alors ni muté ses données ni notifié ses abonnés, donc rien ne
   *  redessine la frise tout seul — à l'appelant de dire l'erreur et de
   *  redessiner s'il le souhaite. */
  readonly surErreur: (raison: string) => void;
}

/** Un clic natif suit toujours un mousedown/mouseup sur le même élément,
 *  quel que soit le mouvement entre les deux : ce drapeau, posé avant
 *  l'écriture pour arriver avant l'événement (synchrone, avant le premier
 *  `await`), empêche ce clic de rouvrir le bloc qu'on vient de glisser.
 *  Local à chaque appel de `construireFrise` : la frise se redessine
 *  entièrement à chaque changement du magasin, donc chaque rendu a ses
 *  propres boutons et n'a pas besoin de survivre au suivant. */
export function construireFrise<B extends BlocFrise>(
  lignes: readonly LigneFrise<B>[], options: OptionsFrise<B>,
): Node {
  const nbColonnes = Math.max(1, Math.round((options.axeFin - options.axeDebut) / PAS_SECONDES));
  let blocVientDeGlisser = false;

  /** Glisser un bloc déplaçable : par défaut, déplace ce bloc par pas de 15
   *  minutes (l'appelant décide ce qu'il entraîne avec lui, la frise ne
   *  regroupe rien elle-même). ALT maintenu au relâchement redimensionne à
   *  la place le bloc saisi, depuis le bord le plus proche du point de
   *  saisie. Un relâchement sans déplacement (delta nul) est un simple
   *  clic, laissé au onclick du bouton. */
  function demarrerGlisser(e: MouseEvent, bouton: HTMLButtonElement, bloc: B): void {
    if (e.button !== 0) { return; }
    e.preventDefault();
    const xDepart = e.clientX;
    const rect = bouton.getBoundingClientRect();
    const depuisDebut = (e.clientX - rect.left) < rect.width / 2;
    let deltaQuarts = 0;

    function onMove(ev: MouseEvent): void {
      deltaQuarts = Math.round((ev.clientX - xDepart) / LARGEUR_QUART_PX);
    }
    async function onUp(ev: MouseEvent): Promise<void> {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (deltaQuarts === 0) { return; }
      blocVientDeGlisser = true;
      const deltaSecondes = deltaQuarts * PAS_SECONDES;
      const resultat = ev.altKey
        ? await options.onRedimensionner(bloc, depuisDebut, deltaSecondes)
        : await options.onDeplacer(bloc, deltaSecondes);
      if (!resultat.ok) { options.surErreur(resultat.raison); }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function elementBloc(bloc: B, rangee: number): Node {
    const colStart = Math.round((bloc.debut - options.axeDebut) / PAS_SECONDES) + 2;
    const colEnd = Math.round((bloc.fin - options.axeDebut) / PAS_SECONDES) + 2;
    const classesSupplementaires = options.classesBloc?.(bloc) ?? '';
    const bouton = h('button', {
      type: 'button',
      class: `timeline__bloc${bloc.deplacable ? ' timeline__bloc--propre' : ''}${classesSupplementaires ? ` ${classesSupplementaires}` : ''}`,
      style: {gridRow: String(rangee), gridColumn: `${colStart} / ${colEnd}`},
      'data-bloc-id': String(bloc.id),
      title: options.titreBloc?.(bloc),
      onclick: () => {
        if (blocVientDeGlisser) { blocVientDeGlisser = false; return; }
        options.onClicBloc(bloc);
      },
    }, options.rendreBloc(bloc)) as HTMLButtonElement;
    if (bloc.deplacable) { bouton.addEventListener('mousedown', (ev) => demarrerGlisser(ev as MouseEvent, bouton, bloc)); }
    return bouton;
  }

  const items: Node[] = [
    h('div', {class: 'timeline__coin', style: {gridRow: '1', gridColumn: '1'}}),
  ];
  for (let i = 0; i < nbColonnes; i++) {
    const texte = libelleHeure(options.axeDebut + i * PAS_SECONDES);
    const surLHeure = texte.endsWith(':00');
    items.push(h('div', {
      class: `axe-quart${surLHeure ? ' axe-quart--heure' : ''}`,
      style: {gridRow: '1', gridColumn: `${i + 2} / ${i + 3}`},
    }, surLHeure ? texte : ''));
  }

  lignes.forEach((ligne, indexLigne) => {
    const rangee = indexLigne + 2;
    items.push(h('div', {class: 'timeline__label', style: {gridRow: String(rangee), gridColumn: '1'}}, ligne.libelle));

    const piste = h('div', {
      class: 'timeline__piste',
      style: {gridRow: String(rangee), gridColumn: `2 / ${nbColonnes + 2}`},
      title: options.titrePiste,
      onclick: (e: Event) => {
        const rect = piste.getBoundingClientRect();
        const quart = Math.max(0, Math.floor(((e as MouseEvent).clientX - rect.left) / LARGEUR_QUART_PX));
        options.onClicPiste(ligne, options.axeDebut + quart * PAS_SECONDES);
      },
    }) as HTMLElement;
    items.push(piste);

    for (const bloc of ligne.blocs) { items.push(elementBloc(bloc, rangee)); }
  });

  const timeline = h('div', {
    class: 'timeline',
    style: {
      gridTemplateColumns: `190px repeat(${nbColonnes}, ${LARGEUR_QUART_PX}px)`,
      gridTemplateRows: `repeat(${lignes.length + 1}, auto)`,
    },
  }, ...items);
  return h('div', {class: 'timeline-wrap'}, timeline);
}
