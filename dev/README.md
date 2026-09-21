# Environnement de développement

Ce dossier contient ce qu'il faut pour tester le widget (`widget/`) contre un
vrai document Grist, avec un jeu de données de festival réaliste.

## Générateur de données (`dev/seed/`)

`dev/seed/` construit un document Grist de test à partir de rien :

- `schema.mjs` décrit les tables et colonnes du modèle de données v1 du
  cahier des charges (§6) : équipes, lieux, bénévoles, missions, artistes,
  macro-créneaux, sous-créneaux, besoins, groupes (indicatifs), positions de
  groupe, places, disponibilités au quart d'heure, souhaits de mission,
  affinités, `Parametres` (réglages ayant valeur d'audit — §5.4, §7.2 —
  poids de l'algorithme et heure de coupure du jour de festival), plus
  `Versions`/`Journal` (créées vides — remplies par le widget à l'usage, pas
  par le générateur). `Besoins.Libelle` est une colonne formule (pas une
  donnée du générateur) : Besoins n'a pas de nom naturel, elle sert
  uniquement de `visibleCol` pour les tables qui le référencent
  (`Positions_groupe.Besoin`) — voir « Pièges » ci-dessous.
- `generate.mjs` tire un jeu de données déterministe (même graine → mêmes
  données) : festival de plusieurs jours, disponibilités et souhaits
  d'artiste au quart d'heure, des groupes positionnés sur plusieurs besoins
  d'un même macro-créneau (mécanisme §6.3), et au moins une mission
  volontairement sous-staffée plus un ou deux conflits volontaires (souhait
  refusé ou indisponibilité), pour avoir de quoi éprouver la vue anomalies
  dès le premier jeu de données.
- `grist-api.mjs` est un client REST minimal pour l'API Grist (aucune
  dépendance externe, `fetch` natif).
- `seed.mjs` orchestre les deux : il recrée entièrement le document (schéma
  et données) à chaque exécution. Le script est jetable et rejouable —
  utile tant que le schéma bouge encore.

### Utilisation

```
node dev/seed/seed.mjs --url=<url de l'instance Grist> --cle=<clé d'API>
```

Ou via `dev/.env` (non versionné) :

```
GRIST_URL=https://docs.getgrist.com
GRIST_API_KEY=...
```

La clé d'API se récupère dans Grist : menu du profil → Profile Settings →
API Key.

Options : `--jours` (défaut 5), `--benevoles` (défaut 70), `--equipes`
(défaut 3), `--artistes` (défaut 20), `--duree-sous-creneau` en minutes
(défaut 90), `--graine` (défaut 20260717), `--workspace` et `--nom` pour le
nom du document. Les défauts correspondent à l'ordre de grandeur réel du
festival d'Antoine (cahier des charges, NF1) ; volontairement paramétrables
plutôt qu'en dur, pour rester utilisable sur d'autres cas d'usage.

### Export JSON statique (`dev/seed/export-json.mjs`)

Pour un besoin qui n'exige pas de document Grist réel — par exemple une
maquette interactive travaillée dans un autre fil, sur données simulées —
`export-json.mjs` écrit le même jeu de données dans un fichier JSON, sans
rien créer côté Grist :

```
node dev/seed/export-json.mjs --sortie=dev/seed/festival.json
```

Mêmes options que `seed.mjs` pour la volumétrie. Les références
inter-tables restent sous la forme locale `{_ref: n}` (index dans le
tableau de la table cible) : il n'y a pas d'identifiant Grist réel sans
document. Le fichier n'est pas versionné (voir `.gitignore`) : il se
régénère à la demande, comme le reste de `dev/seed/`.

## Notes de montage d'un Grist local

Pour tester en local sans dépendre d'un Grist distant, `grist-core` (le
moteur open source de Grist) peut être compilé depuis ses sources plutôt que
par l'image Docker officielle, si celle-ci n'est pas joignable :

```
git clone https://github.com/gristlabs/grist-core.git
cd grist-core
echo community > grist-edition   # évite le téléchargement des extensions "full"
yarn install
yarn run install:python          # sandbox Python pour le moteur de formules
yarn run build:prod
```

Lancement (le `NODE_PATH` est indispensable, `sandbox/run.sh` le pose mais
`_build/stubs/app/server/server.js` seul ne le déduit pas) :

