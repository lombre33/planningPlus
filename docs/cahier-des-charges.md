# PlanningPlus — Cahier des charges

**Version :** v1.17 (§7.2 : nouvel ordre de priorité — binôme souhaité en
tête, artiste souhaité (seuil 30 min, déjà câblé) juste derrière, missions
souhaitées sorti du classement sauf exception « restauration » non encore
définie — décision Antoine, 2026-09-25 11h47 ; historique des versions
précédentes dans `git log` sur ce fichier)
**Statut :** structure et règles validées (§6.3, §7.5) ; développement agile
par incréments courts depuis le 2026-09-22 (§11.1) ; document tenu à jour au
fil du code plutôt qu'en fin de sprint, sur consigne du coordinateur
**Dernière mise à jour :** 2026-09-23

> Les décisions issues du cadrage sont annotées *(Décision Antoine,
> 2026-09-21)* dans le texte. Voir le détail question par question dans
> [questions de cadrage](questions-cadrage.md).

---

## 1. Contexte et objectif

PlanningPlus est un *custom widget* Grist destiné à être hébergé et utilisé sur
une instance Grist (instance DINUM pour l'usage cible). Son rôle est de
construire, visualiser et ajuster un planning d'affectation de personnes sur des
missions découpées dans le temps.

Le cas d'usage pilote est l'organisation des bénévoles d'un festival :

- le festival est découpé en **macro-créneaux** (grandes plages, typiquement une
  demi-journée ou une journée) ;
- chaque macro-créneau est découpé en **sous-créneaux**, qui correspondent aux
  rotations des bénévoles ;
- des **missions** doivent être tenues sur ces sous-créneaux, avec un nombre
  minimum et maximum de bénévoles ;
- des **artistes** se produisent pendant certains sous-créneaux ;
- des **bénévoles** déclarent leurs disponibilités, les artistes qu'ils veulent
  voir et les missions qu'ils souhaitent (ou ne souhaitent pas) faire ;
- l'outil fait correspondre l'offre et le besoin, puis laisse l'humain corriger.

L'outil doit rester générique : le cas festival est le premier client, pas le
seul horizon.

### 1.1 Parcours utilisateur de référence

*(Défini par Antoine, 2026-09-21 — la lecture de référence pour comprendre à
quoi sert l'outil, avant même la liste des vues au §8.)*

1. **Macro-créneaux** — les définir facilement, avec une interface soignée
   (§6.2, vue Agenda au §8).
2. **Sous-créneaux et missions** — les définir, y compris en laissant des
   zones vides : on n'est jamais obligé de couvrir toute la durée d'un
   macro-créneau, ni de créer un besoin pour chaque mission sur chaque
   sous-créneau. Une zone laissée vide n'est pas une anomalie (§6.2, §6.3,
   §7.4).
3. **Indicatifs** — positionner les binômes (ou plus) sur les besoins créés
   (§6.3).
4. **Disponibilités et contraintes** — consulter les disponibilités et les
   souhaits déclarés par les bénévoles (§6.4).
5. **Algorithme** — le lancer pour qu'il répartisse les bénévoles sur les
   indicatifs positionnés (§7).

Toute correction manuelle ultérieure (§7.5) s'inscrit dans ce même parcours,
sans en sortir : elle ajuste le résultat de l'étape 5 sans revenir sur les
étapes 1 à 4.

## 2. Objectifs mesurables

| # | Objectif | Indicateur |
| --- | --- | --- |
| O1 | Produire un planning complet sans saisie manuelle initiale | % de places pourvues automatiquement |
| O2 | Respecter les souhaits des bénévoles | % de souhaits « artiste » et « mission » satisfaits |
| O3 | Rendre les cas impossibles explicites | toute place non pourvue est listée avec sa cause |
| O4 | Permettre l'ajustement à chaud | temps pour remplacer un bénévole absent, sans impact sur le reste du planning |
| O5 | Rester exploitable hors du widget | toute donnée métier lisible dans une vue native Grist |

## 3. Glossaire

| Terme | Définition |
| --- | --- |
| **Macro-créneau** | Grande plage de temps structurante (ex. « Samedi après-midi »). Peut franchir minuit (ex. 22h–2h) : voir §6.2. |
| **Sous-créneau** | Découpage d'un macro-créneau correspondant à une rotation de bénévoles. |
| **Jour de festival** | Journée d'affichage regroupant les créneaux, calculée depuis une heure de coupure paramétrable (6h par défaut) plutôt qu'à minuit civil, pour ne jamais couper une soirée en deux (§6.2). Concept purement visuel, jamais stocké. |
| **Quart d'heure** | Unité de granularité du planning. Toutes les bornes sont alignées sur 00/15/30/45. |
| **Mission** | Tâche à tenir (bar, accueil, sécurité…), avec un besoin en effectif. |
| **Besoin** | Couple (mission, sous-créneau) avec un effectif minimum et maximum. |
| **Groupe / indicatif** | Place théorique nommée (ex. « B1 », §6.3) créée avant toute affectation, jamais automatiquement. Un groupe de taille 2 est un binôme, de taille 3 un trinôme, de taille *n* un *n*-uplet. |
| **Place** | Emplacement individuel dans un groupe. C'est l'unité affectée à un bénévole. |
| **Équipe** | Regroupement opérationnel de bénévoles, avec une cheffe d'équipe. |
| **Disponibilité** | État déclaré d'un bénévole sur une plage : indisponible, disponible, ou « souhaite voir un artiste ». |
| **Affectation** | Association d'un bénévole à une place. |
| **Verrouillage** | Marquage d'une affectation comme intouchable par l'algorithme. |

## 4. Acteurs et rôles

| Rôle | Besoin principal | Accès |
| --- | --- | --- |
| Coordination (Antoine) | construire le planning, lancer l'algorithme, arbitrer, seul point de modification du planning | lecture/écriture complète |
| Cheffe d'équipe | consulter son équipe et ses missions, signaler un problème (absence, place vide) | lecture, signalement |
| Bénévole | connaître son planning personnel | pas d'accès direct au document en v1 ; diffusion par export ou impression |
| Auditeur (DINUM) | relire le code et les traitements de données | lecture du dépôt de code (hors périmètre du document Grist) |

Les cheffes d'équipe n'écrivent pas directement dans le planning : elles
consultent leur équipe et signalent (absence, problème) via un mécanisme dédié
(par exemple un statut à cocher ou une entrée dans le journal), et c'est la
coordination qui valide et modifie. Cela évite les conflits d'édition entre
plusieurs personnes sur les mêmes données. *(Décision Antoine, 2026-09-21 :
« consultent, signalent ».)*

## 5. Contraintes structurantes

### 5.1 Contrainte A — lisibilité native Grist

Toute donnée métier est stockée dans des tables Grist normales, avec des colonnes
typées et des références explicites. Conséquences :

- pas de champ « fourre-tout » JSON pour les données métier ;
- une affectation = une ligne lisible (bénévole, mission, créneau, groupe) ;
- les libellés sont humainement compréhensibles, y compris les indicatifs ;
- seules les données purement algorithmiques (état interne du solveur, traces de
  calcul, instantanés de version) peuvent être stockées sous une forme non
  directement exploitable, et sont alors isolées dans des tables dédiées et
  clairement nommées ;
- **le widget crée lui-même les tables PlanningPlus qui lui manquent**
  (`widget/src/grist/creation.ts`), colonnes et affichage compris, pour
  qu'un document Grist tout neuf suffise comme point de départ — sans import
  d'un fichier modèle, qui n'est plus le chemin nominal. Portée strictement
  aux tables du schéma PlanningPlus (§6) qui n'existent pas encore : une
  table déjà présente n'est jamais recréée ni modifiée par ce mécanisme, et
  **aucune table étrangère** du document (posée par un autre usage du même
  document Grist) n'est jamais touchée, créée ou lue. Suppressions et
  modifications de schéma sont permises, mais seulement sur les tables
  PlanningPlus, jamais sur une table étrangère. *(Renversement assumé par
  Antoine, 2026-09-22, de sa décision du 2026-09-21 au soir — voir aussi
  §5.4 : l'argument d'audit donné ce matin-là est écarté par lui-même.)*

### 5.2 Contrainte B — auditabilité

- Code lisible, structuré en modules à responsabilité unique, commenté là où
  l'intention n'est pas évidente.
- Aucun appel réseau sortant depuis le widget en dehors de l'API Grist :
  toutes les ressources (polices, scripts) sont embarquées, aucun CDN. Cohérent
  avec l'hébergement sur GitHub Pages, qui ne sert que des fichiers statiques.
- Pas d'exécution de code dynamique (`eval`, `new Function`), échappement
  systématique de tout contenu issu des données lors du rendu.
- Dépendances tierces minimales, épinglées, et justifiées une par une.
- Traitement des données personnelles documenté (nature, finalité, durée).
- Une passe d'audit de sécurité est prévue en fin de projet.

### 5.3 Contrainte C — ajustement à chaud

Environ 20 % des éléments du planning bougent le jour J. L'architecture doit donc
séparer :

1. **la structure** (macro-créneaux, sous-créneaux, missions, besoins, groupes) —
   stable ;
2. **l'affectation** (qui occupe quelle place) — volatile.

Un changement d'affectation ne doit jamais imposer de recalcul global. Le moteur
doit savoir résoudre un sous-problème borné : « repourvoir ces *k* places, tout
le reste étant verrouillé ».

### 5.4 Persistance et accès concurrent (précision du 2026-09-21)

Répond à une exigence du message d'ouverture d'Antoine — « il faut pouvoir
sauvegarder, dans une table/colonne dédiée sur Grist » — qui découlait déjà
des contraintes A et B mais n'avait pas été rassemblée en un seul endroit.

- **Une seule source de vérité : le document Grist.** Le widget n'a ni base de
  données ni serveur à lui (cohérent avec la contrainte B : hébergement
  statique GitHub Pages, aucun appel réseau hors API Grist). Tout ce qui doit
  survivre à la fermeture du navigateur, ou être visible depuis un autre
  poste, est écrit dans une table Grist via l'API du plugin — le planning
  (§6) bien sûr, mais aussi l'état de travail du widget qui a une valeur
  d'audit ou de reproductibilité : verrouillages (`Places.Verrouillee`, déjà
  une colonne native, §6.3), paramétrage de l'algorithme (`Parametres`,
  §7.2), heure de coupure du jour de festival (§3, §6.2).
