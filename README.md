# PlanningPlus

Widget personnalisé [Grist](https://www.getgrist.com/) de gestion de plannings.

PlanningPlus permet de construire un planning d'affectation de personnes sur des
missions découpées en créneaux, puis de l'ajuster en temps réel pendant
l'événement. Le premier cas d'usage est l'affectation de bénévoles de festival,
mais le modèle reste générique (astreintes, permanences, accueil, tenue de
poste).

## État du projet

Phase 1 : cadrage. Voir [`docs/`](docs/).

| Document | Objet |
| --- | --- |
| [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md) | Cahier des charges (v0, en cours) |
| [`docs/questions-cadrage.md`](docs/questions-cadrage.md) | Questions de cadrage et réponses |

## Principes directeurs

1. **Lisibilité native Grist.** Toute donnée métier reste consultable et
   modifiable dans les vues natives de Grist, sans passer par le widget.
2. **Code auditable.** Le code doit pouvoir être relu par un tiers (DINUM) :
   lisible, commenté là où c'est utile, sans dépendance opaque, sans faille
   évidente.
3. **Ajustement à chaud.** Le jour J, une part significative du planning bouge.
   L'outil doit permettre de corriger localement sans tout recalculer.