```
NODE_PATH=_build:_build/ext:_build/stubs:ext/node_modules \
GRIST_SANDBOX_FLAVOR=unsandboxed \
GRIST_DATA_DIR=<dossier de données> \
GRIST_SESSION_SECRET=<secret quelconque> \
GRIST_SINGLE_ORG=docs \
GRIST_TEST_LOGIN=1 \
node _build/stubs/app/server/server.js
```

`GRIST_TEST_LOGIN=1` ouvre `/test/login?username=<email>&next=/`, qui pose
une session sans passer par un vrai fournisseur d'identité — pratique en
environnement sans accès réseau sortant vers Cognito.

Sur une installation neuve, l'API refuse toute requête tant qu'aucun
administrateur n'est défini (« Grist is not yet configured. Visit /boot »).
Le plus simple pour tout automatiser, sans étape manuelle dans un
navigateur : au démarrage, la console affiche une `BOOT KEY` ; l'échanger
contre une session admin et une clé d'API se fait en deux appels HTTP,
sans UI :

```
curl -c cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"bootKey":"<clé affichée au démarrage>","adminEmail":"<email au choix>"}' \
  http://localhost:8484/boot/login

curl -b cookies.txt -c cookies.txt -X POST -d '{}' \
  http://localhost:8484/api/profile/apikey   # crée la clé
curl -b cookies.txt http://localhost:8484/api/profile/apikey  # la relit
```

## Pièges rencontrés en écrivant `dev/seed/`

