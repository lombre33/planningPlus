/**
 * Langue de l'interface : français ou anglais, au choix dans Réglages ›
 * Langue (demande d'Antoine du 2026-09-29, « on peut la prévoir dès à
 * présent »), comme Publipostage+ : le guide Grist Factory veut tous ses
 * widgets bilingues fr/en.
 *
 * Le texte français sert de clé. Chaque module garde ses textes en français
 * dans son code, les passe à `t` (ou `tn` quand ils s'accordent en nombre),
 * et déclare en tête leur traduction anglaise, côte à côte :
 *
 *   traductions({
 *     'Désistement de {nom}': 'Withdrawal of {nom}',
 *   });
 *   t('Désistement de {nom}', {nom})
 *
 * Toute chaîne ajoutée ou modifiée porte sa traduction dans le même lot :
 * `i18n.test.js` échoue sinon, et un texte sans traduction reste en
 * français à l'écran, signalé en console.
 *
 * Ne se traduisent jamais : les données du document (noms, missions,
 * indicatifs), les valeurs stockées (`Statut`, `Priorite`…, seul leur
 * libellé à l'écran passe par `t`), les noms de tables et de colonnes.
 */

/** Clé propre à PlanningPlus, comme celle du thème (`ui/reglages.js`). */
const CLE_LANGUE = 'planningplus_langue';

/** Chaque langue se nomme dans sa propre langue, au choix comme ailleurs. */
export const LANGUES = [
  {id: 'fr', libelle: 'Français'},
  {id: 'en', libelle: 'English'},
];

/** Langue témoin, pour les développeurs et `i18n.test.js` : l'anglais, chaque
 *  texte passé par `t` entre ⟦ ⟧. Ce qui reste hors crochets à l'écran a
 *  échappé à la traduction. Jamais proposée dans les Réglages. */
export const LANGUE_TEMOIN = 'temoin';

const TRADUCTIONS = new Map();
const conflits = [];
const manquantes = new Set();
const abonnes = new Set();

/** La langue mémorisée, le français à défaut (rien choisi, ou stockage
 *  indisponible : navigation privée, données du site bloquées). */
export function langueMemorisee() {
  try {
    return localStorage.getItem(CLE_LANGUE) === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

let courante = langueMemorisee();

export const langue = () => courante;

/** Locale des dates et heures (`temps.js`) : jours et mois dans la langue. */
export const locale = () => (courante === 'fr' ? 'fr-FR' : 'en-GB');

/** Pose `lang` sur <html> (lecteurs d'écran, césure) : au démarrage et à
 *  chaque changement. */
export function appliquerLangue() {
  document.documentElement.lang = courante === 'fr' ? 'fr' : 'en';
}

/** Change de langue, la mémorise (sauf la langue témoin) et prévient les
 *  abonnés, qui redessinent ce qu'ils montrent. */
export function choisirLangue(valeur) {
  courante = valeur === 'en' || valeur === LANGUE_TEMOIN ? valeur : 'fr';
  if (courante !== LANGUE_TEMOIN) {
    try {
      localStorage.setItem(CLE_LANGUE, courante);
    } catch {
      // Stockage indisponible : le choix vaut pour cette session seulement.
    }
  }
  appliquerLangue();
  for (const abonne of [...abonnes]) { abonne(courante); }
}

export function surChangementLangue(abonne) {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
}

/** Déclare les traductions anglaises d'un module, clé = texte français. Un
 *  même texte français se traduit partout de la même façon : une seconde
 *  traduction différente est notée (le test la refuse) et ignorée. */
export function traductions(dictionnaire) {
  for (const [fr, en] of Object.entries(dictionnaire)) {
    const deja = TRADUCTIONS.get(fr);
    if (deja != null && deja !== en) { conflits.push({fr, en: [deja, en]}); continue; }
    TRADUCTIONS.set(fr, en);
  }
}

/** Pour `i18n.test.js` : toutes les traductions déclarées, et les conflits. */
export const traductionsDeclarees = () => new Map(TRADUCTIONS);
export const conflitsDeTraduction = () => [...conflits];

function remplir(texte, variables) {
  if (!variables) { return texte; }
  return texte.replace(/\{(\w+)\}/g, (tout, cle) => (cle in variables ? String(variables[cle]) : tout));
}

/** Le texte dans la langue courante, variables `{nom}` remplies. */
export function t(fr, variables) {
  if (courante === 'fr') { return remplir(fr, variables); }
  let en = TRADUCTIONS.get(fr);
  if (en == null) {
    if (!manquantes.has(fr)) {
      manquantes.add(fr);
      console.warn(`[i18n] traduction anglaise manquante : « ${fr} »`);
    }
    en = fr;
  }
  const texte = remplir(en, variables);
  return courante === LANGUE_TEMOIN ? `⟦${texte}⟧` : texte;
}

/** Accord en nombre : le français garde le singulier jusqu'à 1 (« 0
 *  place »), l'anglais seulement pour 1 (« 0 spots »). `{n}` vaut `n`. */
export function tn(n, singulier, pluriel, variables = {}) {
  const un = courante === 'fr' ? n <= 1 : n === 1;
  return t(un ? singulier : pluriel, {n, ...variables});
}