- **Ce qui peut rester dans le navigateur.** Seules les préférences
  d'affichage sans conséquence sur le planning ou sur l'audit (colonnes
  visibles, onglet ouvert, filtre courant) peuvent vivre en stockage local du
  navigateur ; leur perte au changement de poste est sans gravité,
  contrairement à tout ce qui précède.
- **Accès concurrent.** La coordination est le seul point d'écriture du
  planning (§4) : les cheffes d'équipe consultent et signalent mais n'écrivent
  jamais dans les mêmes données, ce qui évite par construction le cas de
  conflit le plus visible — une cheffe d'équipe qui consulte pendant qu'on
  réaffecte (§4, décision « consultent, signalent »). Le risque résiduel,
  propre à la coordination elle-même — une correction manuelle et un recalcul
  d'algorithme qui se chevauchent dans le temps — est déjà couvert par le
  mécanisme du §7.3 : le recalcul ne touche jamais une place verrouillée, et
  toute proposition (y compris une permutation le jour J) est présentée en
  aperçu avant validation plutôt qu'appliquée directement. Grist gère
  lui-même la synchronisation des écritures concurrentes au niveau du
  document ; ce point n'appelle pas de mécanisme supplémentaire pour la v1.
- **Aucun mode démonstration : le widget ne vise que l'intérieur d'un
  document Grist (retiré le 2026-09-23, retour d'Antoine).** « Ce n'est même
  pas la peine de prévoir un cas pour le widget lancé en dehors de Grist, ça
  n'a pas de sens, il ne sera utilisé que dans Grist » — le jeu de données
  factice, le délai de détection d'hôte et l'écran dédié « hors Grist » sont
  retirés, pas seulement désactivés : aucun code ne les remplace. Deux issues
  restent, une fois la connexion à un document Grist établie : toutes les
  tables PlanningPlus attendues existent (vides ou non) → connecté, sur les
  vraies données, y compris à vide, un document flambant neuf étant le
  premier jour d'un vrai utilisateur et non une panne (§1.1) ; il en manque
  au moins une, ou une écriture échoue (création de table comprise, §5.1) →
  un écran nomme précisément ce qui manque ou a échoué. Lancé hors d'un
  document Grist, le widget échoue simplement à sa première requête, sans
  écran dédié pour ce cas — accepté comme non-problème par Antoine, pour ne
  pas alourdir le code d'un chemin que personne n'emprunte.

## 6. Modèle de données

> Noms de tables et de colonnes provisoires. La structure a été éprouvée par
> la maquette (§6.2 et §6.3 notamment) ; ce qui reste ouvert est signalé au
> fil du texte, section par section, plutôt que par un statut global.

### 6.1 Référentiel

| Table | Colonnes principales |
| --- | --- |
| `Equipes` | `Nom`, `Referent` (→ `Benevoles`), `Couleur` |
| `Benevoles` | `Nom`, `Contact`, `Equipe` (→ `Equipes`), `Quota_heures_min`, `Quota_heures_max`, `Statut` (actif / absent), `Notes` |
| `Lieux` | `Nom`, `Description` |
| `Artistes` | `Nom`, `Lieu` (→ `Lieux`, optionnel), `Debut`, `Fin` |

**Lieu facultatif (précisé le 2026-09-23).** `Missions.Lieu` et
`Artistes.Lieu` sont tous deux optionnels : Antoine ne se sert pas encore des
lieux, et rien ne doit bloquer une création faute d'en choisir un. Les deux
formulaires de création proposent une option « — aucun — », et son absence
s'affiche comme un champ vide plutôt qu'une erreur.

### 6.2 Structure temporelle

| Table | Colonnes principales |
| --- | --- |
| `Macro_creneaux` | `Nom`, `Debut`, `Fin`, `Duree_sous_creneau_defaut` (quart d'heure, optionnel) |
| `Sous_creneaux` | `Nom`, `Macro_creneau` (→), `Mission` (→, optionnel), `Debut`, `Fin` |

Les bornes sont des date-heures alignées sur le quart d'heure. Le découpage au
quart d'heure n'est pas matérialisé en base : il est dérivé des bornes au moment
du calcul. Cela évite une table de plusieurs dizaines de milliers de lignes et
garde les vues natives lisibles.

**Découpage automatique en sous-créneaux (ajouté le 2026-09-22, V0.1, §11.1,
point 3).** Un macro-créneau porte une durée par défaut de sous-créneau
(`Duree_sous_creneau_defaut`, un multiple du quart d'heure). Un geste dans le
widget découpe alors automatiquement la plage `Debut`–`Fin` du macro-créneau
en `Sous_creneaux` successifs de cette durée, dernier tronçon possiblement
plus court si la plage n'est pas un multiple exact — ce geste ne fait
qu'insérer des lignes dans `Sous_creneaux` (§5.1, pas de table créée). Une
fois posés, ces sous-créneaux se corrigent, se suppriment ou se complètent à
la main comme n'importe quel sous-créneau (trou et chevauchement restent
tolérés, §6.2 plus bas). Le découpage automatique est une facilité de saisie,
jamais une contrainte : rien n'empêche des sous-créneaux de durées inégales
posés à la main.

Par défaut, les sous-créneaux d'un macro-créneau sont communs à toutes les
missions (une seule grille de rotation). La colonne `Mission` reste vide dans
ce cas. Une mission dont le rythme diffère (rotation plus courte ou plus
longue) peut définir ses propres sous-créneaux en la renseignant : ses
sous-créneaux communs sont alors ignorés pour elle et remplacés par les
siens. *(Décision Antoine, 2026-09-21 : « communs, avec exceptions ».)*

**Grille Missions : un axe commun au quart d'heure (précisé le 2026-09-22).**
La vue Missions (§8.2) présente les sous-créneaux communs et les
sous-créneaux propres à une mission sur une même frise, un axe temporel au
quart d'heure partagé par toutes les lignes. Cliquer la piste d'une mission y
crée un sous-créneau propre à elle ; glisser un bloc le décale par crans de
15 minutes (la suite du même sous-créneau, s'il y en a une, suit) ; ALT
maintenu le redimensionne depuis le bord saisi. **L'affichage est fin, le
modèle ne l'est pas** : un sous-créneau reste une seule ligne de
`Sous_creneaux`, quel que soit le geste qui l'a posé ou ajusté.

**Modification en place, jamais suppression-recréation (invariant ajouté le
2026-09-22).** Décaler ou redimensionner un sous-créneau qui porte déjà un
`Besoin` modifie cette ligne sur place, en conservant son identifiant : un
`Besoin` ne référence que l'identifiant de son `Sous_creneau`, jamais ses
horaires, donc une suppression suivie d'une recréation l'orphelinerait
silencieusement (`Besoins.Sous_creneau` retomberait à vide, Grist ne
cascadant pas les suppressions). Seule la pose d'un tout premier sous-créneau
sur une mission (aucun besoin encore dessus) peut passer par une création
pure. Cette règle s'applique à tout geste d'édition d'un sous-créneau
existant, pas seulement au glisser de la grille.

**Suppression d'un macro-créneau (ajouté le 2026-09-22, garde-fou complété le
2026-09-23).** Un macro-créneau se supprime depuis l'Agenda (§8.1). Le geste
est refusé par défaut, motif affiché, si l'un de ses sous-créneaux porte déjà
un `Besoin`, ou est propre à une mission même sans `Besoin` encore dessus
(`Sous_creneau.Mission` non vide) — pour ne jamais faire disparaître
silencieusement une mission déjà positionnée. *(Un écart entre les deux
formes de ce garde-fou, relevé le 2026-09-23 en relisant le code — la
suppression ne couvrait que les besoins, contrairement au découpage
automatique voisin depuis la veille — a été corrigé le jour même.)*

**Suppression forcée (ajoutée le 2026-09-23, retour d'Antoine).** Quand ce
refus par défaut bloque, un geste « supprimer quand même » passe outre,
après confirmation qui annonce le décompte exact (sous-créneaux, besoins,
binômes positionnés). Cascade alors, en un seul aller-retour, dans cet
ordre : les positions de groupe (`Positions_groupe`) sur les besoins des
sous-créneaux du macro-créneau, ces `Besoins`, tous ses `Sous_creneaux`
(communs et propres), puis le macro-créneau lui-même — Grist ne cascadant
pas les suppressions, chaque ligne qui ne vit que par ce qui part est
supprimée explicitement. **Les `Missions` et les `Groupes` (indicatifs,
avec leurs `Places`) ne sont jamais supprimés** : un indicatif positionné ici
redevient seulement libre (sa ligne `Groupe` et son roster de `Places` sont
indépendants de `Positions_groupe`, §6.3), prêt à se repositionner ailleurs.

Les sous-créneaux d'un même macro-créneau ne sont **pas** tenus de former une
partition stricte. *(Décision Antoine, 2026-09-21 : « tolérée, signalée ».)*
Cette tolérance recouvre deux cas bien distincts, précisés le 2026-09-21 après
un premier passage trop large :

- un **trou** (aucun sous-créneau sur une partie du macro-créneau) est un état
  normal et volontaire — rien ne se passe à 4h du matin — jamais bloqué et
  jamais signalé ; ce n'est pas une anomalie (voir aussi §7.4) ;
- un **chevauchement** (deux sous-créneaux qui se recouvrent dans le temps,
  au sein du même macro-créneau) n'est pas bloqué à la saisie non plus, mais
  reste, lui, remonté dans la vue anomalies pour correction : le plus souvent
  une erreur de saisie (bornes mal ajustées), mais possiblement un choix
  volontaire (deux missions dont les rythmes de rotation diffèrent, §6.2 plus
  haut), d'où « à surveiller » et non bloquant.

**À ne pas confondre avec un double engagement (§7.1, §7.4).** Un
chevauchement de sous-créneaux est une propriété de la *structure* du planning
(deux tranches horaires qui se recouvrent) ; il n'implique pas qu'un bénévole
soit affecté aux deux à la fois. Le double engagement d'un bénévole — la même
personne sur deux places dont les quarts d'heure se recouvrent — est une
question d'*affectation*, traitée comme une contrainte dure de l'algorithme
(§7.1) et cataloguée séparément (§7.4, anomalie « Double engagement »).

**Franchissement de minuit (règle explicitée le 2026-09-21, suite à un cas
rencontré sur la maquette).** Une soirée de festival qui va de 22h à 2h le
lendemain est le cas normal, pas une exception : toutes les bornes de temps du
modèle (`Macro_creneaux.Debut/Fin`, `Sous_creneaux.Debut/Fin`,
`Disponibilites.Quart_heure`, les horaires des `Artistes`) sont des
**date-heures absolues** (un horodatage unique sur tout l'événement), jamais un
couple (jour, heure locale) ni un indice de quart d'heure remis à zéro à
minuit. Un macro-créneau 22h–2h est donc une seule ligne, avec `Fin`
postérieure à `Debut` d'un jour calendaire ; ses sous-créneaux et les quarts
d'heure de disponibilité qui le couvrent suivent la même logique, sans
découpage ni recodage à minuit. Par construction, aucun calcul du modèle
(couverture d'un besoin, détection de chevauchement, recherche de
disponibilité) ne doit donc jamais recalculer ou dépendre d'un « jour
calendaire » : tout se compare sur l'axe absolu du temps. *(Confirmé par le
générateur de données de test, `dev/seed/temps.mjs`, qui stocke déjà tout en
horodatage Unix.)*

Le regroupement par **jour de festival**, utile à l'affichage (colonnes de
l'agenda, filtres, feuilles de route), est un concept dérivé et purement
visuel, distinct du jour calendaire civil — il ne doit jamais être stocké ni
servir de clé de calcul. Un jour de festival ne bascule pas à minuit mais à
une **heure de coupure paramétrable** (par défaut 6h du matin, réglable par
document pour s'adapter à un événement qui se termine plus tôt ou continue
jusqu'à l'aube) : un macro-créneau qui commence à 22h et finit à 2h appartient
tout entier au jour de festival qui a commencé la veille à l'heure de coupure,
jamais scindé entre deux jours d'affichage.

### 6.3 Besoins, indicatifs et places

| Table | Colonnes principales |
| --- | --- |
| `Missions` | `Nom`, `Lieu` (→, optionnel), `Equipe` (→), `Priorite`, `Competences_requises`, `Description` |
| `Besoins` | `Mission` (→), `Sous_creneau` (→), `Effectif_min`, `Effectif_max`, `Taille_groupe` |
| `Groupes` | `Code` (indicatif, ex. « B1 » — voir nomenclature ci-dessous), `Taille`, `Equipe` (→) |
| `Positions_groupe` | `Groupe` (→), `Besoin` (→) |
| `Places` | `Groupe` (→), `Rang` (1..*n*), `Benevole` (→), `Origine` (algorithme / manuel), `Verrouillee` (booléen), `Score` |

**Création d'une mission depuis le widget (décision Antoine, 2026-09-22, cadrage
de la V0.1, §11.1).** Le widget permet de créer une `Mission` sans passer par
la table Grist native — une écriture de ligne dans `Missions`, pas une
création de table (voir §5.1). Ça répond à la question, posée puis retirée,
de savoir si le référentiel se saisit dans le widget ou uniquement dans
Grist : pour les missions, la réponse est le widget. **Antoine n'a nommé que
les missions** ; rien n'est tranché pour `Equipes`, `Lieux`, `Benevoles` et
`Artistes`, qui restent en saisie native Grist jusqu'à ce qu'il le demande —
ne pas généraliser au-delà de ce qu'il a écrit.

**Zone volontairement vide (précision du 2026-09-21, voir aussi §1.1 et §6.2).**
Un `Besoin` n'existe que s'il a été créé délibérément pour un couple (mission,
sous-créneau) : il n'y a pas de ligne « à zéro » générée par défaut. L'absence
de `Besoin` signifie simplement qu'aucune personne n'est requise à cet endroit
— ce n'est jamais une anomalie et ça ne doit jamais apparaître dans le
catalogue du §7.4. Ce n'est qu'une fois un `Besoin` créé que son effectif
minimum peut, ou non, être atteint (voir « Sous-effectif », juste en dessous,
et §7.4).

**Aucun binôme automatique à la création d'un besoin (renversé le 2026-09-22,
reprend la décision du 2026-09-21 ci-dessous).** Créer un `Besoin` ne pose
plus de `Groupe` dessus : les indicatifs se créent librement et
explicitement depuis la vue Indicatifs (§7.5), autant qu'on veut, un geste
« + positionner un binôme » par besoin puis « + binôme » pour en ajouter
d'autres. La vue affiche un repère non bloquant, **« ≈*N* binômes »**, où
*N* = `Besoin.Effectif_min` ÷ 2 arrondi au-dessus : une indication de
dimensionnement, jamais une création ni un blocage — le besoin peut rester
sans indicatif, en avoir moins ou plus que ce repère, sans anomalie propre à
cet écart (l'anomalie « sous-effectif » du §7.4 reste la seule mesure qui
compte, sur l'effectif réellement pourvu). `Besoins.Taille_groupe` continue
de fixer la taille des indicatifs qu'on y pose (binôme par défaut, trinôme ou
plus si réglé).

**Nomenclature des codes d'indicatif (ajoutée le 2026-09-22).** `Groupes.Code`
suit une séquence unique pour tout le document, indépendante des équipes :
A1 à Z1, puis A2 à Z2, et ainsi de suite, en sautant tout code déjà pris
(y compris un ancien format hérité) pour ne jamais réattribuer un code
existant. L'équipe d'un indicatif reste `Groupes.Equipe`, une colonne à part
— jamais un préfixe du code.

**Effectif minimum et maximum (précision du 2026-09-21).** En interface, seul
l'effectif minimum est mis en avant : c'est lui qui déclenche l'alerte visuelle
et l'anomalie « sous-effectif » quand il n'est pas atteint (§7.4). Dépasser
l'effectif maximum ne bloque plus rien — un renfort ponctuel reste possible —
mais remonte comme anomalie « sur-effectif » plutôt que d'être empêché. Ce
n'est donc plus une contrainte dure de l'algorithme (§7.1, révisé en
conséquence).

**Couleur de la puce, vue Indicatifs (tranché par Antoine, carte de décision,
2026-09-24).** Verte si l'indicatif est pourvu, rouge s'il ne l'est pas sur
une mission `Critique`, orange s'il ne l'est pas sur une mission `Normale` ou
`Confort` — évalué créneau par créneau : une même puce peut être verte sur un
besoin et rouge sur un autre, puisque c'est le créneau (donc son besoin, donc
sa mission) qui porte la priorité, pas l'indicatif dans l'absolu. **Pourvu**
exige que toutes les `Places` du binôme (ou *n*-uplet) soient occupées ; une
seule place manquante reste un trou, jamais une nuance de vert. *(Livré le
2026-09-23 22h17, `1db04d4` ; provisoire jusqu'à confirmation, tranché
définitivement par Antoine le 2026-09-24 — rien à changer dans le code.)*

