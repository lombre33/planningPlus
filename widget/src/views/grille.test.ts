import {describe, expect, it} from 'vitest';
import type {Id, Modele} from '../domain/types';
import {type EcritureGrist, Magasin} from '../store';
import {epochDepuisHeureLocale} from '../temps';
import {LARGEUR_QUART_PX} from '../ui/frise';
import {montrerGrille} from './grille';

/** Document Grist « from scratch » : toutes les tables existent (le fichier
 *  modèle les crée) mais aucune n'a de ligne. C'est exactement le point de
 *  départ qu'Antoine aura pour tester la V0.1 — pas un cas limite. */
function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [],
    affinites: [],
  };
}

describe('montrerGrille sur un document vide', () => {
  it("s'affiche sans lever d'exception, sans équipe ni mission ni sous-créneau", () => {
    const container = document.createElement('div');
    const m = new Magasin(modeleVide());

    expect(() => montrerGrille(container, m)).not.toThrow();
    expect(container.querySelector('.empty')?.textContent).toBe('Aucun sous-créneau ce jour.');

    const bouton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '+ Nouvelle mission');
    expect(bouton).toBeDefined();
  });

  it("le bouton « + Nouvelle mission », sur un document sans aucune équipe, propose de la nommer plutôt que de bloquer (demande d'Antoine du 2026-09-22)", () => {
    const container = document.createElement('div');
    document.body.append(container);
    const m = new Magasin(modeleVide());
    montrerGrille(container, m);

    const bouton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '+ Nouvelle mission') as HTMLButtonElement;
    expect(() => bouton.click()).not.toThrow();

    // Pas de blocage à l'ouverture : le champ « Équipe » est un texte libre,
    // pas un sélecteur vide, et aucune erreur ne s'affiche encore.
    expect((document.querySelector('.field-erreur') as HTMLElement | null)?.hidden).not.toBe(false);
    expect(document.body.textContent).toContain("aucune équipe");

    // La modale n'est pas dans `container` (voir `ouvrirModal`) : la fermer
    // explicitement pour ne pas polluer les tests suivants.
    (Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Annuler') as HTMLButtonElement).click();
    container.remove();
  });

  it("créer une mission sur un document sans équipe crée l'équipe nommée puis la mission, et l'utilise aussitôt", async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const m = new Magasin(modeleVide());
    montrerGrille(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '+ Nouvelle mission') as HTMLButtonElement).click();

    const champNom = document.querySelector('input[placeholder="Contrôle des bracelets"]') as HTMLInputElement;
    champNom.value = 'Contrôle billetterie';
    champNom.dispatchEvent(new Event('input'));
    const champEquipe = document.querySelector('input[placeholder="Bars"]') as HTMLInputElement;
    champEquipe.value = 'Bars';
    champEquipe.dispatchEvent(new Event('input'));

    const boutonCreer = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Créer') as HTMLButtonElement;
    boutonCreer.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.equipes).toHaveLength(1);
    expect(m.equipes[0]?.Nom).toBe('Bars');
    expect(m.missions).toHaveLength(1);
    expect(m.missions[0]?.Equipe).toBe(m.equipes[0]?.id);
    expect(document.querySelector('.modal-backdrop')).toBeNull();

    container.remove();
  });

  it("en mode connecté, si la création de l'équipe réussit mais celle de la mission échoue, un nouvel essai réutilise l'équipe déjà créée plutôt que d'en recréer une seconde", async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const m = new Magasin(modeleVide());
    let idEquipeSuivant = 501;
    let echecMission = true;
    const ecriture: EcritureGrist = {
      creerEquipe: async () => idEquipeSuivant++,
      creerMission: async () => { if (echecMission) { throw new Error('document indisponible'); } return 1; },
      creerMacroCreneau: async () => 1,
      modifierMacroCreneau: async () => {},
      supprimerMacroCreneau: async () => {},
      creerArtiste: async () => 1,
      modifierArtiste: async () => {},
      remplacerSousCreneaux: async () => [],
      modifierSousCreneaux: async () => {},
      repointerBesoins: async () => {},
      creerBesoin: async () => 1,
      creerGroupe: async () => 1,
      positionnerGroupe: async () => {},
      definirPlaces: async () => {},
      deplacerPosition: async () => {},
      ajouterPosition: async () => 1,
      supprimerPosition: async () => {},
    };
    m.brancherEcriture(ecriture);
    montrerGrille(container, m);

    (Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === '+ Nouvelle mission') as HTMLButtonElement).click();
    const champNom = document.querySelector('input[placeholder="Contrôle des bracelets"]') as HTMLInputElement;
    champNom.value = 'Contrôle billetterie';
    champNom.dispatchEvent(new Event('input'));
    const champEquipe = document.querySelector('input[placeholder="Bars"]') as HTMLInputElement;
    champEquipe.value = 'Bars';
    champEquipe.dispatchEvent(new Event('input'));
    const boutonCreer = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Créer') as HTMLButtonElement;

    boutonCreer.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(m.equipes).toHaveLength(1);
    expect(m.missions).toHaveLength(0);
    expect(document.querySelector('.field-erreur:not([hidden])')?.textContent).toContain("Échec de l'écriture");

    echecMission = false;
    boutonCreer.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(m.equipes).toHaveLength(1);
    expect(m.missions).toHaveLength(1);
    expect(m.missions[0]?.Equipe).toBe(m.equipes[0]?.id);

    container.remove();
  });
});

