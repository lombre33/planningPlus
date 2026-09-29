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

import {t, tn, traductions} from '../i18n.js';
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

traductions({
  'Classés par : disponibilité (obligatoire), puis binômes souhaités, puis 30 min de chaque artiste souhaité, puis le moins de changements.':
    'Ranked by: availability (required), then wished-for buddies, then 30 min of each wished-for artist, then the fewest changes.',
  'Bénévole introuvable': 'Volunteer not found',
  'désisté·e': 'withdrawn',
  'absent·e': 'absent',
  'Ajouté au brouillon malgré : {malgre}.': 'Added to the draft despite: {malgre}.',
  "{places} redevient libre : l'algorithme pourra la reprendre.": '{places} is free again: the algorithm can fill it.',
  "{places} redeviennent libres : l'algorithme pourra les reprendre.": '{places} are free again: the algorithm can fill them.',
  "{nom} retiré·e de {place} dans le brouillon : la place redevient libre, l'algorithme pourra la reprendre. Verrouillez-la pour la garder vide.":
    '{nom} removed from {place} in the draft: the spot is free again, the algorithm can fill it. Lock it to keep it empty.',
  '{place} verrouillée dans le brouillon : ni les scénarios ni l’algorithme n’y toucheront.':
    '{place} locked in the draft: neither the scenarios nor the algorithm will touch it.',
  '{place} déverrouillée dans le brouillon : les scénarios et l’algorithme peuvent de nouveau la modifier.':
    '{place} unlocked in the draft: the scenarios and the algorithm can change it again.',
  '{place} verrouillée dans le planning : ni les scénarios ni l’algorithme n’y toucheront.':
    '{place} locked in the schedule: neither the scenarios nor the algorithm will touch it.',
  '{place} déverrouillée dans le planning : les scénarios et l’algorithme peuvent de nouveau la modifier.':
    '{place} unlocked in the schedule: the scenarios and the algorithm can change it again.',
  "Échec de l'écriture dans le document Grist connecté. Réessayez.": 'Could not write to the connected Grist document. Try again.',
  "{nom} pointé·e absent·e : sa place {place} reste à son nom, en jaune. Choisissez un remplacement pour l'ajouter au brouillon.":
    '{nom} marked absent: their spot {place} stays in their name, in yellow. Choose a replacement to add it to the draft.',
  "{nom} pointé·e absent·e : ne sera plus proposé·e aujourd'hui.": '{nom} marked absent: will no longer be suggested today.',
  "L'algorithme a ajouté {n} changement au brouillon. Rien n'est encore écrit.":
    'The algorithm added {n} change to the draft. Nothing is written yet.',
  "L'algorithme a ajouté {n} changements au brouillon. Rien n'est encore écrit.":
    'The algorithm added {n} changes to the draft. Nothing is written yet.',
  "L'algorithme ne trouve rien à changer ce jour.": 'The algorithm finds nothing to change on this day.',
  "{n} place avait changé entre-temps dans le planning et n'a pas été écrite : {places}.":
    '{n} spot had changed in the schedule in the meantime and was not written: {places}.',
  "{n} places avaient changé entre-temps dans le planning et n'ont pas été écrites : {places}.":
    '{n} spots had changed in the schedule in the meantime and were not written: {places}.',
  'place {id}': 'spot {id}',
  "Planning mis à jour : {n} place écrite d'un coup. Les places corrigées à la main restent verrouillées.":
    'Schedule updated: {n} spot written at once. Spots set by hand stay locked.',
  "Planning mis à jour : {n} places écrites d'un coup. Les places corrigées à la main restent verrouillées.":
    'Schedule updated: {n} spots written at once. Spots set by hand stay locked.',
  'Réinitialiser TOUT le planning ({n} place affectée ou verrouillée, tous les jours confondus) ?':
    'Reset the ENTIRE schedule ({n} assigned or locked spot, across all days)?',
  'Réinitialiser TOUT le planning ({n} places affectées ou verrouillées, tous les jours confondus) ?':
    'Reset the ENTIRE schedule ({n} assigned or locked spots, across all days)?',
  "Ce geste vide et déverrouille chaque place, y compris vos corrections manuelles : irréversible. Vous pourrez ensuite relancer l'algorithme sur une ardoise vierge.":
    'This empties and unlocks every spot, including your manual corrections: it cannot be undone. You can then rerun the algorithm on a clean slate.',
  '{n} place réinitialisée.': '{n} spot reset.',
  '{n} places réinitialisées.': '{n} spots reset.',
  'Indisponible {plage}': 'Unavailable {plage}',
  'Voit {artiste} ({plage})': 'Sees {artiste} ({plage})',
  'Rate {artiste} ({plage})': 'Misses {artiste} ({plage})',
  'Désisté·e pour tout le festival (Bénévoles › Désistements)': 'Withdrawn for the whole festival (Volunteers › Withdrawals)',
  'Appel : {nom}': 'Roll call: {nom}',
  'Présent·e': 'Present',
  '{nom} présent·e': '{nom} present',
  'Absent·e aujourd’hui': 'Absent today',
  '{nom} absent·e': '{nom} absent',
  'Mission introuvable': 'Task not found',
  'pas de disponibilité déclarée': 'no availability declared',
  'Aucune disponibilité déclarée : impossible de vérifier ses créneaux.': 'No availability declared: their slots cannot be checked.',
  'hors disponibilité': 'outside availability',
  'Placé·e hors de ses disponibilités : {creneaux}.': 'Placed outside their availability: {creneaux}.',
  'en même temps sur {place}': 'at the same time on {place}',
  'Tient aussi {place}, sur des créneaux qui se recouvrent.': 'Also holds {place}, on overlapping slots.',
  'a refusé {mission}': 'refused {mission}',
  'A refusé la mission {mission}.': 'Refused the task {mission}.',
  'quota dépassé ({heures} / {max})': 'quota exceeded ({heures} / {max})',
  'Quota dépassé : {heures} sur tout le festival, pour {max} au plus.':
    'Quota exceeded: {heures} over the whole festival, for {max} at most.',
  'sans indicatif': 'no call sign',
  'Avec son binôme souhaité': 'With their wished-for buddy',
  'Binôme souhaité ailleurs : {binomes}': 'Wished-for buddy elsewhere: {binomes}',
  vide: 'empty',
  'avant : {ancien}': 'before: {ancien}',
  'absent·e à l’appel': 'absent at roll call',
  'rate {artistes}': 'misses {artistes}',
  'avec son binôme souhaité': 'with their wished-for buddy',
  'binôme souhaité ailleurs : {binomes}': 'wished-for buddy elsewhere: {binomes}',
  verrouillée: 'locked',
  '{code} à pourvoir': 'Open spot {code}',
  'À pourvoir': 'Open',
  'Verrouillée : corrigée à la main': 'Locked: set by hand',
  'à pourvoir': 'open',
  refusée: 'refused',
  '{creneau} : {n} personne pour un maximum de {max}.': '{creneau}: {n} person for a maximum of {max}.',
  '{creneau} : {n} personnes pour un maximum de {max}.': '{creneau}: {n} people for a maximum of {max}.',
  '{creneau} : {n} personne pour un minimum de {min}.': '{creneau}: {n} person for a minimum of {min}.',
  '{creneau} : {n} personnes pour un minimum de {min}.': '{creneau}: {n} people for a minimum of {min}.',
  'Seulement {n} place positionnée : positionnez un indicatif de plus (étape 3) ou baissez le minimum (étape 2).':
    'Only {n} spot placed: place one more call sign (step 3) or lower the minimum (step 2).',
  'Seulement {n} places positionnées : positionnez un indicatif de plus (étape 3) ou baissez le minimum (étape 2).':
    'Only {n} spots placed: place one more call sign (step 3) or lower the minimum (step 2).',
  'Et {n} à couvrir ci-dessous.': 'And {n} to cover below.',
  '{n} place à couvrir ci-dessous.': '{n} spot to cover below.',
  '{n} places à couvrir ci-dessous.': '{n} spots to cover below.',
  '{n} créneau sous le minimum': '{n} slot below the minimum',
  '{n} créneaux sous le minimum': '{n} slots below the minimum',
  '{n} au-dessus du maximum': '{n} above the maximum',
  '{n} / {min} min': '{n} / {min} min',
  '{n} / {max} max': '{n} / {max} max',
  '{mission} : {resume}': '{mission}: {resume}',
  'sans place': 'no spot',
  libre: 'free',
  'aucune disponibilité ce jour': 'no availability this day',
  'dispo {plages}': 'available {plages}',
  Heure: 'Hour',
  Artistes: 'Artists',
  'passages du jour': 'the day’s sets',
  'Masquer les effectifs hors bornes': 'Hide out-of-range headcounts',
  'Afficher les missions dont un créneau du jour est sous son minimum ou au-dessus de son maximum':
    'Show the tasks with a slot of the day below its minimum or above its maximum',
  'Effectifs hors bornes ({n})': 'Out-of-range headcounts ({n})',
  'Places du jour': 'The day’s spots',
  'Aucun indicatif positionné ce jour-là. Positionnez des indicatifs depuis la vue Indicatifs (étape 3), puis revenez ici.':
    'No call sign placed on that day. Place call signs from the Call signs view (step 3), then come back here.',
  'Sans indicatif aujourd’hui ({n})': 'Without a call sign today ({n})',
  'Absents sans place ({n})': 'Absent without a spot ({n})',
  'Table du jour': 'Day table',
  '{a} et {b} échangent leurs places ({placeA} ↔ {placeB})': '{a} and {b} swap spots ({placeA} ↔ {placeB})',
  '{nom} passe de {de} à {vers}, à la place de {absent} ({etat})': '{nom} moves from {de} to {vers}, replacing {absent} ({etat})',
  '{nom} passe de {de} à {vers}': '{nom} moves from {de} to {vers}',
  '{nom} prend aussi {vers}, à la place de {absent} ({etat})': '{nom} also takes {vers}, replacing {absent} ({etat})',
  '{nom} prend aussi {vers}': '{nom} also takes {vers}',
  '{nom}, sans indicatif, prend {vers}, à la place de {absent} ({etat})':
    '{nom}, without a call sign, takes {vers}, replacing {absent} ({etat})',
  '{nom}, sans indicatif, prend {vers}': '{nom}, without a call sign, takes {vers}',
  '{nom} quitte {de} et reste disponible': '{nom} leaves {de} and stays available',
  '{a} et {b}': '{a} and {b}',
  '{nom} voit {artiste}': '{nom} sees {artiste}',
  '{nom} rate {artiste}': '{nom} misses {artiste}',
  'Disponibles sur tous leurs créneaux': 'Available on all their slots',
  '+{n} binôme souhaité : {paires}': 'Wished-for buddies +{n}: {paires}',
  '−{n} : {paires} séparés': '−{n}: {paires} apart',
  'Binômes inchangés': 'Buddies unchanged',
  '+{n} : {artistes}': '+{n}: {artistes}',
  '−{n} : {artistes}': '−{n}: {artistes}',
  'Aucun artiste perdu': 'No artist missed',
  '{nom} quitte la restauration souhaitée': '{nom} leaves their wished-for catering',
  '{nom} rejoint la restauration souhaitée': '{nom} joins their wished-for catering',
  'Le mieux classé': 'Best ranked',
  '{n} changement': '{n} change',
  '{n} changements': '{n} changes',
  'Masquer l’aperçu': 'Hide preview',
  'Voir dans la table': 'Show in the table',
  'Ajouter au brouillon': 'Add to draft',
  '{n} autre possibilité, moins bien classée': '{n} other option, ranked lower',
  '{n} autres possibilités, moins bien classées': '{n} other options, ranked lower',
  'Et {n} de plus, encore moins bien classée.': 'And {n} more, ranked even lower.',
  'Et {n} de plus, encore moins bien classées.': 'And {n} more, ranked even lower.',
  '{qui} : {raison}': '{qui}: {raison}',
  Déverrouiller: 'Unlock',
  'Choisir…': 'Choose…',
  'contre : {raison}': 'issue: {raison}',
  'Choisir quelqu’un d’autre': 'Choose someone else',
  'Tous les présents du jour, même hors de vos critères : ce que le choix enfreint s’affiche à côté du nom. Qui tient déjà un indicatif sur ce créneau le quitte.':
    'Everyone present that day, even outside your criteria: what the choice breaks is shown next to the name. Anyone already holding a call sign on this slot leaves it.',
  '{nom} (quitte {places})': '{nom} (leaves {places})',
  'Placer {nom} sur une autre place à couvrir': 'Place {nom} on another spot to cover',
  'Toutes les places à couvrir du jour, même hors de vos critères : ce que le choix enfreint s’affiche à côté.':
    'All the day’s spots to cover, even outside your criteria: what the choice breaks is shown alongside.',
  'voit {artiste} ({heure})': 'sees {artiste} ({heure})',
  'rate {artiste} ({plage})': 'misses {artiste} ({plage})',
  'avec {nom}, binôme souhaité': 'with {nom}, wished-for buddy',
  'souhaite être avec {nom}': 'wants to be with {nom}',
  '{mission} : effectifs': '{mission}: headcounts',
  'Créneaux du jour hors de leurs effectifs minimum ou maximum, avec le planning affiché (brouillon compris). Les absents ne comptent pas.':
    'The day’s slots outside their minimum or maximum headcount, with the schedule shown (draft included). Absent volunteers do not count.',
  'Remplacer {nom} en {code}': 'Replace {nom} in {code}',
  'Désisté·e pour tout le festival : la place reste à son nom tant que vous ne choisissez pas un remplacement.':
    'Withdrawn for the whole festival: the spot stays in their name until you choose a replacement.',
  'Pointé·e absent·e à l’appel : la place reste à son nom tant que vous ne choisissez pas un remplacement.':
    'Marked absent at roll call: the spot stays in their name until you choose a replacement.',
  'Reste en place : {nom}.': 'Still in place: {nom}.',
  'Place verrouillée : corrigée à la main, jamais touchée par un scénario ni par l’algorithme. Déverrouillez-la pour voir ses remplacements.':
    'Locked spot: set by hand, never touched by a scenario or by the algorithm. Unlock it to see its replacements.',
  '{nom} tiendra {indicatif} seul·e sur son créneau': '{nom} will hold {indicatif} alone on its slot',
  '{nom} tiendra {indicatif} seul·e sur ses {n} créneaux': '{nom} will hold {indicatif} alone on its {n} slots',
  'personne ne tiendra {indicatif} sur son créneau': 'nobody will hold {indicatif} on its slot',
  'personne ne tiendra {indicatif} sur ses {n} créneaux': 'nobody will hold {indicatif} on its {n} slots',
  'mission critique : reste en rouge': 'critical task: stays red',
  'reste en orange': 'stays orange',
  'Aucun remplacement ni chaîne ne respecte les disponibilités. Voir ci-dessous qui a été écarté et pourquoi.':
    'No replacement or chain fits the availability. See below who was ruled out and why.',
  'Ou ne rien changer : {tenue} ({couleur}).': 'Or change nothing: {tenue} ({couleur}).',
  'Ou laisser la place vide : {tenue} ({couleur}).': 'Or leave the spot empty: {tenue} ({couleur}).',
  'Verrouillée, elle restera vide même si vous relancez l’algorithme.': 'Once locked, it will stay empty even if you rerun the algorithm.',
  'Verrouiller vide': 'Lock empty',
  Écartés: 'Ruled out',
  'Place verrouillée : corrigée à la main, jamais déplacée par un scénario ni par l’algorithme. Déverrouillez-la pour voir ses échanges.':
    'Locked spot: set by hand, never moved by a scenario or by the algorithm. Unlock it to see its swaps.',
  'Échanges possibles': 'Possible swaps',
  'Aucun échange n’améliore vos critères.': 'No swap improves your criteria.',
  '{n} échange améliore vos critères.': '{n} swap improves your criteria.',
  '{n} échanges améliorent vos critères.': '{n} swaps improve your criteria.',
  'Aucun échange ne respecte les disponibilités des deux personnes.': 'No swap fits both people’s availability.',
  'Ou garder {nom} ici quoi qu’il arrive : verrouillée, la place ne bougera plus, ni par un scénario ni par l’algorithme.':
    'Or keep {nom} here no matter what: once locked, the spot will no longer move, neither by a scenario nor by the algorithm.',
  Verrouiller: 'Lock',
  'Ou retirer {nom} de {place} : la place redevient libre.': 'Or remove {nom} from {place}: the spot becomes free again.',
  'Retirer de la place': 'Remove from spot',
  'Échanges écartés': 'Swaps ruled out',
  'Pointé·e absent·e à l’appel aujourd’hui, sans indicatif.': 'Marked absent at roll call today, without a call sign.',
  'S’il ou elle arrive finalement, ✓ à l’appel le ou la rend disponible pour les remplacements.':
    'If they show up after all, ✓ at roll call makes them available for replacements.',
  'Sans indicatif aujourd’hui': 'Without a call sign today',
  'Places à couvrir qu’il ou elle peut prendre': 'Spots to cover they can take',
  'Aucune place à couvrir ne lui convient en ce moment.': 'No spot to cover suits them right now.',
  'Toutes les places du jour sont couvertes : il ou elle reste en renfort.': 'All the day’s spots are covered: they stay on as backup.',
  'Places écartées': 'Spots ruled out',
  'Cliquez une place à pourvoir ou une personne pour voir toutes les options, classées selon vos priorités.':
    'Click an open spot or a person to see all the options, ranked by your priorities.',
  Scénarios: 'Scenarios',
  '{couvertes} / {total} places couvertes': '{couvertes} / {total} spots covered',
  'Binômes souhaités {n} / {total}': 'Wished-for buddies {n} / {total}',
  'Artistes souhaités vus {n} / {total}': 'Wished-for artists seen {n} / {total}',
  'Lignes qui enfreignent une règle (hors disponibilité, mission refusée, deux places en même temps, quota dépassé, disponibilités non déclarées) et effectifs hors bornes, en tête de table.':
    'Rows that break a rule (outside availability, refused task, two spots at the same time, quota exceeded, no availability declared) and out-of-range headcounts, at the top of the table.',
  '{n} à vérifier': '{n} to check',
  'Brouillon vide': 'Empty draft',
  'Brouillon : {n} place change (dont {ailleurs} un autre jour)': 'Draft: {n} spot changes ({ailleurs} on another day)',
  'Brouillon : {n} places changent (dont {ailleurs} un autre jour)': 'Draft: {n} spots change ({ailleurs} of them on another day)',
  'Brouillon : {n} place change': 'Draft: {n} spot changes',
  'Brouillon : {n} places changent': 'Draft: {n} spots change',
  'Brouillon : {n} verrou change': 'Draft: {n} lock changes',
  'Brouillon : {n} verrous changent': 'Draft: {n} locks change',
  Brouillon: 'Draft',
  Binômes: 'Buddies',
  'À couvrir': 'To cover',
  'Ajoutez un scénario ou lancez l’algorithme : rien n’est écrit dans le planning avant « Appliquer au planning ».':
    'Add a scenario or run the algorithm: nothing is written to the schedule before “Apply to schedule”.',
  'Annuler le dernier': 'Undo last',
  'Brouillon vidé : le planning n’a pas bougé.': 'Draft cleared: the schedule has not changed.',
  'Tout annuler': 'Undo all',
  'Appliquer au planning': 'Apply to schedule',
  'Créneau commun': 'Common slot',
  '{n} paire de sous-créneaux se recouvrent ce jour': '{n} pair of slots overlaps on this day',
  '{n} paires de sous-créneaux se recouvrent ce jour': '{n} pairs of slots overlap on this day',
  'Voulu quand deux missions tournent à des rythmes différents ; sinon, à corriger dans Missions ou l’Agenda.':
    'Intended when two tasks rotate at different paces; otherwise, fix it in Tasks or the Agenda.',
  'Aucun jour de festival : créez d’abord un macro-créneau dans l’Agenda (étape 1).':
    'No festival day: first create a time block in the Agenda (step 1).',
  'Relancer l’algorithme dans le brouillon': 'Rerun the algorithm in the draft',
  'Appliquez ou annulez d’abord le brouillon': 'Apply or discard the draft first',
  'Vide et déverrouille tout le planning, tous les jours confondus': 'Empties and unlocks the whole schedule, across all days',
  'Réinitialiser tout': 'Reset all',
  Légende: 'Legend',
  mission: 'task',
  'absent·e à remplacer': 'absent, to replace',
  indisponible: 'unavailable',
  'placé·e hors disponibilité': 'placed outside availability',
  'voit son artiste': 'sees their artist',
  'rate son artiste': 'misses their artist',
  'changé dans le brouillon': 'changed in the draft',
  'effectif sous le minimum': 'headcount below minimum',
  'binôme réuni': 'buddies together',
  'binôme séparé': 'buddies apart',
  'Aperçu : les lignes marquées en pointillé changeraient. Ajoutez au brouillon pour garder ce scénario.':
    'Preview: the rows marked with dotted lines would change. Add to the draft to keep this scenario.',
});

