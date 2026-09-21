# PlanningPlus — Cahier des charges

**Version :** v1.1 (intègre les retours sur la première maquette, 2026-09-21)
**Statut :** structure et règles en grande partie validées ; le mécanisme
d'indicatifs (§6.3) et le parcours d'affectation/correction (§7.5) restent à
valider sur une maquette refaite — la première a été jugée inutilisable à
l'usage
**Dernière mise à jour :** 2026-09-21

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
| **Groupe / indicatif** | Place théorique nommée (ex. « BAR-B2 ») créée avant toute affectation. Un groupe de taille 2 est un binôme, de taille 3 un trinôme, de taille *n* un *n*-uplet. |
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
  clairement nommées.

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

## 6. Modèle de données proposé (v0)

> Proposition à valider. Les noms de tables et de colonnes sont provisoires.

### 6.1 Référentiel

| Table | Colonnes principales |
| --- | --- |
| `Equipes` | `Nom`, `Referent` (→ `Benevoles`), `Couleur` |
| `Benevoles` | `Nom`, `Contact`, `Equipe` (→ `Equipes`), `Quota_heures_min`, `Quota_heures_max`, `Statut` (actif / absent), `Notes` |
| `Lieux` | `Nom`, `Description` |
| `Artistes` | `Nom`, `Lieu` (→ `Lieux`), `Debut`, `Fin` |

### 6.2 Structure temporelle

| Table | Colonnes principales |
| --- | --- |
| `Macro_creneaux` | `Nom`, `Debut`, `Fin` |
| `Sous_creneaux` | `Nom`, `Macro_creneau` (→), `Mission` (→, optionnel), `Debut`, `Fin` |

Les bornes sont des date-heures alignées sur le quart d'heure. Le découpage au
quart d'heure n'est pas matérialisé en base : il est dérivé des bornes au moment
du calcul. Cela évite une table de plusieurs dizaines de milliers de lignes et
garde les vues natives lisibles.

Par défaut, les sous-créneaux d'un macro-créneau sont communs à toutes les
missions (une seule grille de rotation). La colonne `Mission` reste vide dans
ce cas. Une mission dont le rythme diffère (rotation plus courte ou plus
longue) peut définir ses propres sous-créneaux en la renseignant : ses
sous-créneaux communs sont alors ignorés pour elle et remplacés par les
siens. *(Décision Antoine, 2026-09-21 : « communs, avec exceptions ».)*

Les sous-créneaux d'un même macro-créneau ne sont **pas** tenus de former une
partition stricte : un trou ou un chevauchement n'est pas bloqué à la saisie,
il est simplement remonté dans la vue anomalies pour correction. *(Décision
Antoine, 2026-09-21 : « tolérée, signalée ».)*

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
| `Missions` | `Nom`, `Lieu` (→), `Equipe` (→), `Priorite`, `Competences_requises`, `Description` |
| `Besoins` | `Mission` (→), `Sous_creneau` (→), `Effectif_min`, `Effectif_max`, `Taille_groupe` |
| `Groupes` | `Code` (indicatif, ex. « Beta12 »), `Taille`, `Equipe` (→) |
| `Positions_groupe` | `Groupe` (→), `Besoin` (→) |
| `Places` | `Groupe` (→), `Rang` (1..*n*), `Benevole` (→), `Origine` (algorithme / manuel), `Verrouillee` (booléen), `Score` |

**Dimensionnement par défaut d'un besoin (décision Antoine, 2026-09-21).** À la
création, un besoin reçoit un seul binôme (un `Groupe` de `Taille` 2, positionné
dessus via une ligne `Positions_groupe`). Si l'effectif nécessaire dépasse ce
qu'un binôme peut fournir, un second binôme est ajouté explicitement sur le
même besoin plutôt que d'agrandir le premier. C'est un défaut de création, pas
une limite : `Besoins.Taille_groupe` reste le réglage qui permet de partir
directement sur des trinômes ou plus quand une mission l'exige vraiment.

**Effectif minimum et maximum (précision du 2026-09-21).** En interface, seul
l'effectif minimum est mis en avant : c'est lui qui déclenche l'alerte visuelle
et l'anomalie « sous-effectif » quand il n'est pas atteint (§7.4). Dépasser
l'effectif maximum ne bloque plus rien — un renfort ponctuel reste possible —
mais remonte comme anomalie « sur-effectif » plutôt que d'être empêché. Ce
n'est donc plus une contrainte dure de l'algorithme (§7.1, révisé en
conséquence).

