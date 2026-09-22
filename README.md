# PlanningPlus

Widget personnalisé [Grist](https://www.getgrist.com/) de gestion de plannings.

PlanningPlus permet de construire un planning d'affectation de personnes sur des
missions découpées en créneaux, puis de l'ajuster en temps réel pendant
l'événement. Le premier cas d'usage est l'affectation de bénévoles de festival,
mais le modèle reste générique (astreintes, permanences, accueil, tenue de
poste).

## État du projet

Phase 1 : cadrage. Voir [`docs/`](docs/).

| Document | Objet |
| --- | --- |
| [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md) | Cahier des charges (v0, en cours) |
| [`docs/questions-cadrage.md`](docs/questions-cadrage.md) | Questions de cadrage et réponses |

## Principes directeurs

1. **Lisibilité native Grist.** Toute donnée métier reste consultable et
   modifiable dans les vues natives de Grist, sans passer par le widget.
2. **Code auditable.** Le code doit pouvoir être relu par un tiers (DINUM) :
   lisible, commenté là où c'est utile, sans dépendance opaque, sans faille
   évidente.
3. **Ajustement à chaud.** Le jour J, une part significative du planning bouge.
   L'outil doit permettre de corriger localement sans tout recalculer.

## Déploiement du widget (GitHub Pages)

`.github/workflows/deploy-widget.yml` construit `widget/` (tests, vérification
de types, `vite build`) et publie `widget/dist` sur GitHub Pages à chaque
poussée sur `main` qui touche `widget/`.

**Ce qui reste à activer, une seule fois, côté dépôt GitHub** (le workflow ne
peut pas le faire lui-même) : Settings → Pages → *Build and deployment* →
*Source* → choisir **« GitHub Actions »** (pas « Deploy from a branch »). Le
premier passage du workflow après ce réglage publie le widget à l'adresse
`https://lombre33.github.io/planningPlus/` — c'est cette URL qu'il faut
coller dans « Widget URL » en ajoutant le widget PlanningPlus à un document
Grist (voir `dev/README.md`, « Document modèle »).

Pensé pour un hébergement statique pur, cohérent avec l'audit DINUM : chemins
relatifs (`vite.config.ts`, `base: './'`), aucun script ni police chargés
depuis un CDN, `grist-plugin-api.js` vendorisé dans le dépôt
(`widget/public/vendor/`, voir son `README.md`) plutôt que chargé d'ailleurs,
et aucune variable d'environnement ni secret dans le bundle — le widget ne
lit que `window.grist`, fourni par l'instance Grist qui l'embarque.
