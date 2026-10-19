import {describe, expect, it} from 'vitest';
import {
  appliquerRemplacements, classerReponseMacroCreneau, disponibilitesBenevolePourFestival,
  disponibilitesDepuisReponseMacroCreneau, disponibilitesDepuisSouhaitsArtistes, fusionnerDisponibilites,
  LIBELLES_REPONSE_PAR_DEFAUT,
} from './import-disponibilites.js';

describe('classerReponseMacroCreneau', () => {
  it('reconnaît les libellés par défaut', () => {
    expect(classerReponseMacroCreneau('Tout le créneau')).toBe('Disponible');
    expect(classerReponseMacroCreneau('Pas disponible du tout')).toBe('Indisponible');
  });

  it('tolère la casse, les espaces et les accents', () => {
    expect(classerReponseMacroCreneau('  tout LE creneau ')).toBe('Disponible');
    expect(classerReponseMacroCreneau('PAS DISPONIBLE DU TOUT')).toBe('Indisponible');
  });

  it('retombe sur "Manuelle" pour toute autre valeur, y compris vide ou absente', () => {
    expect(classerReponseMacroCreneau('disponible mais pas avant 18h')).toBe('Manuelle');
    expect(classerReponseMacroCreneau('')).toBe('Manuelle');
    expect(classerReponseMacroCreneau(null)).toBe('Manuelle');
    expect(classerReponseMacroCreneau(undefined)).toBe('Manuelle');
  });

  it('accepte des libellés personnalisés', () => {
    const libelles = {toutLeCreneau: ['Oui, tout le temps'], pasDisponibleDuTout: ['Non, jamais']};
    expect(classerReponseMacroCreneau('Oui, tout le temps', libelles)).toBe('Disponible');
    expect(classerReponseMacroCreneau('Tout le créneau', libelles)).toBe('Manuelle');
  });
});

describe('disponibilitesDepuisReponseMacroCreneau', () => {
  const macro = {Debut: 0, Fin: 1800}; // deux quarts d'heure

  it('étale "tout le créneau" sur tous les quarts d\'heure', () => {
    const resultat = disponibilitesDepuisReponseMacroCreneau(1, macro, 'Tout le créneau');
    expect(resultat.statut).toBe('Disponible');
    expect(resultat.disponibilites).toEqual([
      {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 900, Statut: 'Disponible', Artiste: null},
    ]);
  });

  it('étale "pas disponible du tout" sur tous les quarts d\'heure', () => {
    const resultat = disponibilitesDepuisReponseMacroCreneau(1, macro, 'Pas disponible du tout');
    expect(resultat.statut).toBe('Indisponible');
    expect(resultat.disponibilites).toHaveLength(2);
    expect(resultat.disponibilites.every((d) => d.Statut === 'Indisponible')).toBe(true);
  });

  it('ne génère rien pour une réponse "manuelle" : la saisie se fait à la main ailleurs', () => {
    const resultat = disponibilitesDepuisReponseMacroCreneau(1, macro, 'disponible après 20h seulement');
    expect(resultat.statut).toBe('Manuelle');
    expect(resultat.disponibilites).toEqual([]);
  });
});

describe('disponibilitesDepuisSouhaitsArtistes', () => {
  const artistes = [
    {id: 1, Nom: 'Marée Haute', Lieu: 1, Debut: 0, Fin: 900},
    {id: 2, Nom: 'Les Ondes Vertes', Lieu: 1, Debut: 900, Fin: 1800},
  ];

  it('relie un nom souhaité (insensible à la casse/accents) aux quarts d\'heure du passage', () => {
    const resultat = disponibilitesDepuisSouhaitsArtistes(1, ['maree haute'], artistes);
    expect(resultat).toEqual([{Benevole: 1, Quart_heure: 0, Statut: 'Artiste', Artiste: 1}]);
  });

  it('ignore un nom qui ne correspond à aucun artiste connu, sans erreur', () => {
    const resultat = disponibilitesDepuisSouhaitsArtistes(1, ['Artiste inconnu'], artistes);
    expect(resultat).toEqual([]);
  });

  it('gère plusieurs artistes souhaités', () => {
    const resultat = disponibilitesDepuisSouhaitsArtistes(1, ['Marée Haute', 'Les Ondes Vertes'], artistes);
    expect(resultat.map((d) => d.Artiste)).toEqual([1, 2]);
  });
});

