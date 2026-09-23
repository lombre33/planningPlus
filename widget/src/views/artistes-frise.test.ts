/**
 * Vue Artistes en frise (§8.8, demande d'Antoine du 2026-09-22 : « créer
 * exactement de la même façon [que Missions], chaque groupe sera
 * l'équivalent d'une ligne […] leur horaire de passage sera un
 * sous-créneau/besoin »). Mêmes gestes que `grille.test.ts` (glisser,
 * glisser depuis une poignée de bord, clic sur piste), sur le modèle
 * Artiste plutôt que Mission.
 */
import {describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {epochDepuisHeureLocale} from '../temps';
import {LARGEUR_QUART_PX} from '../ui/frise';
import {montrerArtistes} from './artistes';

function modeleAvecPassage(): Modele {
  const debut = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 22});
  const fin = epochDepuisHeureLocale({annee: 2026, mois: 7, jour: 17, heures: 23});
  return {
    equipes: [], lieux: [{id: 1, Nom: 'Grande scène', Description: ''}], benevoles: [], missions: [],
    artistes: [{id: 1, Nom: 'Nuit Blanche', Lieu: 1, Debut: debut, Fin: fin}],
    // Le jour affiché vient désormais du macro-créneau, pas du passage
    // lui-même (filtre global, demande d'Antoine du 2026-09-23) : sans lui,
    // cette vue n'a plus d'axe du tout — même règle que Missions.
    macroCreneaux: [{id: 1, Nom: 'Soirée', Debut: debut - 3600, Fin: fin + 3600}],
    sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [],
  };
}

function poserRect(el: Element, left: number, width: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({})}),
  });
}

function glisser(bouton: HTMLElement, clientXDepart: number, deltaPx: number): void {
  bouton.dispatchEvent(new MouseEvent('mousedown', {clientX: clientXDepart, button: 0}));
  document.dispatchEvent(new MouseEvent('mousemove', {clientX: clientXDepart + deltaPx}));
  document.dispatchEvent(new MouseEvent('mouseup', {clientX: clientXDepart + deltaPx}));
}

/** Glisse depuis la poignée d'un bord (redimensionnement, remplace l'ancien
 *  geste ALT+position — voir `ui/frise.ts`). */
function glisserPoignee(bouton: HTMLElement, bord: 'debut' | 'fin', clientXDepart: number, deltaPx: number): void {
  const poignee = bouton.querySelector(`[data-poignee="${bord}"]`)!;
  poignee.dispatchEvent(new MouseEvent('mousedown', {clientX: clientXDepart, button: 0, bubbles: true}));
  document.dispatchEvent(new MouseEvent('mousemove', {clientX: clientXDepart + deltaPx}));
  document.dispatchEvent(new MouseEvent('mouseup', {clientX: clientXDepart + deltaPx}));
}

