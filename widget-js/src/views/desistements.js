/**
 * Bénévoles › Désistements : un bénévole qui ne viendra pas du tout.
 * Remplace le bouton « Marquer absent » de l'ancienne vue Jour J (ménage
 * choisi par Antoine le 2026-09-29) : on voit d'abord les places que le
 * désistement libère, et rien n'est écrit avant confirmation.
 *
 * Deux gestes d'absence, chacun à sa place :
 * - l'appel, dans la table du jour (étape 5) : absent un jour donné, aucune
 *   place touchée (choix d'Antoine du 2026-09-24), sa place passe « à
 *   couvrir » ;
 * - le désistement, ici : absent tout le festival. `Magasin.definirAbsence`
 *   vide ses places non verrouillées, tous jours confondus ; une place
 *   verrouillée (corrigée à la main) reste à son nom et passe « à couvrir »
 *   dans la table du jour.
 * Annuler un désistement le rend de nouveau proposable, sans lui rendre ses
 * places : elles ont pu être pourvues entre-temps.
 */

import {t, tn, traductions} from '../i18n.js';
import {indexer, positionsDuGroupe, regrouperParJourFestival} from '../logic/derive.js';
import {nomsCompletsDepuisSource} from '../logic/noms-complets.js';
import {libelleHeurePlage} from '../temps.js';
import {h, ouvrirModal, vider} from '../ui/dom.js';

traductions({
  'Indicatif introuvable': 'Call sign not found',
  'Mission introuvable': 'Task not found',
  'pas encore positionné sur un créneau': 'not yet placed on a slot',
  'Désistement de {nom}': 'Withdrawal of {nom}',
  '{nom} ne viendra pas du tout : ne sera plus proposé·e par les scénarios ni par l’algorithme, sur aucun jour.':
    '{nom} will not come at all: no longer suggested by the scenarios or the algorithm, on any day.',
  '{n} place libérée, tous jours confondus': '{n} spot released, across all days',
  '{n} places libérées, tous jours confondus': '{n} spots released, across all days',
  'Elle passe « à pourvoir » dans la table du jour (étape 5).': 'It becomes “open” in the day table (step 5).',
  'Elles passent « à pourvoir » dans la table du jour (étape 5).': 'They become “open” in the day table (step 5).',
  'Aucune place à libérer.': 'No spot to release.',
  'Ne tient aucune place : rien à libérer.': 'Holds no spot: nothing to release.',
  '{n} place verrouillée reste à son nom': '{n} locked spot stays in their name',
  '{n} places verrouillées restent à son nom': '{n} locked spots stay in their name',
  'Corrigée à la main, elle n’est jamais touchée : elle passe « à couvrir » dans la table du jour, où la déverrouiller pour la pourvoir.':
    'Set by hand, it is never touched: it becomes “to cover” in the day table, where you unlock it to fill it.',
  'Corrigées à la main, elles ne sont jamais touchées : elles passent « à couvrir » dans la table du jour, où les déverrouiller pour les pourvoir.':
    'Set by hand, they are never touched: they become “to cover” in the day table, where you unlock them to fill them.',
  Annuler: 'Cancel',
  'Libérer {n} place': 'Release {n} spot',
  'Libérer {n} places': 'Release {n} spots',
  'Confirmer le désistement': 'Confirm the withdrawal',
  'Désistement de {nom} enregistré : aucune place libérée.': 'Withdrawal of {nom} saved: no spot released.',
  'Désistement de {nom} enregistré : {n} place libérée, à pourvoir dans la table du jour.':
    'Withdrawal of {nom} saved: {n} spot released, to fill in the day table.',
  'Désistement de {nom} enregistré : {n} places libérées, à pourvoir dans la table du jour.':
    'Withdrawal of {nom} saved: {n} spots released, to fill in the day table.',
  '{nom} vient finalement': '{nom} is coming after all',
  '{nom} redevient proposable par les scénarios et l’algorithme. Ses anciennes places ne lui reviennent pas : elles ont pu être pourvues entre-temps.':
    '{nom} can be suggested again by the scenarios and the algorithm. Their former spots do not come back to them: they may have been filled in the meantime.',
  'Garder le désistement': 'Keep the withdrawal',
  'Annuler le désistement': 'Cancel the withdrawal',
  'Désistement de {nom} annulé.': 'Withdrawal of {nom} cancelled.',
  'Rechercher un bénévole…': 'Search volunteers…',
  'Rechercher un bénévole': 'Search volunteers',
  '{n} désistement': '{n} withdrawal',
  '{n} désistements': '{n} withdrawals',
  'Aucun bénévole dans ce document : importez-les depuis Disponibilités.': 'No volunteers in this document: import them from Availability.',
  'Aucun bénévole ne correspond à cette recherche.': 'No volunteer matches this search.',
  'aucune place': 'no spot',
  '{n} place': '{n} spot',
  '{n} places': '{n} spots',
  'sur {n} jour': 'over {n} day',
  'sur {n} jours': 'over {n} days',
  'dont {n} verrouillée': 'including {n} locked',
  'dont {n} verrouillées': 'including {n} locked',
  'Désisté·e': 'Withdrawn',
  'Vient finalement…': 'Coming after all…',
  'Se désiste…': 'Withdraws…',
});

