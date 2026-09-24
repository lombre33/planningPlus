/**
 * Vue « affectation manuelle » (cahier des charges §7.5 et §8.5) : le
 * parcours le plus critique de l'outil, et jusqu'ici le moins abouti. On
 * glisse un bénévole du roster vers une place, ou l'occupant d'une place
 * vers une autre pour l'échanger — chaque dépôt applique immédiatement
 * `Magasin.assignerPlace` et affiche aussitôt ce que le geste a réparé ou
 * cassé (§7.3), sans étape de confirmation intermédiaire : un glisser-déposer
 * direct n'a pas d'effet caché, contrairement à un recalcul algorithmique
 * qui peut permuter des places qu'on n'a pas touchées du doigt (ça, c'est la
 * vue Jour J, `views/jourJ.ts`).
 *
 * Un dépôt est refusé dans deux cas seulement (voir `logic/glisser-deposer.ts`) :
 * la place visée est verrouillée, ou le bénévole se retrouverait sur deux
 * créneaux qui se chevauchent. Tout le reste (souhait refusé, indisponibilité…)
 * est autorisé mais se voit aussitôt comme anomalie — l'utilisateur reste
 * libre de traiter un cas impossible en connaissance de cause.
 */

import type {Benevole, Besoin, Groupe, Id, Place} from '../domain/types';
import {TYPE_BENEVOLE_DRAG as TYPE_BENEVOLE, TYPE_PLACE_DRAG as TYPE_PLACE} from '../logic/dnd-types';
import {
  type Candidat, type Index, benevolesDisponiblesCeJour, couvertureBesoin, heuresAffectees, indexer,
  positionsDuGroupe, quartsDuJour, regrouperParJour,
} from '../logic/derive';
import {type DiffAnomalies, apercuAffectation, apercuEchange, verifierDepot} from '../logic/glisser-deposer';
import {lancerAlgorithme, type ResumeLancement} from '../logic/moteur-pont';
import {classerCandidats, raisonsNonAffecte, raisonsPlaceVide} from '../moteur/adaptateur-magasin';
import type {CodeAnomalie, GraviteAnomalie} from '../moteur';
import type {Magasin} from '../store';
import {carteCandidatCompacte} from '../ui/candidat-carte';
import {formatHeures, h, icone, ICONES, vider} from '../ui/dom';

type Ton = 'ok' | 'warn' | 'danger';

const LIBELLE_ANOMALIE: Record<CodeAnomalie, string> = {
  sous_effectif: 'Sous-effectifs',
  sur_effectif: 'Sur-effectifs',
  souhait_refuse: 'Souhaits refusés forcés',
  indisponibilite: 'Indisponibilités forcées',
  conflit_artiste: 'Conflits artiste',
  chevauchement_creneaux: 'Chevauchements de créneaux',
  double_engagement: 'Doubles engagements',
  hors_quota: 'Quotas dépassés',
};