describe('montrerArtistes — frise commune au quart d’heure', () => {
  it('un passage est un bloc glissable (jamais commun, à la différence des sous-créneaux de mission)', () => {
    const m = new Magasin(modeleAvecPassage());
    const container = document.createElement('div');
    montrerArtistes(container, m);

    const bloc = container.querySelector<HTMLButtonElement>('[data-bloc-id="1"]')!;
    expect(bloc.classList.contains('timeline__bloc--propre')).toBe(true);
  });

  it('glisser un passage (sans ALT) le déplace par pas de 15 minutes, en écrivant via enregistrerArtiste', async () => {
    const m = new Magasin(modeleAvecPassage());
    const container = document.createElement('div');
    montrerArtistes(container, m);

    const bloc = container.querySelector<HTMLButtonElement>('[data-bloc-id="1"]')!;
    const [debutAvant, finAvant] = [m.artistes[0]!.Debut, m.artistes[0]!.Fin];

    glisser(bloc, 100, 2 * LARGEUR_QUART_PX); // +2 quarts = +30 min
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes[0]!.Debut).toBe(debutAvant + 1800);
    expect(m.artistes[0]!.Fin).toBe(finAvant + 1800); // les deux bornes bougent ensemble : pas de « suite » à part
  });

  it('glisser depuis la poignée de fin redimensionne depuis le bord saisi au lieu de déplacer', async () => {
    const m = new Magasin(modeleAvecPassage());
    const container = document.createElement('div');
    montrerArtistes(container, m);

    const bloc = container.querySelector<HTMLButtonElement>('[data-bloc-id="1"]')!;
    const [debutAvant, finAvant] = [m.artistes[0]!.Debut, m.artistes[0]!.Fin];

    glisserPoignee(bloc, 'fin', 3 * LARGEUR_QUART_PX, LARGEUR_QUART_PX); // +1 quart = +15 min

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(m.artistes[0]!.Debut).toBe(debutAvant); // le début ne bouge pas : poignée de fin saisie
    expect(m.artistes[0]!.Fin).toBe(finAvant + 900);
  });

  it('refuse de redimensionner sous un quart d’heure, sans écrire', async () => {
    const m = new Magasin(modeleAvecPassage());
    const container = document.createElement('div');
    document.body.append(container);
    montrerArtistes(container, m);

    const bloc = container.querySelector<HTMLButtonElement>('[data-bloc-id="1"]')!;
    const finAvant = m.artistes[0]!.Fin;

    // Le passage dure 1h (4 quarts) : le pousser de 4 quarts depuis le bord gauche le viderait.
    glisserPoignee(bloc, 'debut', LARGEUR_QUART_PX, 4 * LARGEUR_QUART_PX);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes[0]!.Fin).toBe(finAvant); // rien n'a bougé
    expect(container.textContent).toContain("moins d'un quart d'heure");

    container.remove();
  });

  it("cliquer la piste d'une ligne existante ouvre un nouveau passage pour ce même artiste, nom verrouillé", async () => {
    const m = new Magasin(modeleAvecPassage());
    const container = document.createElement('div');
    document.body.append(container);
    montrerArtistes(container, m);

    const piste = container.querySelector('.timeline__piste') as HTMLElement;
    poserRect(piste, 0, 40 * LARGEUR_QUART_PX);
    piste.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: 10 * LARGEUR_QUART_PX + 5}));

    const champNom = document.querySelector('input[placeholder="Nom de l’artiste"]') as HTMLInputElement;
    expect(champNom.value).toBe('Nuit Blanche');
    expect(champNom.disabled).toBe(true);

    (Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Créer') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes.filter((a) => a.Nom === 'Nuit Blanche')).toHaveLength(2);
    container.remove();
  });

  it("le bouton « + passage » de la ligne (même geste que « + créneau » sur une ligne de mission, grille.ts) "
    + 'ouvre un nouveau passage pour ce même artiste, nom verrouillé, sans dépendre d’une zone de piste libre à cliquer', async () => {
    const m = new Magasin(modeleAvecPassage());
    const container = document.createElement('div');
    document.body.append(container);
    montrerArtistes(container, m);

    const boutonLigne = Array.from(container.querySelectorAll('.timeline__label button'))
      .find((b) => b.textContent === '+ passage') as HTMLButtonElement;
    expect(boutonLigne).toBeTruthy();
    boutonLigne.click();

    const champNom = document.querySelector('input[placeholder="Nom de l’artiste"]') as HTMLInputElement;
    expect(champNom.value).toBe('Nuit Blanche');
    expect(champNom.disabled).toBe(true);

    (Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Créer') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(m.artistes.filter((a) => a.Nom === 'Nuit Blanche')).toHaveLength(2);
    container.remove();
  });

  it('un relâchement sans déplacement (delta nul) est un simple clic : ouvre l’édition, ne modifie aucun horaire', () => {
    const m = new Magasin(modeleAvecPassage());
    const container = document.createElement('div');
    document.body.append(container);
    montrerArtistes(container, m);

    const bloc = container.querySelector<HTMLButtonElement>('[data-bloc-id="1"]')!;
    const debutAvant = m.artistes[0]!.Debut;
    glisser(bloc, 100, 0);
    bloc.click(); // le navigateur émettrait ce clic après un mousedown/mouseup sans déplacement

    expect(m.artistes[0]!.Debut).toBe(debutAvant);
    const champNom = document.querySelector('input[placeholder="Nom de l’artiste"]') as HTMLInputElement;
    expect(champNom.value).toBe('Nuit Blanche');
    expect(champNom.disabled).toBe(false); // édition : le nom reste modifiable

    container.remove();
  });
});