/** Les places d'un bénévole, chacune avec ses créneaux regroupés par jour de festival. */
function placesDuBenevole(m, ix, benevoleId) {
  return m.places
    .filter((p) => p.Benevole === benevoleId)
    .map((place) => {
      const groupe = ix.groupe.get(place.Groupe);
      const positions = groupe ? positionsDuGroupe(m, ix, groupe.id) : [];
      return {
        place,
        code: `${groupe?.Code ?? t('Indicatif introuvable')} #${place.Rang}`,
        debut: positions[0]?.sousCreneau.Debut ?? Infinity,
        jours: regrouperParJourFestival(positions, (p) => p.sousCreneau.Debut),
      };
    })
    .sort((a, b) => a.debut - b.debut || a.code.localeCompare(b.code, 'fr', {numeric: true}));
}

function lignePlace(m, ix, p) {
  const creneaux = p.jours.length === 0
    ? t('pas encore positionné sur un créneau')
    : p.jours.map((jour) => `${jour.libelle} : ${jour.items.map(({besoin, sousCreneau}) => (
      `${ix.mission.get(besoin.Mission)?.Nom ?? t('Mission introuvable')} ${libelleHeurePlage(sousCreneau.Debut, sousCreneau.Fin)}`
    )).join(', ')}`).join(' ; ');
  return h('li', null, h('strong', {class: 'mono'}, p.code), ` · ${creneaux}`);
}

