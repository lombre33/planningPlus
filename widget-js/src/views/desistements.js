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

import {indexer, positionsDuGroupe, regrouperParJourFestival} from '../logic/derive.js';
import {nomsCompletsDepuisSource} from '../logic/noms-complets.js';
import {libelleHeurePlage} from '../temps.js';
import {h, ouvrirModal, vider} from '../ui/dom.js';

const pluriel = (n, un, plusieurs = `${un}s`) => (n > 1 ? plusieurs : un);

/** Les places d'un bénévole, chacune avec ses créneaux regroupés par jour de festival. */
function placesDuBenevole(m, ix, benevoleId) {
  return m.places
    .filter((p) => p.Benevole === benevoleId)
    .map((place) => {
      const groupe = ix.groupe.get(place.Groupe);
      const positions = groupe ? positionsDuGroupe(m, ix, groupe.id) : [];
      return {
        place,
        code: `${groupe?.Code ?? 'Indicatif introuvable'} #${place.Rang}`,
        debut: positions[0]?.sousCreneau.Debut ?? Infinity,
        jours: regrouperParJourFestival(positions, (p) => p.sousCreneau.Debut),
      };
    })
    .sort((a, b) => a.debut - b.debut || a.code.localeCompare(b.code, 'fr', {numeric: true}));
}

function lignePlace(m, ix, p) {
  const creneaux = p.jours.length === 0
    ? 'pas encore positionné sur un créneau'
    : p.jours.map((jour) => `${jour.libelle} : ${jour.items.map(({besoin, sousCreneau}) => (
      `${ix.mission.get(besoin.Mission)?.Nom ?? 'Mission introuvable'} ${libelleHeurePlage(sousCreneau.Debut, sousCreneau.Fin)}`
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
    ouvrirModal(`Désistement de ${nom(benevole)}`, (fermer) => h('div', {class: 'desistement'},
      h('p', null, `${nom(benevole)} ne viendra pas du tout : ne sera plus proposé·e par les scénarios ni par l’algorithme, sur aucun jour.`),
      liberees.length > 0
        ? [
          h('h4', null, `${liberees.length} ${pluriel(liberees.length, 'place libérée', 'places libérées')}, tous jours confondus`),
          h('ul', {class: 'desistement__places'}, ...liberees.map((p) => lignePlace(m, ix, p))),
          h('p', {class: 'desistement__note'}, `${liberees.length > 1 ? 'Elles passent' : 'Elle passe'} « à pourvoir » dans la table du jour (étape 5).`),
        ]
        : h('p', {class: 'desistement__note'}, gardees.length > 0 ? 'Aucune place à libérer.' : 'Ne tient aucune place : rien à libérer.'),
      gardees.length > 0
        ? [
          h('h4', null, `${gardees.length} ${pluriel(gardees.length, 'place verrouillée reste', 'places verrouillées restent')} à son nom`),
          h('ul', {class: 'desistement__places'}, ...gardees.map((p) => lignePlace(m, ix, p))),
          h('p', {class: 'desistement__note'}, `Corrigée${gardees.length > 1 ? 's' : ''} à la main, ${gardees.length > 1 ? 'elles ne sont' : 'elle n’est'} jamais touchée${gardees.length > 1 ? 's' : ''} : ${gardees.length > 1 ? 'elles passent' : 'elle passe'} « à couvrir » dans la table du jour, où ${gardees.length > 1 ? 'les' : 'la'} déverrouiller pour ${gardees.length > 1 ? 'les' : 'la'} pourvoir.`),
        ]
        : null,
      h('div', {class: 'modal__actions'},
        h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Annuler'),
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => { void (async () => {
            fermer();
            const resultat = await m.definirAbsence(benevole.id, true);
            const n = resultat.placesLiberees?.length ?? 0;
            message = resultat.ok
              ? {ton: 'ok', texte: `Désistement de ${nom(benevole)} enregistré : ${n === 0 ? 'aucune place libérée' : `${n} ${pluriel(n, 'place libérée', 'places libérées')}, à pourvoir dans la table du jour`}.`}
              : {ton: 'danger', texte: resultat.raison};
            rafraichir();
          })(); },
        }, liberees.length > 0 ? `Libérer ${liberees.length} ${pluriel(liberees.length, 'place')}` : 'Confirmer le désistement'),
      ),
    ));
  }

  function confirmerRetour(benevole) {
    ouvrirModal(`${nom(benevole)} vient finalement`, (fermer) => h('div', {class: 'desistement'},
      h('p', null, `${nom(benevole)} redevient proposable par les scénarios et l’algorithme. Ses anciennes places ne lui reviennent pas : elles ont pu être pourvues entre-temps.`),
      h('div', {class: 'modal__actions'},
        h('button', {class: 'btn btn--ghost', type: 'button', onclick: fermer}, 'Garder le désistement'),
        h('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: () => { void (async () => {
            fermer();
            const resultat = await m.definirAbsence(benevole.id, false);
            message = resultat.ok
              ? {ton: 'ok', texte: `Désistement de ${nom(benevole)} annulé.`}
              : {ton: 'danger', texte: resultat.raison};
            rafraichir();
          })(); },
        }, 'Annuler le désistement'),
      ),
    ));
  }

  // La recherche reste en place d'un rendu à l'autre (le focus et le
  // curseur ne sautent pas à chaque lettre) : seul le reste se redessine.
  const champ = h('input', {
    class: 'input', type: 'search', placeholder: 'Rechercher un bénévole…', 'aria-label': 'Rechercher un bénévole',
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
    compteur.textContent = `${desistes} ${pluriel(desistes, 'désistement')}`;
    vider(retour);
    retour.style.marginBottom = message ? '12px' : '';
    if (message) { retour.append(h('span', {class: `pill pill--${message.ton}`}, message.texte)); }
    vider(liste);
    if (m.benevoles.length === 0) {
      liste.append(h('p', {class: 'empty'}, 'Aucun bénévole dans ce document : importez-les depuis Disponibilités.'));
    } else if (benevoles.length === 0) {
      liste.append(h('p', {class: 'empty'}, 'Aucun bénévole ne correspond à cette recherche.'));
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
      ? 'aucune place'
      : `${places.length} ${pluriel(places.length, 'place')} sur ${jours.size} ${pluriel(jours.size, 'jour')}${verrouillees > 0 ? `, dont ${verrouillees} ${pluriel(verrouillees, 'verrouillée')}` : ''}`;
    return h('div', {class: 'benevole-row'},
      h('div', null,
        h('span', {class: 'dot', style: {background: equipe?.Couleur ?? 'var(--text-faint)', marginRight: '6px'}}),
        h('span', {class: 'nom'}, nom(b)),
        h('br'),
        h('span', {class: 'equipe'}, `${equipe?.Nom ?? '?'} · ${resume}`),
      ),
      h('div', {style: {display: 'flex', gap: '6px', alignItems: 'center'}},
        desiste ? h('span', {class: 'pill pill--danger'}, 'Désisté·e') : null,
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => (desiste ? confirmerRetour(b) : confirmerDesistement(b)),
        }, desiste ? 'Vient finalement…' : 'Se désiste…'),
      ),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return () => { vueActive = false; desabonner(); };
}