/** Redit en tête de chaque liste de scénarios, dans la langue du moment. */
const ordreTexte = () => t('Classés par : disponibilité (obligatoire), puis binômes souhaités, puis 30 min de chaque artiste souhaité, puis le moins de changements.');
const AUTRES_AFFICHES = 40;

/** Un brouillon par magasin, pour qu'il survive à un changement d'onglet. */
const brouillons = new WeakMap();
function brouillonDe(m) {
  let b = brouillons.get(m);
  if (!b) { b = creerBrouillon(); brouillons.set(m, b); }
  return b;
}

/** Les scénarios sont recalculés à chaque rendu : l'aperçu les reconnaît à leurs mouvements. */
const cleScenario = (sc) => sc.mouvements.map((mv) => `${mv.benevoleId}:${mv.de}>${mv.vers}`).join(' ');

/**
 * Un texte traduit dont les repères `{…}` reçoivent du texte ou un élément
 * (un nom en gras, un nom barré) : chaque langue garde son ordre des mots.
 * Les morceaux de texte voisins restent un seul nœud, comme avant.
 */
function remplirAvecElements(modele, valeurs) {
  const morceaux = [];
  for (const brut of modele.split(/(\{\w+\})/)) {
    const repere = /^\{(\w+)\}$/.exec(brut)?.[1];
    const morceau = repere != null && repere in valeurs ? valeurs[repere] : brut;
    if (morceau instanceof Node) {
      morceaux.push(morceau);
    } else if (typeof morceaux.at(-1) === 'string') {
      morceaux[morceaux.length - 1] += String(morceau);
    } else if (morceau !== '') {
      morceaux.push(String(morceau));
    }
  }
  return morceaux;
}

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

  const nom = (id) => nomsComplets.get(id) ?? m.benevoles.find((b) => b.id === id)?.Nom ?? t('Bénévole introuvable');
  const absence = (id) => (r.journee.desistes.has(id) ? t('désisté·e') : t('absent·e'));
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
    if (malgre) { notes.push(t('Ajouté au brouillon malgré : {malgre}.', {malgre})); }
    if (liberees.length > 0) {
      notes.push(tn(liberees.length, "{places} redevient libre : l'algorithme pourra la reprendre.",
        "{places} redeviennent libres : l'algorithme pourra les reprendre.", {places: liberees.join(', ')}));
    }
    message = notes.length > 0 ? {ton: malgre ? 'danger' : 'info', texte: notes.join(' ')} : null;
    const arrivee = mouvements.find((mv) => mv.vers != null);
    if (arrivee) { selection = {type: 'place', placeId: arrivee.vers}; }
    rafraichir();
  }

  function retirer(placeId, benevoleId) {
    retirerDeLaPlace(m, brouillon, placeId);
    apercu = null;
    message = {ton: 'info', texte: t("{nom} retiré·e de {place} dans le brouillon : la place redevient libre, l'algorithme pourra la reprendre. Verrouillez-la pour la garder vide.",
      {nom: nom(benevoleId), place: etiquette(placeId)})};
    rafraichir();
  }

  /** Un verrou se pose ou s'ôte dans le brouillon sur une place qu'il
   *  change, sinon tout de suite dans le planning (comme dans la maquette). */
  async function changerVerrou(placeId, verrouillee) {
    const place = etiquette(placeId);
    apercu = null;
    if ((verrouillee ? verrouillerDansBrouillon : deverrouillerDansBrouillon)(m, brouillon, placeId)) {
      message = {ton: 'info', texte: verrouillee
        ? t('{place} verrouillée dans le brouillon : ni les scénarios ni l’algorithme n’y toucheront.', {place})
        : t('{place} déverrouillée dans le brouillon : les scénarios et l’algorithme peuvent de nouveau la modifier.', {place})};
      rafraichir();
      return;
    }
    const resultat = await m.basculerVerrouillage(placeId);
    message = resultat.ok
      ? {ton: 'info', texte: verrouillee
        ? t('{place} verrouillée dans le planning : ni les scénarios ni l’algorithme n’y toucheront.', {place})
        : t('{place} déverrouillée dans le planning : les scénarios et l’algorithme peuvent de nouveau la modifier.', {place})}
      : {ton: 'danger', texte: resultat.raison};
    rafraichir();
  }

  async function pointer(benevoleId, present) {
    const {jour, journee} = r;
    try {
      await m.definirPresence(benevoleId, jour.cle, present);
    } catch {
      message = {ton: 'danger', texte: t("Échec de l'écriture dans le document Grist connecté. Réessayez.")};
      rafraichir();
      return;
    }
    apercu = null;
    message = null;
    if (!present) {
      const placeId = [...journee.occupantParPlace].find(([, b]) => b === benevoleId)?.[0];
      if (placeId != null) { selection = {type: 'place', placeId}; }
      message = {ton: 'info', texte: placeId != null
        ? t("{nom} pointé·e absent·e : sa place {place} reste à son nom, en jaune. Choisissez un remplacement pour l'ajouter au brouillon.",
          {nom: nom(benevoleId), place: etiquette(placeId)})
        : t("{nom} pointé·e absent·e : ne sera plus proposé·e aujourd'hui.", {nom: nom(benevoleId)})};
    }
    rafraichir();
  }

  function lancerAlgorithme() {
    const n = relancerAlgorithme(m, brouillon, [...r.journee.macroIds]);
    apercu = null;
    message = n > 0
      ? {ton: 'info', texte: tn(n, "L'algorithme a ajouté {n} changement au brouillon. Rien n'est encore écrit.",
        "L'algorithme a ajouté {n} changements au brouillon. Rien n'est encore écrit.")}
      : {ton: 'info', texte: t("L'algorithme ne trouve rien à changer ce jour.")};
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
        ? ` ${tn(resultat.refusees.length, "{n} place avait changé entre-temps dans le planning et n'a pas été écrite : {places}.",
          "{n} places avaient changé entre-temps dans le planning et n'ont pas été écrites : {places}.",
          {places: resultat.refusees.map((id) => etiquettes.get(id) ?? t('place {id}', {id})).join(', ')})}`
        : '';
      message = {ton: resultat.refusees.length > 0 ? 'danger' : 'ok', texte: `${tn(resultat.ecrites,
        "Planning mis à jour : {n} place écrite d'un coup. Les places corrigées à la main restent verrouillées.",
        "Planning mis à jour : {n} places écrites d'un coup. Les places corrigées à la main restent verrouillées.")}${refus}`};
    }
    rafraichir();
  }

  async function reinitialiser() {
    const nb = m.places.filter((p) => p.Benevole != null || p.Verrouillee).length;
    if (nb === 0) { return; }
    const confirme = window.confirm(
      `${tn(nb, 'Réinitialiser TOUT le planning ({n} place affectée ou verrouillée, tous les jours confondus) ?',
        'Réinitialiser TOUT le planning ({n} places affectées ou verrouillées, tous les jours confondus) ?')}\n\n`
      + t("Ce geste vide et déverrouille chaque place, y compris vos corrections manuelles : irréversible. Vous pourrez ensuite relancer l'algorithme sur une ardoise vierge."),
    );
    if (!confirme) { return; }
    const resultat = await m.reinitialiserAffectations();
    message = resultat.ok
      ? {ton: 'ok', texte: tn(nb, '{n} place réinitialisée.', '{n} places réinitialisées.')}
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
      class: 'tj-indispo', style: position(a, z), title: t('Indisponible {plage}', {plage: libelleHeurePlage(a, z)}),
    }));
  }

  function marquesArtistes(benevoleId) {
    return souhaitsDuBenevole(r.journee, r.affiche, benevoleId).map(({artiste, vu}) => {
      const variables = {artiste: artiste.Nom, plage: libelleHeurePlage(artiste.Debut, artiste.Fin)};
      return h('span', {
        class: `tj-art${vu ? '' : ' tj-art--rate'}`, style: position(artiste.Debut, artiste.Fin),
        title: vu ? t('Voit {artiste} ({plage})', variables) : t('Rate {artiste} ({plage})', variables),
      });
    });
  }

  function boutonsAppel(benevoleId) {
    if (r.journee.desistes.has(benevoleId)) {
      return h('span', {class: 'tj-appel-vide', title: t('Désisté·e pour tout le festival (Bénévoles › Désistements)')});
    }
    const absent = r.journee.absents.has(benevoleId);
    const present = r.journee.presents.has(benevoleId);
    return h('div', {class: 'tj-appel', role: 'group', 'aria-label': t('Appel : {nom}', {nom: nom(benevoleId)}), onclick: (e) => e.stopPropagation(), onkeydown: (e) => e.stopPropagation()},
      h('button', {
        type: 'button', class: 'tj-appel__ok', 'aria-pressed': String(present), title: t('Présent·e'),
        'aria-label': t('{nom} présent·e', {nom: nom(benevoleId)}), onclick: () => void pointer(benevoleId, true),
      }, '✓'),
      h('button', {
        type: 'button', class: 'tj-appel__abs', 'aria-pressed': String(absent), title: t('Absent·e aujourd’hui'),
        'aria-label': t('{nom} absent·e', {nom: nom(benevoleId)}), onclick: () => void pointer(benevoleId, false),
      }, '✗'),
    );
  }

  function celluleNom(contenu, onChoisir, libelle) {
    return h('div', {
      class: 'tj-nom', role: 'button', tabindex: '0', 'aria-label': libelle, onclick: onChoisir,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoisir(); } },
    }, ...contenu);
  }

  const creneauTexte = ({sousCreneau, mission}) => `${mission?.Nom ?? t('Mission introuvable')} ${libelleHeurePlage(sousCreneau.Debut, sousCreneau.Fin)}`;

  /** Ce qu'une place tenue enfreint (ancienne page Anomalies), du plus grave
   *  au moins grave : `texte` pour la ligne, `detail` pour le panneau. Une
   *  personne sans aucune disponibilité déclarée n'est ni en règle ni hors
   *  disponibilité : on n'a rien pu vérifier, on le dit (même règle que
   *  l'ancienne vérification bénévole par bénévole). */
  function alertesPlace(g, placeId, b) {
    const alertes = [];
    if (!r.aDesDispos.has(b)) {
      alertes.push({texte: t('pas de disponibilité déclarée'), neutre: true, detail: t('Aucune disponibilité déclarée : impossible de vérifier ses créneaux.')});
    } else {
      const hors = g.positions.filter(({sousCreneau}) => !disponibleSur(b, sousCreneau));
      if (hors.length > 0) {
        alertes.push({texte: t('hors disponibilité'), grave: true, detail: t('Placé·e hors de ses disponibilités : {creneaux}.', {creneaux: hors.map(creneauTexte).join(', ')})});
      }
    }
    for (const autre of r.signalements.enMemeTemps.get(placeId) ?? []) {
      alertes.push({texte: t('en même temps sur {place}', {place: etiquette(autre)}), grave: true, detail: t('Tient aussi {place}, sur des créneaux qui se recouvrent.', {place: etiquette(autre)})});
    }
    for (const mission of r.signalements.refus.get(placeId) ?? []) {
      alertes.push({texte: t('a refusé {mission}', {mission: mission.Nom}), grave: true, detail: t('A refusé la mission {mission}.', {mission: mission.Nom})});
    }
    const quota = r.signalements.quotas.get(b);
    if (quota) {
      const heures = {heures: formatHeures(quota.heures), max: formatHeures(quota.max)};
      alertes.push({
        texte: t('quota dépassé ({heures} / {max})', heures),
        detail: t('Quota dépassé : {heures} sur tout le festival, pour {max} au plus.', heures),
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
    const separes = binomes.filter((x) => !x.reunis).map((x) => `${nom(x.partenaireId)} (${x.codes.length > 0 ? x.codes.join(', ') : t('sans indicatif')})`);
    const coeur = binomes.some((x) => x.reunis) ? h('span', {class: 'tj-coeur', title: t('Avec son binôme souhaité')}, '♥') : null;
    const coeurVide = separes.length > 0
      ? h('span', {class: 'tj-coeur tj-coeur--vide', title: t('Binôme souhaité ailleurs : {binomes}', {binomes: separes.join(', ')})}, '♡') : null;
    const rates = present ? souhaitsDuBenevole(journee, r.affiche, b).filter((s) => !s.vu) : [];
    const verifiable = present && r.aDesDispos.has(b);

    // Sous le nom : l'indicatif, puis tout ce que la ligne enfreint (en
    // rouge ce qui est à corriger), l'équipe seulement s'il n'y a rien à dire.
    const sousTitre = [h('span', {class: 'tj-code'}, code)];
    const texte = [code];
    const noter = (mot, element = mot) => { sousTitre.push(' · ', element); texte.push(mot); };
    if (changeReel) {
      const ancien = avant != null ? nom(avant) : t('vide');
      sousTitre.push(...remplirAvecElements(` · ${t('avant : {ancien}')}`, {ancien: h('s', null, ancien)}));
      texte.push(t('avant : {ancien}', {ancien}));
    }
    if (absent) { noter(journee.desistes.has(b) ? t('désisté·e') : t('absent·e à l’appel')); }
    for (const a of alertes) { noter(a.texte, a.grave ? h('span', {class: 'tj-alerte'}, a.texte) : a.texte); }
    if (rates.length > 0) { noter(t('rate {artistes}', {artistes: rates.map((s) => s.artiste.Nom).join(', ')})); }
    const equipe = r.ix.equipe.get(g.groupe.Equipe);
    if (texte.length === 1 && equipe) { noter(equipe.Nom); }

    // Nom accessible : qui, où, puis ce que la ligne montre d'autre.
    const details = [
      changeReel ? t('avant : {ancien}', {ancien: avant != null ? nom(avant) : t('vide')}) : null,
      ...alertes.map((a) => a.texte),
      rates.length > 0 ? t('rate {artistes}', {artistes: rates.map((s) => s.artiste.Nom).join(', ')}) : null,
      coeur ? t('avec son binôme souhaité') : null,
      coeurVide ? t('binôme souhaité ailleurs : {binomes}', {binomes: separes.join(', ')}) : null,
      verrouillee ? t('verrouillée') : null,
    ].filter(Boolean);
    const libelle = [b != null ? `${nom(b)}${absent ? `, ${absence(b)}` : ''}, ${code}` : t('{code} à pourvoir', {code}), ...details].join(', ');
    const cellule = celluleNom([
      b != null ? boutonsAppel(b) : h('span', {class: 'tj-appel-vide'}),
      h('div', {class: 'tj-nom__txt'},
        h('strong', null, b != null ? nom(b) : `! ${t('À pourvoir')}`, coeur, coeurVide, verrouillee ? h('span', {class: 'tj-verrou', title: t('Verrouillée : corrigée à la main')}, icone(ICONES.cadenas, 'icone-texte')) : null),
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
      const nomMission = mission?.Nom ?? t('Mission introuvable');
      const etat = b == null ? ` · ${t('à pourvoir')}` : absent ? ` · ${absence(b)}` : horsDispo ? ` · ${t('hors disponibilité')}` : refusee ? ` · ${t('refusée')}` : '';
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
      return tn(pourvues, '{creneau} : {n} personne pour un maximum de {max}.', '{creneau} : {n} personnes pour un maximum de {max}.',
        {creneau, max: besoin.Effectif_max});
    }
    const aCouvrir = places - pourvues;
    const phrases = [tn(pourvues, '{creneau} : {n} personne pour un minimum de {min}.', '{creneau} : {n} personnes pour un minimum de {min}.',
      {creneau, min: besoin.Effectif_min})];
    if (places < besoin.Effectif_min) {
      phrases.push(tn(places, 'Seulement {n} place positionnée : positionnez un indicatif de plus (étape 3) ou baissez le minimum (étape 2).',
        'Seulement {n} places positionnées : positionnez un indicatif de plus (étape 3) ou baissez le minimum (étape 2).'));
      if (aCouvrir > 0) { phrases.push(t('Et {n} à couvrir ci-dessous.', {n: aCouvrir})); }
    } else {
      phrases.push(tn(aCouvrir, '{n} place à couvrir ci-dessous.', '{n} places à couvrir ci-dessous.'));
    }
    return phrases.join(' ');
  }

  /** Une ligne par mission dont un besoin du jour est hors de ses bornes
   *  (ancienne page Anomalies, sous-effectif et sur-effectif). */
  function ligneEffectifs(liste) {
    const mission = liste[0].mission;
    const nomMission = mission?.Nom ?? t('Mission introuvable');
    const cle = mission?.id ?? null;
    const choisie = selection?.type === 'effectifs' && selection.missionId === cle;
    const onChoisir = () => choisir({type: 'effectifs', missionId: cle});
    const sous = liste.filter((e) => e.pourvues < e.besoin.Effectif_min).length;
    const sur = liste.length - sous;
    const resume = [
      sous > 0 ? tn(sous, '{n} créneau sous le minimum', '{n} créneaux sous le minimum') : null,
      sur > 0 ? t('{n} au-dessus du maximum', {n: sur}) : null,
    ].filter(Boolean).join(', ');
    const blocs = liste.map((e) => {
      const manque = e.pourvues < e.besoin.Effectif_min;
      return h('span', {
        class: `tj-bloc ${manque ? 'tj-bloc--sous' : 'tj-bloc--sur'}`,
        style: position(e.sousCreneau.Debut, e.sousCreneau.Fin), title: texteEffectif(e),
      }, manque
        ? t('{n} / {min} min', {n: e.pourvues, min: e.besoin.Effectif_min})
        : t('{n} / {max} max', {n: e.pourvues, max: e.besoin.Effectif_max}));
    });
    return h('div', {class: `tj-ligne tj-effectifs${choisie ? ' tj-ligne--choisie' : ''}`},
      celluleNom([
        h('span', {class: 'tj-appel-vide'}),
        h('div', {class: 'tj-nom__txt'}, h('strong', null, nomMission), h('small', {title: resume}, resume)),
      ], onChoisir, t('{mission} : {resume}', {mission: nomMission, resume})),
      piste(blocs, onChoisir));
  }

  function ligneLibre(benevoleId, absent) {
    const choisie = selection?.type === 'benevole' && selection.benevoleId === benevoleId;
    const onChoisir = () => choisir({type: 'benevole', benevoleId});
    const detail = absent
      ? `${t('absent·e à l’appel')} · ${t('sans place')}`
      : `${t('libre')} · ${disponibiliteTexte(benevoleId) || t('aucune disponibilité ce jour')}`;
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
    return plages.length > 0 ? t('dispo {plages}', {plages: plages.map(([a, z]) => libelleHeurePlage(a, z)).join(', ')}) : '';
  }

  function table() {
    const {journee} = r;
    const heures = [];
    const premiereHeure = Math.ceil(journee.debut / 3600) * 3600;
    const pas = journee.fin - journee.debut > 10 * 3600 ? 2 : 1;
    for (let heure = premiereHeure; heure <= journee.fin; heure += 3600) {
      const bord = heure === journee.debut ? 'tj-axe__debut' : heure === journee.fin ? 'tj-axe__fin' : null;
      heures.push(h('span', {class: bord, style: {left: position(heure, heure).left}}, ((heure - premiereHeure) / 3600) % pas === 0 ? libelleHeure(heure) : ''));
    }
    const lignes = [
      h('div', {class: 'tj-ligne tj-axe', 'aria-hidden': 'true'}, h('div', {class: 'tj-nom'}, h('span', {class: 'tj-note'}, t('Heure'))),
        h('div', {class: 'tj-piste'}, ...heures)),
    ];
    const artistes = m.artistes.filter((a) => a.Fin > journee.debut && a.Debut < journee.fin);
    if (artistes.length > 0) {
      lignes.push(h('div', {class: 'tj-ligne tj-artistes'},
        h('div', {class: 'tj-nom'}, h('div', {class: 'tj-nom__txt'}, h('strong', null, `♪ ${t('Artistes')}`), h('small', null, t('passages du jour')))),
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
          title: effectifsOuverts
            ? t('Masquer les effectifs hors bornes')
            : t('Afficher les missions dont un créneau du jour est sous son minimum ou au-dessus de son maximum'),
          onclick: () => { effectifsOuverts = !effectifsOuverts; rafraichir(); },
        }, `${effectifsOuverts ? '▾' : '▸'} ${t('Effectifs hors bornes ({n})', {n: effectifs.length})}`)),
        h('div', {class: 'tj-piste'})));
      const nomDe = (liste) => liste[0].mission?.Nom ?? '';
      if (effectifsOuverts) {
        for (const liste of [...parMission.values()].sort((a, b) => nomDe(a).localeCompare(nomDe(b), 'fr'))) {
          lignes.push(ligneEffectifs(liste));
        }
      }
      lignes.push(h('div', {class: 'tj-ligne tj-section'}, h('div', {class: 'tj-nom'}, t('Places du jour')), h('div', {class: 'tj-piste'})));
    }
    if (journee.groupes.length === 0) {
      lignes.push(h('p', {class: 'tj-vide'}, t('Aucun indicatif positionné ce jour-là. Positionnez des indicatifs depuis la vue Indicatifs (étape 3), puis revenez ici.')));
    }
    for (const g of journee.groupes) {
      g.places.forEach((place, i) => lignes.push(lignePlace(g, place, i === 0)));
    }
    const tenus = new Set([...r.affiche.values()].filter((b) => b != null));
    const libres = [...journee.duJour].filter((b) => !journee.absents.has(b) && !tenus.has(b)).sort((a, b) => nom(a).localeCompare(nom(b), 'fr'));
    lignes.push(h('div', {class: 'tj-ligne tj-section'}, h('div', {class: 'tj-nom'}, t('Sans indicatif aujourd’hui ({n})', {n: libres.length})), h('div', {class: 'tj-piste'})));
    for (const b of libres) { lignes.push(ligneLibre(b, false)); }
    const absentsSansPlace = [...journee.absents].filter((b) => journee.duJour.has(b) && !tenus.has(b)).sort((a, b) => nom(a).localeCompare(nom(b), 'fr'));
    if (absentsSansPlace.length > 0) {
      lignes.push(h('div', {class: 'tj-ligne tj-section'}, h('div', {class: 'tj-nom'}, t('Absents sans place ({n})', {n: absentsSansPlace.length})), h('div', {class: 'tj-piste'})));
      for (const b of absentsSansPlace) { lignes.push(ligneLibre(b, true)); }
    }
    const grille = h('div', {class: 'tj-table', role: 'region', 'aria-label': t('Table du jour')}, ...lignes);
    // Un trait par heure pleine dans le fond de chaque ligne (voir `.tj-piste`).
    const largeur = journee.fin - journee.debut;
    grille.style.setProperty('--tj-pas', `${(3600 / largeur) * 100}%`);
    grille.style.setProperty('--tj-decalage', `${((premiereHeure - journee.debut) / largeur) * 100}%`);
    return h('div', {class: 'tj-table-cadre'}, grille);
  }

  // --- Panneau --------------------------------------------------------------

  function texteMouvements(mouvements) {
    const {journee} = r;
    const gras = (benevoleId) => h('strong', null, nom(benevoleId));
    /** L'absent·e dont l'arrivant·e prend la place, s'il y en a un·e. */
    const remplace = (vers) => {
      const q = journee.occupantParPlace.get(vers);
      return q != null && journee.absents.has(q) ? q : null;
    };
    const [a, b] = mouvements;
    if (mouvements.length === 2 && a.de != null && a.vers != null && b.de != null && b.vers != null && a.de === b.vers && b.de === a.vers) {
      return [h('li', null, remplirAvecElements(t('{a} et {b} échangent leurs places ({placeA} ↔ {placeB})'),
        {a: gras(a.benevoleId), b: gras(b.benevoleId), placeA: etiquette(a.de), placeB: etiquette(b.de)}))];
    }
    return mouvements.map((mv) => {
      const absent = mv.vers != null ? remplace(mv.vers) : null;
      const valeurs = {
        nom: gras(mv.benevoleId), de: mv.de != null ? etiquette(mv.de) : '', vers: mv.vers != null ? etiquette(mv.vers) : '',
        absent: absent != null ? nom(absent) : '', etat: absent != null ? absence(absent) : '',
      };
      let modele;
      if (mv.de != null && mv.vers != null) {
        modele = absent != null
          ? t('{nom} passe de {de} à {vers}, à la place de {absent} ({etat})')
          : t('{nom} passe de {de} à {vers}');
      } else if (mv.vers != null) {
        const tientDeja = [...journee.occupantParPlace].some(([, q]) => q === mv.benevoleId);
        if (tientDeja) {
          modele = absent != null ? t('{nom} prend aussi {vers}, à la place de {absent} ({etat})') : t('{nom} prend aussi {vers}');
        } else {
          modele = absent != null
            ? t('{nom}, sans indicatif, prend {vers}, à la place de {absent} ({etat})')
            : t('{nom}, sans indicatif, prend {vers}');
        }
      } else {
        modele = t('{nom} quitte {de} et reste disponible');
      }
      return h('li', null, remplirAvecElements(modele, valeurs));
    });
  }

  function criteres(scenario) {
    const e = scenario.eval;
    const paire = ([x, y]) => t('{a} et {b}', {a: nom(x), b: nom(y)});
    const artiste = ([b, a]) => t('{nom} voit {artiste}', {nom: nom(b), artiste: r.ix.artiste.get(a)?.Nom ?? '?'});
    const artisteRate = ([b, a]) => t('{nom} rate {artiste}', {nom: nom(b), artiste: r.ix.artiste.get(a)?.Nom ?? '?'});
    const liste = [h('span', {class: 'tj-crit tj-crit--ok'}, `✓ ${t('Disponibles sur tous leurs créneaux')}`)];
    if (e.binomesGagnes.length) {
      liste.push(h('span', {class: 'tj-crit tj-crit--ok'},
        `♥ ${t('+{n} binôme souhaité : {paires}', {n: e.binomesGagnes.length, paires: e.binomesGagnes.map(paire).join(', ')})}`));
    }
    if (e.binomesPerdus.length) {
      liste.push(h('span', {class: 'tj-crit tj-crit--moins'},
        `♥ ${t('−{n} : {paires} séparés', {n: e.binomesPerdus.length, paires: e.binomesPerdus.map(paire).join(', ')})}`));
    }
    if (!e.binomesGagnes.length && !e.binomesPerdus.length) { liste.push(h('span', {class: 'tj-crit'}, `♥ ${t('Binômes inchangés')}`)); }
    if (e.artistesGagnes.length) {
      liste.push(h('span', {class: 'tj-crit tj-crit--ok'},
        `♪ ${t('+{n} : {artistes}', {n: e.artistesGagnes.length, artistes: e.artistesGagnes.map(artiste).join(', ')})}`));
    }
    if (e.artistesPerdus.length) {
      liste.push(h('span', {class: 'tj-crit tj-crit--moins'},
        `♪ ${t('−{n} : {artistes}', {n: e.artistesPerdus.length, artistes: e.artistesPerdus.map(artisteRate).join(', ')})}`));
    }
    if (!e.artistesGagnes.length && !e.artistesPerdus.length) { liste.push(h('span', {class: 'tj-crit'}, `♪ ${t('Aucun artiste perdu')}`)); }
    for (const b of e.restauPerdue) { liste.push(h('span', {class: 'tj-crit tj-crit--attention'}, t('{nom} quitte la restauration souhaitée', {nom: nom(b)}))); }
    for (const b of e.restauGagnee) { liste.push(h('span', {class: 'tj-crit tj-crit--ok'}, t('{nom} rejoint la restauration souhaitée', {nom: nom(b)}))); }
    return h('div', {class: 'tj-scn__criteres'}, ...liste);
  }

  function carteScenario(scenario, rang) {
    const vu = apercu != null && cleScenario(apercu) === cleScenario(scenario);
    const n = scenario.mouvements.length;
    return h('article', {class: `tj-scn${rang === 0 ? ' tj-scn--premier' : ''}${vu ? ' tj-scn--apercu' : ''}`},
      h('span', {class: 'tj-scn__rang'}, String(rang + 1)),
      h('div', {class: 'tj-scn__corps'},
        rang === 0 ? h('span', {class: 'tj-meilleur'}, t('Le mieux classé')) : null,
        h('ul', {class: 'tj-scn__mouvements'}, ...texteMouvements(scenario.mouvements)),
        criteres(scenario),
        h('div', {class: 'tj-scn__pied'},
          h('span', {class: 'tj-scn__cout'}, tn(n, '{n} changement', '{n} changements')),
          h('button', {
            class: 'btn btn--sm', type: 'button', 'aria-pressed': String(vu),
            onclick: () => { apercu = vu ? null : scenario; rafraichir(); },
          }, vu ? t('Masquer l’aperçu') : t('Voir dans la table')),
          h('button', {class: 'btn btn--sm btn--primary', type: 'button', onclick: () => ajouter(scenario.mouvements)}, t('Ajouter au brouillon')),
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
      h('summary', null, tn(n, '{n} autre possibilité, moins bien classée', '{n} autres possibilités, moins bien classées')),
      h('div', null, ...reste.map((sc, i) => carteScenario(sc, i + visibles)),
        caches > 0 ? h('p', {class: 'tj-note'}, tn(caches, 'Et {n} de plus, encore moins bien classée.', 'Et {n} de plus, encore moins bien classées.')) : null),
    )];
  }

  function blocEcartes(ecartes, titre) {
    if (ecartes.length === 0) { return null; }
    return h('details', {class: 'tj-ecartes'},
      h('summary', null, `${titre} (${ecartes.length})`),
      h('ul', null, ...ecartes.map((e) => h('li', null, t('{qui} : {raison}', {qui: e.etiquette ?? nom(e.benevoleId), raison: e.raison})))),
    );
  }

  function horairesGroupe(g) {
    return g.positions.map(({sousCreneau, mission}) => `${mission?.Nom ?? t('Mission introuvable')} ${libelleHeurePlage(sousCreneau.Debut, sousCreneau.Fin)}`).join(' · ');
  }

  function blocVerrou(placeId, texte) {
    return [
      h('p', {class: 'tj-panneau__vide'}, icone(ICONES.cadenas, 'icone-texte'), ' ', texte),
      h('button', {class: 'btn btn--sm tj-panneau__bouton', type: 'button', onclick: () => void changerVerrou(placeId, false)}, t('Déverrouiller')),
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
      h('option', {value: ''}, t('Choisir…')),
      ...options.map((o, i) => h('option', {value: String(i), disabled: o.mouvements == null},
        `${libelle(o)}${o.raison ? ` · ${o.mouvements == null ? o.raison : t('contre : {raison}', {raison: o.raison})}` : ''}`)),
    );
    const bouton = h('button', {class: 'btn btn--sm', type: 'button', disabled: true, onclick: () => {
      const o = options[Number(select.value)];
      if (select.value === '' || !o?.mouvements) { return; }
      ajouter(o.mouvements, o.raison ? `${libelle(o)}, ${o.raison}` : null);
    }}, t('Ajouter au brouillon'));
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
    return blocChoixLibre(t('Choisir quelqu’un d’autre'),
      t('Tous les présents du jour, même hors de vos critères : ce que le choix enfreint s’affiche à côté du nom. Qui tient déjà un indicatif sur ce créneau le quitte.'),
      options, (o) => (o.quittees?.length
        ? t('{nom} (quitte {places})', {nom: nom(o.benevoleId), places: o.quittees.map(etiquette).join(', ')})
        : nom(o.benevoleId)));
  }

  function blocDeplacer(options, benevoleId) {
    return blocChoixLibre(t('Placer {nom} sur une autre place à couvrir', {nom: nom(benevoleId)}),
      t('Toutes les places à couvrir du jour, même hors de vos critères : ce que le choix enfreint s’affiche à côté.'),
      options, (o) => `${etiquette(o.placeId)} (${horairesGroupe(r.journee.groupeDePlace.get(o.placeId))})`);
  }

  function etatPersonne(benevoleId) {
    const pills = [];
    for (const {artiste, vu} of souhaitsDuBenevole(r.journee, r.journee.occupantParPlace, benevoleId)) {
      pills.push(vu
        ? h('span', {class: 'pill tj-pill--art'}, `♪ ${t('voit {artiste} ({heure})', {artiste: artiste.Nom, heure: libelleHeure(artiste.Debut)})}`)
        : h('span', {class: 'pill pill--danger'}, `♪ ${t('rate {artiste} ({plage})', {artiste: artiste.Nom, plage: libelleHeurePlage(artiste.Debut, artiste.Fin)})}`));
    }
    for (const {partenaireId, reunis, codes} of binomesDuBenevole(r.journee, r.journee.occupantParPlace, benevoleId)) {
      pills.push(reunis
        ? h('span', {class: 'pill pill--ok'}, `♥ ${t('avec {nom}, binôme souhaité', {nom: nom(partenaireId)})}`)
        : h('span', {class: 'pill pill--neutral'}, `♡ ${t('souhaite être avec {nom}', {nom: nom(partenaireId)})}${codes.length ? ` (${codes.join(', ')})` : ''}`));
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
        h('h2', null, t('{mission} : effectifs', {mission: liste[0].mission?.Nom ?? t('Mission introuvable')})),
        h('p', null, t('Créneaux du jour hors de leurs effectifs minimum ou maximum, avec le planning affiché (brouillon compris). Les absents ne comptent pas.')),
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
      h('h2', null, occupant != null ? t('Remplacer {nom} en {code}', {nom: nom(occupant), code}) : t('{code} à pourvoir', {code})),
      h('p', null, horairesGroupe(g)),
      occupant != null ? h('p', null, [
        journee.desistes.has(occupant)
          ? t('Désisté·e pour tout le festival : la place reste à son nom tant que vous ne choisissez pas un remplacement.')
          : t('Pointé·e absent·e à l’appel : la place reste à son nom tant que vous ne choisissez pas un remplacement.'),
        autre != null ? t('Reste en place : {nom}.', {nom: nom(autre)}) : null,
      ].filter(Boolean).join(' ')) : null,
    );
    if (place.Verrouillee) {
      return [tete, ...blocVerrou(placeId, t('Place verrouillée : corrigée à la main, jamais touchée par un scénario ni par l’algorithme. Déverrouillez-la pour voir ses remplacements.'))];
    }
    const {scenarios, ecartes} = scenariosPourPlace(journee, r.moteur(), placeId);
    // « Ou laisser la place vide » : qui tiendra l'indicatif, sur combien de
    // créneaux, et la couleur que garde la ligne.
    const indicatif = g.groupe.Code;
    const nbCreneaux = g.positions.length;
    let tenue;
    if (autre != null) {
      tenue = nbCreneaux === 1
        ? t('{nom} tiendra {indicatif} seul·e sur son créneau', {nom: nom(autre), indicatif})
        : t('{nom} tiendra {indicatif} seul·e sur ses {n} créneaux', {nom: nom(autre), indicatif, n: nbCreneaux});
    } else {
      tenue = nbCreneaux === 1
        ? t('personne ne tiendra {indicatif} sur son créneau', {indicatif})
        : t('personne ne tiendra {indicatif} sur ses {n} créneaux', {indicatif, n: nbCreneaux});
    }
    const couleur = g.critique ? t('mission critique : reste en rouge') : t('reste en orange');
    return [
      tete,
      h('p', {class: 'tj-panneau__ordre'}, ordreTexte()),
      scenarios.length === 0 ? h('p', {class: 'tj-panneau__vide'}, t('Aucun remplacement ni chaîne ne respecte les disponibilités. Voir ci-dessous qui a été écarté et pourquoi.')) : null,
      ...listeScenarios(scenarios, 4),
      h('p', {class: 'tj-laisser-vide'},
        occupant != null
          ? t('Ou ne rien changer : {tenue} ({couleur}).', {tenue, couleur})
          : t('Ou laisser la place vide : {tenue} ({couleur}).', {tenue, couleur}),
        occupant == null ? [` ${t('Verrouillée, elle restera vide même si vous relancez l’algorithme.')} `,
          h('button', {class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => void changerVerrou(placeId, true)}, t('Verrouiller vide'))] : null),
      blocAutreChoix(placeId),
      blocEcartes(ecartes, t('Écartés')),
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
      return [tete, blocAlertes(placeId, benevoleId), etatPersonne(benevoleId), ...blocVerrou(placeId, t('Place verrouillée : corrigée à la main, jamais déplacée par un scénario ni par l’algorithme. Déverrouillez-la pour voir ses échanges.'))];
    }
    const {scenarios, ecartes} = echangesPourPlace(journee, r.moteur(), placeId);
    const positifs = scenarios.filter(ameliore).length;
    return [
      tete,
      blocAlertes(placeId, benevoleId),
      etatPersonne(benevoleId),
      h('h3', null, t('Échanges possibles')),
      h('p', {class: 'tj-panneau__ordre'}, [
        positifs === 0
          ? t('Aucun échange n’améliore vos critères.')
          : tn(positifs, '{n} échange améliore vos critères.', '{n} échanges améliorent vos critères.'),
        ordreTexte(),
      ].join(' ')),
      scenarios.length === 0 ? h('p', {class: 'tj-panneau__vide'}, t('Aucun échange ne respecte les disponibilités des deux personnes.')) : null,
      ...listeScenarios(scenarios, 3),
      h('div', {class: 'tj-laisser-vide'},
        h('p', null, `${t('Ou garder {nom} ici quoi qu’il arrive : verrouillée, la place ne bougera plus, ni par un scénario ni par l’algorithme.', {nom: nom(benevoleId)})} `,
          h('button', {class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => void changerVerrou(placeId, true)}, t('Verrouiller'))),
        h('p', null, `${t('Ou retirer {nom} de {place} : la place redevient libre.', {nom: nom(benevoleId), place: etiquette(placeId)})} `,
          h('button', {class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => retirer(placeId, benevoleId)}, t('Retirer de la place'))),
      ),
      blocDeplacer(deplacementsPourPlace(journee, r.moteur(), placeId), benevoleId),
      blocEcartes(ecartes, t('Échanges écartés')),
    ];
  }

  function panneauPersonneLibre(benevoleId) {
    const {journee} = r;
    const tete = h('div', {class: 'tj-panneau__tete'}, h('h2', null, nom(benevoleId)));
    if (journee.absents.has(benevoleId)) {
      tete.append(h('p', null, t('Pointé·e absent·e à l’appel aujourd’hui, sans indicatif.')));
      return [tete, h('p', {class: 'tj-panneau__vide'}, t('S’il ou elle arrive finalement, ✓ à l’appel le ou la rend disponible pour les remplacements.'))];
    }
    tete.append(h('p', null, `${t('Sans indicatif aujourd’hui')}${disponibiliteTexte(benevoleId) ? ` · ${disponibiliteTexte(benevoleId)}` : ''}`));
    const {scenarios, ecartes} = placesPourBenevole(journee, r.moteur(), benevoleId);
    const aCouvrir = [...journee.occupantParPlace.values()].some((b) => estACouvrir(journee, b));
    return [
      tete,
      etatPersonne(benevoleId),
      h('h3', null, t('Places à couvrir qu’il ou elle peut prendre')),
      h('p', {class: 'tj-panneau__ordre'}, ordreTexte()),
      scenarios.length === 0 ? h('p', {class: 'tj-panneau__vide'}, aCouvrir
        ? t('Aucune place à couvrir ne lui convient en ce moment.')
        : t('Toutes les places du jour sont couvertes : il ou elle reste en renfort.')) : null,
      ...listeScenarios(scenarios, 3),
      blocDeplacer(deplacementsPourBenevole(journee, r.moteur(), benevoleId), benevoleId),
      blocEcartes(ecartes, t('Places écartées')),
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
      contenu = [h('p', {class: 'tj-panneau__vide'}, t('Cliquez une place à pourvoir ou une personne pour voir toutes les options, classées selon vos priorités.'))];
    }
    return h('aside', {class: 'tj-panneau', 'aria-live': 'polite', 'aria-label': t('Scénarios')}, ...contenu.filter(Boolean));
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
      h('span', {class: `pill ${aCouvrir ? 'pill--warn' : 'pill--ok'}`},
        `${aCouvrir ? '! ' : '✓ '}${t('{couvertes} / {total} places couvertes', {couvertes: mes.couvertes, total: mes.totalPlaces})}`),
      h('span', {class: `pill ${mes.binomes === mes.binomesTotal ? 'pill--ok' : 'pill--neutral'}`},
        `♥ ${t('Binômes souhaités {n} / {total}', {n: mes.binomes, total: mes.binomesTotal})}`),
      h('span', {class: `pill ${mes.artistes === mes.artistesTotal ? 'pill--ok' : 'tj-pill--art'}`},
        `♪ ${t('Artistes souhaités vus {n} / {total}', {n: mes.artistes, total: mes.artistesTotal})}`),
      aVerifier > 0
        ? h('span', {
          class: `pill pill--${ton}`,
          title: t('Lignes qui enfreignent une règle (hors disponibilité, mission refusée, deux places en même temps, quota dépassé, disponibilités non déclarées) et effectifs hors bornes, en tête de table.'),
        }, `! ${t('{n} à vérifier', {n: aVerifier})}`)
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
    let titre = t('Brouillon vide');
    if (n > 0) {
      titre = ailleurs > 0
        ? tn(n, 'Brouillon : {n} place change (dont {ailleurs} un autre jour)', 'Brouillon : {n} places changent (dont {ailleurs} un autre jour)', {ailleurs})
        : tn(n, 'Brouillon : {n} place change', 'Brouillon : {n} places changent');
    } else if (verrous > 0) { titre = tn(verrous, 'Brouillon : {n} verrou change', 'Brouillon : {n} verrous changent'); }
    return h('div', {class: 'tj-brouillon', role: 'region', 'aria-label': t('Brouillon')},
      h('div', {class: 'tj-brouillon__txt'},
        h('strong', null, titre),
        ...(n + verrous > 0
          ? [
            delta(`♥ ${t('Binômes')}`, avant.binomes, apres.binomes, true), delta(`♪ ${t('Artistes')}`, avant.artistes, apres.artistes, true),
            delta(t('À couvrir'), avant.aCouvrir.length, apres.aCouvrir.length, false),
          ]
          : [h('span', {class: 'tj-note'}, t('Ajoutez un scénario ou lancez l’algorithme : rien n’est écrit dans le planning avant « Appliquer au planning ».'))]),
      ),
      h('button', {class: 'btn btn--sm', type: 'button', disabled: brouillon.pile.length === 0, onclick: () => { annulerDernier(brouillon); apercu = null; rafraichir(); }}, t('Annuler le dernier')),
      h('button', {class: 'btn btn--sm', type: 'button', disabled: brouillon.modifs.size === 0, onclick: () => {
        toutAnnuler(brouillon); apercu = null; message = {ton: 'info', texte: t('Brouillon vidé : le planning n’a pas bougé.')}; rafraichir();
      }}, t('Tout annuler')),
      h('button', {class: 'btn btn--primary', type: 'button', disabled: brouillon.modifs.size === 0, onclick: () => void appliquer()}, t('Appliquer au planning')),
    );
  }

  /** Deux sous-créneaux d'un même macro-créneau qui se recouvrent : voulu
   *  quand deux missions tournent à des rythmes différents (§6.2), d'où une
   *  simple mention repliée plutôt qu'une ligne de la table. */
  function chevauchements() {
    const paires = r.signalements.chevauchements;
    if (paires.length === 0) { return null; }
    const libelle = (sc) => `${sc.Mission != null ? (r.ix.mission.get(sc.Mission)?.Nom ?? t('Mission introuvable')) : t('Créneau commun')} ${libelleHeurePlage(sc.Debut, sc.Fin)}`;
    return h('details', {class: 'tj-chevauchements'},
      h('summary', null, tn(paires.length, '{n} paire de sous-créneaux se recouvrent ce jour', '{n} paires de sous-créneaux se recouvrent ce jour')),
      h('p', {class: 'tj-note'}, t('Voulu quand deux missions tournent à des rythmes différents ; sinon, à corriger dans Missions ou l’Agenda.')),
      h('ul', null, ...paires.map(([a, z]) => h('li', null, t('{a} et {b}', {a: libelle(a), b: libelle(z)})))),
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
      container.append(h('p', {class: 'empty'}, t('Aucun jour de festival : créez d’abord un macro-créneau dans l’Agenda (étape 1).')));
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
        h('button', {class: 'btn btn--primary', type: 'button', onclick: lancerAlgorithme}, t('Relancer l’algorithme dans le brouillon')),
        compteurs(mesurer(journee)),
        h('button', {
          class: 'btn btn--ghost btn--sm tj-outils__fin', type: 'button', disabled: brouillonNonVide,
          title: brouillonNonVide ? t('Appliquez ou annulez d’abord le brouillon') : t('Vide et déverrouille tout le planning, tous les jours confondus'),
          onclick: () => void reinitialiser(),
        }, t('Réinitialiser tout')),
      ),
      h('div', {class: 'tj-legende', 'aria-label': t('Légende')},
        h('span', null, h('i', {class: 'tj-l-bloc'}), t('mission')),
        h('span', null, h('i', {class: 'tj-l-vide'}), t('à pourvoir')),
        h('span', null, h('i', {class: 'tj-l-absent'}), t('absent·e à remplacer')),
        h('span', null, h('i', {class: 'tj-l-indispo'}), t('indisponible')),
        h('span', null, h('i', {class: 'tj-l-hors-dispo'}), t('placé·e hors disponibilité')),
        h('span', null, h('i', {class: 'tj-l-art'}), t('voit son artiste')),
        h('span', null, h('i', {class: 'tj-l-rate'}), t('rate son artiste')),
        h('span', null, h('i', {class: 'tj-l-change'}), t('changé dans le brouillon')),
        h('span', null, h('i', {class: 'tj-l-sous'}), t('effectif sous le minimum')),
        h('span', null, `♥ ${t('binôme réuni')} · ♡ ${t('binôme séparé')} · `, icone(ICONES.cadenas, 'icone-texte'), ` ${t('verrouillée')}`),
      ),
      chevauchements(),
      message ? h('div', {class: `tj-message tj-message--${message.ton}`, role: 'status'}, message.texte) : null,
      apercu ? h('div', {class: 'tj-message tj-message--info', role: 'status'}, t('Aperçu : les lignes marquées en pointillé changeraient. Ajoutez au brouillon pour garder ce scénario.')) : null,
      h('div', {class: 'tj-corps'}, table(), panneau()),
      barreBrouillon(),
    ].filter(Boolean));
    restaurer(avant);
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return () => { vueActive = false; desabonner(); };
}

