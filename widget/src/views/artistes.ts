/**
 * Vue artistes : qui joue quand, et combien de bénévoles veulent le voir
 * (cahier des charges §8.8). Une frise au quart d'heure, une ligne par
 * artiste, ses passages posés dessus comme des blocs libres — le même
 * principe que la frise Missions (`views/grille.ts`), à la demande
 * d'Antoine du 2026-09-22 : « créer exactement de la même façon les
 * artistes, chaque groupe sera l'équivalent d'une ligne […] leur horaire de
 * passage sera un sous-créneau/besoin ». Contrairement à un sous-créneau de
 * mission, un passage n'a pas de « suite » qui le suit quand on le déplace
 * (chaque ligne de la table `Artistes` est indépendante, §6) : déplacer ou
 * redimensionner un bloc ici n'a donc besoin d'aucune méthode d'écriture
 * dédiée, `Magasin.enregistrerArtiste` (déjà utilisée par la modale de
 * création/édition) suffit.
 *
 * Valeur métier au-delà de l'horaire : le souhait de voir un artiste est la
 * deuxième priorité de l'algorithme d'affectation juste après la
 * disponibilité (§7.2), donc une forte demande sur un passage explique
 * directement pourquoi une mission voisine peine à se remplir. La pastille
 * ambre d'un bloc montre où cette préférence est déjà contrariée par une
 * affectation existante (même seuil que `besoin--partiel`, aucun nouveau
 * contraste à valider).
 */

import type {Artiste, Epoch, Id} from '../domain/types';
import {
  type Jour, type LigneArtiste, type LigneGroupeArtiste,
  indexer, lignesGroupeesParArtiste, regrouperParJour,
} from '../logic/derive';
import type {ResultatEcritureFrise} from '../ui/frise';
import type {Magasin} from '../store';
import {cleJourFestival, PAS_SECONDES} from '../temps';
import {h, vider} from '../ui/dom';
import {type BlocFrise, construireFrise} from '../ui/frise';
import {
  ouvrirModalCreationArtiste, ouvrirModalCreationPassagePourArtiste, ouvrirModalEditionArtiste,
} from '../ui/modalArtiste';

/** Durée par défaut d'un passage créé au clic sur la piste — plus courte
 *  que celle des créneaux de mission (1h30) : un set d'artiste tient
 *  généralement en moins de temps. */
const DUREE_PASSAGE_PAR_DEFAUT_SECONDES = 45 * 60;

interface BlocArtiste extends BlocFrise {
  readonly ligne: LigneArtiste;
}

/** Un artiste juste créé (« + Nouvel artiste », modale identité seule, sans
 *  horaire — demande d'Antoine du 2026-09-23 : « je n'ai pas besoin de
 *  sélectionner un jour/heure dans cette modale-là, ça n'a aucun sens » →
 *  ajouter une ligne) : la table `Artistes` reste un passage par ligne
 *  (§6, aucun changement de modèle), donc cette ligne « sans passage » est
 *  représentée par une borne nulle, `Debut === Fin`, plutôt qu'une entité
 *  séparée. Jamais couverte par un jour de festival, elle n'apparaît donc
 *  jamais comme un bloc — exactement l'effet recherché : une ligne vide,
 *  prête à recevoir son premier créneau via `ouvrirModalCreationPassagePourArtiste`. */
function estPlaceholder(a: Artiste): boolean {
  return a.Debut === a.Fin;
}

