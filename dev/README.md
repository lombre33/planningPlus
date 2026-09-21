# Environnement de développement

Ce dossier contient ce qu'il faut pour tester le widget contre un vrai
document Grist, avec un jeu de données de festival réaliste.

## Générateur de données (`dev/seed/`)

`dev/seed/` construit un document Grist de test à partir de rien :

- `schema.mjs` décrit les tables et colonnes du modèle de données (celui
  proposé dans le cahier des charges : macro-créneaux, sous-créneaux,
  missions, artistes, bénévoles, disponibilités au quart d'heure, équipes,
  binômes, postes et affectations).
- `generate.mjs` tire un jeu de données déterministe (même graine → mêmes
  données) : festival de plusieurs jours, une centaine de bénévoles,
  disponibilités et souhaits d'artiste au quart d'heure, un remplissage
  glouton des affectations pour avoir un document qui n'est pas vide.
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

Options : `--jours` (défaut 3), `--benevoles` (défaut 120), `--graine`
(défaut 20260717), `--workspace` et `--nom` pour le nom du document.

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
environnement sans accès réseau sortant vers Cognito. La clé d'API se pose
ensuite normalement depuis l'interface, ou via `user.apiKey` en base pour
l'automatiser entièrement.
