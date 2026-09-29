# Migration vers le JavaScript natif

Ce dossier porte le passage de `widget/` (TypeScript, compilé par Vite) à
`widget-js/` (JavaScript natif, servi tel quel). Il est provisoire : il
disparaît à la bascule (voir plus bas).

Décision d'Antoine du 2026-09-29 : « une infra simple sans framework, sans
compilation », code dans un nouveau dossier du même dépôt, servi sur GitHub
Pages comme aujourd'hui, licence GNU. L'audit qui a préparé ce choix est dans
le Claude Doc « Audit de migration vers le JavaScript natif » et son kit de
mesures.

## Ce que fait le convertisseur

`node migration/convertir.mjs` (depuis la racine du dépôt, après `npm ci` dans
`widget/` : TypeScript ne sert qu'ici) lit `widget/src/` et `widget/scripts/` et
écrit `widget-js/src/` et `widget-js/scripts/`. Il ne réécrit pas le code : il
**efface** ce qui est propre à TypeScript, par suppression de plages de texte,
et laisse tout le reste au caractère près (commentaires, mise en page,
guillemets).

| Ce qui change | Comment |
| --- | --- |
| Annotations, génériques, `as`, `!`, `?` de paramètre, `interface`, `type`, `implements`, modificateurs `public` / `private` / `readonly` | effacés |
| Imports de types (`import type`, `import {type X}`) | supprimés ; un module qui ne contient que des types (`domain/types.ts`) reste à côté en `.d.ts`, documentation comprise |
| Imports relatifs sans extension | reçoivent `.js` (ou `/index.js`) |
| Import d'une feuille de style (`import './style.css'`) | supprimé : la feuille se charge par `<link>` dans `index.html` et `dev-bench.html` (le convertisseur vérifie que chaque feuille atteinte y est) |
| Import JSON | reçoit l'attribut `with {type: 'json'}` |
| Propriété de paramètre de constructeur (`constructor(private x: T)`) | devient un champ et une affectation |
| Noms de fichiers cités dans les commentaires et les titres de tests (`app.ts`) | prennent l'extension du fichier produit (`app.js`) |
| `grist/schema.ts` (ré-export de `dev/seed/schema.mjs`) | remplacé par une copie du schéma, pour que le dossier servi soit complet |

Deux retouches de texte déclarées à la main (`retouches` dans
`convertir.mjs`) : les messages d'usage des deux scripts de vérification, qui
se lançaient avec `vite-node` et se lancent avec `node`.

## Comment on sait que rien n'a changé

1. **Arbres identiques.** Pour chaque fichier, le résultat est comparé à la
   sortie officielle de `ts.transpileModule` (mêmes options que
   `widget/tsconfig.json`) : les deux sont relus comme du JavaScript et ramenés
   à la suite de leurs nœuds, sans commentaires ni mise en forme
   (`equivalence.mjs`). Le convertisseur s'arrête au premier écart.
2. **Les tests.** `npm test` dans `widget-js/` passe les mêmes tests que dans
   `widget/`, sur le code converti, plus le test de démarrage des 13 onglets.
3. **Le navigateur.** `PP_PLAYWRIGHT=<dossier node_modules> node migration/comparer-navigateur.mjs`
   monte les 13 onglets dans Chromium, côté TypeScript (Vite, puis le paquet de
   production) et côté JavaScript (fichiers servis tels quels, puis site
   assemblé), sur le jeu minimal, le jeu réaliste et un faux document Grist. Il
   compare pour chaque onglet le DOM, les styles calculés, la capture à l'écran
   et la capture à l'impression, puis charge le site assemblé dans un iframe
   sans origine, comme Grist embarque un widget. Playwright n'est pas une
   dépendance du dépôt.

## Tenir le dossier à jour tant que les deux coexistent

`widget/` reste la source. Après toute modification de `widget/src/` ou de
`widget/scripts/` : `node migration/convertir.mjs`, puis committer `widget-js/`
avec elle. `node migration/convertir.mjs --verifier` n'écrit rien et dit ce qui
est en retard ; les workflows de la PR et du déploiement le lancent et le
signalent sans bloquer.

## Reste à faire avant la bascule

**Reprendre en JSDoc les commentaires des types.** L'effacement retire avec
chaque `interface` et chaque `type` le commentaire qui le décrit : environ 460
lignes dans 25 fichiers, dont le contrat d'écriture de `store.ts` (les
raisons de chaque méthode) et le modèle de `moteur/types.ts`. Les modules de
types seuls (`domain/types.ts`) gardent les leurs en `.d.ts`. Avant de
supprimer `widget/`, transformer les autres en `@typedef` dans `widget-js/src`
(le convertisseur peut le faire, et le compilateur vérifie que chaque `@typedef`
équivaut à la déclaration d'origine), ou décider avec Antoine de s'en passer.
Ça ne change que des commentaires : ni le comportement ni les tests.

## La bascule

Quand Antoine a essayé `/js/` dans Grist et donné son accord :

1. Prévenir les fils : plus de modification de `widget/src/` à partir de
   maintenant. Lever, avec Antoine, le gel de Missions et d'Indicatifs pour les
   modifications à venir : la conversion les a copiés sans en changer le
   comportement, mais ils seront désormais écrits en JavaScript.
2. Refaire une dernière conversion et une dernière comparaison
   (`convertir.mjs`, `comparer-navigateur.mjs`, `npm test` dans les deux
   dossiers).
3. `git rm -r widget migration`, puis `git mv widget-js widget`.
4. Workflows : le déploiement publie `widget` assemblé à la racine
   (`node widget/outils/assembler-site.mjs _site`) et n'a plus besoin de la
   construction TypeScript ; retirer de `ci.yml` ce qui parle de
   `widget-js/` et de `migration/`.
5. Documentation : chemins de `README.md`, `dev/README.md` (`widget/src/*.ts`
   devient `widget/src/*.js`), `docs/cahier-des-charges.md`, et le paragraphe
   « Où en est ce dossier » de `widget/README.md`.
6. Vérifier le déploiement comme d'habitude : `curl` de l'adresse publiée et
   empreinte SHA-256 des fichiers comparée à celle du dépôt.
