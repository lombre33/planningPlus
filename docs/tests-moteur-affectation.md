# Tests du moteur d'affectation et de correction

**Périmètre :** `widget/src/moteur/` uniquement — le solveur, l'éligibilité,
la détection d'anomalies et les opérations de correction manuelle décrites
au §7.5 du [cahier des charges](cahier-des-charges.md). Pas les vues (fils
« Maquette interactive » et « Interface d'affectation des bénévoles »).

**Statut :** 62 tests, tous verts. `npm test` (vitest) et `npm run build`
(`tsc --noEmit` strict + build Vite) dans `widget/`.

**Politique de mise à jour (NF7, demande d'Antoine 2026-09-21) :** cette
liste est rejouée à chaque fonctionnalité majeure ajoutée au moteur, pas à
chaque correction mineure. Une case cochée renvoie au fichier et au nom du
test qui la couvre — en cas de doute sur la couverture réelle, le test fait
foi, pas cette liste.

## Comment rejouer

```
cd widget
npm test              # batterie complète
npm run build          # type-check strict + build (fait aussi office de lint)
```

## §7.1 — Contraintes dures (jamais violées)

| Règle | Test |
| --- | --- |
| Un bénévole n'occupe qu'une place à la fois (pas de recouvrement, au quart d'heure près) | `eligibilite.test.ts` « exclut un bénévole déjà occupé sur un quart qui recouvre un autre groupe » ; `affectation.test.ts` « n'affecte jamais le même bénévole à deux groupes dont les créneaux se chevauchent » ; `integration-seed.test.ts` « ne double-réserve jamais... » (échelle réelle) |
| Disponibilité : affecté seulement sur les quarts où il est disponible | `eligibilite.test.ts` « exclut un bénévole indisponible... », « traite l'absence totale de ligne de disponibilité comme indisponible » |
| Compétences requises détenues par le bénévole | `eligibilite.test.ts` « exclut un bénévole sans une compétence requise... » |
| Compétences des DEUX (ou plus) missions quand un groupe tourne entre plusieurs besoins (§6.3) | `eligibilite.test.ts` « exige les compétences des DEUX missions quand un groupe tourne... » |
| Une affectation verrouillée n'est jamais déplacée | `affectation.test.ts` « ne touche jamais une place verrouillée, même en périmètre complet » |
| L'effectif maximum n'est **plus** une contrainte dure (révision 2026-09-21) | voir §7.4 « sur-effectif » ci-dessous — testé comme anomalie, jamais comme blocage |

## §7.2 — Objectifs pondérés

| Objectif | Test |
| --- | --- |
| 1. Couverture, pondérée par la priorité de la mission, jamais au prix de l'objectif 3 | `affectation.test.ts` « sert le groupe de priorité Critique avant celui de priorité Confort... » |
| 1. Sous-staffé plutôt que forcé contre un refus explicite | `affectation.test.ts` « laisse la place vide plutôt que de forcer un bénévole contre un refus explicite » ; `eligibilite.test.ts` « exclut un bénévole ayant explicitement refusé la mission » |
| 2. Conflit artiste : préférence forte, violable seulement si nécessaire pour l'effectif minimum | `affectation.test.ts` « utilise un candidat en conflit artiste en dernier recours... » et « n'utilise PAS un candidat en conflit artiste quand l'effectif minimum est déjà atteint autrement » ; `eligibilite.test.ts` « reste éligible, avec conflitArtiste... » |
| 3. Souhaits de mission, du refus (exclusion, voir objectif 1) au souhait fort | `eligibilite.test.ts` « score plus haut un souhait « Souhaite fortement »... » |
| 4. Équité (heures, quota) | `eligibilite.test.ts` « favorise un bénévole en-dessous de son quota minimum » et « signale depasseraitQuota... » |
| Repère opérationnel « équipe » (§7.5.3 : fait partie de l'explication donnée à l'humain, absent du catalogue §7.1) | `eligibilite.test.ts` « score plus haut un candidat de la même équipe que le groupe » et « laisse equipeCorrespond à null... » |
| Affinités entre bénévoles (préférence de second rang, `dev/seed/schema.mjs`) | `eligibilite.test.ts` « score plus haut un candidat en affinité « Ensemble »... » |
| Score toujours dans [0, 1], même à poids extrêmes | `eligibilite.test.ts` « borne toujours le score à [0, 1]... » |

## §7.3 — Propriétés attendues

| Propriété | Test |
| --- | --- |
| Déterminisme (mêmes données + paramètres ⇒ même résultat) | `affectation.test.ts` « produit exactement le même résultat... » ; `integration-seed.test.ts` « est déterministe à cette échelle... » |
| Résolution partielle : un périmètre restreint, le reste figé | `affectation.test.ts` « ne touche que les places du périmètre demandé », « un périmètre par mission résout les groupes de cette mission uniquement » |
| Permutations autorisées dans le périmètre si ça donne une meilleure solution, jamais hors périmètre | `affectation.test.ts` « libère un bénévole d'une place pour en pourvoir une autre du même périmètre... » — voir le commentaire d'en-tête de `affectation.ts` : ce n'est pas un mécanisme séparé, il émerge du fait que tout le périmètre non verrouillé est libéré puis reréparti ensemble |

## §7.4 — Catalogue des anomalies (sept types exacts)

Chaque type, sa gravité (`a_corriger` / `a_surveiller`) et l'absence de faux
positif sur un planning cohérent : `anomalies.test.ts`, un test par ligne du
tableau du §7.4, plus « ne signale rien sur un planning cohérent ».
Franchissement de minuit sans fausse détection de chevauchement :
« franchit minuit sans anomalie fausse... ».

## §7.5 — Parcours d'affectation et de correction

| Étape | Test |
| --- | --- |
| 1–2. Lancement, résultat (Origine/Score écrits, place vide alimente « sous-effectif ») | `affectation.test.ts` « pourvoit une place avec un candidat disponible... » |
| 3. Correction manuelle place par place : liste classée + explication | `affectation.test.ts` « classe les candidats par score décroissant et exclut les inéligibles » (`candidatsEligibles`) |
| 3. Une place modifiée à la main (y compris vidée) passe Manuel + Verrouillée, un recalcul ne la touche plus tant qu'elle n'est pas déverrouillée | `affectation.test.ts` « verrouille toujours la place corrigée, y compris en la vidant... » |
| 4. Repositionner un indicatif ne change qu'une ligne de `Positions_groupe`, jamais les `Places` | `affectation.test.ts` « ne change que la ligne Positions_groupe visée, jamais les Places » |
| 5. Recalcul partiel après absence déclarée | `affectation.test.ts` « ne retient que les places non verrouillées actuellement tenues par ce bénévole » (`perimetreAbsence`) — le flux complet (marquer `Absent`, calculer le périmètre, relancer `calculerAffectation`) est documenté dans le commentaire de `perimetreAbsence` |
| 6. Anomalies à jour en continu | `detecterAnomalies` est une fonction de lecture pure, rejouable après n'importe quelle modification — pas d'état caché ; voir `anomalies.ts` |

## Cas limites transverses

| Cas | Test |
| --- | --- |
| Un macro-créneau ou un sous-créneau qui franchit minuit reste un intervalle continu, jamais découpé par jour calendaire | `temps.test.ts` (`quartsDIntervalle`, `heuresDIntervalle`, `seChevauchent` « ... franchit minuit ») ; `eligibilite.test.ts` « gère correctement un créneau qui franchit minuit... » ; `affectation.test.ts` « couvre correctement un groupe positionné sur une soirée qui franchit minuit » ; `anomalies.test.ts` « franchit minuit sans anomalie fausse... » |
| Immutabilité : aucune fonction ne mute son entrée | `affectation.test.ts` « ne mute pas l'objet donnees d'origine... » (`appliquerPropositions`) |
| Échelle réelle (70 bénévoles, 5 jours, 3 équipes — cas concret d'Antoine) | `integration-seed.test.ts`, données produites par `dev/seed/generate.mjs` (mêmes données que l'environnement de test Grist) : résolution sans erreur, anomalie volontaire du générateur bien détectée, temps d'exécution (indicatif, Node ≠ navigateur) très en-dessous de NF2 |

## Décisions de conception non triviales (pour l'audit, §5.2)

- **Le solveur n'est pas optimal** : ordonnancement glouton « variable la
  plus contrainte d'abord » (MRV), un groupe à la fois, avec deux passages
  (sans puis avec le pool de secours « conflit artiste »). Choix délibéré :
  déterministe et auditable plutôt qu'une boîte noire, cohérent avec NF2
  (< 10 s en volumétrie NF1) et §5.2. Voir le commentaire d'en-tête de
  `affectation.ts`.
- **Permutation = libérer tout le périmètre puis reremplir**, pas un
  algorithme de swap séparé. Conséquence assumée : une résolution partielle
  peut, dans de rares cas, proposer un résultat légèrement moins bon qu'avant
  sur une place qui n'avait pourtant pas besoin de bouger — acceptable
  puisque §7.3 exige un aperçu validé par un humain avant application, jamais
  une application automatique.
- **Équité** : faute d'un champ « mission pénible » dans le modèle de
  données actuel (`dev/seed/schema.mjs`), l'équité ne porte aujourd'hui que
  sur les heures (vs `Quota_heures_min`/`max`), pas sur la pénibilité
  mentionnée au §7.2 objectif 4. À ajouter si/quand ce champ existe.
- **« Équipe »** est un bonus de score et un champ d'explication, pas une
  contrainte dure : absent du catalogue §7.1, un renfort inter-équipe reste
  possible si besoin.
- **`DonneesPlanning` ne connaît pas Grist** : tableaux de domaine
  camelCase, sans `_ref` ni encodage `ChoiceList`. La conversion depuis un
  document Grist réel (ou vers un document) est hors périmètre de ce
  module — voir l'en-tête de `widget/src/moteur/index.ts`.