- **L'identifiant réel d'une table peut différer de celui demandé à la
  création, et changer une seconde fois.** `POST /tables` accepte un `id`
  proposé, mais Grist peut lui substituer un identifiant dérivé (accents et
  tirets normalisés, mots séparés par `_`, parfois avec un connecteur
  ajouté). Poser ensuite le *titre* d'une table (`UpdateRecord
  _grist_Views_section {title}`, ce que fait `reglerLibellesTables`) peut la
  **renommer une seconde fois**, dérivé cette fois du titre. `seed.mjs` ne
  suppose donc jamais qu'un identifiant capturé reste valable : il le
  retrouve systématiquement via l'identifiant de ligne (stable) de la table
  en métadonnée `_grist_Tables` (voir `idsReelsDepuisLignes`).
- **Une colonne ChoiceList attend un encodage particulier.** L'API REST
  refuse un tableau JS brut pour une cellule ChoiceList : il faut le
  préfixer du code d'objet Grist `'L'` (`['L', 'a', 'b']`, pas `['a', 'b']`).
  Voir `listeGrist` dans `generate.mjs` et `GristObjCode.List` dans les
  sources de grist-core (`app/plugin/GristData.ts`). Vérifié empiriquement :
  cet encodage vaut aussi bien en écriture qu'en lecture (`fetchTable`/`/data`
  renvoient `['L', ...]`, jamais un tableau nu) — voir `widget/src/grist/valeurs.ts`.
  Les colonnes `Ref`/`Date`/`DateTime`, elles, se lisent et s'écrivent comme
  de simples scalaires (identifiant de ligne, timestamp Unix en secondes),
  sans encodage particulier — une `Ref` vide vaut `0`, jamais `null`.
- **L'identifiant réel d'une table dérivé du titre casse aussi le widget, pas
  seulement `seed.mjs`.** Le piège ci-dessus n'est pas qu'une curiosité de
  `seed.mjs` : n'importe quel code qui parle au document — y compris le
  widget lui-même, une fois chargé dans une vraie session Grist — ne peut pas
  coder un identifiant de table en dur. Constaté en pratique sur le document
  de test : `Positions_groupe` (id du schéma) vaut réellement
  `Positions_de_groupe`, et `Souhaits_missions` vaut `Souhaits_de_mission`,
  tous deux dérivés du *titre* de la table. Une action visant l'id du schéma
  échoue côté sandbox Python (`KeyError '<id>'`) plutôt que d'échouer
  clairement. `widget/src/grist/tables.ts` résout donc l'identifiant réel de
  chaque table, une fois par session, par comparaison normalisée avec son
  libellé plutôt que de faire confiance à l'id du schéma.
- **Le `retValue` d'une action groupée porte un tableau, pas un id.** Le
  résultat d'`applyUserActions` a une entrée par *action* envoyée, dans
  l'ordre — pas une entrée par ligne. Pour un `AddRecord` simple, cette
  entrée est directement le nouvel id. Pour un `BulkAddRecord` (plusieurs
  lignes en une seule action), c'est le *tableau* des ids créés : le confondre
  avec un `AddRecord` et déstructurer directement dessus envoie ensuite ce
  tableau comme id de ligne à l'action suivante, qui échoue côté sandbox
  (`TypeError: unhashable type: 'list'`). Voir le commentaire d'`appliquerActions`
  dans `widget/src/grist/ecriture.ts`.

## Couche d'accès Grist (`widget/src/grist/`)

Lit et écrit `DonneesPlanning` (le modèle du moteur d'affectation,
`widget/src/moteur/`) dans un vrai document Grist, via l'API du plugin
(`window.grist.docApi`) :

- `valeurs.ts` : encodage/décodage bas niveau des valeurs de cellule (`Ref`,
  `ChoiceList`, scalaires), vérifié empiriquement contre une instance réelle.
- `tables.ts` : résolution de l'identifiant réel de chaque table, voir
  « Pièges » ci-dessus.
- `lecture.ts` : tables Grist brutes → `DonneesPlanning` + lignes `Parametres`.
- `ecriture.ts` : construit les `UserAction` (création de groupe, positions,
  roster, disponibilités, verrouillage d'une place, réglages) et les envoie.
  Portée volontairement limitée à ce que le widget doit pouvoir écrire selon
  le cahier des charges (§5.4) : le reste (bénévoles, missions, structure
  temporelle, ...) se saisit nativement dans Grist.
- `parametres.ts` : sérialisation de `ParametresAlgorithme` et de l'heure de
  coupure vers/depuis la table `Parametres` (une ligne par réglage scalaire,
  pas un blob JSON — pour rester filtrable/triable nativement).

`scripts/verifier-integration.ts` rejoue un aller-retour complet (écriture
puis relecture) contre une vraie instance, avec les mêmes fonctions que le
widget — pas une réimplémentation. À relancer après tout changement dans
`widget/src/grist/` :

```
cd widget && npx vite-node scripts/verifier-integration.ts --doc=<id> --cle=<clé> --url=<url>
# (ou GRIST_DOC_ID/GRIST_API_KEY/GRIST_URL dans l'environnement, comme dev/.env)
```

Vérification en profondeur (audit lisibilité native §5.1) : le 2026-09-21,
ce script a été rejoué contre un document local fraîchement seedé, puis le
résultat inspecté à l'œil dans l'UI Grist (capture d'écran via Playwright) —
Groupes/Places/Disponibilités/Paramètres se lisent nativement (références en
libellé, dates formatées, pas de code brut), et le tri comme le filtre natifs
fonctionnent sur ces données (testé en vrai sur `Places`, colonnes `Score` et
`Origine`). Voir aussi la colonne `Besoins.Libelle` plus haut, ajoutée après
ce test.

## Widget (`widget/`)

Squelette Vite + TypeScript strict + vitest, pensé pour être servi en statique
(GitHub Pages en pratique — chemins relatifs, aucune requête sortante hors
API Grist). `widget/public/vendor/grist-plugin-api.js` est une copie figée du
fichier que sert n'importe quelle instance Grist à `/grist-plugin-api.js` (ici
compilé depuis les sources de grist-core), vendorisée plutôt que chargée
depuis un CDN — voir `widget/public/vendor/README.md` pour pourquoi et
comment la mettre à jour.

`widget/src/main.ts` n'est qu'une sonde de connexion pour l'instant (liste
les tables du document et leur nombre de lignes) : les vues métier viennent
d'un autre fil, une fois la maquette validée. `widget/src/grist/` (couche
d'accès, ci-dessus) et `widget/src/moteur/` (moteur d'affectation, cahier des
charges §7) n'ont pas encore de fil qui les branche l'un à l'autre depuis une
vraie vue : c'est ce branchement, plus les vues elles-mêmes, qui reste à
faire une fois la maquette validée.

Pour le tester en local : `npm run build` dans `widget/`, servir `dist/` en
statique (`python3 -m http.server` par exemple), puis dans Grist : Add
widget to page → Custom → coller l'URL locale. Un document créé par
`seed.mjs` fournit de vraies données à lire.