export function montrerDesistements(container, m) {
  let recherche = '';
  let message = null;
  let nomsComplets = new Map();
  let vueActive = true;

  nomsCompletsDepuisSource(m).then((trouves) => {
    if (!vueActive || trouves.size === 0) { return; }
    nomsComplets = trouves;
    rafraichir();
  }).catch(() => { /* jamais bloquant : la liste garde Benevole.Nom */ });

  const nom = (b) => nomsComplets.get(b.id) ?? b.Nom;

  function confirmerDesistement(benevole) {
    const ix = indexer(m);
    const places = placesDuBenevole(m, ix, benevole.id);
    const liberees = places.filter((p) => !p.place.Verrouillee);
    const gardees = places.filter((p) => p.place.Verrouillee);
    ouvrirModal(t('Désistement de {nom}', {nom: nom(benevole)}), (fermer) => h('div', {class: 'desistement'},
      h('p', null, t('{nom} ne viendra pas du tout : ne sera plus proposé·e par les scénarios ni par l’algorithme, sur aucun jour.', {nom: nom(benevole)})),
      liberees.length > 0
        ? [
          h('h4', null, tn(liberees.length, '{n} place libérée, tous jours confondus', '{n} places libérées, tous jours confondus')),
          h('ul', {class: 'desistement__places'}, ...liberees.map((p) => lignePlace(m, ix, p))),
          h('p', {class: 'desistement__note'}, liberees.length > 1
            ? t('Elles passent « à pourvoir » dans la table du jour (étape 5).')
            : t('Elle passe « à pourvoir » dans la table du jour (étape 5).')),
        ]
        : h('p', {class: 'desistement__note'}, gardees.length > 0 ? t('Aucune place à libérer.') : t('Ne tient aucune place : rien à libérer.')),
      gardees.length > 0
        ? [
          h('h4', null, tn(gardees.length, '{n} place verrouillée reste à son nom', '{n} places verrouillées restent à son nom')),
          h('ul', {class: 'desistement__places'}, ...gardees.map((p) => lignePlace(m, ix, p))),
          h('p', {class: 'desistement__note'}, gardees.length > 1
            ? t('Corrigées à la main, elles ne sont jamais touchées : elles passent « à couvrir » dans la table du jour, où les déverrouiller pour les pourvoir.')
            : t('Corrigée à la main, elle n’est jamais touchée : elle passe « à couvrir » dans la table du jour, où la déverrouiller pour la pourvoir.')),
        ]
        : null,
      h('div', {class: 'modal__actions'},
        h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, t('Annuler')),
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => { void (async () => {
            fermer();
            const resultat = await m.definirAbsence(benevole.id, true);
            const n = resultat.placesLiberees?.length ?? 0;
            message = resultat.ok
              ? {ton: 'ok', texte: n === 0
                ? t('Désistement de {nom} enregistré : aucune place libérée.', {nom: nom(benevole)})
                : tn(n, 'Désistement de {nom} enregistré : {n} place libérée, à pourvoir dans la table du jour.',
                  'Désistement de {nom} enregistré : {n} places libérées, à pourvoir dans la table du jour.', {nom: nom(benevole)})}
              : {ton: 'danger', texte: resultat.raison};
            rafraichir();
          })(); },
        }, liberees.length > 0 ? tn(liberees.length, 'Libérer {n} place', 'Libérer {n} places') : t('Confirmer le désistement')),
      ),
    ));
  }

  function confirmerRetour(benevole) {
    ouvrirModal(t('{nom} vient finalement', {nom: nom(benevole)}), (fermer) => h('div', {class: 'desistement'},
      h('p', null, t('{nom} redevient proposable par les scénarios et l’algorithme. Ses anciennes places ne lui reviennent pas : elles ont pu être pourvues entre-temps.', {nom: nom(benevole)})),
      h('div', {class: 'modal__actions'},
        h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, t('Garder le désistement')),
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => { void (async () => {
            fermer();
            const resultat = await m.definirAbsence(benevole.id, false);
            message = resultat.ok
              ? {ton: 'ok', texte: t('Désistement de {nom} annulé.', {nom: nom(benevole)})}
              : {ton: 'danger', texte: resultat.raison};
            rafraichir();
          })(); },
        }, t('Annuler le désistement')),
      ),
    ));
  }

  // La recherche reste en place d'un rendu à l'autre (le focus et le
  // curseur ne sautent pas à chaque lettre) : seul le reste se redessine.
  const champ = h('input', {
    class: 'input', type: 'search', placeholder: t('Rechercher un bénévole…'), 'aria-label': t('Rechercher un bénévole'),
    style: {width: '260px', maxWidth: '100%'},
    oninput: (e) => { recherche = e.target.value; rafraichir(); },
  });
  const compteur = h('span', {class: 'pill pill--neutral'});
  const retour = h('div', {role: 'status'});
  const liste = h('div', {class: 'desistements'});
  container.append(h('div', {class: 'agenda__toolbar', style: {marginBottom: '12px'}}, champ, compteur), retour, liste);

  function rafraichir() {
    const ix = indexer(m);
    const filtre = recherche.trim().toLowerCase();
    const benevoles = m.benevoles
      .filter((b) => filtre === '' || nom(b).toLowerCase().includes(filtre))
      .sort((a, b) => nom(a).localeCompare(nom(b), 'fr'));
    const desistes = m.benevoles.filter((b) => b.Statut === 'Absent').length;

    compteur.className = `pill ${desistes > 0 ? 'pill--danger' : 'pill--neutral'}`;
    compteur.textContent = tn(desistes, '{n} désistement', '{n} désistements');
    vider(retour);
    retour.style.marginBottom = message ? '12px' : '';
    if (message) { retour.append(h('span', {class: `pill pill--${message.ton}`}, message.texte)); }
    vider(liste);
    if (m.benevoles.length === 0) {
      liste.append(h('p', {class: 'empty'}, t('Aucun bénévole dans ce document : importez-les depuis Disponibilités.')));
    } else if (benevoles.length === 0) {
      liste.append(h('p', {class: 'empty'}, t('Aucun bénévole ne correspond à cette recherche.')));
    } else {
      liste.append(...benevoles.map((b) => ligneBenevole(ix, b)));
    }
  }

  function ligneBenevole(ix, b) {
    // Équipe orpheline possible (même défaut corrigé ailleurs le 2026-09-23) : ne doit pas planter la liste.
    const equipe = ix.equipe.get(b.Equipe);
    const places = placesDuBenevole(m, ix, b.id);
    const jours = new Set(places.flatMap((p) => p.jours.map((j) => j.cle)));
    const verrouillees = places.filter((p) => p.place.Verrouillee).length;
    const desiste = b.Statut === 'Absent';
    const resume = places.length === 0
      ? t('aucune place')
      : [
        tn(places.length, '{n} place', '{n} places'),
        tn(jours.size, 'sur {n} jour', 'sur {n} jours'),
      ].join(' ') + (verrouillees > 0 ? `, ${tn(verrouillees, 'dont {n} verrouillée', 'dont {n} verrouillées')}` : '');
    return h('div', {class: 'benevole-row'},
      h('div', null,
        h('span', {class: 'dot', style: {background: equipe?.Couleur ?? 'var(--text-faint)', marginRight: '6px'}}),
        h('span', {class: 'nom'}, nom(b)),
        h('br'),
        h('span', {class: 'equipe'}, `${equipe?.Nom ?? '?'} · ${resume}`),
      ),
      h('div', {style: {display: 'flex', gap: '6px', alignItems: 'center'}},
        desiste ? h('span', {class: 'pill pill--danger'}, t('Désisté·e')) : null,
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => (desiste ? confirmerRetour(b) : confirmerDesistement(b)),
        }, desiste ? t('Vient finalement…') : t('Se désiste…')),
      ),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return () => { vueActive = false; desabonner(); };
}