describe('fusionnerDisponibilites', () => {
  it("la surcharge (souhait d'artiste) l'emporte sur la base (réponse macro-créneau) au même quart d'heure", () => {
    const base = disponibilitesDepuisReponseMacroCreneau(1, {Debut: 0, Fin: 1800}, 'Tout le créneau').disponibilites;
    const surcharge = disponibilitesDepuisSouhaitsArtistes(1, ['A'], [{id: 9, Nom: 'A', Lieu: 1, Debut: 900, Fin: 1800}]);
    const fusion = fusionnerDisponibilites(base, surcharge);
    expect(fusion).toEqual([
      {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 900, Statut: 'Artiste', Artiste: 9},
    ]);
  });

  it('ignore les libellés par défaut exportés pour vérifier la valeur exacte attendue', () => {
    expect(LIBELLES_REPONSE_PAR_DEFAUT.toutLeCreneau).toContain('Tout le créneau');
    expect(LIBELLES_REPONSE_PAR_DEFAUT.pasDisponibleDuTout).toContain('Pas disponible du tout');
  });
});

describe('disponibilitesBenevolePourFestival', () => {
  const artistes = [{id: 9, Nom: 'Marée Haute', Lieu: 1, Debut: 1800, Fin: 2700}];

  it('combine plusieurs macro-créneaux et les souhaits d\'artiste, et signale les réponses manuelles', () => {
    const reponses = new Map([
      [1, {macro: {Debut: 0, Fin: 1800}, reponse: 'Tout le créneau'}],
      [2, {macro: {Debut: 1800, Fin: 3600}, reponse: 'Pas disponible du tout'}],
      [3, {macro: {Debut: 3600, Fin: 5400}, reponse: 'dispo après 18h'}],
    ]);
    const resultat = disponibilitesBenevolePourFestival(1, reponses, ['Marée Haute'], artistes);

    expect(resultat.macroCreneauxAManuel).toEqual([3]);
    // Macro 1 : 2 quarts "Disponible". Macro 2 : 2 quarts "Indisponible", mais le
    // souhait d'artiste (1800-2700) écrase le premier de ces deux quarts en "Artiste".
    expect(resultat.disponibilites).toEqual([
      {Benevole: 1, Quart_heure: 0, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 900, Statut: 'Disponible', Artiste: null},
      {Benevole: 1, Quart_heure: 1800, Statut: 'Artiste', Artiste: 9},
      {Benevole: 1, Quart_heure: 2700, Statut: 'Indisponible', Artiste: null},
    ]);
  });

  it('sans aucune réponse ni souhait, ne produit rien', () => {
    const resultat = disponibilitesBenevolePourFestival(1, new Map(), [], []);
    expect(resultat).toEqual({disponibilites: [], macroCreneauxAManuel: []});
  });
});

