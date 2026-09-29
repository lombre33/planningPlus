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

## Comment le code est organisé

- **Modules ES natifs.** Chaque fichier `.js` de `src/` est un module ; les
  imports sont relatifs et portent leur extension (`import {h} from './dom.js'`),
  parce qu'un navigateur ne la devine pas.
- **Aucune dépendance à l'exécution.** `package.json` ne liste que des outils
  de test (`vitest`, `jsdom`). Rien de ce qui est servi ne passe par npm.
- **Feuilles de style par `<link>`.** Un navigateur ne sait pas importer du
  CSS depuis un module : `index.html` charge `src/style.css` puis
  `src/ui/impression.css`, dans cet ordre (la seconde complète la première).
  Une nouvelle feuille se déclare dans `index.html` **et** `dev-bench.html`,
  jamais par un `import` dans un module (`npm run site` échoue dessus).
- **Un seul script classique**, `vendor/grist-plugin-api.js` : il expose
  `window.grist` (voir `vendor/README.md` pour sa provenance et son empreinte).
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

- **Plus de vérification de types.** `tsc` disparaît avec la compilation. Les
  tests, dont un test de démarrage qui monte les 13 onglets sur deux jeux de
  données, sont le filet. Des types en commentaires JSDoc, que `tsc --checkJs`
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