**Révision du modèle initial (décision Antoine, 2026-09-21).** Un indicatif
(`Groupes`) n'est plus rattaché à un seul besoin : il est positionné à l'avance
sur autant de besoins que nécessaire via `Positions_groupe`, y compris sur des
missions différentes d'un sous-créneau à l'autre. Exemple concret donné par
Antoine à l'époque du cadrage : l'indicatif « Beta12 » est positionné sur le
bar à 14h, puis sur la sécurité à 15h ; le binôme réel qui occupe Beta12 (les
deux `Places` de rang 1 et 2) est le même sur les deux créneaux, seule la
mission change. Le principe illustré reste inchangé, mais le code lui-même
ne suit plus ce format : voir la nomenclature ci-dessus (A1, B1…). C'est ce
mécanisme qui porte à la fois :

- la **stabilité des binômes** (un indicatif = un binôme qui ne change pas
  d'identité au sein d'une journée, résolvant du même coup la question de la
  rotation : ce sont les *missions* qui tournent d'un sous-créneau à l'autre,
  pas les personnes) ;
- l'**ajustement à chaud** (contrainte C) : déplacer un indicatif d'un besoin à
  un autre, ou changer sa composition, ne touche qu'une ligne de
  `Positions_groupe` ou de `Places`, jamais l'ensemble du planning.

