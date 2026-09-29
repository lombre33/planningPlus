/**
 * Réglages du widget (roue crantée en haut à droite, logo Grist Factory
 * juste à sa droite) : Langue, Thème et Crédits, sur le modèle des Réglages
 * de Publipostage+ pour que les widgets Grist Factory se ressemblent (guide
 * `identite-ui-ux-grist-factory.md`, demandes d'Antoine du 2026-09-29).
 *
 * Langue : français ou anglais (`../i18n.js`). Le choix redessine aussitôt
 * l'application et ces Réglages, restés ouverts sur l'onglet Langue.
 *
 * Thème : Système, Clair ou Sombre, mémorisé dans le navigateur et posé en
 * `data-theme` sur <html>. « Système » retire l'attribut : c'est alors
 * `prefers-color-scheme` qui décide (haut de `style.css`). Le sombre ne
 * change que le chrome : ce qui part à l'impression garde les couleurs du
 * papier (`.papier`, `#zone-impression`).
 */

import {choisirLangue, langue, LANGUES, t, traductions} from '../i18n.js';
import {h, ICONES, icone, ouvrirModal} from './dom.js';

traductions({
  Réglages: 'Settings',
  Langue: 'Language',
  Thème: 'Theme',
  Crédits: 'Credits',
  Système: 'System',
  Clair: 'Light',
  Sombre: 'Dark',
  Auteur: 'Author',
  Site: 'Website',
  Licence: 'License',
  Fermer: 'Close',
  'Langue de l’interface. Les données du document (noms, missions, indicatifs) restent telles quelles.':
    'Interface language. The document’s data (names, tasks, call signs) stays as it is.',
  'Apparence de l’interface. Les aperçus imprimables restent blancs dans les deux thèmes : c’est ce qui part à l’impression.':
    'Interface appearance. Printable previews stay white in both themes: that is what gets printed.',
});

/** Clé propre à PlanningPlus : Publipostage+ mémorise le sien sous une autre
 *  clé, un choix fait dans l'un ne s'impose pas à l'autre. Mêmes valeurs
 *  que lui, pour qu'une clé commune reste possible sans migration. */
const CLE_THEME = 'planningplus_theme';

const THEMES = [
  {id: 'system', libelle: () => t('Système')},
  {id: 'light', libelle: () => t('Clair')},
  {id: 'dark', libelle: () => t('Sombre')},
];

const CREDITS = [
  {terme: () => t('Auteur'), valeur: 'Grist Factory'},
  {terme: () => t('Site'), valeur: 'grist-factory.fr', lien: 'https://grist-factory.fr'},
  // Pas encore de dépôt public `grist-factory` pour PlanningPlus (Publipostage+
  // pointe sur le sien) : le lien mène au texte de la licence. Jamais le
  // dépôt personnel de développement, qui ne s'affiche nulle part.
  {terme: () => t('Licence'), valeur: 'GNU GPL v3.0', lien: 'https://www.gnu.org/licenses/gpl-3.0.html'},
];

const estTheme = (valeur) => THEMES.some((t) => t.id === valeur);

/** Le thème mémorisé, « system » à défaut (rien choisi, ou stockage
 *  indisponible : navigation privée, données du site bloquées). */
export function themeMemorise() {
  try {
    const valeur = localStorage.getItem(CLE_THEME);
    return estTheme(valeur) ? valeur : 'system';
  } catch {
    return 'system';
  }
}

