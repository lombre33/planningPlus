/**
 * Table du jour (maquette B, validée par Antoine le 2026-09-29) : une ligne
 * par place, le panneau Scénarios au clic, le brouillon qui n'écrit rien
 * avant « Appliquer au planning », l'appel qui ne touche aucune place.
 * Jeu : `logic/journee-fixtures.js` (un vendredi, quatre indicatifs de deux
 * places, Rémi absent à l'appel sur B1 #1, A2 #2 et R1 #2 vides).
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {HUGO, jeuJournee, LEA, NINA, PAUL, REMI, SOFIA, t, TOM, ZOE} from '../logic/journee-fixtures.js';
import {Magasin} from '../store.js';
import {montrerAffectation} from './affectation.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let montees = [];
afterEach(() => {
  for (const {detruire, container} of montees) { detruire(); container.remove(); }
  montees = [];
  vi.restoreAllMocks();
});

function monter(options = {}, modifier = () => {}, m = null) {
  let magasin = m;
  if (!magasin) {
    const jeu = jeuJournee(options);
    modifier(jeu);
    magasin = new Magasin(jeu);
  }
  const container = document.createElement('div');
  document.body.append(container);
  const detruire = montrerAffectation(container, magasin);
  montees.push({detruire, container});
  return {m: magasin, container, detruire};
}

const texte = (el) => el.textContent.replace(/\s+/g, ' ').trim();
/** Une ligne par le début de son nom accessible (qui, où), suivi ou non de ses détails. */
const ligne = (container, libelle) => [...container.querySelectorAll('.tj-nom[role="button"]')]
  .find((el) => el.getAttribute('aria-label') === libelle || el.getAttribute('aria-label').startsWith(`${libelle}, `));
const bouton = (racine, libelle) => [...racine.querySelectorAll('button')].find((b) => texte(b) === libelle);
const panneau = (container) => container.querySelector('.tj-panneau');
const barre = (container) => container.querySelector('.tj-brouillon');
const place = (m, id) => m.places.find((p) => p.id === id);

describe('table du jour', () => {
  it('montre une ligne par place, les places à couvrir, l’absent en jaune et les compteurs', () => {
    const {container} = monter();
    expect(ligne(container, 'Léa Martin, A1 #1')).toBeTruthy();
    expect(ligne(container, 'A2 #2 à pourvoir')).toBeTruthy();
    expect(ligne(container, 'R1 #2 à pourvoir')).toBeTruthy();
    const remi = ligne(container, 'Rémi Blanc, absent·e, B1 #1').closest('.tj-ligne');
    expect(texte(remi)).toContain('absent·e à l’appel');
    expect(remi.querySelector('.tj-bloc--absent')).toBeTruthy();
    expect(texte(container.querySelector('.tj-compteurs'))).toContain('5 / 8 places couvertes');
    expect(texte(container.querySelector('.tj-compteurs'))).toContain('1 / 2 binômes réunis');
    // Zoé et Paul n'ont pas d'indicatif ce jour : section à part.
    expect(texte(container)).toContain('Sans indicatif aujourd’hui (2)');
  });

  it('dit quoi faire quand aucun jour n’existe encore, ou qu’aucun indicatif n’est positionné', () => {
    const sansJour = monter({}, (jeu) => { jeu.macroCreneaux = []; });
    expect(texte(sansJour.container)).toContain('créez d’abord un macro-créneau');
    const sansIndicatif = monter({}, (jeu) => { jeu.positionsGroupe = []; });
    expect(texte(sansIndicatif.container)).toContain('Aucun indicatif positionné ce jour-là. Positionnez des indicatifs');
  });
});

describe('panneau Scénarios', () => {
  it('liste les remplacements d’une place vide, le mieux classé d’abord', () => {
    const {container} = monter();
    ligne(container, 'A2 #2 à pourvoir').click();
    const p = panneau(container);
    expect(texte(p)).toContain('A2 #2 à pourvoir');
    const premier = p.querySelector('.tj-scn--premier');
    expect(texte(premier)).toContain('Le mieux classé');
    expect(texte(premier)).toContain('Paul Morel, sans indicatif, prend A2 #2');
    expect(texte(premier)).toContain('♥ +1 binôme souhaité : Tom Leroy et Paul Morel');
    expect(texte(p)).toContain('Écartés');
  });

  it('remplace un absent sans jamais le reproposer', () => {
    const {container} = monter();
    ligne(container, 'Rémi Blanc, absent·e, B1 #1').click();
    const p = panneau(container);
    expect(texte(p)).toContain('Remplacer Rémi Blanc en B1 #1');
    expect(texte(p.querySelector('.tj-scn--premier'))).toContain('à la place de Rémi Blanc (absent·e)');
    const mouvements = [...p.querySelectorAll('.tj-scn__mouvements')].map(texte).join(' ');
    expect(mouvements).not.toMatch(/Rémi Blanc (passe|prend|quitte)/);
  });

  it('montre les échanges d’une personne en place et permet de la retirer', () => {
    const {m, container} = monter();
    ligne(container, 'Tom Leroy, A2 #1').click();
    const p = panneau(container);
    expect(texte(p)).toContain('Échanges possibles');
    bouton(p, 'Retirer de la place').click();
    expect(ligne(container, 'A2 #1 à pourvoir')).toBeTruthy();
    expect(texte(container.querySelector('.tj-message'))).toContain('la place redevient libre');
    expect(place(m, 3).Benevole).toBe(TOM); // rien d'écrit avant « Appliquer »
  });
});

