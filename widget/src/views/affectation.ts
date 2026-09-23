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
import {type Index, couvertureBesoin, heuresAffectees, indexer, regrouperParJour} from '../logic/derive';
import {type DiffAnomalies, apercuAffectation, apercuEchange, verifierDepot} from '../logic/glisser-deposer';
import {lancerAlgorithme, type ResumeLancement} from '../logic/moteur-pont';
import type {CodeAnomalie, GraviteAnomalie} from '../moteur';
import type {Magasin} from '../store';
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
  let voirTout = false;
  let dernierMessage: {texte: string; ton: Ton} | null = null;
  let dernierResume: ResumeLancement | null = null;

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

  async function executerAlgorithme(): Promise<void> {
    dernierMessage = null;
    dernierResume = await lancerAlgorithme(m);
    if (dernierResume.echecEcriture) {
      dernierMessage = {texte: dernierResume.echecEcriture, ton: 'danger'};
    }
    rafraichir();
  }

  function resumeAlgorithmeVue(resume: ResumeLancement): Node {
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
    const resultat = await m.assignerPlace(placeId, benevoleId, 'Manuel');
    if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; rafraichir(); return; }
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

  function accepteDepot(e: DragEvent): boolean {
    const types = e.dataTransfer?.types ?? [];
    return types.includes(TYPE_BENEVOLE) || types.includes(TYPE_PLACE);
  }

  function placeSlot(ix: Index, place: Place): HTMLElement {
    const benevole = place.Benevole != null ? ix.benevole.get(place.Benevole) : null;
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
        ? h('span', {class: 'place-slot__nom'}, benevole.Nom)
        : h('span', {class: 'place-slot__vide-texte'}, 'Glissez un bénévole ici'),
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

  function groupeCarte(ix: Index, groupe: Groupe): Node {
    const places = m.places.filter((p) => p.Groupe === groupe.id).sort((a, b) => a.Rang - b.Rang);
    return h('div', {class: 'groupe-carte'},
      h('span', {class: 'groupe-carte__code'}, groupe.Code),
      ...places.map((place) => placeSlot(ix, place)),
    );
  }

  function besoinCarte(ix: Index, besoin: Besoin): Node {
    const mission = ix.mission.get(besoin.Mission)!;
    const sousCreneau = ix.sousCreneau.get(besoin.Sous_creneau)!;
    const c = couvertureBesoin(m, ix, besoin.id);
    const fourchette = besoin.Effectif_max > besoin.Effectif_min
      ? `${c.pourvues}/${besoin.Effectif_min}–${besoin.Effectif_max}` : `${c.pourvues}/${besoin.Effectif_min}`;
    return h('div', {class: 'besoin-carte'},
      h('div', {class: 'besoin-carte__tete'},
        h('div', null,
          h('span', {class: 'besoin-carte__mission'}, mission.Nom),
          h('br'),
          h('span', {class: 'besoin-carte__sous-creneau'}, sousCreneau.Libelle),
        ),
        h('span', {class: `pill pill--${c.statut === 'ok' ? 'ok' : c.statut === 'partiel' ? 'warn' : 'danger'}`}, fourchette),
      ),
      c.groupesPositionnes.length === 0
        ? h('p', {class: 'empty'}, "Aucun indicatif n'est encore positionné sur ce besoin.")
        : h('div', {class: 'besoin-carte__groupes'}, ...c.groupesPositionnes.map((g) => groupeCarte(ix, g.groupe))),
    );
  }

  function rosterCard(ix: Index, benevole: Benevole): Node {
    const equipe = ix.equipe.get(benevole.Equipe)!;
    const actif = benevole.Statut === 'Actif';
    const heures = heuresAffectees(m, ix, benevole.id);
    return h('div', {
      class: `roster-card${actif ? '' : ' roster-card--absent'}`,
      draggable: actif ? 'true' : 'false',
      title: actif ? 'Glissez sur une place pour affecter' : 'Absent : non affectable',
      ondragstart: actif ? (e: Event) => {
        const dt = (e as DragEvent).dataTransfer;
        dt?.setData(TYPE_BENEVOLE, String(benevole.id));
        if (dt) { dt.effectAllowed = 'move'; }
      } : undefined,
    },
      h('span', {class: 'dot', style: {background: equipe.Couleur}}),
      h('span', {class: 'roster-card__nom'}, benevole.Nom),
      h('span', {class: 'roster-card__meta mono'}, `${formatHeures(heures)}/${benevole.Quota_heures_max} h`),
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

    const besoinsDuJour = m.besoins
      .filter((b) => sousCreneauxDuJour.has(b.Sous_creneau))
      .map((besoin) => ({besoin, c: couvertureBesoin(m, ix, besoin.id)}))
      .filter(({c}) => voirTout || c.statut !== 'ok')
      .sort((a, b) => {
        const rang = {sous: 0, partiel: 1, ok: 2} as const;
        return rang[a.c.statut] - rang[b.c.statut];
      });

    const roster = m.benevoles
      .filter((b) => equipeFiltre === 'toutes' || b.Equipe === equipeFiltre)
      .filter((b) => rechercheRoster.trim() === '' || b.Nom.toLowerCase().includes(rechercheRoster.trim().toLowerCase()))
      .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'));

    vider(container);
    container.append(
      h('div', {class: 'affectation__lancement', style: {display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap'}},
        h('button', {class: 'btn btn--primary', type: 'button', onclick: executerAlgorithme}, "Lancer l'algorithme"),
        h('span', {class: 'view__intro', style: {margin: '0'}},
          "Remplit tout le planning non verrouillé à partir des indicatifs positionnés et des disponibilités (§7.5.1). Peut se relancer à volonté : les corrections manuelles, verrouillées, ne sont jamais reprises."),
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
          onclick: () => { jourIndex = i; rafraichir(); },
        }, j.libelle.split(' ').slice(0, 1).join(' '))),
        h('label', {class: 'field', style: {flexDirection: 'row', alignItems: 'center', gap: '6px'}},
          h('input', {
            type: 'checkbox', checked: voirTout,
            onchange: (e: Event) => { voirTout = (e.target as HTMLInputElement).checked; rafraichir(); },
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
          ),
          h('div', {class: 'affectation__roster-liste'},
            ...roster.map((b) => rosterCard(ix, b)),
          ),
        ),
        h('div', {class: 'affectation__board'},
          besoinsDuJour.length === 0
            ? h('p', {class: 'empty'}, voirTout ? 'Aucun besoin ce jour.' : "Rien à traiter ce jour : tous les besoins sont couverts. Cochez « afficher aussi les besoins déjà couverts » pour les revoir.")
            : besoinsDuJour.map(({besoin}) => besoinCarte(ix, besoin)),
        ),
      ),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
