/**
 * Petit constructeur d'éléments DOM, pour écrire les vues sans cadriciel
 * (décision Antoine, §12.1) tout en restant lisible. Pas de vdom, pas de
 * diffing : chaque vue se redessine entièrement à chaque changement du
 * magasin (`Magasin.subscribe`), ce qui reste largement assez rapide pour
 * les volumes du cahier des charges (NF1).
 */

type Attrs = Record<string, string | number | boolean | EventListener | Partial<CSSStyleDeclaration> | undefined | null>;
type Enfant = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...enfants: (Enfant | Enfant[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [cle, valeur] of Object.entries(attrs)) {
      if (valeur === undefined || valeur === null || valeur === false) { continue; }
      if (cle.startsWith('on') && typeof valeur === 'function') {
        el.addEventListener(cle.slice(2).toLowerCase(), valeur as EventListener);
      } else if (cle === 'class') {
        el.className = String(valeur);
      } else if (cle === 'style' && typeof valeur === 'object') {
        Object.assign(el.style, valeur);
      } else if (typeof valeur === 'boolean') {
        if (valeur) { el.setAttribute(cle, ''); }
      } else {
        el.setAttribute(cle, String(valeur));
      }
    }
  }
  for (const enfant of enfants.flat()) {
    if (enfant === null || enfant === undefined || enfant === false) { continue; }
    el.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return el;
}

export function vider(el: Element): void {
  el.replaceChildren();
}

export function formatHeures(heures: number): string {
  const arrondi = Math.round(heures * 4) / 4;
  return `${arrondi % 1 === 0 ? arrondi : arrondi.toFixed(2)} h`;
}

/** Icône générique minimale (contour), pour ne dépendre d'aucune police
 *  d'icônes ni bibliothèque externe. */
export function icone(chemin: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', chemin);
  svg.append(path);
  return svg;
}

export const ICONES = {
  agenda: 'M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  grille: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M15 5v14',
  anomalies: 'M12 3 2 20h20L12 3ZM12 10v4M12 17h.01',
  equipes: 'M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3 2.5-5 6-5s6 2 6 5M12 20c0-2.5 2-4.5 5-4.5s5 2 5 4.5',
  jourj: 'M12 3v9l6 3M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  fermer: 'M6 6l12 12M18 6 6 18',
  cadenas: 'M6 11V8a6 6 0 1 1 12 0v3M5 11h14v9H5z',
  personne: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8',
  groupe: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c.4-3.4 3.2-6 7-6s6.6 2.6 7 6M15.5 14.3c2.9.6 5 2.8 5.3 5.7',
  artiste: 'M9 18V5l10-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  imprimante: 'M6 9V3h12v6M6 18h12v4H6zM4 9h16v7H4zM8 13h8',
  disponibilites: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z',
  terrain: 'M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12ZM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
} as const;

/** Ouvre une boîte de dialogue modale simple ; `contenu` reçoit une fonction
 *  `fermer()` à appeler pour la refermer. */
export function ouvrirModal(titre: string, contenu: (fermer: () => void) => Node): void {
  const fermer = () => backdrop.remove();
  const backdrop = h('div', {
    class: 'modal-backdrop',
    onclick: (e: Event) => { if (e.target === backdrop) { fermer(); } },
    onkeydown: (e: Event) => { if ((e as KeyboardEvent).key === 'Escape') { fermer(); } },
  },
    h('div', {class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre},
      h('h3', null, titre),
      contenu(fermer),
    ),
  );
  document.body.append(backdrop);
}

/** Ouvre (ou remplace) le panneau latéral fixe. */
export function ouvrirPanneau(contenu: Node): () => void {
  document.getElementById('panneau-lateral')?.remove();
  const panneau = h('div', {id: 'panneau-lateral', class: 'side-panel'}, contenu);
  document.body.append(panneau);
  return () => panneau.remove();
}

export function fermerPanneau(): void {
  document.getElementById('panneau-lateral')?.remove();
}
