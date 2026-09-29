/**
 * Vue indicatifs : donne à trancher visuellement le §6.3 du cahier des
 * charges. Reprise de zéro (première version jugée inutilisable par Antoine)
 * — l'ancienne vue montrait un indicatif hors de tout contexte, dans une
 * liste plate puis une rangée de cartes reliées par des flèches. Celle-ci
 * réutilise au contraire la même frise que la vue Missions (`ui/frise.js`,
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
 * déplacer/redimensionner un créneau, ni faire l'appel. Les places se
 * pourvoient et l'appel se fait dans la table du jour (étape 5), les
 * créneaux se déplacent dans Missions — ici, une place se lit et se
 * verrouille, mais ne se pourvoit pas ; un créneau se positionne dans le
 * temps, mais n'est jamais glissable depuis cette vue. Le jour affiché est
 * celui du bandeau commun.
 */

import {t, tn, traductions} from '../i18n.js';
import {
  couvertureBesoin, indexer, placesDuGroupe, positionsDuGroupe,
  quartsCouvertsParGroupe, regrouperParJour, sousCreneauxApplicables,
} from '../logic/derive.js';
import {jourAffiche} from '../logic/journee.js';
import {classerCandidats} from '../moteur/adaptateur-magasin.js';
import {peutVoirArtiste, SEUIL_MINUTES_VOIR_ARTISTE, seChevauchent} from '../moteur/index.js';
import {PAS_SECONDES} from '../temps.js';
import {fermerPanneau, h, ICONES, icone, ouvrirPanneau, vider} from '../ui/dom.js';
import {construireFrise} from '../ui/frise.js';

traductions({
  "Échec de l'écriture dans le document Grist connecté. Réessayez.": 'Could not write to the connected Grist document. Try again.',
  "Aucun macro-créneau défini pour l'instant. Commencez par l'étape 1 (Agenda), puis définissez des sous-créneaux, avant de positionner des indicatifs ici.":
    'No time blocks defined yet. Start with step 1 (Agenda), then define slots, before placing call signs here.',
  'Aucun sous-créneau ce jour. Définissez-en depuis l’agenda avant de positionner des indicatifs.':
    'No slots on this day. Define some from the agenda before placing call signs.',
  'Aucune mission définie. Créez vos missions avant de positionner des indicatifs.':
    'No tasks defined. Create your tasks before placing call signs.',
  'Aucune mission pour cette équipe. Changez de filtre ou créez-en une.': 'No tasks for this team. Change the filter or create one.',
  'Toutes les équipes': 'All teams',
  'Choisissez la case où repositionner {code}.': 'Choose the cell to move {code} to.',
  'Choisissez la case où ajouter une nouvelle position pour {code}.': 'Choose the cell for a new placement of {code}.',
  Annuler: 'Cancel',
  'Indicatifs ne déplace pas les créneaux — utilisez la vue Missions.': 'The Call signs view does not move slots — use the Tasks view.',
  'Indicatifs ne redimensionne pas les créneaux — utilisez la vue Missions.': 'The Call signs view does not resize slots — use the Tasks view.',
  'min {min}': 'min {min}',
  '≈{n} binôme': '≈{n} pair',
  '≈{n} binômes': '≈{n} pairs',
  'Indication : {min} places ÷ 2, arrondi au-dessus — pas une création automatique':
    'Suggestion: headcount {min} ÷ 2, rounded up — never created automatically',
  'Dépasse le maximum — signalé, pas bloquant': 'Over the maximum — flagged, not blocking',
  'Positionner un binôme sur ce besoin (§6.3)': 'Place a buddy pair on this need (§6.3)',
  'Ajouter un binôme supplémentaire sur ce besoin (§6.3)': 'Add another buddy pair to this need (§6.3)',
  '{nom} (absent·e)': '{nom} (absent)',
  'Aucun bénévole disponible ne ressort du classement.': 'The ranking brings up no available volunteer.',
  binôme: 'buddy pair',
  'place seule': 'single spot',
  '{n}-uplet': 'group of {n}',
  Fermer: 'Close',
  Composition: 'Members',
  'Voir des bénévoles suggérés pour cette place': 'See suggested volunteers for this spot',
  'Non pourvue': 'Unfilled',
  Déverrouiller: 'Unlock',
  Verrouiller: 'Lock',
  "L'affectation des bénévoles se fait depuis la vue Missions — ici, une place se verrouille et peut vous suggérer des candidats classés (#1/#2), mais ne se pourvoit pas depuis ce panneau.":
    'Volunteers are assigned from the Tasks view — here, a spot can be locked and can suggest ranked candidates (#1/#2), but it is not filled from this panel.',
  'Trajectoire du jour': 'Route for the day',
  'Pas encore positionné sur ce jour.': 'Not yet placed on this day.',
  'Déplacer…': 'Move…',
  'Supprimer cette position': 'Delete this placement',
  Supprimer: 'Delete',
  '+ Ajouter une position': '+ Add a placement',
  'Glissez une puce vers une autre case du planning pour la repositionner directement.':
    'Drag a chip to another cell of the schedule to move it there directly.',
  'Artistes à voir': 'Artists to see',
  "Aucun passage n'est visible sur les créneaux libres de ce jour.": 'No set can be seen during this day’s free slots.',
  'Souhaité par {noms}': 'Wished for by {noms}',
  '★ souhaité': '★ wished for',
  "Au moins {minutes} minutes libres pendant le passage, sur les créneaux où ce binôme n'est pas positionné ce jour.":
    'At least {minutes} free minutes during the set, on the slots where this buddy pair is not placed that day.',
});

