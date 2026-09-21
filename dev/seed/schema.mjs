/**
 * Schéma du document Grist de PlanningPlus.
 *
 * Reflète le modèle de données v1 du cahier des charges (`docs/cahier-des-charges.md`,
 * §6). La description est déclarative pour deux raisons : elle sert à créer le
 * document de test, et elle documente le modèle de données en un seul endroit.
 *
 * Contrainte de lisibilité (§5.1 du cahier des charges) : chaque table doit
 * rester compréhensible dans une vue native Grist. Les colonnes de référence
 * portent donc un `visibleCol` quand la table cible a une colonne de libellé
 * naturelle, pour afficher un texte plutôt qu'un identifiant de ligne.
 *
 * Types utilisés : Text, Int, Numeric, Bool, Date, DateTime, Choice,
 * ChoiceList, Ref:<Table>, RefList:<Table>.
 *
 * Important : Grist réassigne parfois l'identifiant réel d'une table lors de
 * sa création (par exemple à partir d'un identifiant contenant plusieurs mots
 * en casse mixte). `seed.mjs` ne suppose donc jamais que l'identifiant réel
 * d'une table est celui déclaré ici : il relit toujours l'identifiant renvoyé
 * par l'API après création.
 */

/** Fuseau horaire de toutes les colonnes de date et heure du document. */
export const TIMEZONE = 'Europe/Paris';

/** Pas de découpage temporel des disponibilités, en minutes. */
export const PAS_MINUTES = 15;

const dateTime = `DateTime:${TIMEZONE}`;

/** Compétences pouvant être requises par une mission ou détenues par un bénévole. */
const COMPETENCES = ['Majeur', 'Permis B', 'Caisse', 'SST', 'Manutention', 'Anglais'];

/**
 * Les tables, dans un ordre de création qui ne référence que des tables déjà
 * créées, sauf pour les renvois notés `differe: true`, ajoutés après coup
 * (voir `REFERENCES_DIFFEREES`) pour casser le cycle Equipes ↔ Benevoles.
 */
