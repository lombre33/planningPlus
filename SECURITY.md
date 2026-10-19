# Politique de sécurité

## Signaler une vulnérabilité

Merci de ne pas décrire une faille dans une *issue* publique.

- **En privé, par GitHub** : onglet *Security* du dépôt, puis *Report a
  vulnerability*.
- **Si cette option n'est pas proposée** : ouvrir une *issue* qui demande un
  contact privé, sans y donner de détail exploitable (ni donnée d'un document,
  ni adresse d'une instance).
- On peut aussi passer par la politique de divulgation de vulnérabilités de
  l'État : <https://vdp.numerique.gouv.fr/p/Send-a-report>.

Pour qu'un signalement soit utile, indiquer la version concernée (V1, adresse
`…/planningPlus/`, ou V2, adresse `…/planningPlus/js/`), ce qui a été observé et
la façon de le reproduire.

## Versions suivies

Seul le code de la branche `main` est corrigé : la V1 (`widget/`) et la V2
(`widget-js/`).

## Ce que le widget fait et ne fait pas

L'accès demandé à Grist, les données lues et écrites, ce que le navigateur
conserve et les dépendances sont décrits dans le [`README`](README.md), aux
sections « Accès au document », « Données conservées par le widget »,
« Dépendances » et « Sécurité ».