/** Option B (cahier des charges §6.2, décision d'Antoine du 2026-09-22) :
 *  une mission dont le rythme diffère peut se poser ses propres
 *  sous-créneaux, qui remplacent les communs pour elle, sur une frise
 *  commune au quart d'heure (CSS Grid) — retour d'Antoine du même jour
 *  contre l'ancien tableau à colonne répétée par sous-créneau. */
describe('montrerGrille — frise commune au quart d’heure et créneau propre à une mission', () => {
  function modeleAvecMission(): {m: Magasin; macroId: Id; missionId: Id} {
    const debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10});
    const fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 12});
    const m = new Magasin({
      equipes: [{id: 1, Nom: 'Bars', Couleur: '#c00', Referent: null, Notes: ''}],
      lieux: [], benevoles: [], artistes: [],
      missions: [{
        id: 1, Nom: 'Buvette', Description: '', Lieu: 0, Equipe: 1, Priorite: 'Normale', Competences_requises: [],
      }],
      macroCreneaux: [{id: 1, Nom: 'Journée', Debut: debut, Fin: fin}],
      sousCreneaux: [], besoins: [], groupes: [], positionsGroupe: [], places: [],
      disponibilites: [], souhaitsMissions: [], affinites: [],
    });
    return {m, macroId: 1, missionId: 1};
  }

  /** Pose un `getBoundingClientRect` déterministe (jsdom ne fait pas de mise
   *  en page réelle) : nécessaire pour tout test qui clique ou glisse à une
   *  position précise. */
  function poserRect(el: Element, left: number, width: number): void {
    Object.defineProperty(el, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({})}),
    });
  }

  /** Glisse un bloc par son corps (déplacement) : mousedown sur `bouton` puis
   *  mousemove/mouseup sur `document` (mêmes cibles que `demarrerGlisser`),
   *  déplacement en pixels converti en quarts d'heure par le composant
   *  lui-même. */
  function glisser(bouton: HTMLElement, clientXDepart: number, deltaPx: number): void {
    bouton.dispatchEvent(new MouseEvent('mousedown', {clientX: clientXDepart, button: 0}));
    document.dispatchEvent(new MouseEvent('mousemove', {clientX: clientXDepart + deltaPx}));
    document.dispatchEvent(new MouseEvent('mouseup', {clientX: clientXDepart + deltaPx}));
  }

  /** Glisse depuis la poignée d'un bord (redimensionnement, retour
   *  d'Antoine du 2026-09-23 — remplace l'ancien geste ALT+position) :
   *  mousedown sur `[data-poignee]`, `bubbles: true` pour que l'écouteur
   *  posé sur le bouton (délégation) le voie. */
  function glisserPoignee(bouton: HTMLElement, bord: 'debut' | 'fin', clientXDepart: number, deltaPx: number): void {
    const poignee = bouton.querySelector(`[data-poignee="${bord}"]`)!;
    poignee.dispatchEvent(new MouseEvent('mousedown', {clientX: clientXDepart, button: 0, bubbles: true}));
    document.dispatchEvent(new MouseEvent('mousemove', {clientX: clientXDepart + deltaPx}));
    document.dispatchEvent(new MouseEvent('mouseup', {clientX: clientXDepart + deltaPx}));
  }

  it("l'en-tête pose une colonne par quart d'heure sur toute la plage du macro-créneau, marquée à l'heure", async () => {
    const {m, macroId} = modeleAvecMission();
    await m.redecouperSousCreneaux(macroId, 60);
    const container = document.createElement('div');

    montrerGrille(container, m);

    expect(container.querySelectorAll('.axe-quart')).toHaveLength(8); // 2h à 15 min
    expect(container.querySelectorAll('.axe-quart--heure')).toHaveLength(2); // 10h et 11h
    // Une seule frise (un seul en-tête), jamais une par ligne de mission.
    expect(container.querySelectorAll('.timeline__coin')).toHaveLength(1);
  });

  it('sans créneau propre, la mission voit les sous-créneaux communs, un bloc par sous-créneau (largeur = sa durée en quarts), glissable (retour du 2026-09-23 : glisser un commun le rend propre)', async () => {
    const {m, macroId} = modeleAvecMission();
    await m.redecouperSousCreneaux(macroId, 60);
    const container = document.createElement('div');

    montrerGrille(container, m);

    const blocs = Array.from(container.querySelectorAll<HTMLButtonElement>('.timeline__bloc'));
    expect(blocs).toHaveLength(2);
    expect(blocs.every((b) => b.classList.contains('besoin-cell--vide'))).toBe(true);
    expect(blocs.every((b) => b.classList.contains('timeline__bloc--propre'))).toBe(true);
    expect(blocs.map((b) => b.style.gridColumn)).toEqual(['2 / 6', '6 / 10']);
  });

  it("cliquer la piste (hors de tout bloc) ouvre la création d'un créneau propre, horaire suggéré au point cliqué — remplace les communs pour cette mission", async () => {
    const {m, macroId, missionId} = modeleAvecMission();
    await m.redecouperSousCreneaux(macroId, 60);
    const container = document.createElement('div');
    document.body.append(container);
    montrerGrille(container, m);

    const piste = container.querySelector('.timeline__piste') as HTMLElement;
    poserRect(piste, 0, 8 * LARGEUR_QUART_PX);
    // Clic au 5e quart (index 4, entre 22*4=88 et 22*5=110) → 10:15 + 4*15min = 11:00.
    piste.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: 4 * LARGEUR_QUART_PX + 5}));

    const champDebut = document.querySelector('input[type="time"]') as HTMLInputElement;
    expect(champDebut.value).toBe('11:00');
    (Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Créer') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.sousCreneaux.filter((sc) => sc.Mission === missionId)).toHaveLength(1);
    // Les communs ont disparu pour cette mission : un seul bloc reste, propre à elle.
    const blocsApres = Array.from(container.querySelectorAll<HTMLButtonElement>('.timeline__bloc'));
    expect(blocsApres).toHaveLength(1);
    expect(blocsApres[0]!.classList.contains('timeline__bloc--propre')).toBe(true);

    container.remove();
  });

  it("sans aucun découpage commun sur le jour, la ligne de la mission existe déjà (piste cliquable) et accepte un créneau propre (l'un ne dépend pas de l'autre)", async () => {
    const {m, missionId} = modeleAvecMission();
    // Aucun redecouperSousCreneaux : le jour n'a encore aucun sous-créneau commun.
    const container = document.createElement('div');
    document.body.append(container);
    montrerGrille(container, m);

    expect(container.querySelector('.empty')).toBeNull();
    expect(container.querySelectorAll('.timeline__bloc')).toHaveLength(0);
    const piste = container.querySelector('.timeline__piste') as HTMLElement;
    expect(piste).not.toBeNull();
    poserRect(piste, 0, 8 * LARGEUR_QUART_PX);

    piste.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: 4 * LARGEUR_QUART_PX + 5}));
    (Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Créer') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.sousCreneaux.filter((sc) => sc.Mission === missionId)).toHaveLength(1);
    expect(container.querySelectorAll('.timeline__bloc')).toHaveLength(1);

    container.remove();
  });

  it("glisser le corps d'un créneau déjà propre le déplace par pas de 15 minutes, avec ceux qui le suivent", async () => {
    const {m, macroId, missionId} = modeleAvecMission();
    const c1 = await m.creerSousCreneauMission(macroId, missionId, {
      libelle: '10h-11h',
      debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10}),
      fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11}),
    });
    const container = document.createElement('div');
    montrerGrille(container, m);

    const bloc = container.querySelector<HTMLButtonElement>(`[data-bloc-id="${c1}"]`)!;
    const debutAvant = m.sousCreneaux.find((s) => s.id === c1)!.Debut;

    glisser(bloc, 100, 2 * LARGEUR_QUART_PX); // +2 quarts = +30 min

    expect(m.sousCreneaux.find((s) => s.id === c1)!.Debut).toBe(debutAvant + 1800);
  });

  it('pendant le glisser, un retour visuel suit la souris (translation ou largeur en ligne), effacé au relâchement (retour d\'Antoine du 2026-09-23 : « le drag ne change pas l\'affichage »)', async () => {
    const {m, macroId, missionId} = modeleAvecMission();
    const c1 = await m.creerSousCreneauMission(macroId, missionId, {
      libelle: '10h-11h',
      debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10}),
      fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11}),
    });
    const container = document.createElement('div');
    montrerGrille(container, m);
    const bloc = container.querySelector<HTMLButtonElement>(`[data-bloc-id="${c1}"]`)!;

    // Déplacement : mousedown puis mousemove SANS mouseup — la souris est
    // encore maintenue, le magasin n'a encore rien reçu.
    bloc.dispatchEvent(new MouseEvent('mousedown', {clientX: 100, button: 0}));
    document.dispatchEvent(new MouseEvent('mousemove', {clientX: 100 + 2 * LARGEUR_QUART_PX}));
    expect(bloc.style.transform).toBe(`translateX(${2 * LARGEUR_QUART_PX}px)`);
    document.dispatchEvent(new MouseEvent('mouseup', {clientX: 100 + 2 * LARGEUR_QUART_PX}));
    expect(bloc.style.transform).toBe(''); // effacé : le redessin du magasin prend le relais

    // Redimensionnement depuis la poignée de fin : largeur en ligne pendant
    // la saisie, elle aussi effacée au relâchement.
    const poignee = bloc.querySelector('[data-poignee="fin"]')!;
    poignee.dispatchEvent(new MouseEvent('mousedown', {clientX: 100, button: 0, bubbles: true}));
    document.dispatchEvent(new MouseEvent('mousemove', {clientX: 100 + LARGEUR_QUART_PX}));
    expect(bloc.style.width).toBe(`calc(100% + ${LARGEUR_QUART_PX}px)`);
    document.dispatchEvent(new MouseEvent('mouseup', {clientX: 100 + LARGEUR_QUART_PX}));
    expect(bloc.style.width).toBe('');
  });

  it('glisser depuis la poignée de fin redimensionne au lieu de déplacer, sans toucher le début', async () => {
    const {m, macroId, missionId} = modeleAvecMission();
    const c1 = await m.creerSousCreneauMission(macroId, missionId, {
      libelle: '10h-11h',
      debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10}),
      fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11}),
    });
    const container = document.createElement('div');
    montrerGrille(container, m);

    const bloc = container.querySelector<HTMLButtonElement>(`[data-bloc-id="${c1}"]`)!;
    const [debutAvant, finAvant] = [m.sousCreneaux.find((s) => s.id === c1)!.Debut, m.sousCreneaux.find((s) => s.id === c1)!.Fin];

    glisserPoignee(bloc, 'fin', 3 * LARGEUR_QUART_PX, LARGEUR_QUART_PX); // +1 quart = +15 min

    const sc = m.sousCreneaux.find((s) => s.id === c1)!;
    expect(sc.Debut).toBe(debutAvant); // le début ne bouge pas : poignée de fin saisie
    expect(sc.Fin).toBe(finAvant + 900);
  });

  it('glisser depuis la poignée de début redimensionne depuis le début, sans toucher la fin', async () => {
    const {m, macroId, missionId} = modeleAvecMission();
    const c1 = await m.creerSousCreneauMission(macroId, missionId, {
      libelle: '10h-11h',
      debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10}),
      fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11}),
    });
    const container = document.createElement('div');
    montrerGrille(container, m);

    const bloc = container.querySelector<HTMLButtonElement>(`[data-bloc-id="${c1}"]`)!;
    const [debutAvant, finAvant] = [m.sousCreneaux.find((s) => s.id === c1)!.Debut, m.sousCreneaux.find((s) => s.id === c1)!.Fin];

    glisserPoignee(bloc, 'debut', 100, -LARGEUR_QUART_PX); // -1 quart = 15 min plus tôt

    const sc = m.sousCreneaux.find((s) => s.id === c1)!;
    expect(sc.Debut).toBe(debutAvant - 900);
    expect(sc.Fin).toBe(finAvant); // la fin ne bouge pas : poignée de début saisie
  });

  it('glisser un bloc encore commun le rend propre à la mission au passage, puis le déplace (retour d\'Antoine du 2026-09-23)', async () => {
    const {m, macroId} = modeleAvecMission();
    await m.redecouperSousCreneaux(macroId, 60); // deux communs 1h, tapissent le jour, aucun bord vide
    const container = document.createElement('div');
    montrerGrille(container, m);
    const c1 = m.sousCreneaux[0]!.id;
    const bloc = container.querySelector<HTMLButtonElement>(`[data-bloc-id="${c1}"]`)!;
    const debutAvant = m.sousCreneaux.find((s) => s.id === c1)!.Debut;

    glisser(bloc, 100, 2 * LARGEUR_QUART_PX); // +2 quarts = +30 min
    await new Promise((resolve) => setTimeout(resolve, 0)); // la conversion passe par un await, contrairement au propre

    expect(m.sousCreneaux.find((s) => s.id === c1)!.Mission).toBeNull(); // le commun d'origine, inchangé
    const copie = m.sousCreneaux.find((s) => s.Mission != null)!;
    expect(copie.Debut).toBe(debutAvant + 1800);
    expect(container.querySelector(`[data-bloc-id="${copie.id}"]`)?.classList.contains('timeline__bloc--propre')).toBe(true);
  });

  it("un relâchement sans déplacement (delta nul) est un simple clic : ouvre le détail/la création, ne modifie aucun horaire", async () => {
    const {m, macroId, missionId} = modeleAvecMission();
    const c1 = await m.creerSousCreneauMission(macroId, missionId, {
      libelle: '10h-11h',
      debut: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 10}),
      fin: epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 11}),
    });
    const container = document.createElement('div');
    document.body.append(container);
    montrerGrille(container, m);

    const bloc = container.querySelector<HTMLButtonElement>(`[data-bloc-id="${c1}"]`)!;
    const debutAvant = m.sousCreneaux.find((s) => s.id === c1)!.Debut;
    glisser(bloc, 100, 0);
    bloc.click(); // le navigateur émettrait ce clic après un mousedown/mouseup sans déplacement

    expect(m.sousCreneaux.find((s) => s.id === c1)!.Debut).toBe(debutAvant);
    // Aucun besoin sur ce sous-créneau : le clic doit ouvrir sa création.
    expect(document.querySelector('.topbar__subtitle')?.textContent).toBe('10h-11h');

    container.remove();
  });
});
