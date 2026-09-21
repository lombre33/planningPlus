import {defineConfig} from 'vite';

// Bundle statique unique, sans dépendance externe au chargement : le widget
// doit pouvoir être déposé tel quel sur n'importe quel hébergement HTTPS
// (GitHub Pages pour les essais, DINUM en production), sans étape de serveur.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
});