`Places` reste la table centrale du résultat : une ligne = une personne dans un
indicatif, sur un rang donné. Croisée avec `Positions_groupe`, elle donne « qui
est où et quand », et les deux tables restent lisibles et filtrables nativement
dans Grist (par mission, par équipe, par bénévole ou par créneau).

La généralisation binôme → trinôme → *n*-uplet est portée par la seule colonne
`Taille` : aucune structure n'est spécifique à la taille 2.

**Mécanisme validé (Antoine, 2026-09-21).** La première maquette avait
implémenté ce mécanisme fidèlement (vue Indicatifs : un indicatif, sa
trajectoire sur plusieurs missions, un repositionnement qui ne touche qu'une
ligne de `Positions_groupe`), mais Antoine avait jugé cette première vue
catastrophique et inutilisable — un verdict sur l'interface, pas sur le
modèle. En reconstruisant la vue, le fil maquette a rapporté que la
séparation tenait à l'usage (le déplacement d'un indicatif ne touche
toujours qu'une ligne) et que le vrai problème était l'interface, qui
exposait les indicatifs dans une liste déconnectée du planning plutôt que
dans la grille missions × sous-créneaux. Une fois cette interface refaite,
Antoine a confirmé explicitement, par carte de décision, que le
fonctionnement correspond à ce qu'il veut. Le §6.3 est donc validé : la
séparation `Groupes` / `Positions_groupe` / `Places` et le principe « les
missions tournent, pas les personnes » sont acquis pour la suite du
développement.

### 6.4 Préférences des bénévoles

| Table | Colonnes principales |
| --- | --- |
| `Disponibilites` | `Benevole` (→), `Quart_heure` (date-heure, début du quart), `Statut` (Indisponible / Disponible / Souhaite voir artiste), `Artiste` (→, si applicable) |
| `Souhaits_missions` | `Benevole` (→), `Mission` (→), `Preference` (échelle, du refus au souhait fort) |
| `Affinites` | `Benevole_A` (→), `Benevole_B` (→), `Type` (ensemble / éviter) |

