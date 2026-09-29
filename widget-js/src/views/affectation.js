/**
 * Étape 5, « Affectation » : la table du jour (maquette B, validée par
 * Antoine le 2026-09-29, brouillon compris). Une ligne par place, sur les
 * heures du jour choisi dans le bandeau commun ; binômes côte à côte,
 * indisponibilités hachurées et artistes souhaités dans le fond de chaque
 * ligne. Un clic sur une ligne ouvre le panneau Scénarios : tous les
 * remplacements, chaînes et échanges possibles, classés dans l'ordre
 * d'Antoine (disponibilité, binôme, 30 minutes de chaque artiste
 * souhaité), avec ce que chacun gagne et sacrifie.
 *
 * Tout passe par le brouillon (`logic/brouillon.js`) : scénarios et
 * algorithme s'y empilent, les compteurs montrent l'effet, et « Appliquer
 * au planning » écrit tout d'un coup. Seul l'appel vaut tout de suite,
 * comme avant : il ne touche aucune place (choix du 2026-09-24), la place
 * d'un absent passe en jaune « à couvrir » et ses remplacements
 * s'affichent. Le brouillon est gardé par magasin, d'un onglet à l'autre.
 *
 * Remplace l'ancienne vue à cartes et glisser-déposer : ici, un clic ouvre
 * les options, au clavier comme à la souris.
 *
 * Reprend aussi les signalements de l'ancienne page Anomalies (ménage du
 * 2026-09-29), sur le jour affiché et l'occupation affichée : chaque ligne
 * dit ce qu'elle enfreint (hors disponibilité, mission refusée, deux places
 * en même temps, quota dépassé, disponibilités non déclarées, binôme
 * séparé, artiste raté), les besoins hors de leurs effectifs ont leurs
 * lignes en tête de table, et un compteur les additionne.
 */

import {indexerDisponibilites, regrouperParJour} from '../logic/derive.js';
import {
  ajouterScenario, annulerDernier, appliquerBrouillon, creerBrouillon, deverrouillerDansBrouillon,
  placesChangees, planningDuBrouillon, relancerAlgorithme, retirerDeLaPlace, toutAnnuler, verrouillerDansBrouillon,
} from '../logic/brouillon.js';
import {
  appliquerMouvements, binomesDuBenevole, construireJournee, estACouvrir, jourAffiche, mesurer, signalementsDuJour,
  souhaitsDuBenevole,
} from '../logic/journee.js';
import {nomsCompletsDepuisSource} from '../logic/noms-complets.js';
import {
  ameliore, choixPourPlace, deplacementsPourBenevole, deplacementsPourPlace, echangesPourPlace, placesPourBenevole,
  preparerMoteur, scenariosPourPlace,
} from '../logic/scenarios.js';
import {libelleHeure, libelleHeurePlage, PAS_SECONDES} from '../temps.js';
import {formatHeures, h, ICONES, icone, vider} from '../ui/dom.js';

const ORDRE_TEXTE = 'Classés par : disponibilité (obligatoire), puis binômes souhaités, puis 30 min de chaque artiste souhaité, puis le moins de changements.';
const AUTRES_AFFICHES = 40;

/** Un brouillon par magasin, pour qu'il survive à un changement d'onglet. */
const brouillons = new WeakMap();
function brouillonDe(m) {
  let b = brouillons.get(m);
  if (!b) { b = creerBrouillon(); brouillons.set(m, b); }
  return b;
}

const pluriel = (n, un, plusieurs = `${un}s`) => (n > 1 ? plusieurs : un);
/** Les scénarios sont recalculés à chaque rendu : l'aperçu les reconnaît à leurs mouvements. */
const cleScenario = (sc) => sc.mouvements.map((mv) => `${mv.benevoleId}:${mv.de}>${mv.vers}`).join(' ');