export function montrerArtistes(container: HTMLElement, m: Magasin): () => void {
  let dernierMessage: {texte: string; ton: 'ok' | 'danger'} | null = null;

  function rafraichir(): void {
    const ix = indexer(m);
    const groupes = lignesGroupeesParArtiste(m, ix);
    // Le jour affiché vient du filtre global par macro-créneau — même
    // mécanisme que Missions (`views/grille.ts`), monté par `app.ts`
    // au-dessus de cette vue (demande d'Antoine du 2026-09-23 : « un
    // filtre macro qui va servir pour tout »). Remplace le regroupement
    // par passage d'artiste d'origine, qui ne montrait jamais les
    // macro-créneaux et n'avait rien sur quoi se caler sans passage.
    const jours = regrouperParJour(m.macroCreneaux);
    const jour = jours.find((j) => j.macros.some((ma) => ma.id === m.macroCreneauSelectionne)) ?? jours[0];

    vider(container);

    const boutonNouveau = h('button', {
      class: 'btn btn--primary btn--sm', type: 'button',
      onclick: () => ouvrirModalCreationArtiste(m),
    }, '+ Nouvel artiste');

    container.append(
      h('div', {class: 'agenda__toolbar'},
        boutonNouveau,
        h('span', {class: 'view__intro', style: {margin: '0'}},
          groupes.length === 0
            ? 'Aucun artiste dans ce jeu de données : utilisez « + Nouvel artiste » pour en créer un.'
            : '« En conflit » compte les bénévoles qui veulent voir l\'artiste mais tiennent déjà une place sur ce '
              + 'créneau (préférence forte non respectée, §7.2).'),
      ),
      ...(dernierMessage
        ? [h('p', {class: `pill pill--${dernierMessage.ton}`, style: {marginBottom: '8px'}}, dernierMessage.texte)]
        : []),
      !jour
        ? h('p', {class: 'empty'}, 'Aucun macro-créneau dans ce jeu de données : créez-en un dans l’Agenda avant de placer un passage.')
        : construireTimeline(groupes, jour),
    );
  }

  /** Même axe que Missions (`grille.ts`) : les bornes du macro-créneau du
   *  jour affiché, sans marge (un macro-créneau a presque toujours la
   *  sienne déjà). */
  function axeJour(jour: Jour): {debut: Epoch; fin: Epoch} {
    return {
      debut: Math.min(...jour.macros.map((ma) => ma.Debut)),
      fin: Math.max(...jour.macros.map((ma) => ma.Fin)),
    };
  }

  function construireTimeline(groupes: LigneGroupeArtiste[], jour: Jour): Node {
    const axe = axeJour(jour);
    const parLigneId = new Map<Id, LigneGroupeArtiste>();

    const lignes = groupes.map((groupe) => {
      const idLigne = groupe.passages[0]!.artiste.id;
      parLigneId.set(idLigne, groupe);
      // Une ligne fraîchement créée (« + Nouvel artiste ») n'a qu'un
      // placeholder (voir `estPlaceholder`) : son premier vrai créneau doit
      // le remplacer en place, pas s'ajouter à côté, sans quoi une ligne
      // vide inutilisable resterait derrière chaque nouvel artiste.
      const placeholder = groupe.passages.find((p) => estPlaceholder(p.artiste));
      const blocs: BlocArtiste[] = groupe.passages
        .filter((ligne) => !estPlaceholder(ligne.artiste) && cleJourFestival(ligne.artiste.Debut) === jour.cle)
        .map((ligne) => ({
          id: ligne.artiste.id, debut: ligne.artiste.Debut, fin: ligne.artiste.Fin, deplacable: true, ligne,
        }));
      return {
        id: idLigne,
        // Bouton dédié sur la ligne, même geste que « + créneau » sur une
        // ligne de mission (`grille.ts`) : le clic sur la piste (ci-dessous,
        // `onClicPiste`) reste possible, mais un bouton visible ne dépend
        // pas de trouver une zone de piste encore libre à cliquer (retour
        // d'Antoine du 2026-09-23 16h59 : « la vue artiste ne permet
        // toujours pas d'ajouter un artiste sur la même UX/UI que la vue
        // missions »).
        libelle: h('span', null,
          h('span', {class: 'nom'}, groupe.nom),
          h('span', {class: 'lieu'},
            groupe.passages.length > 1 ? `${groupe.passages.length} passages` : groupe.passages[0]!.lieuNom),
          h('button', {
            class: 'btn btn--ghost btn--sm timeline__label__bouton-propre', type: 'button',
            title: 'Ajouter un nouveau passage pour cet artiste',
            onclick: () => {
              const artisteReference = groupe.passages[0]!.artiste;
              ouvrirModalCreationPassagePourArtiste(m, groupe.nom, {
                lieu: artisteReference.Lieu,
                debut: axe.debut,
                fin: axe.debut + DUREE_PASSAGE_PAR_DEFAUT_SECONDES,
              }, placeholder?.artiste.id);
            },
          }, '+ passage'),
        ),
        blocs,
      };
    });

    return construireFrise(lignes, {
      axeDebut: axe.debut,
      axeFin: axe.fin,
      titrePiste: 'Cliquer pour créer le créneau de cet artiste, à l’horaire cliqué — redimensionnable ensuite',
      classesBloc: (bloc) => (bloc.ligne.conflits > 0 ? 'besoin--partiel' : 'besoin--ok'),
      titreBloc: (bloc) => `${bloc.ligne.lieuNom} — ${bloc.ligne.demande} intéressé${bloc.ligne.demande > 1 ? 's' : ''}`
        + (bloc.ligne.conflits > 0 ? `, ${bloc.ligne.conflits} en conflit` : ''),
      rendreBloc: (bloc) => [
        h('span', {class: 'besoin-cell__libelle'}, bloc.ligne.lieuNom),
        h('span', {class: 'besoin__effectif mono'}, String(bloc.ligne.demande)),
      ],
      onClicBloc: (bloc) => {
        dernierMessage = null;
        ouvrirModalEditionArtiste(m, bloc.ligne.artiste);
      },
      onClicPiste: (ligneFrise, debutSuggere) => {
        const groupe = parLigneId.get(ligneFrise.id)!;
        const artisteReference = groupe.passages[0]!.artiste;
        const placeholder = groupe.passages.find((p) => estPlaceholder(p.artiste));
        ouvrirModalCreationPassagePourArtiste(m, groupe.nom, {
          lieu: artisteReference.Lieu,
          debut: debutSuggere,
          fin: debutSuggere + DUREE_PASSAGE_PAR_DEFAUT_SECONDES,
        }, placeholder?.artiste.id);
      },
      onDeplacer: (bloc, deltaSecondes) => deplacerPassage(bloc.ligne.artiste, deltaSecondes),
      onRedimensionner: (bloc, depuisDebut, deltaSecondes) => redimensionnerPassage(bloc.ligne.artiste, depuisDebut, deltaSecondes),
      surErreur: (raison) => { dernierMessage = {texte: raison, ton: 'danger'}; rafraichir(); },
    });
  }

  /** Un passage n'a pas de « suite » (à la différence d'un sous-créneau de
   *  mission, §6) : le déplacer se résume à décaler ses deux bornes et à
   *  réenregistrer la ligne, via la même écriture que la modale de
   *  création/édition. */
  async function deplacerPassage(artiste: Artiste, deltaSecondes: number): Promise<ResultatEcritureFrise> {
    if (deltaSecondes === 0) { return {ok: true}; }
    try {
      await m.enregistrerArtiste({
        id: artiste.id, Nom: artiste.Nom, Lieu: artiste.Lieu,
        Debut: artiste.Debut + deltaSecondes, Fin: artiste.Fin + deltaSecondes,
      });
      return {ok: true};
    } catch {
      return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
    }
  }

  async function redimensionnerPassage(
    artiste: Artiste, depuisDebut: boolean, deltaSecondes: number,
  ): Promise<ResultatEcritureFrise> {
    const debut = depuisDebut ? artiste.Debut + deltaSecondes : artiste.Debut;
    const fin = depuisDebut ? artiste.Fin : artiste.Fin + deltaSecondes;
    if (fin - debut < PAS_SECONDES) {
      return {ok: false, raison: "Un passage ne peut pas durer moins d'un quart d'heure."};
    }
    try {
      await m.enregistrerArtiste({id: artiste.id, Nom: artiste.Nom, Lieu: artiste.Lieu, Debut: debut, Fin: fin});
      return {ok: true};
    } catch {
      return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
    }
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