describe('appliquerRemplacements', () => {
  const ligne = (benevole, quart, statut = 'Disponible') => ({Benevole: benevole, Quart_heure: quart, Statut: statut, Artiste: null});

  /** La référence : ce que fait `Magasin.remplacerDisponibilites`, un appel après l'autre. */
  function suiteDAppels(lignes, remplacements) {
    let courant = [...lignes];
    for (const {benevoleId, debut, fin, nouvelles} of remplacements) {
      courant = courant.filter((d) => !(d.Benevole === benevoleId && d.Quart_heure >= debut && d.Quart_heure < fin));
      courant.push(...nouvelles);
    }
    return courant;
  }

  function jeuFinal(lignes, remplacements) {
    const {conservees, ajoutees} = appliquerRemplacements(lignes, remplacements);
    return [...conservees, ...ajoutees];
  }

  it('ne retire que les lignes du bénévole visé, sur la plage visée, et ajoute les nouvelles à la suite', () => {
    const lignes = [ligne(1, 100), ligne(1, 200), ligne(2, 100), ligne(1, 300)];
    const nouvelles = [ligne(1, 100, 'Indisponible'), ligne(1, 115, 'Indisponible')];

    const resultat = appliquerRemplacements(lignes, [{benevoleId: 1, debut: 100, fin: 200, nouvelles}]);

    expect(resultat.retirees).toEqual([ligne(1, 100)]);
    expect(resultat.conservees).toEqual([ligne(1, 200), ligne(2, 100), ligne(1, 300)]);
    expect(resultat.ajoutees).toEqual(nouvelles);
  });

  it('rend les lignes de départ elles-mêmes, pour que l\'écriture retrouve leur identifiant', () => {
    const lignes = [{id: 7, ...ligne(1, 100)}, {id: 8, ...ligne(1, 500)}];

    const {retirees, conservees} = appliquerRemplacements(lignes, [{benevoleId: 1, debut: 100, fin: 200, nouvelles: []}]);

    expect(retirees).toEqual([{id: 7, ...ligne(1, 100)}]);
    expect(retirees[0]).toBe(lignes[0]);
    expect(conservees[0]).toBe(lignes[1]);
  });

  it('donne le même jeu qu\'une suite d\'appels quand les plages ne se recouvrent pas', () => {
    const lignes = [ligne(1, 100), ligne(2, 100), ligne(1, 400), ligne(2, 450)];
    const remplacements = [
      {benevoleId: 1, debut: 100, fin: 200, nouvelles: [ligne(1, 100, 'Indisponible')]},
      {benevoleId: 2, debut: 100, fin: 200, nouvelles: [ligne(2, 100, 'Artiste'), ligne(2, 115)]},
      {benevoleId: 1, debut: 400, fin: 500, nouvelles: [ligne(1, 400), ligne(1, 415)]},
    ];

    expect(jeuFinal(lignes, remplacements)).toEqual(suiteDAppels(lignes, remplacements));
  });

  it('un macro-créneau qui en recouvre un autre efface ce que le premier vient d\'écrire, comme la suite d\'appels', () => {
    const lignes = [ligne(1, 100)];
    const remplacements = [
      {benevoleId: 1, debut: 100, fin: 300, nouvelles: [ligne(1, 100), ligne(1, 250, 'Artiste')]},
      {benevoleId: 1, debut: 200, fin: 400, nouvelles: [ligne(1, 300)]},
    ];

    expect(jeuFinal(lignes, remplacements)).toEqual([ligne(1, 100), ligne(1, 300)]);
    expect(jeuFinal(lignes, remplacements)).toEqual(suiteDAppels(lignes, remplacements));
  });

  it('sans remplacement, ne touche à rien', () => {
    const lignes = [ligne(1, 100), ligne(2, 200)];
    expect(appliquerRemplacements(lignes, [])).toEqual({conservees: lignes, retirees: [], ajoutees: []});
  });

  it('donne le même jeu, dans le même ordre, qu\'une suite d\'appels sur 300 tirages au hasard (recouvrements compris)', () => {
    // Générateur congruentiel : mêmes tirages à chaque exécution.
    let graine = 20261019;
    const tirer = (borne) => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine % borne;
    };
    for (let essai = 0; essai < 300; essai++) {
      const lignes = [];
      for (let i = 0, n = tirer(25); i < n; i++) { lignes.push(ligne(1 + tirer(4), 15 * tirer(40), tirer(2) ? 'Disponible' : 'Artiste')); }
      const remplacements = [];
      for (let i = 0, n = tirer(9); i < n; i++) {
        const benevoleId = 1 + tirer(4);
        const debut = 15 * tirer(30);
        const fin = debut + 15 * (1 + tirer(20));
        const nouvelles = [];
        for (let j = 0, k = tirer(8); j < k; j++) {
          // Une ligne sur dix porte un autre bénévole que celui du remplacement : le contrat ne l'interdit pas.
          nouvelles.push(ligne(tirer(10) === 0 ? 1 + tirer(4) : benevoleId, debut + 15 * tirer(25), 'Indisponible'));
        }
        remplacements.push({benevoleId, debut, fin, nouvelles});
      }

      const attendu = suiteDAppels(lignes, remplacements);
      const {conservees, retirees, ajoutees} = appliquerRemplacements(lignes, remplacements);

      expect([...conservees, ...ajoutees]).toEqual(attendu);
      expect(conservees.length + retirees.length).toBe(lignes.length);
    }
  });
});
