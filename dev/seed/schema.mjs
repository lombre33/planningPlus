/**
 * Schéma du document Grist de PlanningPlus.
 *
 * La description est déclarative pour deux raisons : elle sert à créer le
 * document de test, et elle documente le modèle de données en un seul endroit.
 *
 * Contrainte de lisibilité : chaque table doit rester compréhensible dans une
 * vue native Grist. Les colonnes de référence portent donc un `visibleCol`,
 * pour afficher un libellé plutôt qu'un identifiant de ligne.
 *
 * Types utilisés : Text, Int, Numeric, Bool, Date, DateTime, Choice,
 * ChoiceList, Ref:<Table>, RefList:<Table>.
 */

/** Fuseau horaire de toutes les colonnes de date et heure du document. */
export const TIMEZONE = 'Europe/Paris';

/** Pas de découpage temporel, en minutes. */
export const PAS_MINUTES = 15;

const dateTime = `DateTime:${TIMEZONE}`;

/**
 * Les tables, dans leur ordre de création. Une table ne référence que des
 * tables déjà créées, sauf pour les renvois notés `differe: true`, ajoutés
 * après coup (voir `REFERENCES_DIFFEREES`).
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
    id: 'Missions',
    libelle: 'Missions',
    description: "Ce qu'il y a à faire pendant le festival. Le minimum et le maximum de bénévoles peuvent être redéfinis sous-créneau par sous-créneau dans la table Besoins.",
    colonnes: [
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'Description', type: 'Text', libelle: 'Description'},
      {id: 'Lieu', type: 'Text', libelle: 'Lieu'},
      {id: 'MinBenevoles', type: 'Int', libelle: 'Minimum de bénévoles'},
      {id: 'MaxBenevoles', type: 'Int', libelle: 'Maximum de bénévoles'},
      {id: 'Competences', type: 'ChoiceList', libelle: 'Compétences requises',
       choix: ['Majeur', 'Permis B', 'Caisse', 'SST', 'Manutention', 'Anglais']},
      {id: 'Active', type: 'Bool', libelle: 'Active'},
    ],
  },

  {
    id: 'Artistes',
    libelle: 'Artistes',
    description: "Les passages des artistes. Sert à comprendre les souhaits des bénévoles qui veulent voir tel ou tel concert.",
    colonnes: [
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'Scene', type: 'Choice', libelle: 'Scène', choix: ['Grande scène', 'Scène club', 'Chapiteau', 'Scène découverte']},
      {id: 'Debut', type: dateTime, libelle: 'Début'},
      {id: 'Fin', type: dateTime, libelle: 'Fin'},
      {id: 'Notes', type: 'Text', libelle: 'Notes'},
    ],
  },

  {
    id: 'Benevoles',
    libelle: 'Bénévoles',
    description: "Les personnes à affecter. L'équipe est une contrainte d'organisation, pas une contrainte de planning.",
    colonnes: [
      {id: 'Prenom', type: 'Text', libelle: 'Prénom'},
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'NomComplet', type: 'Text', libelle: 'Nom complet',
       description: "Dénormalisé volontairement : sert de libellé partout où un bénévole est référencé."},
      {id: 'Email', type: 'Text', libelle: 'Courriel'},
      {id: 'Telephone', type: 'Text', libelle: 'Téléphone'},
      {id: 'Equipe', type: 'Ref:Equipes', libelle: 'Équipe', visibleCol: 'Nom'},
      {id: 'Competences', type: 'ChoiceList', libelle: 'Compétences',
       choix: ['Majeur', 'Permis B', 'Caisse', 'SST', 'Manutention', 'Anglais']},
      {id: 'HeuresMax', type: 'Numeric', libelle: 'Heures maximum', description: "Charge maximale souhaitée sur l'ensemble du festival."},
      {id: 'Notes', type: 'Text', libelle: 'Notes'},
    ],
  },

  {
    id: 'MacroCreneaux',
    libelle: 'Macro-créneaux',
    description: "Les grandes plages d'ouverture du festival. Tout le reste du planning vit à l'intérieur de ces plages.",
    colonnes: [
      {id: 'Nom', type: 'Text', libelle: 'Nom'},
      {id: 'Jour', type: 'Date', libelle: 'Jour'},
      {id: 'Debut', type: dateTime, libelle: 'Début'},
      {id: 'Fin', type: dateTime, libelle: 'Fin'},
      {id: 'Notes', type: 'Text', libelle: 'Notes'},
    ],
  },

  {
    id: 'SousCreneaux',
    libelle: 'Sous-créneaux',
    description: "Les rotations de bénévoles à l'intérieur d'un macro-créneau. C'est l'unité d'affectation.",
    colonnes: [
      {id: 'MacroCreneau', type: 'Ref:MacroCreneaux', libelle: 'Macro-créneau', visibleCol: 'Nom'},
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
      {id: 'SousCreneau', type: 'Ref:SousCreneaux', libelle: 'Sous-créneau', visibleCol: 'Libelle'},
      {id: 'MinBenevoles', type: 'Int', libelle: 'Minimum de bénévoles'},
      {id: 'MaxBenevoles', type: 'Int', libelle: 'Maximum de bénévoles'},
      {id: 'Notes', type: 'Text', libelle: 'Notes'},
    ],
  },

  {
    id: 'Disponibilites',
    libelle: 'Disponibilités',
    description: `Une ligne par bénévole et par quart d'heure couvert par un macro-créneau. Statut « Indisponible » et statut « Artiste » sont les deux formes de non-disponibilité, la seconde étant négociable.`,
    colonnes: [
      {id: 'Benevole', type: 'Ref:Benevoles', libelle: 'Bénévole', visibleCol: 'NomComplet'},
      {id: 'Debut', type: dateTime, libelle: 'Début du quart d’heure'},
      {id: 'Statut', type: 'Choice', libelle: 'Statut', choix: ['Disponible', 'Indisponible', 'Artiste']},
      {id: 'Artiste', type: 'Ref:Artistes', libelle: 'Artiste souhaité', visibleCol: 'Nom'},
      {id: 'Commentaire', type: 'Text', libelle: 'Commentaire'},
    ],
  },

  {
    id: 'PreferencesMission',
    libelle: 'Préférences de mission',
    description: "Souhaits et refus de missions. Une mission absente de cette table est neutre pour le bénévole.",
    colonnes: [
      {id: 'Benevole', type: 'Ref:Benevoles', libelle: 'Bénévole', visibleCol: 'NomComplet'},
      {id: 'Mission', type: 'Ref:Missions', libelle: 'Mission', visibleCol: 'Nom'},
      {id: 'Souhait', type: 'Choice', libelle: 'Souhait', choix: ['Souhaite', 'Refuse']},
      {id: 'Commentaire', type: 'Text', libelle: 'Commentaire'},
    ],
  },

  {
    id: 'Binomes',
    libelle: 'Binômes',
    description: "Indicatifs de binôme : des places nommées, posées avant de connaître les personnes. La taille vaut 2 pour un binôme, 3 pour un trinôme, n au-delà.",
    colonnes: [
      {id: 'Indicatif', type: 'Text', libelle: 'Indicatif'},
      {id: 'Equipe', type: 'Ref:Equipes', libelle: 'Équipe', visibleCol: 'Nom'},
      {id: 'Taille', type: 'Int', libelle: 'Taille'},
      {id: 'Notes', type: 'Text', libelle: 'Notes'},
    ],
  },

  {
    id: 'Postes',
    libelle: 'Postes',
    description: "Le découpage théorique : tel indicatif de binôme tient telle mission sur tel sous-créneau. Se remplit avant de connaître les bénévoles.",
    colonnes: [
      {id: 'Besoin', type: 'Ref:Besoins', libelle: 'Besoin'},
      {id: 'Mission', type: 'Ref:Missions', libelle: 'Mission', visibleCol: 'Nom'},
      {id: 'SousCreneau', type: 'Ref:SousCreneaux', libelle: 'Sous-créneau', visibleCol: 'Libelle'},
      {id: 'Binome', type: 'Ref:Binomes', libelle: 'Binôme', visibleCol: 'Indicatif'},
      {id: 'Places', type: 'Int', libelle: 'Places', description: "Reprend la taille du binôme, ajustable au cas par cas."},
      {id: 'Notes', type: 'Text', libelle: 'Notes'},
    ],
  },

  {
    id: 'Affectations',
    libelle: 'Affectations',
    description: "Le remplissage réel des postes. Une ligne par place. Bénévole vide = place non pourvue. Le statut « Verrouillée » protège une affectation d'un recalcul.",
    colonnes: [
      {id: 'Poste', type: 'Ref:Postes', libelle: 'Poste'},
      {id: 'Place', type: 'Int', libelle: 'Place', description: "Rang de la place dans le binôme, de 1 à Places."},
      {id: 'Benevole', type: 'Ref:Benevoles', libelle: 'Bénévole', visibleCol: 'NomComplet'},
      {id: 'Statut', type: 'Choice', libelle: 'Statut',
       choix: ['Non pourvue', 'Proposée', 'Confirmée', 'Verrouillée', 'Annulée']},
      {id: 'Origine', type: 'Choice', libelle: 'Origine', choix: ['Algorithme', 'Manuel']},
      {id: 'Score', type: 'Numeric', libelle: 'Score',
       description: "Qualité de l'appariement telle que calculée par l'algorithme. Purement indicatif pour un lecteur humain."},
      {id: 'Commentaire', type: 'Text', libelle: 'Commentaire'},
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
    colonne: {id: 'Responsable', type: 'Ref:Benevoles', libelle: 'Responsable', visibleCol: 'NomComplet'},
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
