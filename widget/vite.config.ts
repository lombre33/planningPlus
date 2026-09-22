import {defineConfig, type Plugin} from 'vite';

// Bundle statique unique, sans dépendance externe au chargement : le widget
// doit pouvoir être déposé tel quel sur n'importe quel hébergement HTTPS
// (GitHub Pages pour les essais, DINUM en production), sans étape de serveur.

/**
 * Vite ajoute `crossorigin` à chaque script de module et feuille de style
 * qu'il génère, de façon inconditionnelle (son plugin de build HTML interne,
 * pour permettre un déploiement où les assets viendraient d'une origine
 * différente de la page). Ce widget est justement un bundle statique unique
 * déposé tel quel : page et assets sont toujours à la même origine, sur
 * GitHub Pages/DINUM comme sur tout hébergement qui le sert en l'état.
 *
 * `crossorigin` sans en-têtes CORS côté serveur bloque le chargement de la
 * ressource *silencieusement* si jamais page et assets finissaient sur des
 * origines différentes (le réseau montre un 200, mais le navigateur refuse
 * d'appliquer la ressource, sans erreur visible) — exactement le genre de
 * panne qu'on ne veut pas ici. Un widget qui n'a jamais besoin de charger
 * ses propres assets depuis une autre origine n'a aucune raison de courir
 * ce risque : on retire l'attribut après coup (`order: 'post'`, une fois que
 * le plugin HTML interne de Vite l'a déjà posé).
 */
function retirerCrossorigin(): Plugin {
  return {
    name: 'retirer-crossorigin',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/\s+crossorigin(="[^"]*")?/g, '');
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [retirerCrossorigin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
});