**Révision du modèle initial (décision Antoine, 2026-09-21).** Un indicatif
(`Groupes`) n'est plus rattaché à un seul besoin : il est positionné à l'avance
sur autant de besoins que nécessaire via `Positions_groupe`, y compris sur des
missions différentes d'un sous-créneau à l'autre. Exemple concret donné par
Antoine : l'indicatif « Beta12 » est positionné sur le bar à 14h, puis sur la
sécurité à 15h ; le binôme réel qui occupe Beta12 (les deux `Places` de rang 1
et 2) est le même sur les deux créneaux, seule la mission change. C'est ce
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

*Point ouvert, toujours en attente de validation (mise à jour du
2026-09-21).* La première maquette a implémenté ce mécanisme fidèlement (vue
Indicatifs : un indicatif, sa trajectoire sur plusieurs missions, un
repositionnement qui ne touche qu'une ligne de `Positions_groupe`). Antoine a
jugé cette vue catastrophique et inutilisable — un verdict sur l'interface,
pas sur le modèle : il n'a pas remis en cause la séparation `Groupes` /
`Positions_groupe` / `Places`. Le §6.3 reste donc non validé, dans l'attente
d'une maquette refaite qui permette de le tester pour de vrai.

*Éprouvé à la construction (2026-09-21, à confirmer par Antoine).* En
reconstruisant la vue, le fil maquette rapporte que la séparation tient à
l'usage : déplacer un indicatif d'une case à une autre ne touche toujours
qu'une seule ligne de `Positions_groupe`, sans rien recalculer d'autre. Son
diagnostic sur la première version : le problème venait de l'interface, qui
exposait les indicatifs dans une liste déconnectée du planning, pas de la
séparation elle-même. La nouvelle version les montre directement dans la
grille missions × sous-créneaux et y surligne la trajectoire d'un indicatif.
C'est une observation de construction, pas le verdict d'Antoine — qui n'a pas
encore vu cette version — donc le statut « non validé » ci-dessus reste
inchangé tant qu'il ne s'est pas prononcé sur le lien unique republié par le
fil maquette.

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

`Versions.Instantane` est la seule donnée volontairement non lisible nativement ;
elle sert à revenir à un état antérieur et à comparer deux planifications. Le
`Journal` reste, lui, parfaitement lisible : une ligne = une modification,
qui, quand, avant/après et pourquoi.

## 7. Principes de l'algorithme d'affectation

### 7.1 Contraintes dures (jamais violées)

1. Un bénévole n'occupe qu'une place à la fois : pas de recouvrement, au quart
   d'heure près.
2. Un bénévole n'est affecté que sur des quarts d'heure où il est disponible.
3. Les compétences requises par la mission sont détenues par le bénévole.
4. Une affectation verrouillée n'est jamais déplacée.

*(L'effectif maximum d'un besoin n'est plus une contrainte dure : le dépasser
reste possible — un renfort ponctuel — et remonte en anomalie « sur-effectif »
plutôt que d'être bloqué. Décision Antoine, 2026-09-21 ; voir §6.3 et §7.4.)*

### 7.2 Objectifs (pondérés, dans l'ordre demandé)

1. **Couverture** : atteindre l'effectif minimum de chaque besoin, en pondérant
   par la priorité de la mission — **sans jamais y sacrifier l'objectif 3**
   (voir ci-dessous). Un besoin qui ne peut être couvert qu'en affectant
   quelqu'un contre son souhait reste sous-staffé plutôt que forcé ; c'est
   remonté dans la vue anomalies, pas un échec silencieux. *(Décision Antoine,
   2026-09-21 : « sous-staffée » plutôt que « forcer la mission ».)*
2. **Disponibilité et artistes souhaités** : ne pas placer un bénévole sur un
   quart d'heure où il a déclaré vouloir voir un artiste. Préférence très
   forte mais non absolue : violable seulement si aucune autre solution
   n'existe pour couvrir un besoin, et alors signalée. *(Décision Antoine,
   2026-09-21 : « préférence forte », pas une interdiction absolue.)*
3. **Missions souhaitées** : privilégier les missions que le bénévole
   souhaite, ne jamais l'affecter à une mission qu'il a explicitement
   écartée (voir objectif 1).
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

L'ordre et les poids relatifs sont paramétrables, et le paramétrage est stocké
dans le document pour être audité et rejoué.

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
décidé mais pas encore construit (chevauchement, §6.2). Deux niveaux de
gravité, repris tels quels de la maquette : **à corriger** (une règle a été
violée, ce qui ne devrait arriver que par une correction manuelle qui l'a
introduite) et **à surveiller** (un état normal du système, à regarder mais
jamais bloquant).

| Type | Gravité | Déclencheur |
| --- | --- | --- |
| Sous-effectif | À corriger | Le besoin n'atteint pas son effectif minimum (§7.2 : jamais forcé contre un souhait). |
| Souhait refusé | À corriger | Un bénévole occupe une place sur une mission qu'il a explicitement refusée. |
| Indisponibilité | À corriger | Un bénévole occupe une place sur un quart d'heure où il est indisponible. |
| Sur-effectif | À surveiller | Le besoin dépasse son effectif maximum. *(Nouveau, décision Antoine, 2026-09-21 : n'est plus bloqué, voir §6.3.)* |
| Conflit artiste | À surveiller | Un bénévole occupe une place pendant le passage d'un artiste qu'il veut voir (préférence forte violée en dernier recours, §7.2). |
| Chevauchement de créneaux | À surveiller | Deux sous-créneaux d'un même macro-créneau se chevauchent (§6.2). Décidé, pas encore construit dans la première maquette. |
| Hors quota | À surveiller | Un bénévole dépasse son quota d'heures maximum. |

Cette liste s'enrichira avec le développement, mais le principe reste le même
pour toute nouvelle anomalie : signaler plutôt que bloquer, sauf les trois
premières qui signent une vraie violation de règle.

### 7.5 Parcours d'affectation et de correction

C'est le cœur de l'outil, et le retour d'Antoine sur la première maquette est
clair sur ce point : ce parcours n'était ni écrit finement ni maquetté. Ce qui
suit cadre ce qu'une version refaite doit couvrir, indépendamment de
l'interface retenue.

1. **Lancement de l'algorithme**, sur tout le planning ou sur un périmètre
   choisi (une mission, un macro-créneau — §7.3). Il ne crée jamais de
   `Groupe` ni de `Positions_groupe` : il remplit les `Places` déjà
   positionnées (§6.3), en respectant les contraintes dures (§7.1) et en
   pondérant selon les objectifs (§7.2).
2. **Résultat** : chaque `Place` remplie porte `Origine = Algorithme` et un
   `Score` ; chaque `Place` non pourvue reste vide et alimente l'anomalie
   « sous-effectif » (§7.4).
3. **Correction manuelle, place par place.** Pour toute place, pourvue ou
   non : voir les bénévoles éligibles, classés par le même score que
   l'algorithme et avec la même explication (équipe, souhait, artiste,
   quota — §7.2) ; choisir un bénévole dans cette liste l'affecte ; vider une
   place la libère. Une place modifiée à la main passe `Origine = Manuel` et
   `Verrouillee = vrai` : un recalcul ultérieur, global ou partiel, ne la
   touche plus tant qu'elle n'est pas déverrouillée explicitement (cohérent
   avec §7.1 et la réponse à la question 6.6 du cadrage).
4. **Correction manuelle, indicatif par indicatif.** Un indicatif peut être
   repositionné d'un besoin à un autre — une seule ligne de `Positions_groupe`
   change, rien d'autre (§6.3, mécanisme encore en attente de validation sur
   son ergonomie) — sans toucher aux personnes qui l'occupent.
