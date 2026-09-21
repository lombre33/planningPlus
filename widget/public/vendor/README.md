# Fichiers tiers vendorisés

## `grist-plugin-api.js`

Bibliothèque cliente officielle qui expose `window.grist` et porte la
communication (via `postMessage`) entre le widget et le document Grist
parent. Sans elle, un widget custom ne peut pas lire ni écrire les données du
document.

- **Source :** [`gristlabs/grist-core`](https://github.com/gristlabs/grist-core),
  fichier `app/plugin/grist-plugin-api.ts`, compilé en production
  (`webpack.api.config.js`).
- **Version :** grist-core 1.7.19, commit `80c50278b7f730e7e7619cf6d90d9ea4f9f187a7`.
- **Licence :** Apache License 2.0 (identique à grist-core).

### Pourquoi vendoriser plutôt que charger depuis un CDN

Les widgets custom référencés dans la documentation Grist chargent
généralement ce fichier depuis l'instance Grist cible
(`<script src="https://.../grist-plugin-api.js">`). On vendorise une copie
à la place pour deux raisons :

1. **Portabilité et auditabilité (contrainte B du cahier des charges) :**
   le widget est hébergé sur GitHub Pages et doit fonctionner face à
   n'importe quelle instance Grist qui l'embarque (test local, DINUM…),
   sans dépendre de l'URL de cette instance ni d'un appel réseau
   supplémentaire au chargement.
2. **Stabilité :** le fichier est figé à une version connue plutôt que de
   suivre silencieusement les évolutions d'un CDN externe.

### Mise à jour

Pour rafraîchir ce fichier vers une version plus récente de Grist :

```
git clone https://github.com/gristlabs/grist-core.git
cd grist-core
yarn install
yarn run build:prod
cp static/grist-plugin-api.js <dépôt PlanningPlus>/widget/vendor/grist-plugin-api.js
```

Puis mettre à jour la version et le commit ci-dessus.