export function montrerAffectation(container, m) {
  const brouillon = brouillonDe(m);
  let selection = null;
  let apercu = null;
  let message = null;
  let nomsComplets = new Map();
  let vueActive = true;
  let cleJourAffiche = null;
  // Fermés d'abord : tant que le planning se remplit, presque chaque besoin
  // est sous son minimum, et la table sert d'abord à pourvoir les places.
  let effectifsOuverts = false;
  // Rendu courant, pour les gestes (voir `rafraichir`).
  let r = null;

  nomsCompletsDepuisSource(m).then((trouves) => {
    if (!vueActive || trouves.size === 0) { return; }
    nomsComplets = trouves;
    rafraichir();
  }).catch(() => { /* jamais bloquant : la table garde Benevole.Nom */ });

  const nom = (id) => nomsComplets.get(id) ?? m.benevoles.find((b) => b.id === id)?.Nom ?? 'Bénévole introuvable';
  const absence = (id) => (r.journee.desistes.has(id) ? 'désisté·e' : 'absent·e');
  const etiquette = (placeId) => {
    const place = r.journee.placeParId.get(placeId);
    return `${r.journee.groupeDePlace.get(placeId).groupe.Code} #${place.Rang}`;
  };

  // --- Gestes ---------------------------------------------------------------

  function choisir(nouvelle) {
    selection = nouvelle;
    apercu = null;
    rafraichir();
  }

  /** `malgre` : ce qu'un choix libre enfreint, redit une fois ajouté. */
  function ajouter(mouvements, malgre = null) {
    const liberees = mouvements.filter((mv) => mv.de != null && !mouvements.some((a) => a.vers === mv.de)).map((mv) => etiquette(mv.de));
    ajouterScenario(m, brouillon, mouvements);
    apercu = null;
    const notes = [];
    if (malgre) { notes.push(`Ajouté au brouillon malgré : ${malgre}.`); }
    if (liberees.length > 0) { notes.push(`${liberees.join(', ')} ${liberees.length > 1 ? 'redeviennent libres' : 'redevient libre'} : l'algorithme pourra ${liberees.length > 1 ? 'les' : 'la'} reprendre.`); }
    message = notes.length > 0 ? {ton: malgre ? 'danger' : 'info', texte: notes.join(' ')} : null;
    const arrivee = mouvements.find((mv) => mv.vers != null);
    if (arrivee) { selection = {type: 'place', placeId: arrivee.vers}; }
    rafraichir();
  }

  function retirer(placeId, benevoleId) {
    retirerDeLaPlace(m, brouillon, placeId);
    apercu = null;
    message = {ton: 'info', texte: `${nom(benevoleId)} retiré·e de ${etiquette(placeId)} dans le brouillon : la place redevient libre, l'algorithme pourra la reprendre. Verrouillez-la pour la garder vide.`};
    rafraichir();
  }

  /** Un verrou se pose ou s'ôte dans le brouillon sur une place qu'il
   *  change, sinon tout de suite dans le planning (comme dans la maquette). */
  async function changerVerrou(placeId, verrouillee) {
    const libelle = etiquette(placeId);
    const effet = verrouillee
      ? 'verrouillée : ni les scénarios ni l’algorithme n’y toucheront.'
      : 'déverrouillée : les scénarios et l’algorithme peuvent de nouveau la modifier.';
    apercu = null;
    if ((verrouillee ? verrouillerDansBrouillon : deverrouillerDansBrouillon)(m, brouillon, placeId)) {
      message = {ton: 'info', texte: `${libelle} ${effet.replace(' :', ' dans le brouillon :')}`};
      rafraichir();
      return;
    }
    const resultat = await m.basculerVerrouillage(placeId);
    message = resultat.ok
      ? {ton: 'info', texte: `${libelle} ${effet.replace(' :', ' dans le planning :')}`}
      : {ton: 'danger', texte: resultat.raison};
    rafraichir();
  }

  async function pointer(benevoleId, present) {
    const {jour, journee} = r;
    try {
      await m.definirPresence(benevoleId, jour.cle, present);
    } catch {
      message = {ton: 'danger', texte: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
      rafraichir();
      return;
    }
    apercu = null;
    message = null;
    if (!present) {
      const placeId = [...journee.occupantParPlace].find(([, b]) => b === benevoleId)?.[0];
      if (placeId != null) { selection = {type: 'place', placeId}; }
      message = {ton: 'info', texte: placeId != null
        ? `${nom(benevoleId)} pointé·e absent·e : sa place ${etiquette(placeId)} reste à son nom, en jaune. Choisissez un remplacement pour l'ajouter au brouillon.`
        : `${nom(benevoleId)} pointé·e absent·e : ne sera plus proposé·e aujourd'hui.`};
    }
    rafraichir();
  }

  function lancerAlgorithme() {
    const n = relancerAlgorithme(m, brouillon, [...r.journee.macroIds]);
    apercu = null;
    message = n > 0
      ? {ton: 'info', texte: `L'algorithme a ajouté ${n} ${pluriel(n, 'changement')} au brouillon. Rien n'est encore écrit.`}
      : {ton: 'info', texte: "L'algorithme ne trouve rien à changer ce jour."};
    rafraichir();
  }

  async function appliquer() {
    const etiquettes = new Map([...r.journee.placeParId.keys()].map((id) => [id, etiquette(id)]));
    const resultat = await appliquerBrouillon(m, brouillon);
    apercu = null;
    if (!resultat.ok) {
      message = {ton: 'danger', texte: resultat.raison};
    } else {
      const refus = resultat.refusees.length > 0
        ? ` ${resultat.refusees.length} ${pluriel(resultat.refusees.length, 'place avait', 'places avaient')} changé entre-temps dans le planning et n'${pluriel(resultat.refusees.length, 'a', 'ont')} pas été écrite${resultat.refusees.length > 1 ? 's' : ''} : ${resultat.refusees.map((id) => etiquettes.get(id) ?? `place ${id}`).join(', ')}.`
        : '';
      message = {ton: resultat.refusees.length > 0 ? 'danger' : 'ok', texte: `Planning mis à jour : ${resultat.ecrites} ${pluriel(resultat.ecrites, 'place écrite', 'places écrites')} d'un coup. Les places corrigées à la main restent verrouillées.${refus}`};
    }
    rafraichir();
  }

  async function reinitialiser() {
    const nb = m.places.filter((p) => p.Benevole != null || p.Verrouillee).length;
    if (nb === 0) { return; }
    const confirme = window.confirm(
      `Réinitialiser TOUT le planning (${nb} ${pluriel(nb, 'place affectée ou verrouillée', 'places affectées ou verrouillées')}, tous les jours confondus) ?\n\n`
      + "Ce geste vide et déverrouille chaque place, y compris vos corrections manuelles : irréversible. Vous pourrez ensuite relancer l'algorithme sur une ardoise vierge.",
    );
    if (!confirme) { return; }
    const resultat = await m.reinitialiserAffectations();
    message = resultat.ok
      ? {ton: 'ok', texte: `${nb} ${pluriel(nb, 'place réinitialisée', 'places réinitialisées')}.`}
      : {ton: 'danger', texte: resultat.raison};
    rafraichir();
  }

  // --- Table ----------------------------------------------------------------

  function position(debut, fin) {
    const {debut: d, fin: f} = r.journee;
    const largeur = f - d;
    return {left: `${((debut - d) / largeur) * 100}%`, width: `${((fin - debut) / largeur) * 100}%`};
  }

  function piste(elements, onclick) {
    return h('div', {class: 'tj-piste', onclick}, ...elements.filter(Boolean));
  }

  /** Même vérité que le moteur : un quart « Artiste » est disponible. */
  const libreAuQuart = (benevoleId, q) => {
    const statut = r.dispos.get(`${benevoleId}:${q}`);
    return statut === 'Disponible' || statut === 'Artiste';
  };

  function disponibleSur(benevoleId, sousCreneau) {
    for (let q = sousCreneau.Debut; q < sousCreneau.Fin; q += PAS_SECONDES) {
      if (!libreAuQuart(benevoleId, q)) { return false; }
    }
    return true;
  }

  /** Hachures sur les quarts du jour où la personne n'est pas disponible. */
  function indisponibilites(benevoleId) {
    const segments = [];
    let debut = null;
    for (const q of r.quartsTries) {
      const libre = libreAuQuart(benevoleId, q);
      if (!libre && debut == null) { debut = q; }
      if (libre && debut != null) { segments.push([debut, q]); debut = null; }
    }
    if (debut != null) { segments.push([debut, r.journee.fin]); }
    return segments.map(([a, z]) => h('span', {
      class: 'tj-indispo', style: position(a, z), title: `Indisponible ${libelleHeurePlage(a, z)}`,
    }));
  }

  function marquesArtistes(benevoleId) {
    return souhaitsDuBenevole(r.journee, r.affiche, benevoleId).map(({artiste, vu}) => h('span', {
      class: `tj-art${vu ? '' : ' tj-art--rate'}`, style: position(artiste.Debut, artiste.Fin),
      title: `${vu ? 'Voit' : 'Rate'} ${artiste.Nom} (${libelleHeurePlage(artiste.Debut, artiste.Fin)})`,
    }));
  }

  function boutonsAppel(benevoleId) {
    if (r.journee.desistes.has(benevoleId)) {
      return h('span', {class: 'tj-appel-vide', title: 'Désisté·e pour tout le festival (Bénévoles › Désistements)'});
    }
    const absent = r.journee.absents.has(benevoleId);
    const present = r.journee.presents.has(benevoleId);
    return h('div', {class: 'tj-appel', role: 'group', 'aria-label': `Appel : ${nom(benevoleId)}`, onclick: (e) => e.stopPropagation(), onkeydown: (e) => e.stopPropagation()},
      h('button', {
        type: 'button', class: 'tj-appel__ok', 'aria-pressed': String(present), title: 'Présent·e',
        'aria-label': `${nom(benevoleId)} présent·e`, onclick: () => void pointer(benevoleId, true),
      }, '✓'),
      h('button', {
        type: 'button', class: 'tj-appel__abs', 'aria-pressed': String(absent), title: 'Absent·e aujourd’hui',
        'aria-label': `${nom(benevoleId)} absent·e`, onclick: () => void pointer(benevoleId, false),
      }, '✗'),
    );
  }

  function celluleNom(contenu, onChoisir, libelle) {
    return h('div', {
      class: 'tj-nom', role: 'button', tabindex: '0', 'aria-label': libelle, onclick: onChoisir,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoisir(); } },
    }, ...contenu);
  }

  const creneauTexte = ({sousCreneau, mission}) => `${mission?.Nom ?? 'Mission introuvable'} ${libelleHeurePlage(sousCreneau.Debut, sousCreneau.Fin)}`;

  /** Ce qu'une place tenue enfreint (ancienne page Anomalies), du plus grave
   *  au moins grave : `texte` pour la ligne, `detail` pour le panneau. Une
   *  personne sans aucune disponibilité déclarée n'est ni en règle ni hors
   *  disponibilité : on n'a rien pu vérifier, on le dit (même règle que
   *  l'ancienne vérification bénévole par bénévole). */
  function alertesPlace(g, placeId, b) {
    const alertes = [];
    if (!r.aDesDispos.has(b)) {
      alertes.push({texte: 'pas de disponibilité déclarée', neutre: true, detail: 'Aucune disponibilité déclarée : impossible de vérifier ses créneaux.'});
    } else {
      const hors = g.positions.filter(({sousCreneau}) => !disponibleSur(b, sousCreneau));
      if (hors.length > 0) {
        alertes.push({texte: 'hors disponibilité', grave: true, detail: `Placé·e hors de ses disponibilités : ${hors.map(creneauTexte).join(', ')}.`});
      }
    }
    for (const autre of r.signalements.enMemeTemps.get(placeId) ?? []) {
      alertes.push({texte: `en même temps sur ${etiquette(autre)}`, grave: true, detail: `Tient aussi ${etiquette(autre)}, sur des créneaux qui se recouvrent.`});
    }
    for (const mission of r.signalements.refus.get(placeId) ?? []) {
      alertes.push({texte: `a refusé ${mission.Nom}`, grave: true, detail: `A refusé la mission ${mission.Nom}.`});
    }
    const quota = r.signalements.quotas.get(b);
    if (quota) {
      alertes.push({
        texte: `quota dépassé (${formatHeures(quota.heures)} / ${formatHeures(quota.max)})`,
        detail: `Quota dépassé : ${formatHeures(quota.heures)} sur tout le festival, pour ${formatHeures(quota.max)} au plus.`,
      });
    }
    return alertes;
  }

  function lignePlace(g, place, premiere) {
    const {journee, reelle} = r;
    const b = r.affiche.get(place.id) ?? null;
    const avant = reelle.occupantParPlace.get(place.id) ?? null;
    const dansBrouillon = journee.occupantParPlace.get(place.id) ?? null;
    const changeReel = b !== avant;
    const enApercu = apercu != null && b !== dansBrouillon;
    const absent = b != null && journee.absents.has(b);
    const present = b != null && !absent;
    const verrouillee = journee.placeParId.get(place.id).Verrouillee;
    const choisie = selection?.type === 'place' && selection.placeId === place.id;
    const onChoisir = () => choisir({type: 'place', placeId: place.id});
    const code = `${g.groupe.Code} #${place.Rang}`;
    const alertes = r.alertes.get(place.id) ?? [];
    const refusees = r.signalements.refus.get(place.id) ?? [];
    const enMemeTemps = r.signalements.enMemeTemps.has(place.id);

    const binomes = present ? binomesDuBenevole(journee, r.affiche, b) : [];
    const separes = binomes.filter((x) => !x.reunis).map((x) => `${nom(x.partenaireId)} (${x.codes.length > 0 ? x.codes.join(', ') : 'sans indicatif'})`);
    const coeur = binomes.some((x) => x.reunis) ? h('span', {class: 'tj-coeur', title: 'Avec son binôme souhaité'}, '♥') : null;
    const coeurVide = separes.length > 0
      ? h('span', {class: 'tj-coeur tj-coeur--vide', title: `Binôme souhaité ailleurs : ${separes.join(', ')}`}, '♡') : null;
    const rates = present ? souhaitsDuBenevole(journee, r.affiche, b).filter((s) => !s.vu) : [];
    const verifiable = present && r.aDesDispos.has(b);

    // Sous le nom : l'indicatif, puis tout ce que la ligne enfreint (en
    // rouge ce qui est à corriger), l'équipe seulement s'il n'y a rien à dire.
    const sousTitre = [h('span', {class: 'tj-code'}, code)];
    const texte = [code];
    const noter = (t, element = t) => { sousTitre.push(' · ', element); texte.push(t); };
    if (changeReel) {
      const ancien = avant != null ? nom(avant) : 'vide';
      sousTitre.push(' · avant : ', h('s', null, ancien));
      texte.push(`avant : ${ancien}`);
    }
    if (absent) { noter(journee.desistes.has(b) ? 'désisté·e' : 'absent·e à l’appel'); }
    for (const a of alertes) { noter(a.texte, a.grave ? h('span', {class: 'tj-alerte'}, a.texte) : a.texte); }
    if (rates.length > 0) { noter(`rate ${rates.map((s) => s.artiste.Nom).join(', ')}`); }
    const equipe = r.ix.equipe.get(g.groupe.Equipe);
    if (texte.length === 1 && equipe) { noter(equipe.Nom); }

    // Nom accessible : qui, où, puis ce que la ligne montre d'autre.
    const details = [
      changeReel ? `avant : ${avant != null ? nom(avant) : 'vide'}` : null,
      ...alertes.map((a) => a.texte),
      rates.length > 0 ? `rate ${rates.map((s) => s.artiste.Nom).join(', ')}` : null,
      coeur ? 'avec son binôme souhaité' : null,
      coeurVide ? `binôme souhaité ailleurs : ${separes.join(', ')}` : null,
      verrouillee ? 'verrouillée' : null,
    ].filter(Boolean);
    const libelle = [b != null ? `${nom(b)}${absent ? `, ${absence(b)}` : ''}, ${code}` : `${code} à pourvoir`, ...details].join(', ');
    const cellule = celluleNom([
      b != null ? boutonsAppel(b) : h('span', {class: 'tj-appel-vide'}),
      h('div', {class: 'tj-nom__txt'},
        h('strong', null, b != null ? nom(b) : '! À pourvoir', coeur, coeurVide, verrouillee ? h('span', {class: 'tj-verrou', title: 'Verrouillée : corrigée à la main'}, icone(ICONES.cadenas, 'icone-texte')) : null),
        h('small', {title: texte.join(' · ')}, ...sousTitre),
      ),
    ], onChoisir, libelle);

    const blocs = g.positions.map(({sousCreneau, mission}) => {
      const classes = ['tj-bloc'];
      const horsDispo = verifiable && !disponibleSur(b, sousCreneau);
      const refusee = present && refusees.includes(mission);
      if (b == null) { classes.push('tj-bloc--vide'); if (g.critique) { classes.push('tj-bloc--vide-critique'); } }
      else if (absent) { classes.push('tj-bloc--absent'); }
      else if (mission?.Priorite === 'Critique') { classes.push('tj-bloc--critique'); }
      if (horsDispo) { classes.push('tj-bloc--hors-dispo'); }
      if (refusee || (present && enMemeTemps)) { classes.push('tj-bloc--alerte'); }
      if (changeReel && b != null) { classes.push(enApercu ? 'tj-bloc--apercu' : 'tj-bloc--change'); }
      const nomMission = mission?.Nom ?? 'Mission introuvable';
      const etat = b == null ? ' · à pourvoir' : absent ? ` · ${absence(b)}` : horsDispo ? ' · hors disponibilité' : refusee ? ' · refusée' : '';
      return h('span', {
        class: classes.join(' '), style: position(sousCreneau.Debut, sousCreneau.Fin),
        title: `${nomMission} ${libelleHeurePlage(sousCreneau.Debut, sousCreneau.Fin)}${etat}`,
      }, `${nomMission}${etat}`);
    });
    const fond = verifiable ? [...indisponibilites(b), ...marquesArtistes(b)] : [];
    const classes = ['tj-ligne'];
    if (choisie) { classes.push('tj-ligne--choisie'); }
    if (changeReel) { classes.push('tj-ligne--change'); }
    if (premiere) { classes.push('tj-groupe-debut'); }
    return h('div', {class: classes.join(' ')}, cellule, piste([...fond, ...blocs], onChoisir));
  }

  /** Un besoin hors de ses bornes, en une phrase : ce qui manque ou déborde, et où le corriger. */
  function texteEffectif(e) {
    const {besoin, places, pourvues} = e;
    const creneau = creneauTexte(e);
    if (pourvues > besoin.Effectif_max) {
      return `${creneau} : ${pourvues} ${pluriel(pourvues, 'personne')} pour un maximum de ${besoin.Effectif_max}.`;
    }
    const aCouvrir = places - pourvues;
    const suite = places < besoin.Effectif_min
      ? ` Seulement ${places} ${pluriel(places, 'place positionnée', 'places positionnées')} : positionnez un indicatif de plus (étape 3) ou baissez le minimum (étape 2).${aCouvrir > 0 ? ` Et ${aCouvrir} à couvrir ci-dessous.` : ''}`
      : ` ${aCouvrir} ${pluriel(aCouvrir, 'place')} à couvrir ci-dessous.`;
    return `${creneau} : ${pourvues} ${pluriel(pourvues, 'personne')} pour un minimum de ${besoin.Effectif_min}.${suite}`;
  }

  /** Une ligne par mission dont un besoin du jour est hors de ses bornes
   *  (ancienne page Anomalies, sous-effectif et sur-effectif). */
  function ligneEffectifs(liste) {
    const mission = liste[0].mission;
    const nomMission = mission?.Nom ?? 'Mission introuvable';
    const cle = mission?.id ?? null;
    const choisie = selection?.type === 'effectifs' && selection.missionId === cle;
    const onChoisir = () => choisir({type: 'effectifs', missionId: cle});
    const sous = liste.filter((e) => e.pourvues < e.besoin.Effectif_min).length;
    const sur = liste.length - sous;
    const resume = [
      sous > 0 ? `${sous} ${pluriel(sous, 'créneau', 'créneaux')} sous le minimum` : null,
      sur > 0 ? `${sur} au-dessus du maximum` : null,
    ].filter(Boolean).join(', ');
    const blocs = liste.map((e) => {
      const manque = e.pourvues < e.besoin.Effectif_min;
      return h('span', {
        class: `tj-bloc ${manque ? 'tj-bloc--sous' : 'tj-bloc--sur'}`,
        style: position(e.sousCreneau.Debut, e.sousCreneau.Fin), title: texteEffectif(e),
      }, manque ? `${e.pourvues} / ${e.besoin.Effectif_min} min` : `${e.pourvues} / ${e.besoin.Effectif_max} max`);
    });
    return h('div', {class: `tj-ligne tj-effectifs${choisie ? ' tj-ligne--choisie' : ''}`},
      celluleNom([
        h('span', {class: 'tj-appel-vide'}),
        h('div', {class: 'tj-nom__txt'}, h('strong', null, nomMission), h('small', {title: resume}, resume)),
      ], onChoisir, `${nomMission} : ${resume}`),
      piste(blocs, onChoisir));
  }

  function ligneLibre(benevoleId, absent) {
    const choisie = selection?.type === 'benevole' && selection.benevoleId === benevoleId;
    const onChoisir = () => choisir({type: 'benevole', benevoleId});
    const detail = absent ? 'absent·e à l’appel · sans place' : `libre · ${disponibiliteTexte(benevoleId) || 'aucune disponibilité ce jour'}`;
    return h('div', {class: `tj-ligne${choisie ? ' tj-ligne--choisie' : ''}`},
      celluleNom([boutonsAppel(benevoleId), h('div', {class: 'tj-nom__txt'}, h('strong', null, nom(benevoleId)), h('small', null, detail))],
        onChoisir, `${nom(benevoleId)}, ${detail}`),
      piste(absent ? [] : [...indisponibilites(benevoleId), ...marquesArtistes(benevoleId)], onChoisir));
  }

  function disponibiliteTexte(benevoleId) {
    const plages = [];
    let debut = null;
    for (const q of r.quartsTries) {
      const dispo = libreAuQuart(benevoleId, q);
      if (dispo && debut == null) { debut = q; }
      if (!dispo && debut != null) { plages.push([debut, q]); debut = null; }
    }
    if (debut != null) { plages.push([debut, r.journee.fin]); }
    return plages.length > 0 ? `dispo ${plages.map(([a, z]) => libelleHeurePlage(a, z)).join(', ')}` : '';
  }

  function table() {
    const {journee} = r;
    const heures = [];
    const premiereHeure = Math.ceil(journee.debut / 3600) * 3600;
    const pas = journee.fin - journee.debut > 10 * 3600 ? 2 : 1;
    for (let t = premiereHeure; t <= journee.fin; t += 3600) {
      const bord = t === journee.debut ? 'tj-axe__debut' : t === journee.fin ? 'tj-axe__fin' : null;
      heures.push(h('span', {class: bord, style: {left: position(t, t).left}}, ((t - premiereHeure) / 3600) % pas === 0 ? libelleHeure(t) : ''));
    }
    const lignes = [
      h('div', {class: 'tj-ligne tj-axe', 'aria-hidden': 'true'}, h('div', {class: 'tj-nom'}, h('span', {class: 'tj-note'}, 'Heure')),
        h('div', {class: 'tj-piste'}, ...heures)),
    ];
    const artistes = m.artistes.filter((a) => a.Fin > journee.debut && a.Debut < journee.fin);
    if (artistes.length > 0) {
      lignes.push(h('div', {class: 'tj-ligne tj-artistes'},
        h('div', {class: 'tj-nom'}, h('div', {class: 'tj-nom__txt'}, h('strong', null, '♪ Artistes'), h('small', null, 'passages du jour'))),
        h('div', {class: 'tj-piste'}, ...artistes.map((a) => h('span', {
          class: 'tj-bloc', style: position(Math.max(a.Debut, journee.debut), Math.min(a.Fin, journee.fin)),
          title: `${a.Nom} ${libelleHeurePlage(a.Debut, a.Fin)}`,
        }, a.Nom)))));
    }
    const effectifs = r.signalements.effectifs;
    if (effectifs.length > 0) {
      const parMission = new Map();
      for (const e of effectifs) {
        const cle = e.mission?.id ?? null;
        parMission.set(cle, [...(parMission.get(cle) ?? []), e]);
      }
      lignes.push(h('div', {class: 'tj-ligne tj-section'},
        h('div', {class: 'tj-nom'}, h('button', {
          class: 'tj-section__bascule', type: 'button', 'aria-expanded': String(effectifsOuverts),
          title: effectifsOuverts ? 'Masquer les effectifs hors bornes' : 'Afficher les missions dont un créneau du jour est sous son minimum ou au-dessus de son maximum',
          onclick: () => { effectifsOuverts = !effectifsOuverts; rafraichir(); },
        }, `${effectifsOuverts ? '▾' : '▸'} Effectifs hors bornes (${effectifs.length})`)),
        h('div', {class: 'tj-piste'})));
      const nomDe = (liste) => liste[0].mission?.Nom ?? '';
      if (effectifsOuverts) {
        for (const liste of [...parMission.values()].sort((a, b) => nomDe(a).localeCompare(nomDe(b), 'fr'))) {
          lignes.push(ligneEffectifs(liste));
        }
      }
      lignes.push(h('div', {class: 'tj-ligne tj-section'}, h('div', {class: 'tj-nom'}, 'Places du jour'), h('div', {class: 'tj-piste'})));
    }
    if (journee.groupes.length === 0) {
      lignes.push(h('p', {class: 'tj-vide'}, 'Aucun indicatif positionné ce jour-là. Positionnez des indicatifs depuis la vue Indicatifs (étape 3), puis revenez ici.'));
    }
    for (const g of journee.groupes) {
      g.places.forEach((place, i) => lignes.push(lignePlace(g, place, i === 0)));
    }
    const tenus = new Set([...r.affiche.values()].filter((b) => b != null));
    const libres = [...journee.duJour].filter((b) => !journee.absents.has(b) && !tenus.has(b)).sort((a, b) => nom(a).localeCompare(nom(b), 'fr'));
    lignes.push(h('div', {class: 'tj-ligne tj-section'}, h('div', {class: 'tj-nom'}, `Sans indicatif aujourd’hui (${libres.length})`), h('div', {class: 'tj-piste'})));
    for (const b of libres) { lignes.push(ligneLibre(b, false)); }
    const absentsSansPlace = [...journee.absents].filter((b) => journee.duJour.has(b) && !tenus.has(b)).sort((a, b) => nom(a).localeCompare(nom(b), 'fr'));
    if (absentsSansPlace.length > 0) {
      lignes.push(h('div', {class: 'tj-ligne tj-section'}, h('div', {class: 'tj-nom'}, `Absents sans place (${absentsSansPlace.length})`), h('div', {class: 'tj-piste'})));
      for (const b of absentsSansPlace) { lignes.push(ligneLibre(b, true)); }
    }
    const grille = h('div', {class: 'tj-table', role: 'region', 'aria-label': 'Table du jour'}, ...lignes);
    // Un trait par heure pleine dans le fond de chaque ligne (voir `.tj-piste`).
    const largeur = journee.fin - journee.debut;
    grille.style.setProperty('--tj-pas', `${(3600 / largeur) * 100}%`);
    grille.style.setProperty('--tj-decalage', `${((premiereHeure - journee.debut) / largeur) * 100}%`);
    return h('div', {class: 'tj-table-cadre'}, grille);
  }

  // --- Panneau --------------------------------------------------------------

  function texteMouvements(mouvements) {
    const {journee} = r;
    const remplace = (vers) => {
      const q = journee.occupantParPlace.get(vers);
      return q != null && journee.absents.has(q) ? `, à la place de ${nom(q)} (${absence(q)})` : '';
    };
    const [a, b] = mouvements;
    if (mouvements.length === 2 && a.de != null && a.vers != null && b.de != null && b.vers != null && a.de === b.vers && b.de === a.vers) {
      return [h('li', null, h('strong', null, nom(a.benevoleId)), ' et ', h('strong', null, nom(b.benevoleId)), ` échangent leurs places (${etiquette(a.de)} ↔ ${etiquette(b.de)})`)];
    }
    return mouvements.map((mv) => {
      if (mv.de != null && mv.vers != null) { return h('li', null, h('strong', null, nom(mv.benevoleId)), ` passe de ${etiquette(mv.de)} à ${etiquette(mv.vers)}${remplace(mv.vers)}`); }
      if (mv.vers != null) {
        const tientDeja = [...journee.occupantParPlace].some(([, q]) => q === mv.benevoleId);
        return h('li', null, h('strong', null, nom(mv.benevoleId)), `${tientDeja ? ' prend aussi' : ', sans indicatif, prend'} ${etiquette(mv.vers)}${remplace(mv.vers)}`);
      }
      return h('li', null, h('strong', null, nom(mv.benevoleId)), ` quitte ${etiquette(mv.de)} et reste disponible`);
    });
  }

  function criteres(scenario) {
    const e = scenario.eval;
    const paire = ([x, y]) => `${nom(x)} et ${nom(y)}`;
    const artiste = ([b, a]) => `${nom(b)} voit ${r.ix.artiste.get(a)?.Nom ?? '?'}`;
    const artisteRate = ([b, a]) => `${nom(b)} rate ${r.ix.artiste.get(a)?.Nom ?? '?'}`;
    const liste = [h('span', {class: 'tj-crit tj-crit--ok'}, '✓ Disponibles sur tous leurs créneaux')];
    if (e.binomesGagnes.length) { liste.push(h('span', {class: 'tj-crit tj-crit--ok'}, `♥ +${e.binomesGagnes.length} binôme souhaité : ${e.binomesGagnes.map(paire).join(', ')}`)); }
    if (e.binomesPerdus.length) { liste.push(h('span', {class: 'tj-crit tj-crit--moins'}, `♥ −${e.binomesPerdus.length} : ${e.binomesPerdus.map(paire).join(', ')} séparés`)); }
    if (!e.binomesGagnes.length && !e.binomesPerdus.length) { liste.push(h('span', {class: 'tj-crit'}, '♥ Binômes inchangés')); }
    if (e.artistesGagnes.length) { liste.push(h('span', {class: 'tj-crit tj-crit--ok'}, `♪ +${e.artistesGagnes.length} : ${e.artistesGagnes.map(artiste).join(', ')}`)); }
    if (e.artistesPerdus.length) { liste.push(h('span', {class: 'tj-crit tj-crit--moins'}, `♪ −${e.artistesPerdus.length} : ${e.artistesPerdus.map(artisteRate).join(', ')}`)); }
    if (!e.artistesGagnes.length && !e.artistesPerdus.length) { liste.push(h('span', {class: 'tj-crit'}, '♪ Aucun artiste perdu')); }
    for (const b of e.restauPerdue) { liste.push(h('span', {class: 'tj-crit tj-crit--attention'}, `${nom(b)} quitte la restauration souhaitée`)); }
    for (const b of e.restauGagnee) { liste.push(h('span', {class: 'tj-crit tj-crit--ok'}, `${nom(b)} rejoint la restauration souhaitée`)); }
    return h('div', {class: 'tj-scn__criteres'}, ...liste);
  }

  function carteScenario(scenario, rang) {
    const vu = apercu != null && cleScenario(apercu) === cleScenario(scenario);
    const n = scenario.mouvements.length;
    return h('article', {class: `tj-scn${rang === 0 ? ' tj-scn--premier' : ''}${vu ? ' tj-scn--apercu' : ''}`},
      h('span', {class: 'tj-scn__rang'}, String(rang + 1)),
      h('div', {class: 'tj-scn__corps'},
        rang === 0 ? h('span', {class: 'tj-meilleur'}, 'Le mieux classé') : null,
        h('ul', {class: 'tj-scn__mouvements'}, ...texteMouvements(scenario.mouvements)),
        criteres(scenario),
        h('div', {class: 'tj-scn__pied'},
          h('span', {class: 'tj-scn__cout'}, `${n} ${pluriel(n, 'changement')}`),
          h('button', {
            class: 'btn btn--sm', type: 'button', 'aria-pressed': String(vu),
            onclick: () => { apercu = vu ? null : scenario; rafraichir(); },
          }, vu ? 'Masquer l’aperçu' : 'Voir dans la table'),
          h('button', {class: 'btn btn--sm btn--primary', type: 'button', onclick: () => ajouter(scenario.mouvements)}, 'Ajouter au brouillon'),
        ),
      ),
    );
  }

  function listeScenarios(scenarios, visibles) {
    if (scenarios.length === 0) { return []; }
    const cartes = scenarios.slice(0, visibles).map((sc, i) => carteScenario(sc, i));
    const reste = scenarios.slice(visibles, visibles + AUTRES_AFFICHES);
    if (reste.length === 0) { return cartes; }
    const caches = scenarios.length - visibles - reste.length;
    const n = scenarios.length - visibles;
    return [...cartes, h('details', {class: 'tj-autres'},
      h('summary', null, `${n} ${pluriel(n, 'autre possibilité, moins bien classée', 'autres possibilités, moins bien classées')}`),
      h('div', null, ...reste.map((sc, i) => carteScenario(sc, i + visibles)),
        caches > 0 ? h('p', {class: 'tj-note'}, `Et ${caches} de plus, encore moins bien ${pluriel(caches, 'classée', 'classées')}.`) : null),
    )];
  }

  function blocEcartes(ecartes, titre) {
    if (ecartes.length === 0) { return null; }
    return h('details', {class: 'tj-ecartes'},
      h('summary', null, `${titre} (${ecartes.length})`),
      h('ul', null, ...ecartes.map((e) => h('li', null, `${e.etiquette ?? nom(e.benevoleId)} : ${e.raison}`))),
    );
  }

  function horairesGroupe(g) {
    return g.positions.map(({sousCreneau, mission}) => `${mission?.Nom ?? 'Mission introuvable'} ${libelleHeurePlage(sousCreneau.Debut, sousCreneau.Fin)}`).join(' · ');
  }

  function blocVerrou(placeId, texte) {
    return [
      h('p', {class: 'tj-panneau__vide'}, icone(ICONES.cadenas, 'icone-texte'), ' ', texte),
      h('button', {class: 'btn btn--sm tj-panneau__bouton', type: 'button', onclick: () => void changerVerrou(placeId, false)}, 'Déverrouiller'),
    ];
  }

  /**
   * Choix libre : une liste de tous les choix possibles, y compris ceux
   * qu'aucun scénario ne propose (une suggestion n'empêche jamais un
   * choix) ; ce qu'un choix enfreint s'affiche à côté, un choix impossible
   * reste listé mais grisé avec sa raison.
   */
  function blocChoixLibre(titre, note, options, libelle) {
    if (options.length === 0) { return null; }
    const select = h('select', {class: 'select', 'aria-label': titre},
      h('option', {value: ''}, 'Choisir…'),
      ...options.map((o, i) => h('option', {value: String(i), disabled: o.mouvements == null},
        `${libelle(o)}${o.raison ? ` · ${o.mouvements == null ? '' : 'contre : '}${o.raison}` : ''}`)),
    );
    const bouton = h('button', {class: 'btn btn--sm', type: 'button', disabled: true, onclick: () => {
      const o = options[Number(select.value)];
      if (select.value === '' || !o?.mouvements) { return; }
      ajouter(o.mouvements, o.raison ? `${libelle(o)}, ${o.raison}` : null);
    }}, 'Ajouter au brouillon');
    select.addEventListener('change', () => { bouton.disabled = select.value === ''; });
    return h('details', {class: 'tj-choix'},
      h('summary', null, titre),
      h('p', {class: 'tj-note'}, note),
      h('div', {class: 'tj-choix__ligne'}, select, bouton),
    );
  }

  function blocAutreChoix(placeId) {
    const options = choixPourPlace(r.journee, r.moteur(), placeId)
      .sort((a, b) => nom(a.benevoleId).localeCompare(nom(b.benevoleId), 'fr'));
    return blocChoixLibre('Choisir quelqu’un d’autre',
      'Tous les présents du jour, même hors de vos critères : ce que le choix enfreint s’affiche à côté du nom. Qui tient déjà un indicatif sur ce créneau le quitte.',
      options, (o) => `${nom(o.benevoleId)}${o.quittees?.length ? ` (quitte ${o.quittees.map(etiquette).join(', ')})` : ''}`);
  }

  function blocDeplacer(options, benevoleId) {
    return blocChoixLibre(`Placer ${nom(benevoleId)} sur une autre place à couvrir`,
      'Toutes les places à couvrir du jour, même hors de vos critères : ce que le choix enfreint s’affiche à côté.',
      options, (o) => `${etiquette(o.placeId)} (${horairesGroupe(r.journee.groupeDePlace.get(o.placeId))})`);
  }

  function etatPersonne(benevoleId) {
    const pills = [];
    for (const {artiste, vu} of souhaitsDuBenevole(r.journee, r.journee.occupantParPlace, benevoleId)) {
      pills.push(vu
        ? h('span', {class: 'pill tj-pill--art'}, `♪ voit ${artiste.Nom} (${libelleHeure(artiste.Debut)})`)
        : h('span', {class: 'pill pill--danger'}, `♪ rate ${artiste.Nom} (${libelleHeurePlage(artiste.Debut, artiste.Fin)})`));
    }
    for (const {partenaireId, reunis, codes} of binomesDuBenevole(r.journee, r.journee.occupantParPlace, benevoleId)) {
      pills.push(reunis
        ? h('span', {class: 'pill pill--ok'}, `♥ avec ${nom(partenaireId)}, binôme souhaité`)
        : h('span', {class: 'pill pill--neutral'}, `♡ souhaite être avec ${nom(partenaireId)}${codes.length ? ` (${codes.join(', ')})` : ''}`));
    }
    return pills.length > 0 ? h('div', {class: 'tj-panneau__etat'}, ...pills) : null;
  }

  /** Ce que la place enfreint, en toutes lettres (même liste que sa ligne). */
  function blocAlertes(placeId, benevoleId) {
    if (r.affiche.get(placeId) !== benevoleId) { return null; } // un aperçu montre quelqu'un d'autre sur cette ligne
    const alertes = r.alertes.get(placeId) ?? [];
    if (alertes.length === 0) { return null; }
    return h('div', {class: 'tj-panneau__etat'},
      ...alertes.map((a) => h('span', {class: `pill ${a.grave ? 'pill--danger' : a.neutre ? 'pill--neutral' : 'pill--warn'}`}, a.detail)));
  }

  function panneauEffectifs(missionId) {
    const liste = r.signalements.effectifs.filter((e) => (e.mission?.id ?? null) === missionId);
    return [
      h('div', {class: 'tj-panneau__tete'},
        h('h2', null, `${liste[0].mission?.Nom ?? 'Mission introuvable'} : effectifs`),
        h('p', null, 'Créneaux du jour hors de leurs effectifs minimum ou maximum, avec le planning affiché (brouillon compris). Les absents ne comptent pas.'),
      ),
      h('ul', {class: 'tj-effectifs-liste'}, ...liste.map((e) => h('li', null, texteEffectif(e)))),
    ];
  }

  function panneauPlace(placeId) {
    const {journee} = r;
    const place = journee.placeParId.get(placeId);
    const g = journee.groupeDePlace.get(placeId);
    const occupant = journee.occupantParPlace.get(placeId) ?? null;
    const code = etiquette(placeId);
    const autre = g.places.map((p) => journee.occupantParPlace.get(p.id)).find((b, i) => g.places[i].id !== placeId && b != null && !journee.absents.has(b));
    const tete = h('div', {class: 'tj-panneau__tete'},
      h('h2', null, occupant != null ? `Remplacer ${nom(occupant)} en ${code}` : `${code} à pourvoir`),
      h('p', null, horairesGroupe(g)),
      occupant != null ? h('p', null, `${journee.desistes.has(occupant) ? 'Désisté·e pour tout le festival' : 'Pointé·e absent·e à l’appel'} : la place reste à son nom tant que vous ne choisissez pas un remplacement.${autre != null ? ` Reste en place : ${nom(autre)}.` : ''}`) : null,
    );
    if (place.Verrouillee) {
      return [tete, ...blocVerrou(placeId, 'Place verrouillée : corrigée à la main, jamais touchée par un scénario ni par l’algorithme. Déverrouillez-la pour voir ses remplacements.')];
    }
    const {scenarios, ecartes} = scenariosPourPlace(journee, r.moteur(), placeId);
    return [
      tete,
      h('p', {class: 'tj-panneau__ordre'}, ORDRE_TEXTE),
      scenarios.length === 0 ? h('p', {class: 'tj-panneau__vide'}, 'Aucun remplacement ni chaîne ne respecte les disponibilités. Voir ci-dessous qui a été écarté et pourquoi.') : null,
      ...listeScenarios(scenarios, 4),
      h('p', {class: 'tj-laisser-vide'},
        `${occupant != null ? 'Ou ne rien changer' : 'Ou laisser la place vide'} : ${autre != null ? `${nom(autre)} tiendra ${g.groupe.Code} seul·e` : `personne ne tiendra ${g.groupe.Code}`} sur ${g.positions.length === 1 ? 'son créneau' : `ses ${g.positions.length} créneaux`} (${g.critique ? 'mission critique : reste en rouge' : 'reste en orange'}).`,
        occupant == null ? [' Verrouillée, elle restera vide même si vous relancez l’algorithme. ',
          h('button', {class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => void changerVerrou(placeId, true)}, 'Verrouiller vide')] : null),
      blocAutreChoix(placeId),
      blocEcartes(ecartes, 'Écartés'),
    ];
  }

  function panneauPersonneEnPlace(placeId, benevoleId) {
    const {journee} = r;
    const place = journee.placeParId.get(placeId);
    const g = journee.groupeDePlace.get(placeId);
    const equipe = r.ix.equipe.get(g.groupe.Equipe)?.Nom;
    const tete = h('div', {class: 'tj-panneau__tete'},
      h('h2', null, nom(benevoleId)),
      h('p', null, [etiquette(placeId), equipe, horairesGroupe(g)].filter(Boolean).join(' · ')),
    );
    if (place.Verrouillee) {
      return [tete, blocAlertes(placeId, benevoleId), etatPersonne(benevoleId), ...blocVerrou(placeId, 'Place verrouillée : corrigée à la main, jamais déplacée par un scénario ni par l’algorithme. Déverrouillez-la pour voir ses échanges.')];
    }
    const {scenarios, ecartes} = echangesPourPlace(journee, r.moteur(), placeId);
    const positifs = scenarios.filter(ameliore).length;
    return [
      tete,
      blocAlertes(placeId, benevoleId),
      etatPersonne(benevoleId),
      h('h3', null, 'Échanges possibles'),
      h('p', {class: 'tj-panneau__ordre'}, `${positifs === 0 ? 'Aucun échange n’améliore vos critères.' : `${positifs} ${pluriel(positifs, 'échange améliore', 'échanges améliorent')} vos critères.`} ${ORDRE_TEXTE}`),
      scenarios.length === 0 ? h('p', {class: 'tj-panneau__vide'}, 'Aucun échange ne respecte les disponibilités des deux personnes.') : null,
      ...listeScenarios(scenarios, 3),
      h('div', {class: 'tj-laisser-vide'},
        h('p', null, `Ou garder ${nom(benevoleId)} ici quoi qu’il arrive : verrouillée, la place ne bougera plus, ni par un scénario ni par l’algorithme. `,
          h('button', {class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => void changerVerrou(placeId, true)}, 'Verrouiller')),
        h('p', null, `Ou retirer ${nom(benevoleId)} de ${etiquette(placeId)} : la place redevient libre. `,
          h('button', {class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => retirer(placeId, benevoleId)}, 'Retirer de la place')),
      ),
      blocDeplacer(deplacementsPourPlace(journee, r.moteur(), placeId), benevoleId),
      blocEcartes(ecartes, 'Échanges écartés'),
    ];
  }

  function panneauPersonneLibre(benevoleId) {
    const {journee} = r;
    const tete = h('div', {class: 'tj-panneau__tete'}, h('h2', null, nom(benevoleId)));
    if (journee.absents.has(benevoleId)) {
      tete.append(h('p', null, 'Pointé·e absent·e à l’appel aujourd’hui, sans indicatif.'));
      return [tete, h('p', {class: 'tj-panneau__vide'}, 'S’il ou elle arrive finalement, ✓ à l’appel le ou la rend disponible pour les remplacements.')];
    }
    tete.append(h('p', null, `Sans indicatif aujourd’hui${disponibiliteTexte(benevoleId) ? ` · ${disponibiliteTexte(benevoleId)}` : ''}`));
    const {scenarios, ecartes} = placesPourBenevole(journee, r.moteur(), benevoleId);
    const aCouvrir = [...journee.occupantParPlace.values()].some((b) => estACouvrir(journee, b));
    return [
      tete,
      etatPersonne(benevoleId),
      h('h3', null, 'Places à couvrir qu’il ou elle peut prendre'),
      h('p', {class: 'tj-panneau__ordre'}, ORDRE_TEXTE),
      scenarios.length === 0 ? h('p', {class: 'tj-panneau__vide'}, aCouvrir
        ? 'Aucune place à couvrir ne lui convient en ce moment.'
        : 'Toutes les places du jour sont couvertes : il ou elle reste en renfort.') : null,
      ...listeScenarios(scenarios, 3),
      blocDeplacer(deplacementsPourBenevole(journee, r.moteur(), benevoleId), benevoleId),
      blocEcartes(ecartes, 'Places écartées'),
    ];
  }

  function panneau() {
    let contenu;
    if (selection?.type === 'place' && r.journee.placeParId.has(selection.placeId)) {
      const occupant = r.journee.occupantParPlace.get(selection.placeId) ?? null;
      contenu = occupant != null && !r.journee.absents.has(occupant)
        ? panneauPersonneEnPlace(selection.placeId, occupant)
        : panneauPlace(selection.placeId);
    } else if (selection?.type === 'benevole' && r.journee.duJour.has(selection.benevoleId)) {
      contenu = panneauPersonneLibre(selection.benevoleId);
    } else if (selection?.type === 'effectifs' && r.signalements.effectifs.some((e) => (e.mission?.id ?? null) === selection.missionId)) {
      contenu = panneauEffectifs(selection.missionId);
    } else {
      contenu = [h('p', {class: 'tj-panneau__vide'}, 'Cliquez une place à pourvoir ou une personne pour voir toutes les options, classées selon vos priorités.')];
    }
    return h('aside', {class: 'tj-panneau', 'aria-live': 'polite', 'aria-label': 'Scénarios'}, ...contenu.filter(Boolean));
  }

  // --- Barre d'outils et brouillon -------------------------------------------

  function compteurs(mes) {
    const aCouvrir = mes.aCouvrir.length;
    const aVerifier = r.alertes.size + r.signalements.effectifs.length;
    // Rouge pour une règle enfreinte, jaune pour un quota, neutre quand on
    // n'a seulement rien pu vérifier (pas de disponibilité déclarée).
    const alertes = [...r.alertes.values()].flat();
    const ton = r.signalements.effectifs.length > 0 || alertes.some((a) => a.grave) ? 'danger'
      : alertes.some((a) => !a.neutre) ? 'warn' : 'neutral';
    return h('div', {class: 'tj-compteurs'},
      h('span', {class: `pill ${aCouvrir ? 'pill--warn' : 'pill--ok'}`}, `${aCouvrir ? '! ' : '✓ '}${mes.couvertes} / ${mes.totalPlaces} places couvertes`),
      h('span', {class: `pill ${mes.binomes === mes.binomesTotal ? 'pill--ok' : 'pill--neutral'}`}, `♥ Binômes souhaités ${mes.binomes} / ${mes.binomesTotal}`),
      h('span', {class: `pill ${mes.artistes === mes.artistesTotal ? 'pill--ok' : 'tj-pill--art'}`}, `♪ Artistes souhaités vus ${mes.artistes} / ${mes.artistesTotal}`),
      aVerifier > 0
        ? h('span', {
          class: `pill pill--${ton}`,
          title: 'Lignes qui enfreignent une règle (hors disponibilité, mission refusée, deux places en même temps, quota dépassé, disponibilités non déclarées) et effectifs hors bornes, en tête de table.',
        }, `! ${aVerifier} à vérifier`)
        : null,
    );
  }

  function barreBrouillon() {
    const changees = placesChangees(m, brouillon);
    const ailleurs = changees.filter((id) => !r.journee.placeParId.has(id)).length;
    const avant = mesurer(r.reelle);
    const apres = mesurer(r.journee);
    const delta = (libelle, a, b, plusEstMieux) => h('span', null, `${libelle} `,
      h('span', {class: `tj-delta${a === b ? '' : (b > a) === plusEstMieux ? ' tj-delta--mieux' : ' tj-delta--pire'}`}, `${a} → ${b}`));
    const n = changees.length;
    // Une place dont seul le verrou change (même occupant) s'écrit aussi.
    const verrous = [...brouillon.modifs].filter(([id, modif]) => {
      const reelle = m.places.find((p) => p.id === id);
      return reelle && (reelle.Benevole ?? null) === modif.Benevole && reelle.Verrouillee !== modif.Verrouillee;
    }).length;
    let titre = 'Brouillon vide';
    if (n > 0) { titre = `Brouillon : ${n} ${pluriel(n, 'place change', 'places changent')}${ailleurs > 0 ? ` (dont ${ailleurs} un autre jour)` : ''}`; }
    else if (verrous > 0) { titre = `Brouillon : ${verrous} ${pluriel(verrous, 'verrou change', 'verrous changent')}`; }
    return h('div', {class: 'tj-brouillon', role: 'region', 'aria-label': 'Brouillon'},
      h('div', {class: 'tj-brouillon__txt'},
        h('strong', null, titre),
        ...(n + verrous > 0
          ? [delta('♥ Binômes', avant.binomes, apres.binomes, true), delta('♪ Artistes', avant.artistes, apres.artistes, true), delta('À couvrir', avant.aCouvrir.length, apres.aCouvrir.length, false)]
          : [h('span', {class: 'tj-note'}, 'Ajoutez un scénario ou lancez l’algorithme : rien n’est écrit dans le planning avant « Appliquer au planning ».')]),
      ),
      h('button', {class: 'btn btn--sm', type: 'button', disabled: brouillon.pile.length === 0, onclick: () => { annulerDernier(brouillon); apercu = null; rafraichir(); }}, 'Annuler le dernier'),
      h('button', {class: 'btn btn--sm', type: 'button', disabled: brouillon.modifs.size === 0, onclick: () => {
        toutAnnuler(brouillon); apercu = null; message = {ton: 'info', texte: 'Brouillon vidé : le planning n’a pas bougé.'}; rafraichir();
      }}, 'Tout annuler'),
      h('button', {class: 'btn btn--primary', type: 'button', disabled: brouillon.modifs.size === 0, onclick: () => void appliquer()}, 'Appliquer au planning'),
    );
  }

  /** Deux sous-créneaux d'un même macro-créneau qui se recouvrent : voulu
   *  quand deux missions tournent à des rythmes différents (§6.2), d'où une
   *  simple mention repliée plutôt qu'une ligne de la table. */
  function chevauchements() {
    const paires = r.signalements.chevauchements;
    if (paires.length === 0) { return null; }
    const libelle = (sc) => `${sc.Mission != null ? (r.ix.mission.get(sc.Mission)?.Nom ?? 'Mission introuvable') : 'Créneau commun'} ${libelleHeurePlage(sc.Debut, sc.Fin)}`;
    return h('details', {class: 'tj-chevauchements'},
      h('summary', null, `${paires.length} ${pluriel(paires.length, 'paire')} de sous-créneaux se recouvrent ce jour`),
      h('p', {class: 'tj-note'}, 'Voulu quand deux missions tournent à des rythmes différents ; sinon, à corriger dans Missions ou l’Agenda.'),
      h('ul', null, ...paires.map(([a, z]) => h('li', null, `${libelle(a)} et ${libelle(z)}`))),
    );
  }

  // --- Rendu ------------------------------------------------------------------

  /** La vue se redessine entière à chaque geste : on garde ce que la
   *  personne regardait (défilement de la table et du panneau, rubriques
   *  ouvertes du panneau tant qu'il montre la même chose). */
  function memoriser() {
    const panneauActuel = container.querySelector('.tj-panneau');
    return {
      selection: JSON.stringify(selection),
      tableGauche: container.querySelector('.tj-table-cadre')?.scrollLeft ?? 0,
      panneauHaut: panneauActuel?.scrollTop ?? 0,
      ouvertes: [...(panneauActuel?.querySelectorAll('details') ?? [])].map((d) => d.open),
    };
  }

  function restaurer(avant) {
    const cadre = container.querySelector('.tj-table-cadre');
    if (cadre) { cadre.scrollLeft = avant.tableGauche; }
    if (avant.selection !== JSON.stringify(selection)) { return; }
    const panneauActuel = container.querySelector('.tj-panneau');
    if (!panneauActuel) { return; }
    const details = [...panneauActuel.querySelectorAll('details')];
    if (details.length === avant.ouvertes.length) { details.forEach((d, i) => { d.open = avant.ouvertes[i]; }); }
    panneauActuel.scrollTop = avant.panneauHaut;
  }

  function rafraichir() {
    const avant = memoriser();
    vider(container);
    const jour = jourAffiche(regrouperParJour(m.macroCreneaux), m.macroCreneauSelectionne);
    if (!jour) {
      r = null;
      container.append(h('p', {class: 'empty'}, 'Aucun jour de festival : créez d’abord un macro-créneau dans l’Agenda (étape 1).'));
      return;
    }
    if (jour.cle !== cleJourAffiche) {
      // Autre jour choisi dans le bandeau : la sélection et l'aperçu visaient l'ancien.
      if (cleJourAffiche != null) { selection = null; apercu = null; message = null; }
      cleJourAffiche = jour.cle;
    }
    const planning = planningDuBrouillon(m, brouillon);
    const journee = construireJournee(planning, jour);
    let moteur = null;
    const affiche = apercu ? appliquerMouvements(journee.occupantParPlace, apercu.mouvements) : journee.occupantParPlace;
    // Les signalements portent sur ce que la table montre, aperçu compris.
    const planningAffiche = apercu
      ? {...planning, places: planning.places.map((p) => (affiche.has(p.id) ? {...p, Benevole: affiche.get(p.id)} : p))}
      : planning;
    r = {
      jour, journee, reelle: construireJournee(m, jour), ix: journee.ix, affiche,
      dispos: indexerDisponibilites(m),
      aDesDispos: new Set(m.disponibilites.map((d) => d.Benevole)),
      signalements: signalementsDuJour(journee, affiche, planningAffiche),
      alertes: new Map(),
      quartsTries: [...journee.quarts].sort((a, b) => a - b),
      moteur: () => { moteur ??= preparerMoteur(planning); return moteur; },
    };
    if (r.quartsTries.length === 0) { r.quartsTries = [journee.debut]; }
    for (const g of journee.groupes) {
      for (const place of g.places) {
        const b = affiche.get(place.id) ?? null;
        if (b == null || journee.absents.has(b)) { continue; }
        const alertes = alertesPlace(g, place.id, b);
        if (alertes.length > 0) { r.alertes.set(place.id, alertes); }
      }
    }

    const brouillonNonVide = brouillon.modifs.size > 0;
    container.append(...[
      h('div', {class: 'tj-outils'},
        h('button', {class: 'btn btn--primary', type: 'button', onclick: lancerAlgorithme}, 'Relancer l’algorithme dans le brouillon'),
        compteurs(mesurer(journee)),
        h('button', {
          class: 'btn btn--ghost btn--sm tj-outils__fin', type: 'button', disabled: brouillonNonVide,
          title: brouillonNonVide ? 'Appliquez ou annulez d’abord le brouillon' : 'Vide et déverrouille tout le planning, tous les jours confondus',
          onclick: () => void reinitialiser(),
        }, 'Réinitialiser tout'),
      ),
      h('div', {class: 'tj-legende', 'aria-label': 'Légende'},
        h('span', null, h('i', {class: 'tj-l-bloc'}), 'mission'),
        h('span', null, h('i', {class: 'tj-l-vide'}), 'à pourvoir'),
        h('span', null, h('i', {class: 'tj-l-absent'}), 'absent·e à remplacer'),
        h('span', null, h('i', {class: 'tj-l-indispo'}), 'indisponible'),
        h('span', null, h('i', {class: 'tj-l-hors-dispo'}), 'placé·e hors disponibilité'),
        h('span', null, h('i', {class: 'tj-l-art'}), 'voit son artiste'),
        h('span', null, h('i', {class: 'tj-l-rate'}), 'rate son artiste'),
        h('span', null, h('i', {class: 'tj-l-change'}), 'changé dans le brouillon'),
        h('span', null, h('i', {class: 'tj-l-sous'}), 'effectif sous le minimum'),
        h('span', null, '♥ binôme réuni · ♡ binôme séparé · ', icone(ICONES.cadenas, 'icone-texte'), ' verrouillée'),
      ),
      chevauchements(),
      message ? h('div', {class: `tj-message tj-message--${message.ton}`, role: 'status'}, message.texte) : null,
      apercu ? h('div', {class: 'tj-message tj-message--info', role: 'status'}, 'Aperçu : les lignes marquées en pointillé changeraient. Ajoutez au brouillon pour garder ce scénario.') : null,
      h('div', {class: 'tj-corps'}, table(), panneau()),
      barreBrouillon(),
    ].filter(Boolean));
    restaurer(avant);
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return () => { vueActive = false; desabonner(); };
}

