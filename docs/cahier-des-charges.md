# PlanningPlus — Cahier des charges

**Version :** v0 (socle rédigé avant les réponses de cadrage)
**Statut :** en cours de rédaction
**Dernière mise à jour :** 2026-09-21

> Les sections marquées `[À CONFIRMER]` dépendent des réponses aux
> [questions de cadrage](questions-cadrage.md). Le numéro entre crochets renvoie
> à la question correspondante.

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
| **Macro-créneau** | Grande plage de temps structurante (ex. « Samedi après-midi »). |
| **Sous-créneau** | Découpage d'un macro-créneau correspondant à une rotation de bénévoles. |
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

| Rôle | Besoin principal | `[À CONFIRMER]` |
| --- | --- | --- |
| Coordination (Antoine) | construire le planning, lancer l'algorithme, arbitrer | — |
| Cheffe d'équipe | voir son équipe et ses missions, signaler les absences | périmètre d'écriture [Q8.1] |
| Bénévole | connaître son planning personnel | accès direct ou non [Q8.3] |
| Auditeur (DINUM) | relire le code et les traitements de données | [Q8.5] |

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
- Pas d'appel réseau sortant depuis le widget en dehors de l'API Grist
  `[À CONFIRMER Q12.3]`.
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
garde les vues natives lisibles `[À CONFIRMER Q3.1]`.

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

### 6.3 Besoins et places

| Table | Colonnes principales |
| --- | --- |
| `Missions` | `Nom`, `Lieu` (→), `Equipe` (→), `Priorite`, `Competences_requises`, `Description` |
| `Besoins` | `Mission` (→), `Sous_creneau` (→), `Effectif_min`, `Effectif_max`, `Taille_groupe` |
| `Groupes` | `Code` (indicatif, ex. « BAR-B2 »), `Besoin` (→), `Taille`, `Equipe` (→) |
| `Places` | `Groupe` (→), `Rang` (1..*n*), `Benevole` (→), `Origine` (algorithme / manuel), `Verrouillee` (booléen), `Score` |

`Places` est la table centrale du résultat : une ligne = une personne sur une
mission à un moment donné. Elle reste lisible telle quelle dans Grist, triable et
filtrable par mission, par équipe, par bénévole ou par créneau.

La généralisation binôme → trinôme → *n*-uplet est portée par la seule colonne
`Taille` : aucune structure n'est spécifique à la taille 2.

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
`Journal` reste, lui, parfaitement lisible `[À CONFIRMER Q10.1]`.

## 7. Principes de l'algorithme d'affectation

### 7.1 Contraintes dures (jamais violées)

1. Un bénévole n'occupe qu'une place à la fois : pas de recouvrement, au quart
   d'heure près.
2. Un bénévole n'est affecté que sur des quarts d'heure où il est disponible.
3. Les compétences requises par la mission sont détenues par le bénévole.
4. L'effectif maximum d'un besoin n'est jamais dépassé.
5. Une affectation verrouillée n'est jamais déplacée.

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
4. **Équité** : répartir la charge et les créneaux ingrats
   `[À CONFIRMER Q6.3]`.
5. **Continuité** : limiter le nombre de missions différentes par bénévole, et
   garder les binômes stables quand c'est possible `[À CONFIRMER Q5.5]`.

L'ordre et les poids relatifs sont paramétrables, et le paramétrage est stocké
dans le document pour être audité et rejoué.

### 7.3 Propriétés attendues

- **Déterminisme** : à données et paramètres identiques, résultat identique.
- **Explicabilité** : chaque affectation porte son score et, pour chaque place
  non pourvue, la raison du blocage (aucun disponible, tous refusent, conflit
  artiste…).
- **Résolution partielle** : le moteur accepte un périmètre restreint de places à
  (re)pourvoir, le reste du planning étant traité comme figé. C'est le mécanisme
  qui sert la contrainte C.

## 8. Vues attendues

Liste de travail, à arbitrer (voir le brainstorm dans le fil et la
[liste de questions](questions-cadrage.md#9-vues-et-ux)).

1. **Agenda** — création et édition des macro-créneaux et sous-créneaux, en mode
   semaine ou par jours choisis à la main, sans exigence de continuité.
2. **Grille mission × sous-créneau** — qui est où, la vue des cheffes d'équipe.
3. **Vue tension** — couverture par mission et par quart d'heure, trous et
   sur-effectifs.
4. **Vue anomalies** — liste des cas à traiter : places vides, souhaits non
   satisfaits, bénévoles hors quota.
5. **Vue affectation manuelle** — placement assisté, avec les candidats classés
   par pertinence.
6. **Vue bénévole** — la feuille de route individuelle, imprimable.
7. **Vue équipe** — une équipe sur toute la durée, par groupe.
8. **Vue artistes** — qui joue quand, et combien de bénévoles veulent le voir.
9. **Vue jour J** — ce qui tourne maintenant, absences et remplacements.
10. **Vue disponibilités** — saisie et correction rapides.

## 9. Exigences non fonctionnelles

| # | Exigence | Cible |
| --- | --- | --- |
| NF1 | Volumétrie supportée | `[À CONFIRMER Q1.1]` |
| NF2 | Temps de calcul complet | `[À CONFIRMER Q6.8]` |
| NF3 | Temps de recalcul partiel | quelques secondes, perçu comme immédiat |
| NF4 | Fonctionnement hors ligne | `[À CONFIRMER Q1.6]` |
| NF5 | Navigateurs cibles | `[À CONFIRMER Q12.4]` |
| NF6 | Accessibilité | `[À CONFIRMER Q1.7]` |
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