export function montrerIndicatifs(container, m) {
  let equipeFiltre = 'toutes';
  /** Jour affiché au rendu précédent : le bandeau commun (`app.js`) le
   *  choisit ; en changer ferme ce qui visait l'ancien jour. */
  let cleJourAffiche = null;
  let groupeSelectionne = null;
  let modeCible = null;
  let dernierMessage = null;
  /** Place dont le panneau montre la liste de candidats suggérés (retour
   *  Antoine 2026-09-23, point 9 : cliquer #1/#2). Purement informatif —
   *  jamais d'affectation depuis cette vue, voir `panneauIndicatif`. */
  let placeCandidatsVisible = null;

  // État transitoire du glisser-déposer natif (pas dans le magasin : ça ne
  // survit pas à un rafraîchissement, et n'a pas à le faire).
  let groupeDeplace = null;
  let besoinOrigineDeplace = null;

  /** Écrit vers le magasin (mode connecté : vers Grist, voir `EcritureGrist`)
   *  sans jamais laisser un échec silencieux : la case ou la puce reste
   *  telle quelle et un message rouge apparaît, plutôt que de laisser
   *  croire à un déplacement ou une création qui n'a pas eu lieu. */
  async function ecrire(action) {
    try {
      await action();
      dernierMessage = null;
    } catch {
      dernierMessage = {texte: t("Échec de l'écriture dans le document Grist connecté. Réessayez."), ton: 'danger'};
    }
    // `action` notifie déjà les abonnés sur un succès (`Magasin.notifier`),
    // donc ce rafraîchissement peut sembler redondant dans ce cas — mais un
    // échec, lui, interrompt `action` avant tout `notifier`, et c'est ce
    // second cas qui a besoin de ce rafraîchissement explicite pour que le
    // message d'erreur s'affiche.
    rafraichir();
  }

  /** `Magasin.supprimerPosition` ne lève jamais : elle rend `{ok, raison}`
   *  (même contrat que `supprimerMacroCreneau`, voir `views/agenda.js`) —
   *  `ecrire()` ci-dessus, bâti pour des méthodes qui lèvent, ne verrait
   *  donc jamais l'échec. */
  async function supprimerPosition(positionId) {
    const resultat = await m.supprimerPosition(positionId);
    dernierMessage = resultat.ok ? null : {texte: resultat.raison, ton: 'danger'};
    rafraichir();
  }

  function rafraichir() {
    const ix = indexer(m);
    // Le jour vient du bandeau commun (un seul jour pour toutes les vues,
    // ménage du 2026-09-29) : plus de sélecteur propre à cet écran.
    const jours = regrouperParJour(m.macroCreneaux);
    const jour = jourAffiche(jours, m.macroCreneauSelectionne);
    if ((jour?.cle ?? null) !== cleJourAffiche) {
      if (cleJourAffiche != null) { groupeSelectionne = null; modeCible = null; placeCandidatsVisible = null; }
      cleJourAffiche = jour?.cle ?? null;
    }
    const tousSousCreneaux = jour
      ? m.sousCreneaux.filter((sc) => jour.macros.some((ma) => ma.id === sc.Macro_creneau))
      : [];
    const missions = m.missions
      .filter((mi) => equipeFiltre === 'toutes' || mi.Equipe === equipeFiltre)
      .sort((a, b) => a.Equipe - b.Equipe || a.Nom.localeCompare(b.Nom, 'fr'));

    vider(container);
    container.append(
      h('div', {class: 'indicatifs-layout'},
        barreOutils(),
        dernierMessage ? h('span', {class: `pill pill--${dernierMessage.ton}`}, dernierMessage.texte) : null,
        modeCible ? bandeauCible() : null,
        jours.length === 0
          ? h('p', {class: 'empty'}, t("Aucun macro-créneau défini pour l'instant. Commencez par l'étape 1 (Agenda), puis définissez des sous-créneaux, avant de positionner des indicatifs ici."))
          : tousSousCreneaux.length === 0
            ? h('p', {class: 'empty'}, t('Aucun sous-créneau ce jour. Définissez-en depuis l’agenda avant de positionner des indicatifs.'))
            : missions.length === 0
              ? h('p', {class: 'empty'}, equipeFiltre === 'toutes'
                ? t('Aucune mission définie. Créez vos missions avant de positionner des indicatifs.')
                : t('Aucune mission pour cette équipe. Changez de filtre ou créez-en une.'))
              : construireTimelineIndicatifs(ix, missions, jour, tousSousCreneaux),
      ),
    );

    if (groupeSelectionne != null && ix.groupe.has(groupeSelectionne)) {
      panneauIndicatif(ix, groupeSelectionne, jour);
    } else {
      fermerPanneau();
    }
  }

  /** Axe commun du jour affiché — mêmes bornes que la frise Missions (même
   *  calcul, non exporté de `grille.js` : trois lignes d'arithmétique, pas
   *  une règle métier susceptible de diverger comme l'était
   *  `sousCreneauxApplicables`). */
  function axeJour(jour) {
    const debut = Math.min(...jour.macros.map((ma) => ma.Debut));
    const fin = Math.max(...jour.macros.map((ma) => ma.Fin));
    return {debut, fin};
  }

  // --- Barre d'outils : équipe (même contrôle que la vue Missions) ----------

  function barreOutils() {
    return h('div', {class: 'agenda__toolbar'},
      h('select', {
        class: 'select',
        onchange: (e) => {
          const v = e.target.value;
          equipeFiltre = v === 'toutes' ? 'toutes' : Number(v);
          rafraichir();
        },
      },
        h('option', {value: 'toutes'}, t('Toutes les équipes')),
        ...m.equipes.map((eq) => h('option', {value: String(eq.id), selected: equipeFiltre === eq.id}, eq.Nom)),
      ),
    );
  }

  function bandeauCible() {
    const mode = modeCible;
    const groupe = m.groupes.find((g) => g.id === mode.groupeId);
    const code = groupe?.Code ?? '';
    const texte = mode.mode === 'deplacer'
      ? t('Choisissez la case où repositionner {code}.', {code})
      : t('Choisissez la case où ajouter une nouvelle position pour {code}.', {code});
    return h('div', {class: 'mode-bandeau'},
      h('span', null, texte),
      h('button', {class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { modeCible = null; rafraichir(); }}, t('Annuler')),
    );
  }

  // --- Frise : une ligne par mission, ses créneaux positionnés dans le temps

  function construireTimelineIndicatifs(
    ix, missions, jour, tousSousCreneaux,
  ) {
    const axe = axeJour(jour);
    const lignes = missions.map((mission) => {
      const lieu = ix.lieu.get(mission.Lieu);
      // Même défaut que `rosterCard` dans `views/affectation.js`, corrigé
      // le 2026-09-23 (équipe orpheline) : `equipe` peut être absente.
      const equipe = ix.equipe.get(mission.Equipe);
      const blocs = sousCreneauxApplicables(mission, tousSousCreneaux).map((sc) => {
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
          h('span', {class: 'dot', style: {background: equipe?.Couleur ?? 'var(--text-faint)', marginRight: '6px'}}),
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
      rendreBloc: (bloc) => (bloc.besoin ? [celluleIndicatifs(ix, bloc.besoin.id, jour.cle)] : []),
      // Le clic utile (sélectionner une puce, cibler un besoin en mode
      // cible) est déjà géré par les écouteurs posés sur le contenu du bloc
      // dans `celluleIndicatifs` ; un clic hors de tout contenu (rare, une
      // case sans besoin) n'a rien à déclencher.
      onClicBloc: () => {},
      onClicPiste: () => {},
      // Jamais appelés : tous les blocs sont `deplacable: false` (voir plus
      // haut), mais le type de `construireFrise` les exige.
      onDeplacer: async () => ({ok: false, raison: t('Indicatifs ne déplace pas les créneaux — utilisez la vue Missions.')}),
      onRedimensionner: async () => (
        {ok: false, raison: t('Indicatifs ne redimensionne pas les créneaux — utilisez la vue Missions.')}
      ),
      surErreur: () => {},
    });
  }

  function celluleIndicatifs(ix, besoinId, jourCle) {
    const c = couvertureBesoin(m, ix, besoinId);
    const sc = ix.sousCreneau.get(c.besoin.Sous_creneau);
    const sousEffectif = c.pourvues < c.besoin.Effectif_min;
    const surEffectif = c.pourvues > c.besoin.Effectif_max;
    const surlignee = groupeSelectionne != null && c.groupesPositionnes.some((g) => g.groupe.id === groupeSelectionne);
    // Indication, jamais une création automatique ni un blocage (retour
    // Antoine 2026-09-22, point 3) : deux places par binôme, arrondi au-dessus.
    const binomesRecommandes = Math.ceil(c.besoin.Effectif_min / 2);
    const libelleMin = t('min {min}', {min: c.besoin.Effectif_min});
    const libelleReco = tn(binomesRecommandes, '≈{n} binôme', '≈{n} binômes');

    const cellule = h('div', {
      class: `indicatif-cell${modeCible ? ' indicatif-cell--cible' : ''}${surlignee ? ' indicatif-cell--surlignee' : ''}`,
    },
      // L'horaire n'a plus d'en-tête de colonne partagé (frise, retour
      // Antoine 2026-09-23) : chaque bloc porte le sien, comme la vue
      // Missions le fait déjà pour ses propres blocs.
      h('span', {class: 'besoin-cell__libelle', title: sc.Libelle}, sc.Libelle),
      h('div', {
        class: `indicatif-cell__eff${sousEffectif ? ' indicatif-cell__eff--sous' : ''}`,
        title: `${libelleMin} · ${libelleReco}`,
      },
        h('span', null, libelleMin),
        h('span', {
          class: 'indicatif-cell__reco',
          title: t('Indication : {min} places ÷ 2, arrondi au-dessus — pas une création automatique', {min: c.besoin.Effectif_min}),
        }, libelleReco),
        surEffectif ? h('span', {class: 'flag', title: t('Dépasse le maximum — signalé, pas bloquant')}, '⚑') : null,
      ),
      ...c.groupesPositionnes.map((g) => puceGroupe(ix, g.groupe, besoinId, jourCle)),
    );

    // Icône seule, jamais un bouton en toutes lettres (retour Connexion
    // Grist 2026-09-23 : « + positionner un binôme » mesure ~55px, plus
    // large qu'un bloc de 15-30 min même déplié — et un survol qui doit
    // rester lisible AU REPOS ne peut pas dépendre d'un élargissement, qui
    // recouvre alors le bloc voisin). Le texte complet reste en `title`.
    cellule.append(h('button', {
      class: 'ajouter-binome', type: 'button',
      title: c.groupesPositionnes.length === 0
        ? t('Positionner un binôme sur ce besoin (§6.3)')
        : t('Ajouter un binôme supplémentaire sur ce besoin (§6.3)'),
      onclick: (e) => { e.stopPropagation(); selectionnerNouveauGroupe(besoinId); },
    }, '+'));

    cellule.addEventListener('dragover', (e) => {
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
    cellule.addEventListener('drop', (e) => {
      e.preventDefault();
      cellule.classList.remove('indicatif-cell--dropzone', 'indicatif-cell--dropzone-copie');
      if (groupeDeplace == null || besoinOrigineDeplace == null || besoinOrigineDeplace === besoinId) { return; }
      // Alt tenu au moment de relâcher (pas au moment de saisir) tranche
      // entre les deux gestes — même convention que la frise Missions/
      // Artistes (`ui/frise.js`, `ev.altKey` relu au dépôt). Alt+glisser
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

  async function selectionnerNouveauGroupe(besoinId) {
    await ecrire(async () => {
      const id = await m.creerGroupeSurBesoin(besoinId);
      if (id === -1) { return; }
      groupeSelectionne = id;
    });
  }

  /** Couleur de la puce (retour Antoine du 2026-09-23, point 3) : verte
   *  pourvue, rouge non pourvue sur une mission Critique, orange non pourvue
   *  sur Normale/Confort — tranché créneau par créneau, puisque c'est le
   *  créneau (donc son besoin, donc sa mission) qui porte la priorité, pas
   *  l'indicatif dans l'absolu. « Pourvue » exige les deux places du binôme
   *  (choix du coordinateur ; une place manquante reste un trou), pas
   *  seulement l'une d'elles.
   *
   *  Statut `absence` (retour Antoine du 2026-09-24, appel) : prime sur les
   *  trois autres dès qu'un membre du binôme, bien que pourvu, est pointé
   *  absent ce jour-là (`presenceDuJour`) — signal plus urgent que
   *  pourvu/non-pourvu, qui ne dit rien de la présence réelle. Jaune, pas
   *  violet (déjà pris par `--accent-2`, « veut voir un artiste »,
   *  `.dispos-cellule--artiste`) — voir `--absence` dans `style.css`. */
  function puceGroupe(ix, groupe, besoinId, jourCle) {
    // Même défaut que `rosterCard` dans `views/affectation.js`, corrigé
    // le 2026-09-23 (équipe orpheline) : `equipe` peut être absente.
    const equipe = ix.equipe.get(groupe.Equipe);
    const places = placesDuGroupe(m, groupe.id);
    const vide = places.every((p) => p.Benevole == null);
    const pourvu = places.every((p) => p.Benevole != null);
    const mission = ix.mission.get(ix.besoin.get(besoinId).Mission);
    const membreAbsent = places.some((p) => p.Benevole != null && presenceDuJour(p.Benevole, jourCle) === false);
    const statut = membreAbsent ? 'absence' : pourvu ? 'pourvu' : mission.Priorite === 'Critique' ? 'critique' : 'non-pourvu';
    const noms = places.map((p) => {
      if (p.Benevole == null) { return '—'; }
      const nom = courtNom(ix.benevole.get(p.Benevole).Nom);
      return presenceDuJour(p.Benevole, jourCle) === false ? t('{nom} (absent·e)', {nom}) : nom;
    }).join(' · ');

    let ordre = null;
    if (groupeSelectionne === groupe.id) {
      const positions = positionsDuGroupe(m, ix, groupe.id);
      if (positions.length > 1) { ordre = positions.findIndex((p) => p.besoin.id === besoinId) + 1; }
    }

    const chip = h('button', {
      class: `groupe-chip groupe-chip--${statut}${vide ? ' groupe-chip--vide' : ''}`
        + `${groupeSelectionne === groupe.id ? ' groupe-chip--selectionnee' : ''}`
        + `${groupeSelectionne != null && groupeSelectionne !== groupe.id ? ' groupe-chip--estompee' : ''}`,
      type: 'button',
      draggable: 'true',
      // Composition en toutes lettres au survol/panneau, pas dans la puce
      // elle-même (retour Antoine 2026-09-23 : un bloc de frise au quart
      // d'heure n'a pas la place d'un nom en clair) — cliquer la puce ouvre
      // toujours le panneau complet, inchangé.
      title: `${groupe.Code} · ${equipe?.Nom ?? '?'} · ${noms}`,
    },
      h('span', {class: 'dot', style: {background: equipe?.Couleur ?? 'var(--text-faint)'}}),
      h('span', {class: 'groupe-chip__code mono'}, groupe.Code),
      ordre != null ? h('span', {class: 'groupe-chip__ordre'}, String(ordre)) : null,
    );

    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (modeCible) { return; }
      groupeSelectionne = groupeSelectionne === groupe.id ? null : groupe.id;
      placeCandidatsVisible = null;
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

  /** Candidats classés pour une place vide non verrouillée (retour Antoine
   *  2026-09-23, point 9 : cliquer #1/#2) — réutilise le même classement que
   *  la vue Affectation (`classerCandidats`, `moteur/adaptateur-magasin.js`),
   *  y compris les bénévoles partiellement disponibles, jamais un nouveau
   *  classement écrit ici. Purement informatif, sans bouton d'affectation :
   *  cette vue ne pourvoit toujours pas de place (voir le paragraphe sous la
   *  composition, `panneauIndicatif`). */
  function candidatsSuggeres(ix, groupeId) {
    const candidats = classerCandidats(m, ix, groupeId).slice(0, 5);
    if (candidats.length === 0) {
      return h('p', {class: 'empty', style: {margin: '4px 0 8px'}}, t('Aucun bénévole disponible ne ressort du classement.'));
    }
    return h('div', {style: {display: 'flex', flexDirection: 'column', gap: '6px', margin: '4px 0 8px'}},
      ...candidats.map((c) => h('div', {class: 'candidat'},
        h('div', {class: 'candidat__head'}, h('span', {class: 'candidat__nom'}, c.nom)),
        c.tags.length > 0
          ? h('div', {class: 'candidat__raisons'}, ...c.tags.map((tag) => h('span', {class: `tag tag--${tag.sens}`}, tag.texte)))
          : null,
      )),
    );
  }

  /** Artistes que les bénévoles déjà affectés à ce binôme peuvent réellement
   *  aller voir ce jour (retour Antoine 2026-09-23, point 8) : sur les
   *  créneaux du jour où ce binôme n'est PAS positionné, au moins
   *  `SEUIL_MINUTES_VOIR_ARTISTE` minutes libres pendant le passage — pas le
   *  passage entier (`peutVoirArtiste`, `moteur/temps.js`, écrit par le fil
   *  Algorithme, jamais réécrit ici). `souhaitePar` marque les bénévoles de
   *  ce binôme qui l'ont dans leurs souhaits (`Disponibilite.Statut ===
   *  'Artiste'`, import §6.4), pour distinguer un passage juste possible d'un
   *  passage vraiment voulu. */
  function artistesVisibles(ix, groupeId, jour) {
    const quartsOccupes = quartsCouvertsParGroupe(m, ix, groupeId);
    const debutJour = Math.min(...jour.macros.map((ma) => ma.Debut));
    const finJour = Math.max(...jour.macros.map((ma) => ma.Fin));
    const benevoleIds = placesDuGroupe(m, groupeId)
      .map((p) => p.Benevole)
      .filter((id) => id != null);

    return m.artistes
      .filter((a) => seChevauchent(a.Debut, a.Fin, debutJour, finJour))
      .filter((a) => peutVoirArtiste(a.Debut, a.Fin, quartsOccupes, PAS_SECONDES))
      .map((a) => ({
        artiste: a,
        souhaitePar: benevoleIds
          .filter((bId) => m.disponibilites.some((d) => d.Benevole === bId && d.Statut === 'Artiste' && d.Artiste === a.id))
          .map((bId) => ix.benevole.get(bId)?.Nom ?? '?'),
      }))
      .sort((x, y) => x.artiste.Debut - y.artiste.Debut);
  }

  function panneauIndicatif(ix, groupeId, jour) {
    const groupe = ix.groupe.get(groupeId);
    // Même défaut que `rosterCard` dans `views/affectation.js`, corrigé
    // le 2026-09-23 (équipe orpheline) : `equipe` peut être absente.
    const equipe = ix.equipe.get(groupe.Equipe);
    const places = placesDuGroupe(m, groupeId);
    const positions = positionsDuGroupe(m, ix, groupeId);
    const tailleLibelle = groupe.Taille === 2 ? t('binôme') : groupe.Taille === 1 ? t('place seule') : t('{n}-uplet', {n: groupe.Taille});

    const panneau = h('div', {style: {display: 'flex', flexDirection: 'column', gap: '16px'}},
      h('div', {class: 'side-panel__head'},
        h('div', null,
          h('h3', {class: 'mono'}, groupe.Code),
          h('p', {class: 'topbar__subtitle'}, `${equipe?.Nom ?? '?'} · ${tailleLibelle}`),
        ),
        h('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          onclick: () => { groupeSelectionne = null; placeCandidatsVisible = null; rafraichir(); },
        }, t('Fermer')),
      ),

      h('div', null,
        h('div', {class: 'section-title'}, h('h2', null, t('Composition'))),
        h('div', {class: 'card', style: {display: 'flex', flexDirection: 'column', gap: '6px'}},
          ...places.map((place) => {
            const suggerable = place.Benevole == null && !place.Verrouillee;
            return h('div', null,
              h('div', {class: 'membre'},
                suggerable
                  ? h('button', {
                    class: 'rang mono', type: 'button', style: {background: 'none', border: 'none', cursor: 'pointer', padding: '0'},
                    title: t('Voir des bénévoles suggérés pour cette place'),
                    onclick: () => {
                      placeCandidatsVisible = placeCandidatsVisible === place.id ? null : place.id;
                      rafraichir();
                    },
                  }, `#${place.Rang}`)
                  : h('span', {class: 'rang mono'}, `#${place.Rang}`),
                place.Benevole != null
                  ? h('span', {style: {flex: '1'}}, ix.benevole.get(place.Benevole).Nom)
                  : h('span', {style: {flex: '1', color: 'var(--text-faint)'}}, t('Non pourvue')),
                h('button', {
                  class: 'btn btn--ghost btn--sm btn--icone', type: 'button',
                  title: place.Verrouillee ? t('Déverrouiller') : t('Verrouiller'),
                  'aria-label': place.Verrouillee ? t('Déverrouiller') : t('Verrouiller'),
                  onclick: () => m.basculerVerrouillage(place.id),
                }, icone(place.Verrouillee ? ICONES.cadenas : ICONES.cadenasOuvert)),
              ),
              placeCandidatsVisible === place.id ? candidatsSuggeres(ix, groupe.id) : null,
            );
          }),
        ),
        h('p', {class: 'view__intro', style: {marginTop: '8px', marginBottom: '0'}},
          t("L'affectation des bénévoles se fait depuis la vue Missions — ici, une place se verrouille et peut vous suggérer des candidats classés (#1/#2), mais ne se pourvoit pas depuis ce panneau."),
        ),
      ),

      h('div', null,
        h('div', {class: 'section-title'},
          h('h2', null, t('Trajectoire du jour')),
          h('span', {class: 'count mono'}, String(positions.length)),
        ),
        positions.length === 0
          ? h('p', {class: 'empty'}, t('Pas encore positionné sur ce jour.'))
          : h('ol', {class: 'trajectoire-liste'}, ...positions.map(({position, besoin, sousCreneau}, i) => h(
            'li', {class: 'trajectoire-etape'},
            positions.length > 1 ? h('span', {class: 'trajectoire-etape__badge'}, String(i + 1)) : null,
            h('span', {class: 'trajectoire-etape__info'},
              h('span', {class: 'trajectoire-etape__mission'}, ix.mission.get(besoin.Mission).Nom),
              h('span', {class: 'trajectoire-etape__creneau'}, sousCreneau.Libelle),
            ),
            h('button', {
              class: 'btn btn--ghost btn--sm', type: 'button',
              onclick: () => { modeCible = {groupeId, positionId: position.id, mode: 'deplacer'}; rafraichir(); },
            }, t('Déplacer…')),
            // Retire cette seule étape (demande d'Antoine du 2026-09-23 :
            // jusqu'ici on ne pouvait que déplacer) — ne touche jamais le
            // Groupe ni ses Places : le binôme et les bénévoles déjà
            // affectés restent, seule cette position du jour disparaît.
            h('button', {
              class: 'btn btn--ghost btn--sm', type: 'button', title: t('Supprimer cette position'),
              onclick: () => void supprimerPosition(position.id),
            }, t('Supprimer')),
          ))),
        h('button', {
          class: 'ajouter-binome', type: 'button', style: {opacity: '1', width: '100%', marginTop: '8px'},
          onclick: () => { modeCible = {groupeId, positionId: null, mode: 'ajouter'}; rafraichir(); },
        }, t('+ Ajouter une position')),
        h('p', {class: 'view__intro', style: {marginTop: '8px', marginBottom: '0'}},
          t('Glissez une puce vers une autre case du planning pour la repositionner directement.'),
        ),
      ),

      m.artistes.length > 0 && jour
        ? (() => {
          const visibles = artistesVisibles(ix, groupeId, jour);
          return h('div', null,
            h('div', {class: 'section-title'},
              h('h2', null, t('Artistes à voir')),
              h('span', {class: 'count mono'}, String(visibles.length)),
            ),
            h('div', {class: 'card', style: {display: 'flex', flexDirection: 'column', gap: '6px'}},
              visibles.length === 0
                ? h('p', {class: 'empty'}, t("Aucun passage n'est visible sur les créneaux libres de ce jour."))
                : visibles.map(({artiste, souhaitePar}) => h('div', {class: 'membre artiste-visible'},
                  h('span', {style: {flex: '1'}}, artiste.Nom),
                  souhaitePar.length > 0
                    ? h('span', {class: 'tag tag--plus', title: t('Souhaité par {noms}', {noms: souhaitePar.join(', ')})}, t('★ souhaité'))
                    : null,
                )),
            ),
            h('p', {class: 'view__intro', style: {marginTop: '8px', marginBottom: '0'}},
              t("Au moins {minutes} minutes libres pendant le passage, sur les créneaux où ce binôme n'est pas positionné ce jour.", {minutes: SEUIL_MINUTES_VOIR_ARTISTE}),
            ),
          );
        })()
        : null,
    );
    ouvrirPanneau(panneau);
  }

  function executerCible(besoinId) {
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

  function courtNom(nomComplet) {
    const parties = nomComplet.split(' ');
    return parties.length < 2 ? nomComplet : `${parties[0]} ${parties[1][0]}.`;
  }

  /** Pointage d'un bénévole pour un jour de festival donné, ou `undefined`
   *  si pas encore pointé (`Magasin.presences`, jamais absent par défaut —
   *  voir l'en-tête de `domain/types.d.ts`, `Presence`). */
  function presenceDuJour(benevoleId, jourCle) {
    return m.presences.find((p) => p.Benevole === benevoleId && p.Jour === jourCle)?.Present;
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return () => { desabonner(); fermerPanneau(); };
}