Une ligne par bénévole et par quart d'heure. *(Décision Antoine, 2026-09-21 :
stockage par quart d'heure plutôt que par intervalle.)* Pour l'ordre de
grandeur donné (70 bénévoles, 5 jours), cela reste de l'ordre de 15 000 à
20 000 lignes selon l'amplitude horaire couverte par jour — une table filtrable
et triable par bénévole ou par date, donc encore raisonnable dans les vues
natives Grist. Un formulaire ou une vue en grille (bénévole × quart d'heure)
sera nécessaire côté widget pour que la saisie reste pratique malgré le volume
de lignes ; c'est un des écrans à prévoir (voir §8, vue disponibilités).

L'absence de ligne pour un bénévole sur un quart d'heure donné vaut
**indisponible** : on n'affecte jamais quelqu'un par défaut, seule une
disponibilité explicitement déclarée ouvre la possibilité d'une affectation.
*(Décision Antoine, 2026-09-21.)*

### 6.5 Versions et traçabilité

| Table | Colonnes principales |
| --- | --- |
| `Versions` | `Nom`, `Date`, `Auteur`, `Commentaire`, `Instantane` (données sérialisées) |
| `Journal` | `Date`, `Auteur`, `Action`, `Place` (→), `Avant`, `Apres`, `Motif` |
| `Parametres` | `Cle`, `Valeur` (poids des objectifs du §7.2 — l'ordre, lui, n'est pas paramétrable — heure de coupure du jour de festival du §6.2, etc. — voir §5.4) |

`Versions.Instantane` est la seule donnée volontairement non lisible nativement ;
elle sert à revenir à un état antérieur et à comparer deux planifications. Le
`Journal` reste, lui, parfaitement lisible : une ligne = une modification,
qui, quand, avant/après et pourquoi. `Parametres` est la table qui porte tout
réglage ayant un effet sur le résultat ou sur l'audit ; c'est elle qui rend
explicite la règle du §5.4 (rien de significatif ne vit hors du document).

## 7. Principes de l'algorithme d'affectation

### 7.1 Contraintes dures (jamais violées)

1. Un bénévole n'occupe qu'une place à la fois : pas de recouvrement, au quart
   d'heure près (anomalie « Double engagement » si violée malgré tout, §7.4 —
   à distinguer d'un chevauchement de sous-créneaux, qui est une question de
   structure et non d'affectation, §6.2).
2. Un bénévole n'est affecté que sur des quarts d'heure où il est disponible.
3. Les compétences requises par la mission sont détenues par le bénévole.
4. Une affectation verrouillée n'est jamais déplacée.
5. **Un bénévole n'a qu'un seul indicatif par jour (macro-créneau)** : une
   fois affecté à un indicatif, il y reste pour toute la journée — c'est
   l'indicatif entier qui doit être compatible, pas seulement le créneau en
   cours de remplissage (voir §6.3 : « les missions tournent, pas les
   personnes »). *(Antoine, 2026-09-23 20h38, dans le fil Algorithme.)*

   *(Posée le 2026-09-23 20h38, câblée le jour même par le fil Algorithme,
   commit `7fc0b30` : `evaluerEligibilite` refuse désormais un candidat déjà
   affecté à un *autre* indicatif sur le même macro-créneau, même sans
   chevauchement de quarts — raison `autre_indicatif_meme_jour`. S'ajoute à
   la vérification déjà correcte de la disponibilité sur `quartsParGroupe`,
   l'ensemble des quarts de toutes les positions de l'indicatif, pas
   seulement celle en cours de remplissage. Deux points restent en attente
   d'une réponse d'Antoine, volontairement non écrits ici : que faire d'une
   violation de cette règle introduite à la main dans Grist (anomalie
   éventuelle, §7.4), et si cette contrainte doit un jour être assouplie.)*

*(L'effectif maximum d'un besoin n'est plus une contrainte dure : le dépasser
reste possible — un renfort ponctuel — et remonte en anomalie « sur-effectif »
plutôt que d'être bloqué. Décision Antoine, 2026-09-21 ; voir §6.3 et §7.4.)*

### 7.2 Objectifs (pondérés, dans l'ordre demandé)

1. **Couverture** : atteindre l'effectif minimum de chaque besoin, en pondérant
   par la priorité de la mission. Un besoin qui ne peut être couvert qu'en
   affectant quelqu'un contre son souhait reste sous-staffé plutôt que
   forcé ; c'est remonté dans la vue anomalies, pas un échec silencieux.
   *(Ce renvoi visait jusqu'ici « l'objectif 3 », le souhait de mission —
   voir plus bas : sorti du classement le 2026-09-25, y compris son volet
   « jamais forcé sur une mission explicitement écartée », faute de
   précision contraire d'Antoine.)*
   *(Décision Antoine, 2026-09-21 : « sous-staffée » plutôt que « forcer la
   mission ».)* *(Antoine, 2026-09-23 17h49, a redemandé ce même
   comportement en le motivant par le risque de pénurie de bénévoles à un
   instant donné — il était déjà en place avant sa demande :
   `Mission.Priorite` (Critique/Normale/Confort), réglable à la création
   d'une mission (`grille.ts`), comportement de pénurie prouvé par test
   (`affectation.test.ts`, « sert le groupe de priorité Critique avant
   celui de priorité Confort quand un seul candidat existe pour les deux »).
   Il manque un écran pour changer la priorité d'une mission déjà créée —
   Missions étant gelée (voir consignes en vigueur), ce champ se modifie en
   attendant directement dans la table `Missions` du document Grist.)*
2. **Binôme souhaité** : bonus/malus de score entre deux bénévoles qui ont
   demandé à être « Ensemble » ou à s'« Éviter » (table `Affinites`, §6.4).
   Distinct de l'objectif 6 : celui-ci porte sur la stabilité de l'indicatif
   dans son ensemble d'un macro-créneau à l'autre, pas sur un souhait nommé
   entre deux bénévoles précis. *(Confirmé par Antoine le 2026-09-23 15h45 ;
   câblage effectif le jour même par le fil Algorithme d'affectation, qui
   jusque-là calculait ce score sans jamais le lire — voir
   `versDonneesPlanning` dans `widget/src/moteur/adaptateur-magasin.ts`.)*
   « Leur affinité, niveau maximum » (Antoine, 2026-09-25 11h47) : reste le
   premier critère de départage, devant l'artiste souhaité — inchangé depuis
   le renversement du 2026-09-23 17h49 (« par défaut on va valider le binôme
   souhaité »), qui avait déjà mis ce critère devant l'artiste. *(Note pour
   le fil Algorithme d'affectation, toujours valable : les deux mécanismes
   ne sont pas au même niveau structurel. Un conflit avec un artiste sépare
   déjà les candidats en deux pools — `propre`/`secours` — tenté l'un après
   l'autre avant même le calcul du score (`affectation.ts`) ; le binôme
   souhaité n'est qu'un terme du score (`poids.affiniteEnsemble: 0.1` /
   `affiniteEviter: -0.1`, contre `poids.conflitArtiste: -0.4`, voir
   `moteur/types.ts`). Un simple réglage des poids ne suffira probablement
   pas à faire passer le binôme devant dans tous les cas : la partition en
   deux pools reste à revoir.)*
3. **Artiste souhaité** : ne pas placer un bénévole sur un quart d'heure où
   il a déclaré vouloir voir un artiste. Préférence forte mais non absolue :
   violable seulement si aucune autre solution n'existe pour couvrir un
   besoin, et alors signalée. *(Décision Antoine, 2026-09-21 : « préférence
   forte », pas une interdiction absolue.)* La disponibilité elle-même n'est
   **pas** dans cette liste d'objectifs : c'est une contrainte dure (§7.1,
   règle 2), toujours strictement prioritaire sur tout ce qui suit — un
   bénévole indisponible sur le quart d'heure n'est même pas candidat.
   *(« Leur dispo, niveau maximum », Antoine, 2026-09-25 11h47 : déjà le cas
   depuis toujours, en tant que contrainte dure jamais arbitrée — pas une
   erreur à corriger, une reconfirmation.)*

   **Seuil de 30 minutes, pas le créneau entier** : voir un artiste au moins
   30 minutes d'affilée suffit à déclencher cette préférence ; en dessous de
   30 minutes de passage, le passage entier compte. *(Décision Antoine,
   2026-09-23 22h01, tranchée par le coordinateur sur la règle des 30
   minutes d'affilée ; déjà câblée le jour même —
   `SEUIL_MINUTES_VOIR_ARTISTE` dans `widget/src/moteur/temps.ts`, commit
   `09f9bb1`.)*

   **Position dans le classement** : objectif 2 jusqu'au 2026-09-23 17h49,
   objectif 7 jusqu'au 2026-09-25 11h47, désormais objectif 3 (« Artiste
   souhaité : au moins 30mn priorité haute », Antoine) — toujours derrière
   le binôme souhaité, mais remonte devant l'équipe, l'équité et la
   continuité (objectifs 4 à 6 ci-dessous).
4. **Équipe** : à égalité sur les critères précédents, préférer un bénévole de
   la même équipe que le groupe/indicatif à couvrir. Jamais un blocage : un
   bénévole hors équipe reste éligible, et c'est même souhaitable s'il
   correspond mieux aux objectifs 1 à 3 ou si personne de l'équipe n'est
   disponible. *(Décision Antoine, 2026-09-21, question 5.2 : « toléré si
   besoin » plutôt qu'une contrainte dure. Ce point comblait un trou du
   document — la règle était appliquée sans être écrite ici ; le fil
   Algorithme d'affectation en a demandé confirmation à Antoine dans son
   propre fil, à recouper si sa réponse nuance celle-ci.)*
5. **Équité** : équilibrer le nombre d'heures et la répartition des missions
   marquées « pénibles » entre bénévoles.
6. **Continuité** : limiter le nombre de missions différentes par bénévole. Ne
   s'applique plus à la stabilité des binômes, portée nativement par le
   mécanisme des indicatifs (§6.3) plutôt que par un objectif d'algorithme.

**Missions souhaitées, sorti du classement le 2026-09-25 11h47** (« on
oublie choix de la missions SAUF pour restauration », Antoine) : c'était
l'objectif 3 jusqu'ici — privilégier les missions que le bénévole
souhaite, ne jamais l'affecter à une mission qu'il a explicitement
écartée. Antoine ne dit pas si son « on oublie » ne vise que la préférence
positive ou aussi le refus explicite ; les deux sont donc traités comme
abandonnés en l'absence de précision contraire, plutôt que de deviner
laquelle des deux moitiés il veut garder. **Exception « restauration »** :
ce que ça signifie concrètement n'est pas encore défini côté code — le fil
Algorithme choisit un défaut et le fait confirmer, plutôt que d'être
deviné ici.

Les poids relatifs de ces six objectifs sont paramétrables ; leur **ordre**,
lui, est une propriété structurelle de l'algorithme fixée par ce document,
pas par le paramétrage. *(Précision du 2026-09-23 : `ParametresAlgorithme`
ne rend réglables que les poids, jamais l'ordre — voir
`widget/src/moteur/types.ts`.)* Le paramétrage des poids est stocké dans le
document pour être audité et rejoué, dans une table dédiée (`Parametres` :
`Cle`, `Valeur` — voir aussi §5.4) plutôt que dans le code du widget, pour
rester visible et modifiable sans déploiement.

### 7.3 Propriétés attendues

- **Déterminisme** : à données et paramètres identiques, résultat identique.
- **Explicabilité** : chaque affectation porte son score et, pour chaque place
  non pourvue, la raison du blocage (aucun disponible, tous refusent, conflit
  artiste…).
- **Résolution partielle** : le moteur accepte un périmètre restreint de places à
  (re)pourvoir, le reste du planning étant traité comme figé. C'est le mécanisme
  qui sert la contrainte C. En cas d'annulation le jour J, le recalcul peut
  aller jusqu'à permuter d'autres bénévoles déjà affectés dans ce périmètre
  restreint si cela donne une meilleure solution — jamais hors périmètre, et
  toujours avec un aperçu des permutations proposées avant validation.
  *(Décision Antoine, 2026-09-21 : « permutations autorisées », plutôt que de
  ne jamais toucher aux places déjà pourvues.)*

### 7.4 Catalogue des anomalies

La première maquette a implémenté cinq types d'anomalies ; le retour
d'Antoine en ajoute un sixième (sur-effectif) et confirme un septième déjà
décidé mais pas encore construit (chevauchement, §6.2). Un huitième, le double
engagement, était déjà une contrainte dure de l'algorithme (§7.1) sans avoir
son entrée ici — comblé le 2026-09-21 après une divergence entre les fils
Algorithme et Interface d'affectation sur ce que « chevauchement » recouvrait
(voir la note sous le tableau). Deux niveaux de gravité, repris tels quels de
la maquette : **à corriger** (une règle a été violée, ce qui ne devrait
arriver que par une correction manuelle qui l'a introduite) et **à
surveiller** (un état normal du système, à regarder mais jamais bloquant).

| Type | Gravité | Déclencheur |
| --- | --- | --- |
| Sous-effectif | À corriger | Le besoin n'atteint pas son effectif minimum (§7.2 : jamais forcé contre un souhait). |
| Souhait refusé | À corriger | Un bénévole occupe une place sur une mission qu'il a explicitement refusée. |
| Indisponibilité | À corriger | Un bénévole occupe une place sur un quart d'heure où il est indisponible. |
| Double engagement | À corriger | Un bénévole occupe deux places dont les quarts d'heure se recouvrent (§7.1, règle 1). Ne devrait survenir que par une édition directe des tables Grist, hors du widget — l'interface d'affectation le refuse déjà à la saisie. |
| Sur-effectif | À surveiller | Le besoin dépasse son effectif maximum. *(Nouveau, décision Antoine, 2026-09-21 : n'est plus bloqué, voir §6.3.)* |
| Conflit artiste | À surveiller | Un bénévole occupe une place pendant le passage d'un artiste qu'il veut voir (préférence forte violée en dernier recours, §7.2). |
| Chevauchement de créneaux | À surveiller | Deux sous-créneaux d'un même macro-créneau se chevauchent dans le temps (§6.2) — indépendamment de qui est affecté dessus. Décidé, pas encore construit dans la première maquette. |
| Hors quota | À surveiller | Un bénévole dépasse son quota d'heures maximum. |

Cette liste s'enrichira avec le développement, mais le principe reste le même
pour toute nouvelle anomalie : signaler plutôt que bloquer, sauf les quatre
premières qui signent une vraie violation de règle.

**Chevauchement de créneaux vs double engagement (précision du 2026-09-21,
demandée par les fils Algorithme et Interface d'affectation).** Ce sont deux
choses différentes, à garder comme deux entrées distinctes dans ce catalogue
et dans toute union de types côté code :

- **Chevauchement de créneaux** porte sur la *structure* du planning (deux
  `Sous_creneaux` qui se recouvrent dans le temps) ; il n'implique rien sur
  qui est affecté dessus, et peut être volontaire (§6.2).
- **Double engagement** porte sur l'*affectation* (un bénévole sur deux
  places qui se recouvrent) ; c'est toujours une erreur, jamais un choix, et
  c'est pour cela que l'interface d'affectation le refuse en amont plutôt que
  de le laisser remonter — cette entrée du catalogue est le filet de
  sécurité pour le cas, résiduel, d'une édition directe des tables.

**Zone vide vs sous-effectif (précision du 2026-09-21, voir §1.1 et §6.3).**
Ce catalogue ne concerne que les besoins réellement créés. Une zone
volontairement laissée vide — pas de sous-créneau sur une partie du
macro-créneau (§6.2), ou pas de `Besoin` pour tel couple mission/sous-créneau
(§6.3) — n'est *jamais* une anomalie et n'entre dans aucune des lignes
ci-dessus, en particulier pas « Sous-effectif ». Cette dernière ne se déclenche
que pour un `Besoin` qui existe et dont l'effectif minimum n'est pas atteint.
Sans cette distinction, tout planning partiel — le cas normal en cours de
construction — remonterait une avalanche de faux positifs.

### 7.5 Parcours d'affectation et de correction

C'est le cœur de l'outil. Le fil Interface d'affectation en a livré une
première version maquettée (glisser un bénévole sur une place vide, glisser
une place occupée sur une autre pour échanger deux personnes, un retour
immédiat sur ce que chaque dépôt répare ou casse), sur des fonctions
provisoires en attendant le branchement du vrai moteur du fil Algorithme. Ce
qui suit reste la référence sur ce que ce parcours doit couvrir,
indépendamment de l'interface retenue.

1. **Lancement de l'algorithme, toujours dans le contexte d'un seul jour**
   (macro-créneau) : il ne balaie jamais le festival entier en une fois, les
   affectations se gèrent jour par jour. *(Décision Antoine, 2026-09-24
   4h38 — complète l'exclusivité par jour du §7.1 : cohérent, puisqu'un
   indicatif ne peut de toute façon tenir qu'un seul jour à la fois. Annule
   la formulation précédente, qui laissait entendre un lancement sur tout
   le planning.)* Il ne crée jamais de `Groupe` ni de `Positions_groupe` :
   il remplit les `Places` déjà positionnées (§6.3) pour le jour affiché, en
   respectant les contraintes dures (§7.1) et en pondérant selon les
   objectifs (§7.2). *(Écart connu au 2026-09-24 : le bouton « Lancer
   l'algorithme » de la vue Affectation appelle aujourd'hui
   `lancerAlgorithme(m)` sans restreindre le périmètre au jour affiché — il
   couvre encore tout le festival en une fois. À corriger par le fil
   Algorithme pour se conformer à cette décision.)*
2. **Réinitialisation complète**, un geste distinct du lancement : vide et
   déverrouille chaque `Place` de tout le festival, corrections manuelles
   verrouillées comprises — y compris une place verrouillée restée vide,
   sinon l'algorithme l'ignore pour toujours (§7.1). Irréversible :
   confirmation explicite annonçant le nombre de places concernées avant
   d'agir. *(Demande d'Antoine, 2026-09-23 20h38, livrée le jour même par le
   fil Algorithme — `Magasin.reinitialiserAffectations`. Portée
   volontairement le festival entier, pas le seul jour affiché ; peut
   devenir réglable par jour si Antoine le redemande — pas encore le cas.)*
3. **Listing des bénévoles limité au jour affiché** : le panneau de
   sélection ne montre que les bénévoles ayant déclaré au moins une
   disponibilité (y compris « veut voir un artiste », pas seulement
   « disponible ») sur les macro-créneaux du jour en cours — un bénévole
   sans aucune disponibilité déclarée ce jour-là n'y figure pas. *(Demande
   d'Antoine, 2026-09-23 20h38, livrée le jour même par le fil
   Algorithme.)*
4. **Résultat** : chaque `Place` remplie porte `Origine = Algorithme` et un
   `Score` ; chaque `Place` non pourvue reste vide et alimente l'anomalie
   « sous-effectif » (§7.4).
5. **Correction manuelle, place par place.** Pour toute place, pourvue ou
   non : voir les bénévoles éligibles, classés par le même score que
   l'algorithme et avec la même explication (équipe, souhait, artiste,
   quota — §7.2) ; choisir un bénévole dans cette liste l'affecte ; vider une
   place la libère. Une place modifiée à la main passe `Origine = Manuel` et
   `Verrouillee = vrai` : un recalcul ultérieur, global ou partiel, ne la
   touche plus tant qu'elle n'est pas déverrouillée explicitement (cohérent
   avec §7.1 et la réponse à la question 6.6 du cadrage). Ce verrouillage
   n'a de sens que si on le voit et qu'on peut le défaire :
   - **Signalement** : une place verrouillée se distingue visuellement,
     partout où elle apparaît (grille, vue affectation, feuille de route) —
     un cadenas ou un équivalent, jamais une différence de couleur seule
     (accessibilité, §9 NF6). Un recalcul qui la traverse sans la toucher
     doit rester lisible comme volontaire, pas comme un oubli.
   - **Déverrouillage** : un geste explicite, symétrique de l'affectation
     manuelle (une action directement sur la place verrouillée), jamais un
     effet de bord d'une autre opération. Une fois déverrouillée, la place
     redevient une place normale, éligible au prochain recalcul comme
     n'importe quelle autre.

   Sans ces deux points, quelqu'un qui corrige à la main ne comprend pas
   pourquoi un recalcul ignore son travail — c'est le genre de silence qui se
   paie le jour J.