export const TABLES = [
  {
    id: 'Equipes',
    libelle: 'Équipes',
    description: "Regroupement opérationnel de bénévoles, avec une personne responsable.",
    colonnes: [
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'Couleur', type: 'Text', libelle: 'Couleur', description: "Code hexadécimal, pour l'affichage."},
      {id: 'Notes', type: 'Text', libelle: 'Notes'},
    ],
  },

  {
    id: 'Lieux',
    libelle: 'Lieux',
    description: "Les emplacements du site : scènes, bars, postes fixes.",
    colonnes: [
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'Description', type: 'Text', libelle: 'Description'},
    ],
  },

  {
    id: 'Benevoles',
    libelle: 'Bénévoles',
    description: "Les personnes à affecter. L'équipe est une contrainte d'organisation, pas une contrainte de planning.",
    colonnes: [
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'Contact', type: 'Text', libelle: 'Contact', description: "Téléphone ou courriel."},
      {id: 'Equipe', type: 'Ref:Equipes', libelle: 'Équipe', visibleCol: 'Nom'},
      {id: 'Competences', type: 'ChoiceList', libelle: 'Compétences', choix: COMPETENCES},
      {id: 'Quota_heures_min', type: 'Numeric', libelle: "Quota d'heures minimum"},
      {id: 'Quota_heures_max', type: 'Numeric', libelle: "Quota d'heures maximum"},
      {id: 'Statut', type: 'Choice', libelle: 'Statut', choix: ['Actif', 'Absent']},
      {id: 'Notes', type: 'Text', libelle: 'Notes'},
    ],
  },

  {
    id: 'Missions',
    libelle: 'Missions',
    description: "Ce qu'il y a à faire pendant le festival. Le nombre de bénévoles requis se définit sous-créneau par sous-créneau, dans la table Besoins.",
    colonnes: [
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'Description', type: 'Text', libelle: 'Description'},
      {id: 'Lieu', type: 'Ref:Lieux', libelle: 'Lieu', visibleCol: 'Nom'},
      {id: 'Equipe', type: 'Ref:Equipes', libelle: 'Équipe', visibleCol: 'Nom'},
      {id: 'Priorite', type: 'Choice', libelle: 'Priorité', choix: ['Critique', 'Normale', 'Confort']},
      {id: 'Competences_requises', type: 'ChoiceList', libelle: 'Compétences requises', choix: COMPETENCES},
    ],
  },

  {
    id: 'Artistes',
    libelle: 'Artistes',
    description: "Les passages des artistes. Sert à comprendre les souhaits des bénévoles qui veulent voir tel ou tel concert.",
    colonnes: [
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'Lieu', type: 'Ref:Lieux', libelle: 'Lieu', visibleCol: 'Nom'},
      {id: 'Debut', type: dateTime, libelle: 'Début'},
      {id: 'Fin', type: dateTime, libelle: 'Fin'},
    ],
  },

  {
    id: 'Macro_creneaux',
    libelle: 'Macro-créneaux',
    description: "Les grandes plages d'ouverture du festival. Tout le reste du planning vit à l'intérieur de ces plages.",
    colonnes: [
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'Debut', type: dateTime, libelle: 'Début'},
      {id: 'Fin', type: dateTime, libelle: 'Fin'},
    ],
  },

  {
    id: 'Sous_creneaux',
    libelle: 'Sous-créneaux',
    description: "Les rotations de bénévoles à l'intérieur d'un macro-créneau. Communs à toutes les missions par défaut (colonne Mission vide) ; une mission au rythme différent peut définir les siens.",
    colonnes: [
      {id: 'Macro_creneau', type: 'Ref:Macro_creneaux', libelle: 'Macro-créneau', visibleCol: 'Nom'},
      {id: 'Mission', type: 'Ref:Missions', libelle: 'Mission (si spécifique)', visibleCol: 'Nom'},
      {id: 'Libelle', type: 'Text', libelle: 'Libellé'},
      {id: 'Debut', type: dateTime, libelle: 'Début'},
      {id: 'Fin', type: dateTime, libelle: 'Fin'},
    ],
  },

  {
    id: 'Besoins',
    libelle: 'Besoins',
    description: "Une mission ouverte sur un sous-créneau donné, avec son effectif attendu. Absence de ligne = mission fermée sur ce sous-créneau.",
    colonnes: [
      {id: 'Mission', type: 'Ref:Missions', libelle: 'Mission', visibleCol: 'Nom'},
      {id: 'Sous_creneau', type: 'Ref:Sous_creneaux', libelle: 'Sous-créneau', visibleCol: 'Libelle'},
      {id: 'Effectif_min', type: 'Int', libelle: 'Effectif minimum'},
      {id: 'Effectif_max', type: 'Int', libelle: 'Effectif maximum'},
      {id: 'Taille_groupe', type: 'Int', libelle: 'Taille de groupe attendue'},
    ],
  },

  {
    id: 'Groupes',
    libelle: 'Groupes',
    description: "Indicatifs nommés (ex. « Beta12 ») : des places posées avant de connaître les personnes. La taille vaut 2 pour un binôme, 3 pour un trinôme, n au-delà.",
    colonnes: [
      {id: 'Code', type: 'Text', libelle: 'Code'},
      {id: 'Taille', type: 'Int', libelle: 'Taille'},
      {id: 'Equipe', type: 'Ref:Equipes', libelle: 'Équipe', visibleCol: 'Nom'},
      {id: 'Notes', type: 'Text', libelle: 'Notes'},
    ],
  },

  {
    id: 'Positions_groupe',
    libelle: 'Positions de groupe',
    description: "Positionne un groupe sur un besoin. Un même groupe peut être positionné sur plusieurs besoins, y compris sur des missions différentes d'un sous-créneau à l'autre : ce sont les missions qui tournent, pas les personnes.",
    colonnes: [
      {id: 'Groupe', type: 'Ref:Groupes', libelle: 'Groupe', visibleCol: 'Code'},
      {id: 'Besoin', type: 'Ref:Besoins', libelle: 'Besoin'},
    ],
  },

  {
    id: 'Places',
    libelle: 'Places',
    description: "Le roster réel d'un groupe : une ligne par rang. Bénévole vide = place non pourvue. Ce roster vaut pour toutes les positions du groupe (voir Positions_groupe).",
    colonnes: [
      {id: 'Groupe', type: 'Ref:Groupes', libelle: 'Groupe', visibleCol: 'Code'},
      {id: 'Rang', type: 'Int', libelle: 'Rang', description: "Rang de la place dans le groupe, de 1 à Taille."},
      {id: 'Benevole', type: 'Ref:Benevoles', libelle: 'Bénévole', visibleCol: 'Nom'},
      {id: 'Origine', type: 'Choice', libelle: 'Origine', choix: ['Algorithme', 'Manuel']},
      {id: 'Verrouillee', type: 'Bool', libelle: 'Verrouillée'},
      {id: 'Score', type: 'Numeric', libelle: 'Score',
       description: "Qualité de l'appariement telle que calculée par l'algorithme. Purement indicatif pour un lecteur humain."},
    ],
  },

  {
    id: 'Disponibilites',
    libelle: 'Disponibilités',
    description: "Une ligne par bénévole et par quart d'heure couvert par un macro-créneau. L'absence de ligne vaut indisponible : on n'affecte jamais quelqu'un par défaut.",
    colonnes: [
      {id: 'Benevole', type: 'Ref:Benevoles', libelle: 'Bénévole', visibleCol: 'Nom'},
      {id: 'Quart_heure', type: dateTime, libelle: 'Quart d’heure'},
      {id: 'Statut', type: 'Choice', libelle: 'Statut', choix: ['Disponible', 'Indisponible', 'Artiste']},
      {id: 'Artiste', type: 'Ref:Artistes', libelle: 'Artiste souhaité', visibleCol: 'Nom'},
    ],
  },

  {
    id: 'Souhaits_missions',
    libelle: 'Souhaits de mission',
    description: "Préférence d'un bénévole pour une mission, sur une échelle du refus au souhait fort. Une mission absente de cette table est neutre pour le bénévole.",
    colonnes: [
      {id: 'Benevole', type: 'Ref:Benevoles', libelle: 'Bénévole', visibleCol: 'Nom'},
      {id: 'Mission', type: 'Ref:Missions', libelle: 'Mission', visibleCol: 'Nom'},
      {id: 'Preference', type: 'Choice', libelle: 'Préférence',
       choix: ['Refuse', 'Réticent', 'Neutre', 'Intéressé', 'Souhaite fortement']},
    ],
  },

  {
    id: 'Affinites',
    libelle: 'Affinités',
    description: "Affinités entre bénévoles, prises en compte comme préférence de second rang par l'algorithme.",
    colonnes: [
      {id: 'Benevole_A', type: 'Ref:Benevoles', libelle: 'Bénévole A', visibleCol: 'Nom'},
      {id: 'Benevole_B', type: 'Ref:Benevoles', libelle: 'Bénévole B', visibleCol: 'Nom'},
      {id: 'Type', type: 'Choice', libelle: 'Type', choix: ['Ensemble', 'Éviter']},
    ],
  },

  {
    id: 'Versions',
    libelle: 'Versions',
    description: "Instantanés nommés du planning, pour comparer ou revenir en arrière. Table vide tant que le widget n'a pas encore écrit dedans.",
    colonnes: [
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'Date', type: dateTime, libelle: 'Date'},
      {id: 'Auteur', type: 'Text', libelle: 'Auteur'},
      {id: 'Commentaire', type: 'Text', libelle: 'Commentaire'},
      {id: 'Instantane', type: 'Text', libelle: 'Instantané',
       description: "Données sérialisées. Seule donnée du document volontairement non lisible nativement."},
    ],
  },

  {
    id: 'Journal',
    libelle: 'Journal',
    description: "Historique des modifications du planning : qui, quand, avant/après, pourquoi. Table vide tant que le widget n'a pas encore écrit dedans.",
    colonnes: [
      {id: 'Date', type: dateTime, libelle: 'Date'},
      {id: 'Auteur', type: 'Text', libelle: 'Auteur'},
      {id: 'Action', type: 'Text', libelle: 'Action'},
      {id: 'Place', type: 'Ref:Places', libelle: 'Place'},
      {id: 'Avant', type: 'Text', libelle: 'Avant'},
      {id: 'Apres', type: 'Text', libelle: 'Après'},
      {id: 'Motif', type: 'Text', libelle: 'Motif'},
    ],
  },
];

/**
 * Références qui créeraient un cycle à la création des tables : on les ajoute
 * une fois toutes les tables en place.
 */
export const REFERENCES_DIFFEREES = [
  {
    table: 'Equipes',
    colonne: {id: 'Referent', type: 'Ref:Benevoles', libelle: 'Référent', visibleCol: 'Nom'},
  },
];

/** Toutes les tables, y compris leurs colonnes différées. */
export function tablesCompletes() {
  return TABLES.map((table) => {
    const differees = REFERENCES_DIFFEREES
      .filter((r) => r.table === table.id)
      .map((r) => r.colonne);
    return {...table, colonnes: [...table.colonnes, ...differees]};
  });
}