describe('brouillon', () => {
  it('garde un scénario hors du planning, puis l’écrit d’un coup', async () => {
    const {m, container} = monter();
    ligne(container, 'A2 #2 à pourvoir').click();
    bouton(panneau(container).querySelector('.tj-scn--premier'), 'Ajouter au brouillon').click();

    const paul = ligne(container, 'Paul Morel, A2 #2').closest('.tj-ligne');
    expect(texte(paul)).toContain('avant : vide');
    expect(paul.classList.contains('tj-ligne--change')).toBe(true);
    expect(texte(barre(container))).toContain('Brouillon : 1 place change');
    expect(texte(barre(container))).toContain('♥ Binômes 1 → 2');
    expect(place(m, 4).Benevole).toBeNull();

    bouton(barre(container), 'Appliquer au planning').click();
    await tick();
    expect(place(m, 4)).toMatchObject({Benevole: PAUL, Origine: 'Manuel', Verrouillee: true});
    expect(texte(barre(container))).toContain('Brouillon vide');
    expect(texte(container.querySelector('.tj-message'))).toContain('1 place écrite');
  });

  it('montre un aperçu dans la table sans rien ajouter', () => {
    const {container} = monter();
    ligne(container, 'A2 #2 à pourvoir').click();
    bouton(panneau(container), 'Voir dans la table').click();
    expect(ligne(container, 'Paul Morel, A2 #2').closest('.tj-ligne').querySelector('.tj-bloc--apercu')).toBeTruthy();
    expect(texte(barre(container))).toContain('Brouillon vide');
    bouton(panneau(container), 'Masquer l’aperçu').click();
    expect(ligne(container, 'A2 #2 à pourvoir')).toBeTruthy();
  });

  it('annule le dernier ajout, puis tout', () => {
    const {container} = monter();
    ligne(container, 'A2 #2 à pourvoir').click();
    bouton(panneau(container).querySelector('.tj-scn--premier'), 'Ajouter au brouillon').click();
    ligne(container, 'R1 #2 à pourvoir').click();
    bouton(panneau(container).querySelector('.tj-scn--premier'), 'Ajouter au brouillon').click();
    expect(texte(barre(container))).toContain('Brouillon : 2 places changent');
    bouton(barre(container), 'Annuler le dernier').click();
    expect(texte(barre(container))).toContain('Brouillon : 1 place change');
    bouton(barre(container), 'Tout annuler').click();
    expect(texte(barre(container))).toContain('Brouillon vide');
  });

  it('relance l’algorithme dans le brouillon sans rien écrire', () => {
    const {m, container} = monter();
    const avant = m.places.map((p) => p.Benevole);
    bouton(container, 'Répartir automatiquement').click();
    expect(texte(container.querySelector('.tj-message'))).toMatch(/L'algorithme a ajouté \d+ changements? au brouillon/);
    expect(m.places.map((p) => p.Benevole)).toEqual(avant);
    expect(texte(barre(container))).toMatch(/Brouillon : \d+ places? change/);
  });

  it('survit à un changement d’onglet', () => {
    const {m, container, detruire} = monter();
    ligne(container, 'A2 #2 à pourvoir').click();
    bouton(panneau(container).querySelector('.tj-scn--premier'), 'Ajouter au brouillon').click();
    detruire();
    montees = montees.filter((x) => x.detruire !== detruire);
    const autre = monter({}, () => {}, m);
    expect(texte(barre(autre.container))).toContain('Brouillon : 1 place change');
  });

  it('suit le jour du bandeau, et compte ce que le brouillon change un autre jour', () => {
    const {m, container} = monter({}, (jeu) => { jeu.macroCreneaux.push({id: 2, Nom: 'Samedi', Debut: t(14) + 86400, Fin: t(26) + 86400}); });
    ligne(container, 'A2 #2 à pourvoir').click();
    bouton(panneau(container).querySelector('.tj-scn--premier'), 'Ajouter au brouillon').click();
    m.selectionnerMacroCreneau(2);
    expect(texte(container)).toContain('Aucun indicatif positionné ce jour-là');
    expect(texte(barre(container))).toContain('Brouillon : 1 place change (dont 1 un autre jour)');
    expect(texte(panneau(container))).toContain('Cliquez une place à pourvoir ou une personne');
    m.selectionnerMacroCreneau(1);
    expect(ligne(container, 'Paul Morel, A2 #2')).toBeTruthy();
  });

  it('bloque « Réinitialiser tout » tant que le brouillon n’est pas vide', () => {
    const {container} = monter();
    expect(bouton(container, 'Réinitialiser tout').disabled).toBe(false);
    ligne(container, 'A2 #2 à pourvoir').click();
    bouton(panneau(container).querySelector('.tj-scn--premier'), 'Ajouter au brouillon').click();
    expect(bouton(container, 'Réinitialiser tout').disabled).toBe(true);
  });

  it('accepte un choix libre contre les critères, en disant ce qu’il enfreint', () => {
    const {container} = monter();
    ligne(container, 'A2 #2 à pourvoir').click();
    const choix = panneau(container).querySelector('.tj-choix');
    const select = choix.querySelector('select');
    const sofia = [...select.options].find((o) => o.textContent.startsWith('Sofia Roux'));
    expect(sofia.textContent).toBe('Sofia Roux (quitte B1 #2) · contre : pas disponible sur tous ses créneaux');
    const tom = [...select.options].find((o) => o.textContent.startsWith('Tom Leroy'));
    expect(tom.disabled).toBe(true); // déjà en A2 #1
    select.value = sofia.value;
    select.dispatchEvent(new Event('change'));
    bouton(choix, 'Ajouter au brouillon').click();
    expect(texte(container.querySelector('.tj-message'))).toContain('Ajouté au brouillon malgré : Sofia Roux (quitte B1 #2), pas disponible sur tous ses créneaux.');
    expect(texte(container.querySelector('.tj-message'))).toContain('B1 #2 redevient libre');
    const ligneSofia = ligne(container, 'Sofia Roux, A2 #2').closest('.tj-ligne');
    expect(ligneSofia.querySelector('.tj-bloc--hors-dispo')).toBeTruthy();
    expect(texte(ligneSofia)).toContain('avant : vide');
  });
});

describe('appel', () => {
  it('pointe une absence sans toucher aux places, et ouvre ses remplacements', async () => {
    const {m, container} = monter();
    const avant = m.places.map((p) => p.Benevole);
    const tom = ligne(container, 'Tom Leroy, A2 #1');
    bouton(tom, '✗').click();
    await tick();
    expect(m.presences.find((p) => p.Benevole === TOM)).toMatchObject({Present: false});
    expect(m.places.map((p) => p.Benevole)).toEqual(avant);
    expect(texte(ligne(container, 'Tom Leroy, absent·e, A2 #1').closest('.tj-ligne'))).toContain('absent·e à l’appel');
    expect(texte(panneau(container))).toContain('Remplacer Tom Leroy en A2 #1');
    expect(texte(container.querySelector('.tj-message'))).toContain('sa place A2 #1 reste à son nom');
  });

  it('rend un absent de nouveau proposable quand on le pointe présent', async () => {
    const {m, container} = monter();
    bouton(ligne(container, 'Rémi Blanc, absent·e, B1 #1'), '✓').click();
    await tick();
    expect(m.presences.find((p) => p.Benevole === REMI)).toMatchObject({Present: true});
    expect(ligne(container, 'Rémi Blanc, B1 #1')).toBeTruthy();
  });
});

describe('signaux de l’ancien écran Anomalies, dans la table', () => {
  const pastille = (container) => [...container.querySelectorAll('.tj-compteurs .tj-stat')].find((p) => texte(p).endsWith('à vérifier'));
  // Toutes les places tenues, chacun dans ses disponibilités : aucun signal.
  const complet = {places: [LEA, HUGO, TOM, PAUL, REMI, SOFIA, NINA, ZOE], absents: []};

  it('met en tête les effectifs à revoir, repliés, une ligne par mission, et les compte à vérifier', () => {
    const {container} = monter();
    // Rémi absent : Accueil à 1 / 2 l'après-midi ; A2 #2 et R1 #2 vides : Bar et Restauration à 1 / 2 le soir.
    // Repliés d'abord, pour que les places restent en haut de la table.
    const bascule = bouton(container, '▸ Effectifs à revoir (3)');
    expect(bascule.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.tj-effectifs')).toBeNull();
    bascule.click();
    expect(bouton(container, '▾ Effectifs à revoir (3)').getAttribute('aria-expanded')).toBe('true');
    expect([...container.querySelectorAll('.tj-effectifs .tj-nom')].map((el) => el.getAttribute('aria-label'))).toEqual([
      'Accueil : 1 créneau sous le minimum', 'Bar : 1 créneau sous le minimum', 'Restauration : 1 créneau sous le minimum',
    ]);
    expect(texte(pastille(container))).toBe('3 à vérifier');
    expect(pastille(container).classList.contains('tj-stat--danger')).toBe(true);

    const vide = monter(complet).container;
    expect(texte(vide)).not.toContain('Effectifs à revoir');
    expect(pastille(vide)).toBeUndefined();
  });

  it('marque en rouge une mission refusée et deux places en même temps, détail au panneau', () => {
    const {container} = monter({places: [LEA, HUGO, TOM, PAUL, LEA, SOFIA, NINA, ZOE], absents: []}, (jeu) => {
      jeu.souhaitsMissions.push({id: 2, Benevole: HUGO, Mission: 1, Preference: 'Refuse'});
    });
    const hugo = ligne(container, 'Hugo Petit, A1 #2');
    expect(hugo.getAttribute('aria-label')).toBe('Hugo Petit, A1 #2, a refusé Bar, avec son binôme souhaité');
    expect(texte(hugo.closest('.tj-ligne').querySelector('.tj-alerte'))).toBe('a refusé Bar');
    expect(hugo.closest('.tj-ligne').querySelector('.tj-bloc--alerte')).toBeTruthy();
    // Léa tient A1 #1 et B1 #1, tous deux l'après-midi.
    expect(ligne(container, 'Léa Martin, A1 #1').getAttribute('aria-label')).toContain('en même temps sur B1 #1');
    expect(ligne(container, 'Léa Martin, B1 #1').getAttribute('aria-label')).toContain('en même temps sur A1 #1');
    expect(texte(pastille(container))).toBe('3 à vérifier');

    hugo.click();
    expect(texte(panneau(container))).toContain('A refusé la mission Bar.');
  });

  it('dit sans rouge qu’une personne n’a déclaré aucune disponibilité', () => {
    const {container} = monter(complet, (jeu) => { jeu.disponibilites = jeu.disponibilites.filter((d) => d.Benevole !== HUGO); });
    const hugo = ligne(container, 'Hugo Petit, A1 #2').closest('.tj-ligne');
    expect(texte(hugo)).toContain('pas de disponibilité déclarée');
    expect(hugo.querySelector('.tj-alerte, .tj-bloc--hors-dispo, .tj-bloc--alerte')).toBeNull();
    expect(texte(pastille(container))).toBe('1 à vérifier');
    expect(pastille(container).classList.contains('tj-stat--neutral')).toBe(true);
  });

  it('montre un désisté « désisté·e » sur sa place verrouillée, sans boutons d’appel', () => {
    const {container} = monter({absents: []}, (jeu) => {
      jeu.benevoles.find((b) => b.id === TOM).Statut = 'Absent';
      jeu.places[2].Verrouillee = true;
    });
    const tom = ligne(container, 'Tom Leroy, désisté·e, A2 #1').closest('.tj-ligne');
    expect(texte(tom)).toContain('désisté·e');
    expect(tom.querySelector('.tj-appel')).toBeNull();
    expect(tom.querySelector('.tj-bloc--absent')).toBeTruthy();
  });
});

describe('verrous', () => {
  it('déverrouille tout de suite une place verrouillée dans le planning', async () => {
    const {m, container} = monter({}, (jeu) => { jeu.places[1].Verrouillee = true; });
    ligne(container, 'Hugo Petit, A1 #2').click();
    expect(texte(panneau(container))).toContain('Place verrouillée');
    bouton(panneau(container), 'Déverrouiller').click();
    await tick();
    expect(place(m, 2).Verrouillee).toBe(false);
    expect(texte(panneau(container))).toContain('Échanges possibles');
  });

  it('verrouille vide une place à pourvoir, pour que l’algorithme la laisse', async () => {
    const {m, container} = monter();
    ligne(container, 'R1 #2 à pourvoir').click();
    bouton(panneau(container), 'Verrouiller vide').click();
    await tick();
    expect(place(m, 8)).toMatchObject({Benevole: null, Verrouillee: true});
    bouton(container, 'Répartir automatiquement').click();
    expect(ligne(container, 'R1 #2 à pourvoir')).toBeTruthy();
  });

});

describe('état d’une personne', () => {
  it('montre son binôme réuni et l’artiste qu’elle voit', () => {
    const {container} = monter();
    ligne(container, 'Léa Martin, A1 #1').click();
    const etat = texte(panneau(container).querySelector('.tj-panneau__etat'));
    expect(etat).toContain('♥ avec Hugo Petit, binôme souhaité');
    expect(etat).toContain('♪ voit Fanfare');
  });
});
