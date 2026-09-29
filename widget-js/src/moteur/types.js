/**
 * Modèle de données du moteur d'affectation.
 *
 * Ce module ne dépend ni de Grist ni du DOM : les types ci-dessous forment
 * une couche de domaine propre, en miroir du modèle §6 du cahier des charges
 * (`docs/cahier-des-charges.md`). La conversion depuis les lignes Grist
 * réelles (colonnes `_ref`, encodage `ChoiceList`, etc.) est la
 * responsabilité de l'intégration widget, pas de ce module — voir le
 * `README.md` de ce dossier.
 *
 * Les valeurs des unions de chaînes reprennent volontairement, caractère
 * pour caractère, les choix déclarés dans `dev/seed/schema.mjs`, pour qu'un
 * relecteur puisse comparer les deux sans table de correspondance.
 */

export const PARAMETRES_PAR_DEFAUT = {
  pasSecondes: 15 * 60,
  poids: {
    conflitArtiste: -0.4,
    souhaitMission: {
      'Réticent': -0.15,
      'Neutre': 0,
      'Intéressé': 0.2,
      'Souhaite fortement': 0.35,
    },
    equite: 0.15,
    affiniteEnsemble: 0.1,
    affiniteEviter: -0.1,
    equipeCorrespond: 0.1,
  },
};

export const GRAVITE_PAR_CODE = {
  sous_effectif: 'a_corriger',
  souhait_refuse: 'a_corriger',
  indisponibilite: 'a_corriger',
  double_engagement: 'a_corriger',
  sur_effectif: 'a_surveiller',
  conflit_artiste: 'a_surveiller',
  chevauchement_creneaux: 'a_surveiller',
  hors_quota: 'a_surveiller',
};

