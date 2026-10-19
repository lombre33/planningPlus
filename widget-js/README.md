# Widget PlanningPlus — JavaScript natif

Le widget [Grist](https://www.getgrist.com/) de PlanningPlus, en JavaScript
natif : **aucun framework, aucune compilation**. Les fichiers de `src/` sont
ceux que le navigateur charge, tels qu'ils sont écrits. Il n'y a rien à
construire avant de les servir, et rien entre le code du dépôt et le code
exécuté (choix d'Antoine, 2026-09-29).

> **Où en est ce dossier.** C'est la V2 de PlanningPlus, en construction. Son
> point de départ est la conversion exacte de `widget/` (TypeScript, la V1, qui
> reste le widget en production) ; s'y ajoutent la maquette B validée par
> Antoine et les corrections des audits. `src/` et `scripts/` se modifient
> directement : le sceau `.sceau-conversion` en prend acte et le convertisseur
> (`node migration/convertir.mjs`) refuse dès lors de les écraser. Voir
> [`../migration/README.md`](../migration/README.md), qui dit aussi comment se
> fait la bascule. Ce paragraphe disparaît avec elle.

## À quoi sert ce widget

PlanningPlus construit un planning d'affectation de personnes sur des missions
découpées en créneaux (le cas pilote : des bénévoles de festival), puis
l'ajuste le jour J : agenda, missions, indicatifs, disponibilités,
affectation, vue terrain, impressions. Le parcours est décrit dans le
[README du dépôt](../README.md#à-quoi-sert-planningplus).

## Accès au document, données conservées, sécurité

Le widget demande l'accès complet au document (`requiredAccess: 'full'`) : il
lit et écrit seize tables qu'aucune section ne lui lie, ce que seul ce niveau
permet. Il crée lui-même les tables qui lui manquent et n'écrit que dans celles
qu'il reconnaît comme siennes, à leur identifiant. Dans le navigateur, il ne
conserve (`localStorage`) que la langue et le thème. Il ne fait aucune requête
vers l'extérieur. Le détail (tables lues et écrites, limite connue,
dépendances, garanties de sécurité) est dans le
[README du dépôt](../README.md#accès-au-document).

## Carte du code

Par où commencer : `index.html` charge `vendor/grist-plugin-api.js` puis
`src/main.js`, qui se connecte à Grist, lit le document (en créant au besoin
les tables qui manquent) et monte `src/app.js`, le menu et les écrans.

| Où | Rôle |
| --- | --- |
| `src/main.js` | Connexion à Grist (`grist.ready`), lecture du document, création des tables manquantes, branchement des écritures. |
| `src/app.js` | Le cadre : menu, sous-vues, choix du jour, zone d'impression. |
| `src/store.js` | Le `Magasin` : le modèle en mémoire, les modifications (qui passent par les écritures Grist) et la mise à jour des écrans. |
| `src/grist/` | Tout ce qui parle à Grist : schéma des tables, lecture, écritures, création des tables, décodage des valeurs. |
| `src/domain/types.d.ts` | Le modèle de données (déclarations de types seulement). |
| `src/logic/` | Les calculs qui se déduisent du modèle sans le modifier : couverture, anomalies, scénarios, brouillon d'affectation, journée, impressions, import des disponibilités. |
| `src/moteur/` | Le moteur d'affectation : éligibilité, score, solveur, anomalies. Sans DOM ni Grist. |
| `src/views/` | Les écrans du menu. |
| `src/ui/` | Les éléments communs : construction du DOM (`dom.js`), frise, fenêtres, Réglages, impression. |
| `src/i18n.js`, `src/temps.js` | La langue, et les dates (jours, heures, fuseau de Paris). |
| `outils/`, `scripts/` | Serveur local, assemblage du site, vérification de bout en bout contre une instance Grist. |
| `dev-bench.html`, `src/dev-bench.js`, `src/dev/`, `src/donnees/` | Banc de développement sur un jeu de données de fichier : jamais publié. |

## Comment le code est organisé

- **Modules ES natifs.** Chaque fichier `.js` de `src/` est un module ; les
  imports sont relatifs et portent leur extension (`import {h} from './dom.js'`),
  parce qu'un navigateur ne la devine pas.
- **Quelques noms courts, partout les mêmes.** `h` construit un élément du DOM
  (`src/ui/dom.js`), `t` et `tn` traduisent, `m` est le `Magasin` que chaque
  écran reçoit, `ix` l'ensemble des index par identifiant (`indexer(m)`,
  `src/logic/derive.js` : `ix.mission.get(id)`). Dans un rappel court
  (`filter`, `map`, `sort`), le paramètre est l'initiale de ce que l'on parcourt :
  `b` un bénévole, `d` une disponibilité, `p` une place.
- **Aucune dépendance à l'exécution.** `package.json` ne liste que des outils
  de test (`vitest`, `jsdom`). Rien de ce qui est servi ne passe par npm.
- **Feuilles de style par `<link>`.** Un navigateur ne sait pas importer du
  CSS depuis un module : `index.html` charge `src/style.css`, puis
  `src/ui/impression.css`, puis `src/views/affectation.css`, dans cet ordre
  (chacune complète la précédente).
  Une nouvelle feuille se déclare dans `index.html` **et** `dev-bench.html`,
  jamais par un `import` dans un module (`npm run site` échoue dessus).
- **Un seul script classique**, `vendor/grist-plugin-api.js` : il expose
  `window.grist` (voir `vendor/README.md` pour sa provenance et son empreinte).
- **Une image n'arrive dans le site que citée par la page.** Le logo Grist
  Factory (`img/grist-factory-logo.jpg`, le même que sur Publipostage+) est
  l'icône d'onglet de `index.html`, ce qui le fait copier ; le coin haut-droit
  de chaque vue l'affiche ensuite (`src/ui/reglages.js`). Une image citée
  seulement depuis le JS ou le CSS ne serait pas copiée.
- **Bilingue français et anglais** (Réglages › Langue, comme Publipostage+).
  Le texte français sert de clé : `t('Désistement de {nom}', {nom})`, ou
  `tn(n, '{n} place', '{n} places')` quand il s'accorde en nombre, et chaque
  module déclare en tête ses traductions anglaises (`traductions({…})`, voir
  `src/i18n.js`). Une chaîne ajoutée ou modifiée porte sa traduction dans le
  même lot : `src/i18n.test.js` échoue sinon, et repère à l'écran tout texte
  resté en dur. Les données du document ne se traduisent jamais.
- **JSON importé avec son attribut** : `import jeu from './festival.json' with {type: 'json'}`
  (jeu de données de démonstration, jamais chargé par le widget en production).
- **Plus de types écrits.** Ceux de TypeScript ont été effacés. Le modèle de
  données (`Benevole`, `Mission`, `Modele`…) reste décrit, commentaires compris,
  dans `src/domain/types.d.ts` : des déclarations seulement, que le navigateur
  ne charge jamais. Les commentaires des autres `interface` et `type`
  (environ 460 lignes, surtout le contrat d'écriture de `store` et le modèle du
  moteur) ne sont pas encore repris ici : voir `../migration/README.md`.

## Commandes

Node 22.12 ou plus récent.

| Commande | Effet |
| --- | --- |
| `npm ci` | installe les outils de test |
| `npm test` | lance tous les tests (`vitest`) |
| `npm run dev` | sert le dossier en local sur <http://127.0.0.1:5173/index.html> (`node outils/servir.mjs`, sans dépendance) |
| `npm run dev:bench` | idem, à l'adresse du banc de développement : le widget monté sur un jeu de données de fichier, sans document Grist |
| `npm run site` | assemble dans `_site/` les seuls fichiers à publier (`node outils/assembler-site.mjs`) |
| `node scripts/verifier-integration.js --doc=<id>` | vérification de bout en bout contre une vraie instance Grist (voir `../dev/README.md`) |

Pour essayer le widget dans Grist : « Add widget to page → Custom », puis
coller l'adresse publiée (voir plus bas) ou une adresse HTTPS qui sert ce
dossier.

## Ce qui est publié

`outils/assembler-site.mjs` part de `index.html`, suit les imports de proche en
proche et ne copie que ce que la page charge : ni les tests, ni le banc de
développement, ni les scripts. Un import qui ne mène à rien arrête
l'assemblage plutôt que de publier un widget cassé. Le workflow
`.github/workflows/deploy-widget.yml` le fait à chaque fusion sur `main` qui
touche ce dossier, et publie le résultat sous `/js/` de la même adresse
GitHub Pages que `widget/` :

- widget en production (V1, TypeScript) : <https://lombre33.github.io/planningPlus/>
- V2 en JavaScript natif (essai) : <https://lombre33.github.io/planningPlus/js/>

## Limites connues

- **Pas de mise à jour en direct.** Le widget lit le document une fois, au
  démarrage, et ne s'abonne pas à ses changements : une ligne modifiée dans
  Grist pendant qu'il est ouvert n'apparaît qu'au rechargement de la page.
- **Plus de vérification de types.** `tsc` disparaît avec la compilation. Les
  tests, dont un test de démarrage qui monte chaque vue des sept entrées du
  menu sur deux jeux de données, sont le filet. Des types en commentaires JSDoc, que `tsc --checkJs`
  peut vérifier sans rien compiler, pourront être ajoutés plus tard.
- **Chargement à froid plus lent.** Une cinquantaine de petits fichiers
  plutôt qu'un paquet : environ trois fois le temps de chargement du paquet
  mesuré le 29/09 (376 ms contre 121 ms sur un poste, 934 ms contre 326 ms sur
  une connexion 4G, bibliothèque Grist non comprise). Les fichiers sont
  ensuite en cache.
- **Cache après un déploiement.** GitHub Pages laisse les fichiers en cache
  dix minutes (`max-age=600`) et les noms ne portent pas d'empreinte : pendant
  ce délai, un poste peut recevoir une page et des modules de deux versions.
  Un rechargement complet règle le cas.
- **Le navigateur doit connaître les imports JSON à attribut** (Chrome 123,
  Firefox 138, Safari 17.2 ou plus récent) : seuls le jeu de démonstration et
  les tests s'en servent.

## Licence

GPL-3.0-or-later : voir [`../LICENSE`](../LICENSE). Le fichier
`vendor/grist-plugin-api.js` garde sa licence d'origine (Apache-2.0).
