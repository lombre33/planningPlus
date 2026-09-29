# Migration vers le JavaScript natif

Ce dossier porte le passage de `widget/` (TypeScript, compilé par Vite : la V1,
en production) à `widget-js/` (JavaScript natif, servi tel quel : la V2). Il est
provisoire : il disparaît à la bascule (voir plus bas).

Décisions d'Antoine du 2026-09-29 : « une infra simple sans framework, sans
compilation », code dans un nouveau dossier du même dépôt, servi sur GitHub
Pages comme aujourd'hui, licence GNU ; puis « faire une V2 avec les corrections
de la maquette et du code ». La V2 est ce nouveau dossier : la conversion en
est le point de départ, elle ne la finit pas. L'audit qui a préparé ce choix
est dans le Claude Doc « Audit de migration vers le JavaScript natif » et son
kit de mesures.

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
   dépendance du dépôt. Cette comparaison n'a de sens que sur le dossier tel
   que la conversion l'a produit : une fois la V2 modifiée, `widget-js/` n'est
   plus censé ressembler à `widget/`.

## Le sceau : de la conversion à la V2

Le convertisseur écrit, avec `widget-js/src/` et `widget-js/scripts/`, un
**sceau** (`widget-js/.sceau-conversion`) : l'empreinte de ce qu'il vient
d'écrire. Tant que ces deux dossiers n'ont pas été modifiés à la main, ils sont
le reflet de `widget/` et la conversion peut les réécrire sans rien perdre.

Dès qu'un fichier de `widget-js/src/` ou de `widget-js/scripts/` change ou
s'ajoute à la main (la V2 se construit), le sceau ne correspond plus au disque.
La conversion **refuse alors d'écraser** ce travail, et `--verifier` ne
compare plus fichier par fichier : il dit seulement si `widget/` a changé depuis
la conversion.

| `widget-js/` | `widget/` depuis la conversion | `--verifier` | conversion sans option |
| --- | --- | --- | --- |
| intact | inchangé | « à jour » | réécrit à l'identique |
| intact | changé | liste les fichiers en retard, code de sortie 1 | réécrit : rattrape `widget/` |
| modifié à la main | inchangé | « rien à reporter » | refuse |
| modifié à la main | changé | demande de reporter le changement, code de sortie 1 | refuse |

Les workflows (`ci.yml`, `deploy-widget.yml`) lancent `--verifier` et n'en font
qu'un avertissement, qui ne bloque rien. Deux options pour les autres cas :

- `--sortie <dossier>` écrit la conversion dans ce dossier et ne touche ni
  `widget-js/` ni le sceau ;
- `--forcer` écrase `widget-js/` même modifié : pour repartir de la conversion,
  jamais pour « rattraper » un changement de `widget/`.

### Reporter un changement de `widget/`

Une correction fusionnée dans `widget/` après le début de la V2 (la V1 reste en
production jusqu'à la bascule) n'arrive pas seule dans `widget-js/`.
`node migration/convertir.mjs --sortie /tmp/conversion` produit la conversion à
jour dans un dossier à part : pour un fichier que la V2 n'a pas touché, on le
copie ; pour un fichier que la V2 a aussi modifié, on en reprend les lignes du
changement. Ces corrections sont petites, le plus souvent, et la V2 remplace la
V1 à la bascule.

## Le schéma

`widget-js/src/grist/schema.js` est une copie de `dev/seed/schema.mjs` : le
dossier publié doit se suffire, GitHub Pages ne sert pas `dev/`. Tant que
`widget/` existe, la source reste `dev/seed/schema.mjs`, que les scripts de
`dev/seed/` (document de test, jeu de données) et `widget/` lisent aussi : on le
modifie, puis on copie le fichier dans `widget-js/src/grist/schema.js`. `widget-js/outils/schema.test.js`
échoue si les deux diffèrent. À la bascule, on inverse (voir plus bas).

## Reste à faire avant la bascule

À faire sur le code final de la V2, pas avant : les écrans que la maquette B
refait sont ceux où se trouvent le code mort et les types les plus commentés.

- **Le code mort.** L'audit en a relevé une centaine de lignes dans
  `logic/derive` (`calculerAnomalies`, `placesDuBenevole`) et quelques exports
  que plus rien n'appelle, avec leurs tests. À reprendre sur la V2, une fois
  l'écran Anomalies refait.
- **Les commentaires des types, en JSDoc.** L'effacement retire avec chaque
  `interface` et chaque `type` le commentaire qui le décrit : environ 460
  lignes dans 25 fichiers, dont le contrat d'écriture de `store` (les raisons de
  chaque méthode) et le modèle de `moteur/types`. Les modules de types seuls
  (`domain/types`) gardent les leurs en `.d.ts`. À reprendre en `@typedef` dans
  `widget-js/src` (le compilateur peut vérifier que chaque `@typedef` équivaut à
  la déclaration d'origine, tant que `widget/` existe), ou à laisser de côté
  avec l'accord d'Antoine. Ça ne change que des commentaires.

## La bascule

Quand Antoine a essayé la V2 dans Grist et donné son accord :

1. Prévenir les fils : plus rien dans `widget/`. Reporter, s'il y en a, les
   derniers changements de `widget/` (voir plus haut).
2. Publication : le déploiement assemble `widget-js` à la racine
   (`node widget-js/outils/assembler-site.mjs _site`), sans construction
   TypeScript, et cesse de publier sous `/js/`. L'adresse à coller dans Grist
   reste `https://lombre33.github.io/planningPlus/` : les documents où Antoine a
   essayé `/js/` doivent revenir à elle. Retirer de `ci.yml` et de
   `deploy-widget.yml` ce qui parle de `widget/` et de `migration/`.
3. `git rm -r widget migration`. Le dossier `widget-js/` peut garder son nom ;
   le renommer en `widget/` (`git mv`) est possible mais facultatif, dans une
   pull request à part et à un moment où aucune branche n'est ouverte sur ce
   dossier.
4. Schéma : `widget-js/src/grist/schema.js` devient la source ;
   `dev/seed/schema.mjs` la réexporte (`export * from …`) ; supprimer
   `widget-js/outils/schema.test.js`.
5. Documentation : chemins de `README.md`, `dev/README.md` (`widget/src/*.ts`
   devient `widget-js/src/*.js`), `docs/cahier-des-charges.md`, et le paragraphe
   « Où en est ce dossier » de `widget-js/README.md`.
6. Vérifier le déploiement comme d'habitude : `curl` de l'adresse publiée et
   empreinte SHA-256 des fichiers comparée à celle du dépôt.
