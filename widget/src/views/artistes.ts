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
  type GroupeJourFestival, type LigneArtiste, type LigneGroupeArtiste,
  indexer, lignesGroupeesParArtiste, regrouperParJourFestival,
} from '../logic/derive';
import type {ResultatEcritureFrise} from '../ui/frise';
import type {Magasin} from '../store';
import {cleJourFestival, epochDebutJourFestival, libelleJourLong, PAS_SECONDES} from '../temps';
import {h, vider} from '../ui/dom';
import {type BlocFrise, construireFrise} from '../ui/frise';
import {
  ouvrirModalCreationArtiste, ouvrirModalCreationPassagePourArtiste, ouvrirModalEditionArtiste,
} from '../ui/modalArtiste';

type JourArtistes = GroupeJourFestival<Artiste>;

/** Marge de part et d'autre du premier et du dernier passage du jour : sans
 *  elle, un jour à un seul passage remplirait la frise de bord en bord,
 *  sans piste cliquable pour en ajouter un autre avant ou après (à la
 *  différence de la vue Missions, dont l'axe vient de macro-créneaux qui
 *  ont presque toujours leur propre marge). */
const MARGE_AXE_SECONDES = PAS_SECONDES * 2;

/** Durée par défaut d'un passage créé au clic sur la piste — plus courte
 *  que celle des créneaux de mission (1h30) : un set d'artiste tient
 *  généralement en moins de temps. */
const DUREE_PASSAGE_PAR_DEFAUT_SECONDES = 45 * 60;

interface BlocArtiste extends BlocFrise {
  readonly ligne: LigneArtiste;
}

export function montrerArtistes(container: HTMLElement, m: Magasin): () => void {
  let jourIndex = 0;
  let dernierMessage: {texte: string; ton: 'ok' | 'danger'} | null = null;

  /** Jour de secours quand aucun artiste n'a encore de passage : sans lui,
   *  cette vue n'a rien pour caler un axe (pas de macro-créneau indépendant
   *  à interroger, contrairement à Missions, §6) et retombait sur un simple
   *  message texte à la place de la frise — ce qu'Antoine a signalé comme
   *  « complètement différent de Missions, pas de timeline » (2026-09-23
   *  16h29) : Missions affiche sa frise et ses lignes même sans contenu,
   *  cette vue doit faire pareil. */
  function jourParDefaut(): JourArtistes {
    const debut = epochDebutJourFestival(Math.floor(Date.now() / 1000));
    return {cle: cleJourFestival(debut), libelle: libelleJourLong(debut), items: []};
  }

  function rafraichir(): void {
    const ix = indexer(m);
    const groupes = lignesGroupeesParArtiste(m, ix);
    // Regroupé par jour de festival à partir des passages eux-mêmes plutôt
    // que des macro-créneaux : un artiste n'a pas de lien avec la table
    // MacroCreneaux (§6), donc cette vue reste utilisable même sans aucune
    // mission créée (« from scratch », demande d'Antoine du 2026-09-22).
    const jours = regrouperParJourFestival(m.artistes, (a) => a.Debut);
    jourIndex = Math.min(jourIndex, Math.max(jours.length - 1, 0));
    const jour = jours[jourIndex] ?? jourParDefaut();

    vider(container);

    const boutonNouveau = h('button', {
      class: 'btn btn--primary btn--sm', type: 'button',
      onclick: () => ouvrirModalCreationArtiste(m),
    }, '+ Nouveau passage');

    container.append(
      h('div', {class: 'agenda__toolbar'},
        boutonNouveau,
        h('span', {class: 'view__intro', style: {margin: '0'}},
          groupes.length === 0
            ? 'Aucun artiste dans ce jeu de données : utilisez « + Nouveau passage » pour en créer un.'
            : '« En conflit » compte les bénévoles qui veulent voir l\'artiste mais tiennent déjà une place sur ce '
              + 'créneau (préférence forte non respectée, §7.2).'),
      ),
      ...(jours.length > 0
        ? [h('div', {class: 'agenda__toolbar'},
            ...jours.map((j, i) => h('button', {
              class: `btn btn--sm${i === jourIndex ? ' btn--primary' : ''}`, type: 'button',
              onclick: () => { jourIndex = i; rafraichir(); },
            }, j.libelle.split(' ').slice(0, 1).join(' '))),
          )]
        : []),
      ...(dernierMessage
        ? [h('p', {class: `pill pill--${dernierMessage.ton}`, style: {marginBottom: '8px'}}, dernierMessage.texte)]
        : []),
      construireTimeline(groupes, jour),
    );
  }

  /** L'axe du jour vient des passages eux-mêmes (pas de macro-créneau à
   *  interroger), avec une marge de chaque côté — voir `MARGE_AXE_SECONDES`.
   *  Le jour de secours (`jourParDefaut`, aucun artiste) n'a aucun passage
   *  pour borner un axe : repli sur le jour de festival courant en entier. */
  function axeJour(jour: JourArtistes): {debut: Epoch; fin: Epoch} {
    if (jour.items.length === 0) {
      const debut = epochDebutJourFestival(Math.floor(Date.now() / 1000));
      return {debut, fin: debut + 24 * 3600};
    }
    return {
      debut: Math.min(...jour.items.map((a) => a.Debut)) - MARGE_AXE_SECONDES,
      fin: Math.max(...jour.items.map((a) => a.Fin)) + MARGE_AXE_SECONDES,
    };
  }

  function construireTimeline(groupes: LigneGroupeArtiste[], jour: JourArtistes): Node {
    const axe = axeJour(jour);
    const parLigneId = new Map<Id, LigneGroupeArtiste>();

    const lignes = groupes.map((groupe) => {
      const idLigne = groupe.passages[0]!.artiste.id;
      parLigneId.set(idLigne, groupe);
      const blocs: BlocArtiste[] = groupe.passages
        .filter((ligne) => cleJourFestival(ligne.artiste.Debut) === jour.cle)
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
              });
            },
          }, '+ passage'),
        ),
        blocs,
      };
    });

    return construireFrise(lignes, {
      axeDebut: axe.debut,
      axeFin: axe.fin,
      titrePiste: 'Cliquer pour ajouter un nouveau passage à cet artiste, à l’horaire cliqué',
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
        ouvrirModalCreationPassagePourArtiste(m, groupe.nom, {
          lieu: artisteReference.Lieu,
          debut: debutSuggere,
          fin: debutSuggere + DUREE_PASSAGE_PAR_DEFAUT_SECONDES,
        });
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