5. **Recalcul partiel** après une correction manuelle ou une absence
   déclarée : relancer l'algorithme sur le seul périmètre affecté reprend les
   places encore vides sans toucher aux places verrouillées (§7.3, §5.3).
6. **Anomalies à jour en continu** (§7.4) : chaque correction met à jour la
   vue anomalies immédiatement, jamais en différé.

C'est ce parcours, plus que les vues de consultation, qui décide si l'outil
fait gagner du temps le jour J — il doit être le premier maquetté en détail à
la prochaine itération.

## 8. Vues attendues

Liste de travail, à arbitrer (voir le brainstorm dans le fil et la
[liste de questions](questions-cadrage.md#9-vues-et-ux)).

1. **Agenda** — création et édition des macro-créneaux et sous-créneaux, en mode
   semaine ou par jours choisis à la main, sans exigence de continuité.
2. **Grille mission × sous-créneau** — qui est où, la vue des cheffes d'équipe.
3. **Vue tension** — couverture par mission et par quart d'heure, trous et
   sur-effectifs.
4. **Vue anomalies** — liste des cas à traiter, structurée par le catalogue du
   §7.4 (sous-effectif, sur-effectif, souhait refusé, indisponibilité,
   conflit artiste, chevauchement, hors quota).
5. **Vue affectation manuelle** — le parcours décrit au §7.5 : candidats
   classés par pertinence pour chaque place, repositionnement d'un indicatif
   d'un besoin à un autre. La vue la plus critique de l'outil, et la moins
   aboutie à ce stade : la première maquette n'en proposait qu'une ébauche,
   jugée inutilisable.
6. **Vue bénévole** — la feuille de route individuelle, imprimable.
7. **Vue équipe** — une équipe sur toute la durée, par groupe.
8. **Vue artistes** — qui joue quand, et combien de bénévoles veulent le voir.
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

1. Cadrage : questions, puis ce cahier des charges. **En cours.**
2. Maquette interactive, validée avant tout développement.
3. Développement itératif, avec batterie de tests tenue à jour.
4. Passe d'audit de sécurité et de lisibilité du code.