6. **Correction manuelle, indicatif par indicatif.** Un indicatif peut être
   repositionné d'un besoin à un autre — une seule ligne de `Positions_groupe`
   change, rien d'autre (§6.3) — sans toucher aux personnes qui l'occupent.
   Il peut aussi être **ajouté** sur un second besoin sans quitter le
   premier — une nouvelle ligne de `Positions_groupe`, l'ancienne restant en
   place — pour l'usage central du §6.3 (un indicatif positionné sur
   plusieurs besoins à la fois). *(Distinction geste par geste ajoutée le
   2026-09-23 : glisser déplace, Alt maintenu pendant le dépôt ajoute.)*
7. **Recalcul partiel** après une correction manuelle ou une absence
   déclarée : relancer l'algorithme sur le seul périmètre affecté reprend les
   places encore vides sans toucher aux places verrouillées (§7.3, §5.3).
8. **Anomalies à jour en continu** (§7.4) : chaque correction met à jour la
   vue anomalies immédiatement, jamais en différé.

C'est ce parcours, plus que les vues de consultation, qui décide si l'outil
fait gagner du temps le jour J.

## 8. Vues attendues

Liste de travail, à arbitrer (voir le brainstorm dans le fil et la
[liste de questions](questions-cadrage.md#9-vues-et-ux)).

**Le macro-créneau est l'ossature de l'application, pas une entité parmi
d'autres** (Décision Antoine, 2026-09-23 17h18) : ses bornes découpent le
festival en jours, et ce découpage sert d'axe et de **filtre global à
toutes les vues** — bénévoles et artistes compris, pas seulement la grille
Missions (point 2 ci-dessous) où il a été construit en premier. Une vue qui
calerait son propre découpage en jours sur autre chose que les
macro-créneaux (c'était le cas de la vue Artistes, voir point 8) est un
écart à corriger, jamais une variante voulue.

Techniquement, ce filtre global vit dans la coquille de l'application
(`app.ts`) : un drapeau `DefinitionOnglet.filtreJour` marque les vues qui
s'y accrochent, `demarrerApp` monte alors au-dessus d'elles un bandeau
commun (`construireBandeauJours`, dans `ui/bandeauJours.ts`), et la
sélection elle-même vit dans le magasin (`Magasin.macroCreneauSelectionne`,
modifiée par `Magasin.selectionnerMacroCreneau`). Il se branche vue par vue,
pas d'un coup : au 2026-09-23, Missions, Disponibilités et Artistes portent
`filtreJour: true` ; Indicatifs, Affectation et Terrain calent déjà leurs
jours sur les mêmes macro-créneaux mais gardent encore leur propre
sélecteur de jour, non partagé avec les autres vues — chantier en cours,
vue par vue, pas un défaut à signaler à nouveau. Un fil qui branche une
nouvelle vue sur ce filtre n'a que le drapeau à poser : le mécanisme est
déjà générique.

1. **Agenda** — création, édition et suppression des macro-créneaux et
   sous-créneaux, en horizontal (la disposition verticale et le comparatif
   envisagés en cadrage ont été abandonnés). Permet aussi le découpage
   automatique en sous-créneaux d'une durée par défaut (§6.2, §11.1 point 3).
   La suppression d'un macro-créneau est refusée, motif affiché, si un
   besoin y est déjà positionné (garde-fou partiel, voir §6.2).
2. **Grille mission × sous-créneau** — qui est où, la vue des cheffes
   d'équipe. Présentée en frise (§6.2) : un axe commun au quart d'heure, une
   piste par mission, clic pour créer un sous-créneau propre à la mission,
   glisser pour le décaler, ALT maintenu pour le redimensionner. Les
   sous-créneaux communs restent modifiables depuis l'Agenda (§8.1).
3. **Vue tension** — couverture par mission et par quart d'heure, trous et
   sur-effectifs.
4. **Vue anomalies** — liste des cas à traiter, structurée par le catalogue du
   §7.4 (sous-effectif, sur-effectif, souhait refusé, indisponibilité,
   conflit artiste, chevauchement, hors quota).
5. **Vue affectation manuelle** — le parcours décrit au §7.5 : candidats
   classés par pertinence pour chaque place, repositionnement d'un indicatif
   d'un besoin à un autre. La vue la plus critique de l'outil ; maquettée
   (glisser-déposer pour affecter ou échanger), sur des fonctions
   provisoires en attendant le branchement du vrai moteur d'affectation.
6. **Vue bénévole** — la feuille de route individuelle, imprimable.
7. **Vue équipe** — une équipe sur toute la durée, par groupe.
8. **Vue artistes** — qui joue quand, et combien de bénévoles veulent le voir.
   Permet aussi de créer et modifier un passage (nom, lieu, début, fin) : la
   table `Artistes` est un passage par ligne (§6), donc un artiste qui joue
   plusieurs fois se déclare en plusieurs lignes du même nom, sans qu'il
   faille distinguer « artiste » et « passage » dans le modèle. Le formulaire
   de création/édition saisit le passage en durée libre, sans le découpage en
   sous-créneaux ni le pas de 15 minutes utilisés pour l'agenda.
   *(Demande Antoine, 2026-09-22.)*

   Présentée en frise, sur le même principe que la grille Missions (§8.2) :
   chaque artiste est une ligne, ses passages des blocs posés sur un axe
   commun au quart d'heure. Glisser un bloc le déplace, ALT maintenu le
   redimensionne depuis le bord saisi — ce geste se cale au quart d'heure
   (l'axe de la frise), même si le formulaire reste en durée libre. Cliquer
   la piste d'une ligne crée un nouveau passage pour ce même artiste, nom
   verrouillé. Un passage n'est rattaché à aucun macro-créneau **en base**
   (`Artistes` n'a pas de colonne macro-créneau) : c'est seulement l'axe
   *affiché* qui s'aligne dessus, pas le modèle de données.

   **L'axe et le découpage en jours suivent les macro-créneaux, comme
   toutes les autres vues** (Décision Antoine, 2026-09-23 17h18 — voir la
   note en tête du §8 — qui **annule** la décision ci-dessous du
   2026-09-22 : « l'axe de chaque jour se calcule à partir des passages de
   ce jour, pas des macro-créneaux »). Ce premier choix laissait la vue
   entièrement vide tant qu'aucun artiste n'y avait été créé, sans jamais
   montrer les jours du festival déjà posés dans l'Agenda — cause directe
   du mécontentement d'Antoine le 2026-09-23. **Corrigé et posé** (commit
   `3efdfec`, fil Vue artistes, 2026-09-23) : la vue s'accroche désormais au
   filtre global par macro-créneau (`filtreJour: true`), création du passage
   toujours en deux temps (voir ci-dessus).
9. **Vue jour J** — ce qui tourne maintenant, absences et remplacements.
10. **Vue disponibilités** — saisie et correction rapides.

## 9. Exigences non fonctionnelles

| # | Exigence | Cible |
| --- | --- | --- |
| NF1 | Volumétrie supportée | de l'ordre de 100 bénévoles, 5 jours, 20 missions, 20 artistes, une dizaine d'équipes (marge au-delà du cas concret d'Antoine : 70 bénévoles, 5 jours, 20 artistes, 3 équipes) |
| NF2 | Temps de calcul complet | moins de 10 secondes dans le navigateur, pour la volumétrie ci-dessus |
| NF3 | Temps de recalcul partiel | quelques secondes, perçu comme immédiat |
| NF4 | Fonctionnement hors ligne | non requis ; lecture confortable sur mobile mais connexion réseau nécessaire |
| NF5 | Navigateurs cibles | versions récentes de Firefox et Chromium sur ordinateur, Safari et Chrome sur mobile |
| NF6 | Accessibilité | bonnes pratiques (contrastes, navigation clavier, libellés), sans audit RGAA formel en v1 |
| NF7 | Tests | batterie de tests unitaires exhaustive, rejouée à chaque fonctionnalité majeure |

## 10. Hors périmètre (v1)

- Envoi de notifications aux bénévoles (SMS, e-mail).
- Collecte des disponibilités auprès des bénévoles (formulaire amont).
- Gestion des ressources matérielles.

## 11. Étapes

1. Cadrage : questions, puis ce cahier des charges. **Fait**, tenu à jour en
   continu au fil des fils de développement plutôt que clos une fois pour
   toutes.
2. Maquette interactive, validée avant tout développement. **Faite** —
   plusieurs vues rejouées et corrigées sur retour d'Antoine (§1.1, §6.3,
   §7.5).
3. Développement itératif, avec batterie de tests tenue à jour. **En cours**,
   démarré le 2026-09-22 : Antoine passe le projet en mode agile, par
   incréments courts plutôt qu'un développement d'un seul tenant. Voir §11.1
   pour le premier incrément (V0.1) et son périmètre.
4. Passe d'audit de sécurité et de lisibilité du code.

### 11.1 V0.1 — premier incrément (agile)

*(Périmètre donné par Antoine, 2026-09-22, dans le fil du projet — voir aussi
[questions de cadrage](questions-cadrage.md). Ce cahier des charges décrit le
produit complet ; cette sous-section fixe ce qui doit fonctionner pour que la
V0.1 soit considérée faite, sans qu'il faille réécrire le document à chaque
nouvel incrément. Les incréments suivants s'ajouteront ici au fur et à
mesure, sans remplacer celui-ci.)*

1. **Macro-créneaux** — les positionner (date et heure) dans une interface
   soignée et sobre (§6.2, vue Agenda du §8).
2. **Missions** — les créer depuis le widget (§6.3, décision ci-dessus).
3. **Sous-créneaux** — définir une durée par défaut sur un macro-créneau et y
   placer des sous-créneaux, avec une option de découpage automatique de la
   plage selon cette durée (§6.2, mécanisme ajouté le 2026-09-22).
4. **Indicatifs** — une page dédiée qui crée les indicatifs et permet de les
   répartir sur les sous-créneaux simplement (glisser-déposer et/ou clic),
   §6.3 et §7.5 ; la page existe déjà côté maquette (fil Page Indicatifs).

**Périmètre technique (confirmé par Antoine, 2026-09-22 : « on ne parle plus
de la maquette »).** La V0.1 est du code réel dans le widget, écrivant dans
un vrai document Grist — pas la maquette Artifact isolée, qui n'est plus la
cible. Une fonctionnalité qui ne vivrait que sur un jeu de données factice
n'est pas livrée. *(Mise à jour du 2026-09-23 : le mode démonstration évoqué
ici la veille a depuis été retiré, pas seulement laissé de côté — voir
§5.4.)*

Hors de ce périmètre pour la V0.1 (mais dans le produit complet décrit
ailleurs dans ce document) : l'algorithme d'affectation, le catalogue
d'anomalies, le verrouillage et la correction manuelle, les autres vues du
§8. Rien n'empêche un fil d'avancer dessus en parallèle si Antoine le
demande ; ce n'est simplement pas ce qui définit la V0.1 comme faite.

**État au 2026-09-23 (relevé sur le code et les commits, pas une déclaration
de « fait »).** Les quatre points ont du code écrit et poussé sur `main` :
macro-créneaux (Agenda, création/édition/suppression), missions (création
depuis le widget), découpage automatique de sous-créneaux, page Indicatifs
(création libre de binômes, plus d'automatisme, §6.3). Un défaut d'affichage
bloquant était en cours de correction chez le fil Intégration à cette date
(un bloc de frise inatteignable au clic derrière sa piste). Ce document
décrit ce que le code fait ; il ne se prononce pas sur le go donné à Antoine
pour tester, qui reste la décision du fil qui porte l'intégration.