export function montrerAffectation(container: HTMLElement, m: Magasin): () => void {
  let jourIndex = 0;
  let equipeFiltre: Id | 'toutes' = 'toutes';
  let rechercheRoster = '';
  let nonAffectesSeulement = false;
  let voirTout = false;
  let dernierMessage: {texte: string; ton: Ton} | null = null;
  let dernierResume: ResumeLancement | null = null;
  // Repro confirmée sur le banc (2026-09-24, signalement d'Antoine « je
  // dépose mais rien ne se passe ») : un dépôt qui couvre entièrement un
  // besoin le fait aussitôt disparaître du tableau (filtré par défaut,
  // `voirTout` étant décoché) — la carte que l'œil suivait s'efface sous le
  // curseur, seul un bandeau ailleurs sur l'écran confirme que ça a marché.
  // Garde visibles, pour le rendu suivant seulement, les besoins touchés par
  // le dernier geste manuel — remis à zéro à toute navigation qui n'est pas
  // ce geste (jour, case à cocher, algorithme, réinitialisation).
  let besoinsIdsGardesVisibles = new Set<Id>();
  // Point 4 de la nuit (2026-09-24, 4h34) : « quand je clique sur un
  // bénévole j'aimerais voir où il est affecté... et pouvoir le
  // désaffecter ». Un seul roster peut être ouvert à la fois.
  let benevoleIdOuvert: Id | null = null;

  function basculerRosterOuvert(benevoleId: Id): void {
    benevoleIdOuvert = benevoleIdOuvert === benevoleId ? null : benevoleId;
    rafraichir();
  }

  function messageDepuisDiff(base: string, diff: DiffAnomalies): {texte: string; ton: Ton} {
    if (diff.creees.length === 0 && diff.resolues.length === 0) { return {texte: base, ton: 'ok'}; }
    const parties = [base];
    if (diff.resolues.length > 0) {
      parties.push(`${diff.resolues.length} anomalie${diff.resolues.length > 1 ? 's' : ''} résolue${diff.resolues.length > 1 ? 's' : ''}`);
    }
    if (diff.creees.length > 0) {
      parties.push(`${diff.creees.length} anomalie${diff.creees.length > 1 ? 's' : ''} créée${diff.creees.length > 1 ? 's' : ''}`);
    }
    return {texte: parties.join(' — '), ton: diff.creees.length > 0 ? 'danger' : 'ok'};
  }

  /** Besoins couverts par un groupe, via ses positions — sert à savoir quels
   *  besoins garder visibles après un dépôt qui vient de les compléter. */
  function besoinIdsDuGroupe(groupeId: Id): Id[] {
    return m.positionsGroupe.filter((p) => p.Groupe === groupeId).map((p) => p.Besoin);
  }

  /**
   * Confirmé par Antoine (2026-09-24 4h38) : « l'algo ne doit tourner que
   * dans le contexte d'un même jour ». Avant ce correctif, `lancerAlgorithme`
   * était appelé sans périmètre et libérait/reremplissait tout le planning
   * non verrouillé, tous les jours confondus — un lancement fait en
   * regardant un jour pouvait donc redistribuer des places d'un autre jour
   * sous ses yeux, sans que rien à l'écran ne le montre. Le périmètre suit
   * maintenant le jour affiché (§6.2 : un « jour » peut réunir plusieurs
   * macro-créneaux via la coupure à 6h, d'où `jour.macros`).
   */
  async function executerAlgorithme(): Promise<void> {
    besoinsIdsGardesVisibles = new Set();
    dernierMessage = null;
    const joursActuels = regrouperParJour(m.macroCreneaux);
    const jourActuel = joursActuels[Math.min(jourIndex, Math.max(joursActuels.length - 1, 0))];
    dernierResume = await lancerAlgorithme(
      m,
      jourActuel ? {perimetre: {macroCreneauIds: jourActuel.macros.map((macro) => macro.id)}} : undefined,
    );
    if (dernierResume.echecEcriture) {
      dernierMessage = {texte: dernierResume.echecEcriture, ton: 'danger'};
    }
    rafraichir();
  }

  /**
   * Réinitialise tout le planning (demande d'Antoine, 2026-09-23) : détruit
   * sans recours toute correction manuelle sur l'ensemble du festival, pas
   * seulement le jour affiché — un geste irréversible, donc confirmé
   * explicitement (point soulevé par le coordinateur), avec le nombre de
   * places concernées annoncé avant de trancher.
   */
  async function executerReinitialisation(): Promise<void> {
    const nbAffectees = m.places.filter((p) => p.Benevole != null || p.Verrouillee).length;
    if (nbAffectees === 0) { return; }
    const confirme = window.confirm(
      `Réinitialiser TOUT le planning (${nbAffectees} place${nbAffectees > 1 ? 's' : ''} affectée${nbAffectees > 1 ? 's' : ''} ou verrouillée${nbAffectees > 1 ? 's' : ''}, tous les jours confondus) ?\n\n`
      + "Ce geste vide et déverrouille chaque place, y compris vos corrections manuelles : irréversible. Vous pourrez ensuite relancer l'algorithme sur une ardoise vierge.",
    );
    if (!confirme) { return; }
    besoinsIdsGardesVisibles = new Set();
    dernierMessage = null;
    dernierResume = null;
    const resultat = await m.reinitialiserAffectations();
    dernierMessage = resultat.ok
      ? {texte: `${nbAffectees} place${nbAffectees > 1 ? 's' : ''} réinitialisée${nbAffectees > 1 ? 's' : ''}.`, ton: 'ok'}
      : {texte: resultat.raison, ton: 'danger'};
    rafraichir();
  }

  function resumeAlgorithmeVue(resume: ResumeLancement): Node {
    if (resume.placesTraitees === 0) {
      const aucunePlace = m.places.length === 0;
      // `placesTraitees` compte les propositions (un changement réel), pas
      // le périmètre : une place non verrouillée mais qui reste vide faute
      // de candidat (pénurie) ne produit aucune proposition non plus, donc
      // ne doit pas être confondue avec « tout est verrouillé » — message
      // qui pousserait à déverrouiller des places déjà libres, sans jamais
      // pointer vers l'explication (juste en dessous, sur chaque place).
      const toutVerrouille = !aucunePlace && m.places.every((p) => p.Verrouillee);
      return h('div', {class: 'card', style: {marginBottom: '12px'}},
        h('p', {class: 'view__intro', style: {margin: '0'}}, aucunePlace
          ? "Rien à affecter : aucune place n'est encore positionnée sur un besoin. Positionnez des indicatifs (binômes) depuis la vue Indicatifs, puis relancez l'algorithme."
          : toutVerrouille
            ? "Rien à affecter : toutes les places existantes sont verrouillées (affectées à la main). Déverrouillez-en pour que l'algorithme puisse les reprendre."
            : "Aucune place n'a pu être pourvue ou modifiée : les places non verrouillées restent sans candidat possible. Voir la raison affichée sur chacune, juste en dessous."),
      );
    }
    const groupes = new Map<CodeAnomalie, {gravite: GraviteAnomalie; nombre: number}>();
    for (const a of resume.resultat.anomalies) {
      const entree = groupes.get(a.code);
      if (entree) { entree.nombre++; } else { groupes.set(a.code, {gravite: a.gravite, nombre: 1}); }
    }
    const tries = [...groupes.entries()].sort(([, a], [, b]) => (
      a.gravite === b.gravite ? 0 : a.gravite === 'a_corriger' ? -1 : 1
    ));
    return h('div', {class: 'card', style: {marginBottom: '12px'}},
      h('div', {style: {display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}},
        h('span', {class: 'pill pill--ok'}, `${resume.placesRemplies}/${resume.placesTraitees} places remplies`),
        ...tries.map(([code, {gravite, nombre}]) => h(
          'span', {class: `pill pill--${gravite === 'a_corriger' ? 'danger' : 'warn'}`},
          `${nombre} ${LIBELLE_ANOMALIE[code].toLowerCase()}`,
        )),
      ),
      tries.length === 0
        ? h('p', {class: 'view__intro', style: {margin: '8px 0 0'}}, 'Aucune anomalie : le planning est entièrement couvert.')
        : h('p', {class: 'view__intro', style: {margin: '8px 0 0'}},
          'Les besoins à traiter en priorité (à corriger) apparaissent déjà dans le tableau ci-dessous.'),
    );
  }

  async function deposerBenevoleSurPlace(benevoleId: Id, placeId: Id): Promise<void> {
    const verdict = verifierDepot(m, benevoleId, placeId);
    if (!verdict.ok) { dernierMessage = {texte: verdict.motif, ton: 'danger'}; rafraichir(); return; }
    const diff = apercuAffectation(m, placeId, benevoleId);
    const groupeId = m.places.find((p) => p.id === placeId)?.Groupe;
    const resultat = await m.assignerPlace(placeId, benevoleId, 'Manuel');
    if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; rafraichir(); return; }
    if (groupeId != null) { besoinsIdsGardesVisibles = new Set(besoinIdsDuGroupe(groupeId)); }
    const nom = indexer(m).benevole.get(benevoleId)?.Nom ?? 'Bénévole';
    dernierMessage = messageDepuisDiff(`${nom} affecté(e).`, diff);
    rafraichir();
  }

  async function deposerPlaceSurPlace(placeSourceId: Id, placeCibleId: Id): Promise<void> {
    const source = m.places.find((p) => p.id === placeSourceId);
    const cible = m.places.find((p) => p.id === placeCibleId);
    if (!source || !cible || source.Benevole == null) { return; }
    if (source.Verrouillee || cible.Verrouillee) {
      dernierMessage = {texte: 'Place verrouillée : déverrouillez-la avant de la modifier.', ton: 'danger'};
      rafraichir();
      return;
    }
    if (source.Benevole != null) {
      const verdict = verifierDepot(m, source.Benevole, placeCibleId, [placeSourceId]);
      if (!verdict.ok) { dernierMessage = {texte: verdict.motif, ton: 'danger'}; rafraichir(); return; }
    }
    if (cible.Benevole != null) {
      const verdict = verifierDepot(m, cible.Benevole, placeSourceId, [placeCibleId]);
      if (!verdict.ok) { dernierMessage = {texte: verdict.motif, ton: 'danger'}; rafraichir(); return; }
    }

    const diff = apercuEchange(m, placeSourceId, placeCibleId);
    const benevoleSource = source.Benevole;
    const benevoleCible = cible.Benevole;
    const resultat1 = await m.assignerPlace(placeSourceId, benevoleCible, 'Manuel');
    if (!resultat1.ok) { dernierMessage = {texte: resultat1.raison, ton: 'danger'}; rafraichir(); return; }
    const resultat2 = await m.assignerPlace(placeCibleId, benevoleSource, 'Manuel');
    if (!resultat2.ok) { dernierMessage = {texte: resultat2.raison, ton: 'danger'}; rafraichir(); return; }
    besoinsIdsGardesVisibles = new Set([...besoinIdsDuGroupe(source.Groupe), ...besoinIdsDuGroupe(cible.Groupe)]);
    dernierMessage = messageDepuisDiff(benevoleCible != null ? 'Échange effectué.' : 'Déplacé.', diff);
    rafraichir();
  }

  async function viderPlace(place: Place): Promise<void> {
    if (place.Verrouillee) {
      dernierMessage = {texte: 'Place verrouillée : déverrouillez-la avant de la modifier.', ton: 'danger'};
      rafraichir();
      return;
    }
    const diff = apercuAffectation(m, place.id, null);
    const resultat = await m.assignerPlace(place.id, null);
    if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; rafraichir(); return; }
    dernierMessage = messageDepuisDiff('Place vidée.', diff);
    rafraichir();
  }

  /**
   * Vide une place puis la déverrouille aussitôt — à la différence de
   * `viderPlace` (le « vider » du tableau, qui verrouille volontairement une
   * place laissée vide à la main, un choix voulu, voir `corrigerPlace` dans
   * le moteur), tout geste du roster (point 4 de la nuit, 2026-09-24 : voir/
   * désaffecter/réaffecter) vise à libérer le bénévole pour le réaffecter
   * « facilement » ailleurs (mot d'Antoine). La place ne doit donc jamais
   * rester verrouillée-vide : ni un glisser-déposer, ni un nouveau lancement
   * de l'algorithme ne pourraient plus la reprendre — même piège que celui
   * qu'évite déjà `executerReinitialisation` en déverrouillant, signalé par
   * le coordinateur avant que ça atterrisse. Une seule fonction pour ce
   * comportement : `desaffecterDepuisRoster` et `changerIndicatifDepuisRoster`
   * (choix « Aucun » du dropdown) s'appuient toutes les deux dessus plutôt
   * que de le répéter chacune à sa façon.
   */
  async function libererPlaceEtDeverrouiller(place: Place): Promise<{ok: true} | {ok: false; raison: string}> {
    const resultat = await m.assignerPlace(place.id, null);
    if (!resultat.ok) { return resultat; }
    await m.basculerVerrouillage(place.id);
    return {ok: true};
  }

  async function desaffecterDepuisRoster(place: Place): Promise<void> {
    if (place.Verrouillee) {
      dernierMessage = {texte: 'Place verrouillée : déverrouillez-la avant de la modifier.', ton: 'danger'};
      rafraichir();
      return;
    }
    const diff = apercuAffectation(m, place.id, null);
    const resultat = await libererPlaceEtDeverrouiller(place);
    if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; rafraichir(); return; }
    dernierMessage = messageDepuisDiff('Désaffecté(e), place libre pour un glisser-déposer ou un nouveau lancement.', diff);
    rafraichir();
  }

  /**
   * Colonne indicatif du roster, demandée par Antoine en plus du point 4
   * (2026-09-24 5h02) : choisir « Aucun » désaffecte (même chemin que
   * `desaffecterDepuisRoster` ci-dessus, un seul comportement pour les
   * deux — demandé explicitement par le coordinateur) ; choisir un autre
   * indicatif du jour affiché y cherche une place encore ouverte (vide, non
   * verrouillée). Un indicatif déjà complet reste dans la liste (pour rester
   * visible) mais refuse avec un message clair plutôt qu'échouer en
   * silence ou évincer quelqu'un d'autre à sa place.
   */
  async function changerIndicatifDepuisRoster(
    benevole: Benevole, placeActuelle: Place | undefined, nouveauGroupeId: Id | null,
  ): Promise<void> {
    if (placeActuelle?.Verrouillee) {
      dernierMessage = {texte: 'Place verrouillée : déverrouillez-la avant de la modifier.', ton: 'danger'};
      rafraichir();
      return;
    }
    if (nouveauGroupeId == null) {
      if (placeActuelle) { await desaffecterDepuisRoster(placeActuelle); }
      return;
    }
    const placeCible = m.places.find((p) => p.Groupe === nouveauGroupeId && p.Benevole == null && !p.Verrouillee);
    if (!placeCible) {
      dernierMessage = {texte: 'Indicatif complet : libérez-y une place avant de le choisir.', ton: 'danger'};
      rafraichir();
      return;
    }
    if (placeActuelle) {
      const resultatLiberation = await libererPlaceEtDeverrouiller(placeActuelle);
      if (!resultatLiberation.ok) { dernierMessage = {texte: resultatLiberation.raison, ton: 'danger'}; rafraichir(); return; }
    }
    const diff = apercuAffectation(m, placeCible.id, benevole.id);
    const resultat = await m.assignerPlace(placeCible.id, benevole.id);
    if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; rafraichir(); return; }
    dernierMessage = messageDepuisDiff(`${benevole.Nom} réaffecté(e).`, diff);
    rafraichir();
  }

  function accepteDepot(e: DragEvent): boolean {
    const types = e.dataTransfer?.types ?? [];
    return types.includes(TYPE_BENEVOLE) || types.includes(TYPE_PLACE);
  }

  /**
   * Pourquoi ce bénévole est ici plutôt qu'un autre (question du
   * coordinateur, 2026-09-23) : les mêmes tags qu'un remplaçant proposé
   * (`classerCandidats`, déjà utilisés en Jour J), mais pour l'occupant
   * actuel plutôt qu'une suggestion — un arbitrage gagné (« avec un binôme
   * souhaité ») se lit à côté d'un arbitrage perdu accepté quand même
   * (« veut voir un artiste »), sans jamais montrer le score.
   */
  function pourquoiCeBenevole(ix: Index, place: Place, benevoleId: Id): Candidat | null {
    const groupe = ix.groupe.get(place.Groupe);
    if (!groupe) { return null; }
    return classerCandidats(m, ix, groupe.id, {placeIdCible: place.id}).find((c) => c.benevoleId === benevoleId) ?? null;
  }

  /**
   * Pourquoi cette place reste vide, en langage métier — le pendant côté
   * échec de `pourquoiCeBenevole` (question du coordinateur, 2026-09-23).
   * Seulement pour une place non verrouillée : une place vidée à la main
   * (verrouillée) est un choix d'Antoine, pas un échec de l'algorithme à
   * expliquer.
   */
  function pourquoiVide(place: Place): string[] {
    if (place.Verrouillee) { return []; }
    return raisonsPlaceVide(m, place.Groupe);
  }

  /**
   * Qui choisir pour une place vide (question du coordinateur, 2026-09-23) :
   * le roster seul ne dit ni qui convient, ni qui est déjà pris ailleurs sur
   * ce créneau — le moteur le sait déjà, puisqu'il s'en sert pour classer.
   * Purement informatif, comme `pourquoiCeBenevole` : le glisser-déposer
   * libre reste inchangé, on n'empêche aucun choix que l'algorithme réprouve.
   */
  function candidatsPourPlaceVide(ix: Index, place: Place): Candidat[] {
    if (place.Verrouillee) { return []; }
    const groupe = ix.groupe.get(place.Groupe);
    if (!groupe) { return []; }
    return classerCandidats(m, ix, groupe.id);
  }

  /**
   * Point 4 (nuit du 2026-09-23, corrigé après relecture du coordinateur) :
   * Antoine veut des bénévoles SANS indicatif ce jour-là qui pourraient
   * prendre une place vide d'une mission prioritaire au prix d'une
   * contrainte qu'il peut choisir de lever lui-même (voir un artiste,
   * binôme…) — pas les contraintes dures (compétence, indisponibilité) qui
   * ne se lèvent pas sur un coup de tête. `classerCandidats` ne renvoie déjà
   * que des éligibles ; un tag "moins" dessus est justement une de ces
   * contraintes molles. On ne recalcule rien de nouveau côté moteur.
   */
  function candidatsBloquesVide(
    classement: Candidat[], missionPrioritaire: boolean, candidatsVide: Candidat[], nonAffectesCeJour: Set<Id>,
  ): Candidat[] {
    if (!missionPrioritaire || candidatsVide.length > 0) { return []; }
    return classement
      .filter((c) => nonAffectesCeJour.has(c.benevoleId) && c.tags.some((t) => t.sens === 'moins'))
      .slice(0, 5);
  }

  function placeSlot(ix: Index, place: Place, missionPrioritaire: boolean, nonAffectesCeJour: Set<Id>): HTMLElement {
    const benevole = place.Benevole != null ? ix.benevole.get(place.Benevole) : null;
    const pourquoi = benevole ? pourquoiCeBenevole(ix, place, benevole.id) : null;
    const raisonsVide = benevole ? [] : pourquoiVide(place);
    const classementVide = benevole ? [] : candidatsPourPlaceVide(ix, place);
    const candidatsVide = classementVide.filter((c) => c.tags.every((t) => t.sens !== 'moins')).slice(0, 5);
    const candidatsBloques = benevole ? [] : candidatsBloquesVide(classementVide, missionPrioritaire, candidatsVide, nonAffectesCeJour);
    const classes = ['place-slot'];
    classes.push(benevole ? 'place-slot--occupee' : 'place-slot--vide');
    if (place.Verrouillee) { classes.push('place-slot--verrouillee'); }

    const slot: HTMLElement = h('div', {
      class: classes.join(' '),
      draggable: benevole && !place.Verrouillee ? 'true' : 'false',
      ondragstart: benevole ? (e: Event) => {
        const dt = (e as DragEvent).dataTransfer;
        dt?.setData(TYPE_PLACE, String(place.id));
        if (dt) { dt.effectAllowed = 'move'; }
      } : undefined,
      ondragover: (e: Event) => {
        const de = e as DragEvent;
        if (!accepteDepot(de)) { return; }
        de.preventDefault();
        slot.classList.add('place-slot--survol');
      },
      ondragleave: () => slot.classList.remove('place-slot--survol'),
      ondrop: (e: Event) => {
        const de = e as DragEvent;
        de.preventDefault();
        slot.classList.remove('place-slot--survol');
        const benevoleRaw = de.dataTransfer?.getData(TYPE_BENEVOLE);
        const placeRaw = de.dataTransfer?.getData(TYPE_PLACE);
        if (benevoleRaw) { deposerBenevoleSurPlace(Number(benevoleRaw), place.id); }
        else if (placeRaw && Number(placeRaw) !== place.id) { deposerPlaceSurPlace(Number(placeRaw), place.id); }
      },
    },
      h('span', {class: 'place-slot__rang mono'}, `#${place.Rang}`),
      benevole
        ? h('div', {class: 'place-slot__contenu'},
          h('span', {class: 'place-slot__nom'}, benevole.Nom),
          pourquoi && pourquoi.tags.length > 0
            ? h('div', {class: 'place-slot__pourquoi'}, ...pourquoi.tags.map((t) => h('span', {class: `tag tag--${t.sens}`}, t.texte)))
            : null,
        )
        : h('div', {class: 'place-slot__contenu'},
          h('span', {class: 'place-slot__vide-texte'}, 'Glissez un bénévole ici'),
          raisonsVide.length > 0
            ? h('span', {class: 'place-slot__raison-vide'}, raisonsVide.map((r) => r[0]!.toUpperCase() + r.slice(1)).join(' · '))
            : null,
          candidatsVide.length > 0
            ? h('div', {class: 'place-slot__candidats'}, ...candidatsVide.map((c) => carteCandidatCompacte(
              c,
              () => deposerBenevoleSurPlace(c.benevoleId, place.id),
              {avecScore: false},
            )))
            : null,
          candidatsBloques.length > 0
            ? h('div', {class: 'place-slot__candidats'},
              h('span', {class: 'place-slot__raison-vide'}, 'Mission prioritaire : candidats possibles au prix d\'une contrainte'),
              ...candidatsBloques.map((c) => carteCandidatCompacte(
                c,
                () => deposerBenevoleSurPlace(c.benevoleId, place.id),
                {avecScore: false},
              )))
            : null,
        ),
      place.Verrouillee
        ? h('span', {class: 'pill pill--neutral'}, icone(ICONES.cadenas), 'Verrouillée')
        : null,
      h('div', {class: 'place-slot__actions'},
        h('button', {
          class: 'btn btn--ghost btn--sm', type: 'button',
          title: place.Verrouillee ? 'Déverrouiller cette place' : 'Verrouiller cette place',
          onclick: () => { void (async () => {
            const resultat = await m.basculerVerrouillage(place.id);
            if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; rafraichir(); }
          })(); },
        }, icone(ICONES.cadenas)),
        benevole ? h('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', title: 'Vider',
          onclick: () => viderPlace(place),
        }, icone(ICONES.fermer)) : null,
      ),
    );
    return slot;
  }

  function groupeCarte(ix: Index, groupe: Groupe, missionPrioritaire: boolean, nonAffectesCeJour: Set<Id>): Node {
    const places = m.places.filter((p) => p.Groupe === groupe.id).sort((a, b) => a.Rang - b.Rang);
    return h('div', {class: 'groupe-carte'},
      h('span', {class: 'groupe-carte__code'}, groupe.Code),
      ...places.map((place) => placeSlot(ix, place, missionPrioritaire, nonAffectesCeJour)),
    );
  }

  function besoinCarte(ix: Index, besoin: Besoin, nonAffectesCeJour: Set<Id>): Node {
    // Mission/sous-créneau orphelins possibles (référence vers une ligne
    // supprimée ailleurs, même défaut que l'équipe corrigé le 2026-09-23) :
    // ne doit pas planter tout l'écran Affectation.
    const mission = ix.mission.get(besoin.Mission);
    const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau);
    const c = couvertureBesoin(m, ix, besoin.id);
    const fourchette = besoin.Effectif_max > besoin.Effectif_min
      ? `${c.pourvues}/${besoin.Effectif_min}–${besoin.Effectif_max}` : `${c.pourvues}/${besoin.Effectif_min}`;
    // Point 4 (nuit du 2026-09-23) : « mission prioritaire » = Critique,
    // même seuil que le rouge/orange de la vue Indicatifs (point 3).
    const missionPrioritaire = mission?.Priorite === 'Critique';
    return h('div', {class: 'besoin-carte'},
      h('div', {class: 'besoin-carte__tete'},
        h('div', null,
          h('span', {class: 'besoin-carte__mission'}, mission?.Nom ?? '?'),
          h('br'),
          h('span', {class: 'besoin-carte__sous-creneau'}, sousCreneau?.Libelle ?? '?'),
        ),
        h('span', {class: `pill pill--${c.statut === 'ok' ? 'ok' : c.statut === 'partiel' ? 'warn' : 'danger'}`}, fourchette),
      ),
      c.groupesPositionnes.length === 0
        ? h('p', {class: 'empty'}, "Aucun indicatif n'est encore positionné sur ce besoin.")
        : h('div', {class: 'besoin-carte__groupes'}, ...c.groupesPositionnes.map((g) => groupeCarte(ix, g.groupe, missionPrioritaire, nonAffectesCeJour))),
    );
  }

  function rosterCard(
    ix: Index, benevole: Benevole, placeCeJour: {place: Place; libelle: string} | undefined,
    groupeIdsOuvertsCeJour: readonly Id[], groupesDuJourTries: readonly {id: Id; code: string}[],
  ): Node {
    // `ix.equipe.get(...)` peut renvoyer `undefined` si l'équipe du bénévole
    // ne correspond plus à aucune équipe existante (référence orpheline,
    // vue confirmée cassée sur le banc le 2026-09-23 : ça faisait planter
    // tout le rendu d'Affectation, roster compris, plutôt que de simplement
    // afficher ce bénévole sans couleur d'équipe).
    const equipe = ix.equipe.get(benevole.Equipe);
    const actif = benevole.Statut === 'Actif';
    const heures = heuresAffectees(m, ix, benevole.id);
    const ouvert = benevoleIdOuvert === benevole.id;
    const carte = h('div', {
      class: `roster-card${actif ? '' : ' roster-card--absent'}`,
      draggable: actif ? 'true' : 'false',
      title: actif
        ? (placeCeJour
          ? 'Glissez sur une place, ou changez son indicatif à droite pour le réaffecter'
          : "Glissez sur une place pour affecter, cliquez pour voir pourquoi il n'est pas affecté")
        : 'Absent : non affectable',
      onclick: () => basculerRosterOuvert(benevole.id),
      ondragstart: actif ? (e: Event) => {
        const dt = (e as DragEvent).dataTransfer;
        dt?.setData(TYPE_BENEVOLE, String(benevole.id));
        if (dt) { dt.effectAllowed = 'move'; }
      } : undefined,
    },
      h('span', {class: 'dot', style: {background: equipe?.Couleur ?? 'var(--text-faint)', flexShrink: '0'}}),
      // `minWidth: '0'` indispensable sur un enfant flex à côté d'un
      // `<select>` : sans lui, le nom peut se faire écraser à rien plutôt
      // que de laisser le sélecteur prendre sa vraie taille (piège déjà
      // rencontré sur Indicatifs, voir la mémoire de ce fil-là — régression
      // visuelle signalée par Antoine le 2026-09-24 avant ce correctif).
      h('span', {
        class: 'roster-card__nom',
        style: {flex: '1 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'},
      }, benevole.Nom),
      h('span', {class: 'roster-card__meta mono', style: {flexShrink: '0'}}, `${formatHeures(heures)}/${benevole.Quota_heures_max} h`),
      // Colonne indicatif (demande d'Antoine, 2026-09-24 5h02, en plus du
      // clic-pour-voir ci-dessus) : « Aucun » en tête, puis les indicatifs
      // du jour affiché par ordre alphabétique — stopPropagation partout
      // pour ne pas aussi basculer le panneau du clic sur la carte, et sur
      // mousedown en plus de click : une carte `draggable` peut sinon voler
      // l'interaction avant qu'un <select> imbriqué ne la reçoive. Largeur
      // fixe et étroite (le code fait 2-3 caractères) : jamais dépendante
      // du contenu, sans quoi le sélecteur peut redevenir large et écraser
      // le nom si une option plus longue s'y glisse un jour.
      h('select', {
        class: 'roster-card__indicatif',
        title: 'Changer son indicatif du jour affiché',
        style: {flexShrink: '0', width: '56px', fontSize: '12px'},
        onclick: (e: Event) => e.stopPropagation(),
        onmousedown: (e: Event) => e.stopPropagation(),
        onchange: (e: Event) => {
          const valeur = (e.target as HTMLSelectElement).value;
          void changerIndicatifDepuisRoster(benevole, placeCeJour?.place, valeur === '' ? null : Number(valeur));
        },
      },
        h('option', {value: '', selected: placeCeJour == null}, 'Aucun'),
        ...groupesDuJourTries.map((g) => h('option', {
          value: String(g.id), selected: placeCeJour?.place.Groupe === g.id,
        }, g.code)),
      ),
    );
    // Un bénévole affecté n'ouvre plus de bandeau : sa mission tournant
    // d'un besoin à l'autre au fil de la soirée, en montrer une seule était
    // trompeur (déjà corrigé une fois pour le dropdown, même défaut ici) et
    // redondant avec la colonne indicatif — signalé par Antoine, 2026-09-24
    // 5h28 : « on s'en fiche, à retirer proprement ». Désaffecter reste
    // possible, via « Aucun » dans le menu déroulant ci-dessus
    // (`changerIndicatifDepuisRoster`, qui appelle `desaffecterDepuisRoster`
    // pour ce cas). Le panneau « pourquoi il n'est pas affecté » (point 1)
    // n'est pas concerné, il reste.
    if (!ouvert || placeCeJour) { return carte; }

    return h('div', {class: 'roster-card-wrap', style: {display: 'flex', flexDirection: 'column'}},
      carte,
      h('div', {
        class: 'roster-card__detail',
        style: {padding: '6px 10px', fontSize: '13px', background: 'var(--bg-subtle, #f4f4f5)', borderRadius: '4px'},
      },
        h('span', {class: 'view__intro', style: {margin: '0'}},
          `Non affecté(e) aujourd'hui — ${raisonsNonAffecte(m, benevole.id, groupeIdsOuvertsCeJour).join(' ; ')}.`),
      ),
    );
  }

  function rafraichir(): void {
    const ix = indexer(m);
    const jours = regrouperParJour(m.macroCreneaux);
    jourIndex = Math.min(jourIndex, Math.max(jours.length - 1, 0));
    const jour = jours[jourIndex];
    const sousCreneauxDuJour = jour
      ? new Set(m.sousCreneaux.filter((sc) => jour.macros.some((ma) => ma.id === sc.Macro_creneau)).map((sc) => sc.id))
      : new Set<Id>();

    const besoinsExistantsDuJour = m.besoins.filter((b) => sousCreneauxDuJour.has(b.Sous_creneau));
    const besoinsDuJour = besoinsExistantsDuJour
      .map((besoin) => ({besoin, c: couvertureBesoin(m, ix, besoin.id)}))
      .filter(({besoin, c}) => voirTout || c.statut !== 'ok' || besoinsIdsGardesVisibles.has(besoin.id))
      .sort((a, b) => {
        const rang = {sous: 0, partiel: 1, ok: 2} as const;
        return rang[a.c.statut] - rang[b.c.statut];
      });

    // Roster limité aux bénévoles ayant une vraie disponibilité ce jour-là
    // (demande d'Antoine, 2026-09-23 ; prédicat corrigé le 2026-09-24, voir
    // `benevolesDisponiblesCeJour` — un souhait « voir un artiste » n'en est
    // pas une). Les quarts du jour affiché viennent des mêmes macro-créneaux
    // que `sousCreneauxDuJour` ci-dessus, pas des sous-créneaux (une dispo se
    // déclare par macro-créneau, voir l'écran Disponibilités).
    const benevolesDisposCeJour = benevolesDisponiblesCeJour(m, quartsDuJour(jour));

    // Point 5 (nuit du 2026-09-23, corrigé après relecture du coordinateur) :
    // un simple filtre, pas un nouveau classement — mais "affecté" doit
    // suivre le même filtre par jour que le reste de la vue (roster compris,
    // demande d'Antoine du 20h38), pas "tous jours confondus" : un bénévole
    // pris samedi mais libre dimanche doit pouvoir ressortir non affecté le
    // dimanche. Réutilisé tel quel par `candidatsBloquesVide` (point 4).
    const benevolesAffectesCeJour = new Set(
      m.places
        .filter((p) => p.Benevole != null)
        .filter((p) => positionsDuGroupe(m, ix, p.Groupe).some(({sousCreneau}) => sousCreneauxDuJour.has(sousCreneau.id)))
        .map((p) => p.Benevole),
    );
    const nonAffectesCeJour = new Set(m.benevoles.filter((b) => !benevolesAffectesCeJour.has(b.id)).map((b) => b.id));

    // Point 4 de la nuit : place du jour affiché pour un bénévole donné (au
    // plus une, l'exclusivité par jour du moteur en garantit une seule en
    // temps normal — une correction manuelle pourrait en théorie en créer
    // plusieurs, la première trouvée suffit pour ce qu'affiche le roster).
    const placeCeJourParBenevole = new Map<Id, {place: Place; libelle: string}>();
    for (const place of m.places) {
      if (place.Benevole == null || placeCeJourParBenevole.has(place.Benevole)) { continue; }
      const position = positionsDuGroupe(m, ix, place.Groupe).find(({sousCreneau}) => sousCreneauxDuJour.has(sousCreneau.id));
      if (!position) { continue; }
      const mission = ix.mission.get(position.besoin.Mission);
      const groupe = ix.groupe.get(place.Groupe);
      placeCeJourParBenevole.set(place.Benevole, {place, libelle: `${mission?.Nom ?? '?'} — ${groupe?.Code ?? '?'}`});
    }

    // Point 1 de la nuit (2026-09-24 4h24) : groupes encore ouverts
    // aujourd'hui (au moins une place vide non verrouillée), pour expliquer
    // pourquoi un bénévole non affecté ne l'est sur aucun d'eux.
    const groupeIdsOuvertsCeJour = [...new Set(
      m.places
        .filter((p) => p.Benevole == null && !p.Verrouillee)
        .filter((p) => positionsDuGroupe(m, ix, p.Groupe).some(({sousCreneau}) => sousCreneauxDuJour.has(sousCreneau.id)))
        .map((p) => p.Groupe),
    )];

    // Colonne indicatif du roster (2026-09-24 5h02) : tous les indicatifs du
    // jour affiché, complets ou non (voir changerIndicatifDepuisRoster pour
    // ce qui se passe si l'un d'eux est complet), triés par code.
    const groupeIdsDuJour = [...new Set(
      m.places
        .filter((p) => positionsDuGroupe(m, ix, p.Groupe).some(({sousCreneau}) => sousCreneauxDuJour.has(sousCreneau.id)))
        .map((p) => p.Groupe),
    )];
    // Juste le code (pas la mission, corrigé le 2026-09-24 : un même
    // indicatif tourne d'une mission à l'autre au fil de la soirée — lui
    // accoler une mission arbitraire n'a pas de sens et cassait la mise en
    // page en plus, régression signalée par Antoine).
    const groupesDuJourTries = groupeIdsDuJour
      .map((id) => ix.groupe.get(id))
      .filter((g): g is Groupe => g != null)
      .map((g) => ({id: g.id, code: g.Code}))
      .sort((a, b) => a.code.localeCompare(b.code, 'fr'));
    const rosterFiltreEquipeRecherche = m.benevoles
      .filter((b) => equipeFiltre === 'toutes' || b.Equipe === equipeFiltre)
      .filter((b) => rechercheRoster.trim() === '' || b.Nom.toLowerCase().includes(rechercheRoster.trim().toLowerCase()))
      .filter((b) => !nonAffectesSeulement || nonAffectesCeJour.has(b.id));
    const roster = rosterFiltreEquipeRecherche
      .filter((b) => benevolesDisposCeJour.has(b.id))
      .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'));

    vider(container);
    container.append(
      h('div', {class: 'affectation__lancement', style: {display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap'}},
        h('button', {
          class: 'btn btn--primary', type: 'button', title: 'Ne remplit que le jour affiché — les autres jours ne sont jamais touchés',
          onclick: executerAlgorithme,
        }, "Lancer l'algorithme"),
        h('button', {
          class: 'btn btn--ghost', type: 'button', title: 'Vide et déverrouille tout le planning, tous les jours confondus',
          onclick: () => { void executerReinitialisation(); },
        }, 'Réinitialiser tout'),
        h('span', {class: 'view__intro', style: {margin: '0'}},
          "Remplit le jour affiché, non verrouillé, à partir des indicatifs positionnés et des disponibilités (§7.5.1). Peut se relancer à volonté : les corrections manuelles, verrouillées, ne sont jamais reprises, et les autres jours ne sont jamais touchés."),
      ),
      h('div', null, dernierResume ? resumeAlgorithmeVue(dernierResume) : null),
      h('div', {class: 'affectation__banniere'},
        dernierMessage
          ? h('span', {class: `pill pill--${dernierMessage.ton}`}, dernierMessage.texte)
          : h('span', {class: 'pill pill--neutral'}, 'Glissez un bénévole du roster vers une place, ou une place vers une autre pour échanger.'),
      ),
      h('div', {class: 'agenda__toolbar', style: {marginBottom: '12px'}},
        ...jours.map((j, i) => h('button', {
          class: `btn btn--sm${i === jourIndex ? ' btn--primary' : ''}`, type: 'button',
          onclick: () => { jourIndex = i; besoinsIdsGardesVisibles = new Set(); benevoleIdOuvert = null; rafraichir(); },
        }, j.libelle.split(' ').slice(0, 1).join(' '))),
        h('label', {class: 'field', style: {flexDirection: 'row', alignItems: 'center', gap: '6px'}},
          h('input', {
            type: 'checkbox', checked: voirTout,
            onchange: (e: Event) => {
              voirTout = (e.target as HTMLInputElement).checked;
              besoinsIdsGardesVisibles = new Set();
              rafraichir();
            },
          }),
          h('span', null, 'Afficher aussi les besoins déjà couverts'),
        ),
      ),
      h('div', {class: 'affectation__layout'},
        h('div', {class: 'affectation__roster'},
          h('div', {class: 'affectation__roster-toolbar'},
            h('input', {
              class: 'input', type: 'search', placeholder: 'Rechercher un bénévole…', value: rechercheRoster,
              oninput: (e: Event) => { rechercheRoster = (e.target as HTMLInputElement).value; rafraichir(); },
            }),
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
            h('label', {class: 'field', style: {flexDirection: 'row', alignItems: 'center', gap: '6px'}},
              h('input', {
                type: 'checkbox', checked: nonAffectesSeulement,
                onchange: (e: Event) => { nonAffectesSeulement = (e.target as HTMLInputElement).checked; rafraichir(); },
              }),
              h('span', null, 'Non affectés seulement'),
            ),
          ),
          h('div', {class: 'affectation__roster-liste'},
            roster.length === 0
              ? h('p', {class: 'empty'}, m.benevoles.length === 0
                ? "Aucun bénévole importé pour l'instant : rien à affecter tant que le fil Disponibilités n'a pas importé les bénévoles."
                : rosterFiltreEquipeRecherche.length === 0
                  ? 'Aucun bénévole ne correspond à ce filtre.'
                  : `Aucun bénévole disponible ${jour ? jour.libelle.toLowerCase() : 'ce jour'} : le roster n'affiche que ceux qui ont déclaré au moins une disponibilité ce jour-là.`)
              : roster.map((b) => rosterCard(
                ix, b, placeCeJourParBenevole.get(b.id), groupeIdsOuvertsCeJour, groupesDuJourTries,
              )),
          ),
        ),
        h('div', {class: 'affectation__board'},
          besoinsDuJour.length === 0
            ? h('p', {class: 'empty'}, besoinsExistantsDuJour.length === 0
              ? "Aucun besoin positionné ce jour : créez-en depuis la vue Missions."
              : "Rien à traiter ce jour : tous les besoins sont couverts. Cochez « afficher aussi les besoins déjà couverts » pour les revoir.")
            : besoinsDuJour.map(({besoin}) => besoinCarte(ix, besoin, nonAffectesCeJour)),
        ),
      ),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
