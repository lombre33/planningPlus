# PlanningPlus

Widget personnalisé [Grist](https://www.getgrist.com/) de gestion de plannings.

PlanningPlus permet de construire un planning d'affectation de personnes sur des
missions découpées en créneaux, puis de l'ajuster en temps réel pendant
l'événement. Le premier cas d'usage est l'affectation de bénévoles de festival,
mais le modèle reste générique (astreintes, permanences, accueil, tenue de
poste).

## À quoi sert PlanningPlus

Le widget accompagne le travail en cinq étapes, dans l'ordre du menu :

1. **Agenda** : les macro-créneaux (les jours du festival) et leurs
   sous-créneaux, que l'on déplace et redimensionne.
2. **Missions** : les missions et leurs créneaux du jour, avec leur couverture.
3. **Indicatifs** : un indicatif (une place seule, un binôme…) est positionné à
   l'avance sur plusieurs missions.
4. **Bénévoles** : leurs disponibilités au quart d'heure, les artistes qu'ils
   veulent voir, les désistements.
5. **Affectation** : la table du jour, une ligne par place. Le widget propose
   (algorithme, scénarios), la personne qui planifie ajuste, et les
   affectations proposées passent par un brouillon avant d'être écrites dans le
   document.

Deux entrées complètent le parcours : **Terrain** (le jour J : qui doit être où
à un instant donné, et les effectifs attendus face à leur minimum) et
**Impressions** (rosters et feuilles de route à imprimer, par bénévole ou par
équipe, pour un jour ou pour tout le festival).

L'interface existe en français et en anglais (Réglages › Langue), en thème
clair ou sombre (Réglages › Thème).

## État du projet

Deux versions du widget sont dans ce dépôt : la V1 (`widget/`, TypeScript), en
production, et la V2 (`widget-js/`, JavaScript natif, sans compilation),
publiée à côté pour être essayée avant la bascule (voir « V2 en JavaScript
natif » plus bas). Le cadrage du projet est dans [`docs/`](docs/).

| Document | Objet |
| --- | --- |
| [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md) | Cahier des charges (v0, en cours) |
| [`docs/questions-cadrage.md`](docs/questions-cadrage.md) | Questions de cadrage et réponses |

## Configuration dans Grist

1. Dans un document Grist, ajouter à une page un widget **Personnalisé**
   (« Custom ») et y coller l'adresse du widget :
   `https://lombre33.github.io/planningPlus/` (V1) ou
   `https://lombre33.github.io/planningPlus/js/` (V2, en essai).
2. Accorder au widget l'**accès complet au document** (`full`). Il le demande
   lui-même ; la section suivante dit pourquoi.
3. C'est tout. Au premier chargement, le widget crée les tables qui lui
   manquent, colonnes comprises : Équipes, Lieux, Bénévoles, Missions,
   Artistes, Macro-créneaux, Sous-créneaux, Besoins, Groupes, Positions de
   groupe, Places, Disponibilités, Souhaits de mission, Affinités, Présences,
   Paramètres. Les tables `Versions` et `Journal`, prévues au schéma, ne sont
   pas créées : aucune fonction du widget ne s'en sert encore.
4. Pour reprendre des bénévoles déjà saisis dans une autre table du document
   (un formulaire d'inscription, par exemple) : Bénévoles › Disponibilités,
   « Réglages d'import ». On désigne la table et ses colonnes ; elle n'est que
   lue.

Les données restent dans le document : chaque table du widget se lit et se
modifie dans les vues natives de Grist (voir « Principes directeurs »).

## Accès au document

Le widget demande `requiredAccess: 'full'` (appel à `grist.ready`, dans
`widget-js/src/main.js` pour la V2 et `widget/src/main.ts` pour la V1).

**Pourquoi pas moins.** Un niveau « lecture de la table » ne donne que la table
liée à la section du widget. PlanningPlus travaille sur seize tables
qu'aucune section ne lui lie ; il passe donc par l'API du document
(`grist.docApi` : liste des tables, lecture, `applyUserActions`), que seul le
niveau `full` ouvre.

**Ce que la V2 lit**

- la liste des tables du document et le contenu des tables de PlanningPlus
  (celles de la section précédente, plus `Versions` et `Journal` si elles
  existent) ;
- à la demande seulement (« Réglages d'import ») : les tables système
  `_grist_Tables` et `_grist_Tables_column`, pour proposer les tables et
  colonnes du document, puis les valeurs des colonnes que la personne associe
  dans sa propre table.

**Ce que la V2 écrit** (par `applyUserActions`)

- la création de ses tables manquantes et, pour ces seules tables, l'intitulé de
  leur vue brute et l'affichage des colonnes de référence (`AddTable`,
  `AddColumn`, `ModifyColumn`, `SetDisplayFormula`, `UpdateRecord` sur
  `_grist_Views_section`) ;
- la colonne `Id_source` ajoutée à sa table Bénévoles quand elle manque ;
- les lignes de ses propres tables : ajout, mise à jour, suppression (créneaux,
  missions, indicatifs, places, disponibilités, présences, paramètres…).

Aucune table ni colonne n'est supprimée ou renommée. La table d'où l'on reprend
des bénévoles n'est jamais modifiée.

**Limite connue.** Le widget reconnaît ses tables à leur identifiant exact
(`Benevoles`, `Groupes`, `Places`…). Si le document contient déjà, avant le
premier lancement, une table étrangère qui porte l'un de ces identifiants, il la
prend pour la sienne et y lit et écrit. À éviter : ne pas nommer ses propres
tables comme celles de la liste ci-dessus.

## Données conservées par le widget

Dans le navigateur de la personne, rien d'autre que deux préférences
d'affichage, dans le `localStorage` : `planningplus_langue` (`fr` ou `en`) et
`planningplus_theme` (`system`, `light` ou `dark`). Aucune donnée du document
n'y est copiée. Sans stockage disponible (navigation privée), les choix valent
pour la session.

Le widget lit le document une fois au démarrage et ne s'abonne pas à ses
changements : une ligne modifiée dans Grist pendant que le widget est ouvert
n'apparaît qu'au rechargement de la page.

## Dépendances

**À l'exécution (V2), une seule** : `widget-js/vendor/grist-plugin-api.js`,
l'API cliente officielle de Grist (Apache-2.0), recopiée dans le dépôt avec sa
provenance et son empreinte SHA-256 (`widget-js/vendor/README.md`, vérifiées
par un test). Aucun framework, aucune bibliothèque, aucune étape de
construction : les fichiers de `widget-js/src/` sont ceux que le navigateur
charge.

**Pour développer** : Node 22.12 ou plus récent, `vitest` et `jsdom` pour les
tests. Rien de cela n'est servi avec le widget. La V1 se construit avec npm :
voir `widget/package.json`.

## Sécurité

- **Aucune requête vers l'extérieur.** Le code que la page charge
  (`widget-js/src/`) n'emploie ni `fetch`, ni `XMLHttpRequest`, ni `WebSocket`,
  ni `sendBeacon`. Seuls deux scripts de vérification, lancés à la main sous
  Node (`widget-js/scripts/`) et jamais publiés, appellent `fetch`. Script,
  feuilles de style et image sont servis par le widget lui-même, sans police
  chargée. Il ne parle qu'à Grist, par `postMessage`, au travers de
  `grist-plugin-api.js`. Les seules adresses extérieures sont deux liens de
  Réglages › Crédits (le site de l'auteur, le texte de la licence), qui
  s'ouvrent dans un autre onglet au clic.
- **Les données du document ne sont jamais interprétées.** L'interface se
  construit avec `createElement` et `createTextNode` : le code du widget n'a ni
  `innerHTML`, ni `outerHTML`, ni `insertAdjacentHTML`, ni `document.write`, ni
  `eval`, ni `new Function`. La seule valeur du document qui sert de style, la
  couleur d'une équipe, est filtrée (`decoderCouleur`, `widget-js/src/grist/valeurs.js`)
  pour qu'un `url(…)` saisi dans la colonne ne fasse pas charger une adresse.
- Le fichier officiel `grist-plugin-api.js` embarque lodash, dont une fonction
  de gabarits construit du code (`Function`) ; le widget ne l'appelle pas et
  les mesures n'en voient aucun appel.

Un signalement de vulnérabilité se fait comme dit dans [`SECURITY.md`](SECURITY.md).

## Principes directeurs

1. **Lisibilité native Grist.** Toute donnée métier reste consultable et
   modifiable dans les vues natives de Grist, sans passer par le widget.
2. **Code auditable.** Le code doit pouvoir être relu par un tiers (DINUM) :
   lisible, commenté là où c'est utile, sans dépendance opaque, sans faille
   évidente.
3. **Ajustement à chaud.** Le jour J, une part significative du planning bouge.
   L'outil doit permettre de corriger localement sans tout recalculer.

## Déploiement du widget (GitHub Pages)

`.github/workflows/deploy-widget.yml` teste et construit `widget/` (tests,
vérification de types, `vite build`), teste `widget-js/` et publie le tout sur
GitHub Pages à chaque poussée sur `main` qui touche l'un des deux : le paquet de
`widget/` à la racine, les fichiers de `widget-js/` sous `/js/` (voir la section
suivante).

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

## V2 en JavaScript natif (en construction)

Antoine a demandé le 2026-09-29 « une infra simple sans framework, sans
compilation », puis « une V2 avec les corrections de la maquette et du code ».
[`widget-js/`](widget-js/) est cette V2 : du JavaScript natif, où les fichiers du
dépôt sont ceux que le navigateur charge, sans paquet à construire. Son point de
départ est la conversion exacte de `widget/` (la V1, TypeScript, qui reste en
production) ; la maquette B et les corrections des audits s'y ajoutent
directement. Elle est publiée à côté de la V1, à
`https://lombre33.github.io/planningPlus/js/`, pour être essayée dans Grist
avant la bascule. La conversion, ses preuves d'équivalence, le sceau qui
l'arrête dès que la V2 est modifiée et la marche de la bascule sont dans
[`migration/README.md`](migration/README.md).

## Licence

PlanningPlus est un logiciel libre, publié sous licence GNU GPL version 3 ou
(à votre choix) toute version ultérieure : voir [`LICENSE`](LICENSE). Le fichier
`grist-plugin-api.js`, repris de Grist, garde sa licence d'origine
(Apache-2.0).