export function appliquerTheme(theme) {
  if (estTheme(theme) && theme !== 'system') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function choisirTheme(theme) {
  const valeur = estTheme(theme) ? theme : 'system';
  try {
    localStorage.setItem(CLE_THEME, valeur);
  } catch {
    // Stockage indisponible : le choix vaut pour cette session seulement.
  }
  appliquerTheme(valeur);
}

function panneauLangue(rouvrir) {
  return [
    h('p', {class: 'reglages__intro'},
      t('Langue de l’interface. Les données du document (noms, missions, indicatifs) restent telles quelles.')),
    h('div', {class: 'reglages__choix', role: 'radiogroup', 'aria-label': t('Langue')},
      ...LANGUES.map((l) => h('label', {lang: l.id},
        h('input', {
          type: 'radio', name: 'reglages-langue', value: l.id, checked: l.id === langue(),
          onchange: (e) => {
            if (!e.target.checked) { return; }
            choisirLangue(l.id);
            rouvrir('langue');
          },
        }),
        l.libelle,
      )),
    ),
  ];
}

function panneauTheme() {
  const actuel = themeMemorise();
  return [
    h('p', {class: 'reglages__intro'},
      t('Apparence de l’interface. Les aperçus imprimables restent blancs dans les deux thèmes : c’est ce qui part à l’impression.')),
    h('div', {class: 'reglages__choix', role: 'radiogroup', 'aria-label': t('Thème')},
      ...THEMES.map((th) => h('label', null,
        h('input', {
          type: 'radio', name: 'reglages-theme', value: th.id, checked: th.id === actuel,
          onchange: (e) => { if (e.target.checked) { choisirTheme(th.id); } },
        }),
        th.libelle(),
      )),
    ),
  ];
}

function panneauCredits() {
  return [
    h('dl', {class: 'reglages__credits'},
      ...CREDITS.flatMap((c) => [
        h('dt', null, c.terme()),
        h('dd', null, c.lien
          ? h('a', {href: c.lien, target: '_blank', rel: 'noopener noreferrer'}, c.valeur)
          : c.valeur),
      ]),
    ),
  ];
}

const ONGLETS = [
  {id: 'langue', libelle: () => t('Langue'), contenu: panneauLangue},
  {id: 'theme', libelle: () => t('Thème'), contenu: panneauTheme},
  {id: 'credits', libelle: () => t('Crédits'), contenu: panneauCredits},
];

/** `onglet` : celui à montrer d'abord (le premier à défaut). */
export function ouvrirReglages(onglet = ONGLETS[0].id) {
  ouvrirModal(t('Réglages'), (fermer) => {
    // Après un changement de langue : les Réglages se rouvrent aussitôt,
    // dans la nouvelle langue, sur le même onglet.
    const rouvrir = (id) => { fermer(); ouvrirReglages(id); };
    const boutons = [];
    const panneaux = [];
    const montrer = (id) => {
      for (const b of boutons) {
        const actif = b.dataset.onglet === id;
        b.setAttribute('aria-selected', String(actif));
        b.tabIndex = actif ? 0 : -1;
      }
      for (const p of panneaux) { p.hidden = p.dataset.onglet !== id; }
    };
    for (const o of ONGLETS) {
      boutons.push(h('button', {
        class: 'reglages__onglet', type: 'button', role: 'tab',
        id: `reglages-onglet-${o.id}`, 'aria-controls': `reglages-panneau-${o.id}`, 'data-onglet': o.id,
        onclick: () => montrer(o.id),
        onkeydown: (e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') { return; }
          const i = ONGLETS.indexOf(o) + (e.key === 'ArrowRight' ? 1 : -1);
          const suivant = ONGLETS[(i + ONGLETS.length) % ONGLETS.length];
          montrer(suivant.id);
          boutons.find((b) => b.dataset.onglet === suivant.id).focus();
        },
      }, o.libelle()));
      panneaux.push(h('div', {
        class: 'reglages__panneau', role: 'tabpanel',
        id: `reglages-panneau-${o.id}`, 'aria-labelledby': `reglages-onglet-${o.id}`, 'data-onglet': o.id,
      }, ...o.contenu(rouvrir)));
    }
    montrer(onglet);
    queueMicrotask(() => boutons.find((b) => b.dataset.onglet === onglet).focus());
    return h('div', {class: 'reglages'},
      h('div', {class: 'reglages__onglets', role: 'tablist', 'aria-label': t('Réglages')}, ...boutons),
      ...panneaux,
      h('div', {class: 'modal__actions'},
        h('button', {class: 'btn', type: 'button', onclick: fermer}, t('Fermer')),
      ),
    );
  });
}

/** La roue crantée et le logo, coin haut-droit de chaque vue. */
export function marqueEtReglages() {
  return [
    h('button', {
      class: 'btn btn--ghost btn--icone', type: 'button',
      title: t('Réglages'), 'aria-label': t('Réglages'), 'aria-haspopup': 'dialog',
      onclick: () => ouvrirReglages(),
    }, icone(ICONES.reglages)),
    // Chemin relatif à la page : `index.html` le charge aussi en icône d'onglet,
    // ce qui le fait copier dans le site publié (`outils/assembler-site.mjs`).
    h('img', {class: 'topbar__logo', src: './img/grist-factory-logo.jpg', alt: 'Grist Factory', width: '20', height: '20'}),
  ];
}
