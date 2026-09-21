# PlanningPlus — Questions de cadrage

**Statut :** en attente de réponses
**Dernière mise à jour :** 2026-09-21

Chaque question est accompagnée d'un **défaut proposé** : à défaut de réponse,
c'est l'hypothèse qui sera retenue dans le cahier des charges. Répondre « ok »
sur un bloc entier est donc une réponse valable.

Les réponses seront reportées ici au fil de l'eau, sous chaque question.

---

## 1. Cadre et environnement

| # | Question | Défaut proposé |
| --- | --- | --- |
| 1.1 | Ordres de grandeur : combien de bénévoles, de missions, de macro-créneaux, de sous-créneaux, d'artistes, d'équipes, et sur combien de jours ? | 300 bénévoles, 30 missions, 6 macro-créneaux sur 3 jours, 8 sous-créneaux par macro, 40 artistes, 10 équipes. |
| 1.2 | L'instance Grist DINUM : version de Grist, auto-hébergée ou SaaS ? Y a-t-il des restrictions connues sur les widgets personnalisés (liste blanche d'URL, en-têtes CSP) ? | Grist récent, widget hébergé sur une URL à fournir, à déclarer en liste blanche. |
| 1.3 | Le widget aura-t-il l'accès « lecture/écriture sur tout le document », ou seulement sur la table sélectionnée ? | Accès complet au document (nécessaire pour écrire dans plusieurs tables). |
| 1.4 | Un document Grist par édition du festival, ou un document qui accumule les éditions ? | Un document par édition ; une table `Evenements` est prévue mais non exploitée en v1. |
| 1.5 | Qui crée le document et les tables : un modèle Grist prêt à l'emploi fourni par nous, ou une création à la main ? | Nous fournissons un modèle de document et un script de création des tables. |
| 1.6 | Usage sur mobile le jour J (cheffes d'équipe sur le terrain) ? Faut-il un fonctionnement sans réseau ? | Lecture confortable sur mobile, mais connexion réseau requise. Pas de mode hors ligne. |
| 1.7 | Y a-t-il une exigence d'accessibilité formelle (RGAA) côté DINUM ? | Bonnes pratiques (contrastes, navigation clavier, libellés) sans audit RGAA formel en v1. |
| 1.8 | Langue de l'interface : français uniquement, ou faut-il prévoir l'internationalisation ? | Français uniquement, mais textes centralisés pour permettre une traduction ultérieure. |

## 2. Temps et créneaux

| # | Question | Défaut proposé |
| --- | --- | --- |
| 2.1 | Un macro-créneau correspond-il à une journée, une demi-journée, autre chose ? Peut-il franchir minuit ? | Plage libre définie par un début et une fin ; peut franchir minuit. |
| 2.2 | Les sous-créneaux d'un macro-créneau forment-ils une partition stricte (sans trou ni recouvrement), ou peuvent-ils se chevaucher ? | Partition stricte par défaut, mais les trous et chevauchements sont tolérés et signalés comme anomalies plutôt que bloqués. |
| 2.3 | Les sous-créneaux sont-ils communs à toutes les missions, ou chaque mission a-t-elle ses propres rotations ? | Communs au macro-créneau, avec possibilité d'en définir de spécifiques à une mission si besoin. |
| 2.4 | Les sous-créneaux ont-ils tous la même durée ? Une durée minimale ou maximale ? | Durée libre, multiple du quart d'heure, sans minimum imposé. |
| 2.5 | Toutes les bornes sont-elles alignées sur 00/15/30/45, ou faut-il tolérer des créneaux désalignés (ex. 14h05) ? | Alignement strict sur le quart d'heure ; une borne désalignée est arrondie et signalée. |
| 2.6 | Faut-il un temps de battement entre deux affectations consécutives d'un même bénévole (déplacement, pause) ? | Aucun battement imposé par défaut, paramétrable globalement en minutes. |
| 2.7 | Y a-t-il des règles de repos : durée maximale de travail d'affilée, pause repas obligatoire, amplitude maximale par jour ? | Pas de règle dure en v1 ; la charge est traitée comme un objectif d'équité, pas comme une contrainte. |
| 2.8 | Une mission est-elle ouverte sur tout le festival, ou seulement sur certaines plages (ex. le bar n'ouvre qu'à 18h) ? | Ouverture définie par les besoins créés : pas de besoin, pas de mission à cette heure-là. |
| 2.9 | Fuseau horaire et changement d'heure : à gérer, ou toujours en heure locale ? | Heure locale, un seul fuseau, pas de bascule heure d'été pendant l'événement. |

## 3. Disponibilités et souhaits

| # | Question | Défaut proposé |
| --- | --- | --- |
| 3.1 | Stockage des disponibilités : une ligne par intervalle (lisible dans Grist) plutôt qu'une ligne par quart d'heure et par bénévole (≈ 90 000 lignes) — confirmez-vous ? | Par intervalles, normalisés au quart d'heure en mémoire. |
| 3.2 | Quel est l'état par défaut d'un bénévole sur un quart d'heure non renseigné : disponible ou indisponible ? | Indisponible : on n'affecte personne sur un créneau qu'il n'a pas explicitement ouvert. |
| 3.3 | Les trois états (indisponible / disponible / veut voir un artiste) suffisent-ils, ou faut-il des nuances (« disponible si besoin », « préférence forte ») ? | Ces trois états, plus un niveau de préférence optionnel sur « disponible ». |
| 3.4 | « Veut voir un artiste » est-il une contrainte dure (on ne l'affecte jamais) ou une préférence forte (violable en dernier recours) ? | Préférence très forte, violable uniquement si aucune solution n'existe, et alors signalée. |
| 3.5 | Un bénévole classe-t-il ses souhaits d'artistes (top 3), ou sont-ils tous au même niveau ? | Tous au même niveau en v1, avec un champ de priorité optionnel. |
| 3.6 | Les souhaits de mission : simple liste de missions souhaitées, ou échelle avec refus explicite (« je ne veux pas faire la sécurité ») ? | Échelle à cinq niveaux, de « refus » à « souhait fort ». Le refus reste violable mais très coûteux. |
| 3.7 | Un refus de mission peut-il être un véto absolu (contre-indication, ex. mineur au bar) ? | Oui, via les compétences requises et non via le souhait : les deux mécanismes sont séparés. |
| 3.8 | Comment les données arrivent-elles : formulaire Grist, import CSV, autre outil ? Faut-il prévoir l'import ? | Saisie ou import dans les tables Grist en amont, hors périmètre du widget en v1. |
| 3.9 | Faut-il gérer des affinités entre bénévoles (« X veut être avec Y », « ne pas mettre X avec Z ») ? | Oui, table `Affinites` prévue, traitée comme préférence de second rang. |
| 3.10 | Un bénévole a-t-il un quota d'heures à réaliser (contrepartie d'un pass) ? Minimum, maximum ? | Un minimum et un maximum optionnels par bénévole, vides par défaut. |

## 4. Missions et besoins

| # | Question | Défaut proposé |
| --- | --- | --- |
| 4.1 | Le minimum et le maximum de bénévoles sont-ils définis par mission, ou par couple (mission, sous-créneau) ? | Par couple (mission, sous-créneau), avec une valeur par défaut héritée de la mission. |
| 4.2 | Le minimum peut-il varier dans la journée (pic de fréquentation) ? | Oui, c'est la conséquence directe de 4.1. |
| 4.3 | Les missions ont-elles une priorité entre elles quand les bénévoles manquent (mission critique vs confort) ? | Oui, un niveau de priorité par mission, utilisé pour arbitrer la couverture. |
| 4.4 | Y a-t-il des compétences ou prérequis (majeur, permis, SSIAP, formation caisse) ? | Oui, une liste de compétences par mission et par bénévole, traitée en contrainte dure. |
| 4.5 | Une mission est-elle rattachée à une équipe unique, ou plusieurs équipes peuvent-elles y intervenir ? | Rattachée à une équipe pour le management, mais un bénévole d'une autre équipe peut y être affecté en dépannage. |
| 4.6 | Y a-t-il un rôle à l'intérieur d'une mission (un référent, un chef de poste) ? | Oui, porté par le rang 1 du groupe, avec un libellé de rôle optionnel. |
| 4.7 | Faut-il gérer un lieu par mission, et la distance ou le temps de trajet entre lieux ? | Lieu oui, temps de trajet non en v1 (couvert par le battement global de 2.6). |
| 4.8 | Une mission peut-elle être « au fil de l'eau » (effectif non fixe, renfort ponctuel) ? | Traitée comme une mission normale avec un minimum à 0 et un maximum élevé. |

## 5. Équipes, groupes, binômes et dimension *n*

| # | Question | Défaut proposé |
| --- | --- | --- |
| 5.1 | Un bénévole appartient-il à une seule équipe pour tout l'événement, ou cela peut-il changer selon le créneau ? | Une seule équipe pour tout l'événement. |
| 5.2 | L'équipe contraint-elle l'affectation (on n'affecte que dans les missions de son équipe), ou est-ce purement organisationnel ? | Préférence forte, pas une contrainte dure : on sort de l'équipe si nécessaire, et c'est signalé. |
| 5.3 | Les indicatifs de binôme sont-ils propres à un couple (mission, sous-créneau), ou un même indicatif traverse-t-il plusieurs créneaux ? | Propres à un couple (mission, sous-créneau), avec un code lisible du type `BAR-S3-B2`. |
| 5.4 | Confirmez-vous que la taille du groupe est un simple nombre (2 = binôme, 3 = trinôme, *n* = *n*-uplet), sans traitement particulier pour la valeur 2 ? | Oui : rien dans le code ne connaît la valeur 2. |
| 5.5 | Faut-il essayer de garder les mêmes personnes ensemble d'un créneau à l'autre, ou au contraire faire tourner ? | On cherche la stabilité (moins de briefings), avec un réglage pour inverser la préférence. |
| 5.6 | Faut-il équilibrer la composition des groupes (un expérimenté avec un nouveau) ? | Oui si un niveau d'expérience existe sur les bénévoles ; sinon non traité en v1. |
| 5.7 | Un groupe peut-il rester partiellement rempli (1 personne sur un binôme), ou est-ce une anomalie bloquante ? | Possible mais listé comme anomalie, sauf si l'effectif minimum est atteint. |
| 5.8 | Les cheffes d'équipe sont-elles elles-mêmes affectées à des missions, ou sont-elles en dehors du planning ? | Elles sont des bénévoles comme les autres, avec un indicateur « référent ». |

## 6. Algorithme d'affectation

| # | Question | Défaut proposé |
| --- | --- | --- |
| 6.1 | Confirmez l'ordre des priorités : 1) disponibilité, 2) artiste souhaité, 3) mission souhaitée. La couverture des besoins passe-t-elle avant ou après les souhaits ? | Disponibilité = contrainte dure. Puis couverture du minimum, puis artiste, puis mission. |
| 6.2 | Vaut-il mieux laisser une mission sous-staffée, ou affecter quelqu'un contre son souhait ? | Affecter contre le souhait de mission, mais jamais contre une indisponibilité. Le cas est signalé. |
| 6.3 | Faut-il une équité explicite (même nombre d'heures, répartition des créneaux ingrats comme la nuit ou le ménage) ? | Oui : équilibrage du nombre d'heures et des missions marquées « pénibles ». |
| 6.4 | L'algorithme peut-il créer ou supprimer des groupes, ou se contente-t-il de remplir les indicatifs existants ? | Il remplit uniquement les indicatifs existants ; la création reste un acte humain, avec une aide à la génération. |
| 6.5 | Faut-il un mode « je propose, tu valides » (l'algorithme propose, rien n'est écrit sans validation) ? | Oui : calcul en mémoire, aperçu des changements, écriture dans Grist seulement après validation. |
| 6.6 | Les affectations manuelles sont-elles automatiquement verrouillées ? | Oui, avec possibilité de déverrouiller. |
| 6.7 | Le résultat doit-il être reproductible à l'identique (même données, même résultat) ? | Oui, algorithme déterministe à graine fixe. |
| 6.8 | Quel temps de calcul est acceptable pour un planning complet ? | Moins de 10 secondes dans le navigateur pour la volumétrie de 1.1. |
| 6.9 | Faut-il pouvoir expliquer chaque affectation (« pourquoi elle ici ? ») et chaque impossibilité ? | Oui : score détaillé par affectation, cause explicite par place non pourvue. |
| 6.10 | Peut-on lancer l'algorithme sur un périmètre restreint (un macro-créneau, une mission) plutôt que sur tout ? | Oui, le périmètre est un paramètre de lancement. |

## 7. Jour J et ajustements

| # | Question | Défaut proposé |
| --- | --- | --- |
| 7.1 | Qui manipule l'outil le jour J, et sur quel support ? | Vous et les cheffes d'équipe, sur ordinateur portable et téléphone. |
| 7.2 | Quand un bénévole annule, attend-on une liste de remplaçants classés à valider, ou un recalcul automatique de la zone ? | Liste de remplaçants classés, avec la raison du classement. Rien ne bouge sans validation. |
| 7.3 | Le recalcul peut-il déplacer d'autres bénévoles déjà affectés (effet domino) pour trouver une meilleure solution ? | Non par défaut : on ne touche qu'aux places vides. Un mode « autoriser les permutations » est proposé, avec aperçu des déplacements. |
| 7.4 | Comment marque-t-on une absence : un statut sur le bénévole, ou une modification de ses disponibilités ? | Un statut `Absent` sur le bénévole, plus lisible et réversible, qui libère ses places à venir. |
| 7.5 | Faut-il figer le passé (ne plus rien modifier avant l'heure courante) ? | Oui : au-delà de l'heure courante seulement, avec un forçage possible. |
| 7.6 | Faut-il un journal des modifications (qui a changé quoi, quand, pourquoi) ? | Oui, table `Journal` lisible nativement. |
| 7.7 | Plusieurs personnes modifieront-elles le planning en même temps ? Faut-il gérer les conflits d'édition ? | Oui : détection de modification concurrente et rechargement plutôt qu'écrasement silencieux. |
| 7.8 | Faut-il une notion de bénévole « volant » / réserve mobilisable ? | Oui, via un indicateur sur le bénévole, utilisé en priorité pour les remplacements. |
| 7.9 | Faut-il prévenir les personnes concernées (SMS, mail) ? | Hors périmètre v1 ; on prévoit un export de la liste des changements à communiquer. |

## 8. Rôles, permissions et données personnelles

| # | Question | Défaut proposé |
| --- | --- | --- |
| 8.1 | Les cheffes d'équipe peuvent-elles modifier le planning, ou seulement le consulter et signaler ? | Consultation complète, modification limitée à leur équipe. |
| 8.2 | Les restrictions d'accès doivent-elles reposer sur les règles d'accès natives de Grist ? | Oui. Le widget ne fait que refléter les droits ; il ne les crée pas. C'est un point d'audit important : un filtrage uniquement côté widget ne serait pas une sécurité. |
| 8.3 | Les bénévoles ont-ils un accès direct au document (pour voir leur planning) ? | Non en v1 : diffusion par export ou impression. |
| 8.4 | Quelles données personnelles seront stockées (téléphone, e-mail, âge, régime alimentaire, santé) ? | Nom, contact, équipe, compétences. Pas de donnée sensible. |
| 8.5 | Y a-t-il un cadre RGPD à respecter (mention d'information, durée de conservation, suppression après l'événement) ? | À documenter dans le cahier des charges ; suppression ou anonymisation après l'édition. |
| 8.6 | Le dépôt sera-t-il public, et le code publié en logiciel libre ? | Oui, dépôt public avec une licence à choisir (MIT ou EUPL). |

## 9. Vues et UX

| # | Question | Défaut proposé |
| --- | --- | --- |
| 9.1 | Parmi les dix vues listées dans le cahier des charges, lesquelles sont indispensables en v1 et lesquelles peuvent attendre ? | v1 : agenda, grille mission × sous-créneau, affectation manuelle, anomalies. Le reste suit. |
| 9.2 | Le widget est-il unique avec une navigation interne, ou plusieurs widgets à poser dans des pages Grist différentes ? | Un widget unique, avec un sélecteur de vue. Les vues secondaires restent utilisables seules. |
| 9.3 | Le widget doit-il réagir à la ligne sélectionnée dans une table Grist voisine (filtrage lié) ? | Oui quand c'est pertinent : sélectionner une mission filtre la vue. |
| 9.4 | L'agenda doit-il permettre le glisser-déposer pour créer et déplacer les créneaux, ou un formulaire suffit-il ? | Glisser-déposer pour créer et redimensionner, formulaire pour les détails. |
| 9.5 | Dans la vue d'affectation, préférez-vous le glisser-déposer d'un bénévole sur une place, ou un clic sur une place qui propose des candidats classés ? | Les deux, avec le clic comme chemin principal : il porte l'explication du classement. |
| 9.6 | Faut-il des impressions et exports (feuilles de route par équipe, affichage par poste) ? | Oui, export imprimable, priorité moyenne. |
| 9.7 | Un code couleur : par mission, par équipe, ou par état de couverture ? | Par équipe, avec surcouche d'alerte sur les places non pourvues. |

## 10. Sauvegarde et versions

| # | Question | Défaut proposé |
| --- | --- | --- |
| 10.1 | « Sauvegarder » signifie-t-il conserver plusieurs versions du planning (v1, v2, jour J), ou simplement persister l'état courant ? | Les deux : l'état courant est toujours persisté, et on peut nommer des instantanés. |
| 10.2 | Faut-il comparer deux versions (ce qui a bougé entre la v1 et le jour J) ? | Oui, vue de comparaison, priorité moyenne. |
| 10.3 | L'historique natif de Grist suffit-il pour revenir en arrière, ou faut-il un retour arrière dans le widget ? | Instantanés nommés dans le widget, l'historique Grist restant le filet de sécurité. |
| 10.4 | Faut-il travailler sur des scénarios parallèles (deux hypothèses de planning comparées avant de choisir) ? | Non en v1 ; les instantanés couvrent le besoin de manière suffisante. |

## 11. Généricité au-delà du festival

| # | Question | Défaut proposé |
| --- | --- | --- |
| 11.1 | Quels autres cas d'usage avez-vous en tête (astreintes, permanences d'accueil, gardes) ? | Aucun précis ; on évite simplement les hypothèses spécifiques au festival. |
| 11.2 | Le vocabulaire doit-il être configurable (bénévole → agent, mission → poste, artiste → événement à ne pas manquer) ? | Oui : libellés centralisés et paramétrables, structure inchangée. |
| 11.3 | La notion d'artiste est-elle généralisable en « événement attractif qu'une personne souhaite suivre » ? | Oui, c'est ainsi qu'elle sera modélisée. |
| 11.4 | Le widget doit-il s'adapter à un schéma de tables existant, ou impose-t-il le sien ? | Il impose le sien, avec une table de correspondance des noms de colonnes pour s'adapter. |

## 12. Technique et livraison

| # | Question | Défaut proposé |
| --- | --- | --- |
| 12.1 | Avez-vous une préférence de technologie (JavaScript sans cadriciel, TypeScript, React, Svelte) ? | TypeScript, sans cadriciel d'interface lourd, compilé en fichiers statiques. Choix favorable à l'audit. |
| 12.2 | Où le widget sera-t-il hébergé (GitHub Pages, serveur DINUM, fichier déposé dans Grist) ? | GitHub Pages pour les essais, hébergement DINUM pour la production. |
| 12.3 | Le widget doit-il n'émettre aucune requête réseau en dehors de l'API Grist (pas de CDN, pas de police distante) ? | Oui, aucune requête sortante. Toutes les ressources sont embarquées. |
| 12.4 | Navigateurs à couvrir ? | Versions récentes de Firefox et Chromium sur ordinateur, Safari et Chrome sur mobile. |
| 12.5 | Pour les tests : lancement en ligne de commande suffisant, ou faut-il aussi des tests de bout en bout dans un navigateur ? | Tests unitaires et d'intégration en ligne de commande, plus quelques tests de bout en bout sur les parcours critiques. |
| 12.6 | Le document de tests demandé doit-il être un document lisible (markdown, cas par cas) en plus du code de test ? | Oui : un document lisible dans `docs/`, tenu en correspondance avec les tests automatisés. |
| 12.7 | Faut-il une intégration continue GitHub Actions dès maintenant ? | Oui, dès les premiers développements : tests et analyse statique à chaque poussée. |
