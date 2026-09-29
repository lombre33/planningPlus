import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {HUGO, jeuJournee, LEA} from '../logic/journee-fixtures.js';
import {Magasin} from '../store.js';
import {montrerDesistements} from './desistements.js';

const texte = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const attendre = () => new Promise((resolve) => { setTimeout(resolve, 0); });

let container;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(() => { document.body.innerHTML = ''; });

/** Léa tient A1 #1 (après-midi) et A2 #1 (soirée, verrouillée à la main). */
function magasin() {
  const jeu = jeuJournee({places: [LEA, HUGO, LEA, null, null, null, null, null], absents: []});
  jeu.places.find((p) => p.id === 3).Verrouillee = true;
  return new Magasin(jeu);
}

const ligneDe = (nom) => [...container.querySelectorAll('.benevole-row')].find((l) => texte(l.querySelector('.nom')) === nom);
const bouton = (racine, libelle) => [...racine.querySelectorAll('button')].find((b) => texte(b) === libelle);

describe('Bénévoles › Désistements', () => {
  it('montre les places que le désistement libère et celles qu’il garde, avant d’écrire quoi que ce soit', () => {
    const m = magasin();
    montrerDesistements(container, m);
    expect(texte(ligneDe('Léa Martin'))).toContain('2 places sur 1 jour, dont 1 verrouillée');

    bouton(ligneDe('Léa Martin'), 'Se désiste…').click();
    const modal = document.querySelector('.modal');
    expect(texte(modal.querySelector('h3'))).toBe('Désistement de Léa Martin');
    const [liberees, gardees] = [...modal.querySelectorAll('.desistement__places')].map((ul) => [...ul.children].map(texte));
    expect(liberees).toEqual([expect.stringMatching(/^A1 #1 · .+ : Bar 14:00–18:00$/)]);
    expect(gardees).toEqual([expect.stringMatching(/^A2 #1 · .+ : Bar 18:00–22:00$/)]);
    // Rien n'est écrit tant qu'on n'a pas confirmé.
    expect(m.benevoles.find((b) => b.id === LEA).Statut).toBe('Actif');
    expect(m.places.filter((p) => p.Benevole === LEA).map((p) => p.id)).toEqual([1, 3]);

    bouton(modal, 'Annuler').click();
    expect(document.querySelector('.modal')).toBeNull();
    expect(m.places.filter((p) => p.Benevole === LEA).map((p) => p.id)).toEqual([1, 3]);
  });

  it('libère à la confirmation les places non verrouillées, et le dit', async () => {
    const m = magasin();
    montrerDesistements(container, m);
    bouton(ligneDe('Léa Martin'), 'Se désiste…').click();
    bouton(document.querySelector('.modal'), 'Libérer 1 place').click();
    await attendre();

    expect(m.benevoles.find((b) => b.id === LEA).Statut).toBe('Absent');
    expect(m.places.filter((p) => p.Benevole === LEA).map((p) => p.id)).toEqual([3]);
    expect(texte(container.querySelector('[role="status"]'))).toBe('Désistement de Léa Martin enregistré : 1 place libérée, à pourvoir dans la table du jour.');
    expect(texte(ligneDe('Léa Martin'))).toContain('Désisté·e');
    expect(bouton(ligneDe('Léa Martin'), 'Vient finalement…')).toBeTruthy();
  });

  it('annule un désistement sans rendre les places', async () => {
    const m = magasin();
    montrerDesistements(container, m);
    bouton(ligneDe('Léa Martin'), 'Se désiste…').click();
    bouton(document.querySelector('.modal'), 'Libérer 1 place').click();
    await attendre();

    bouton(ligneDe('Léa Martin'), 'Vient finalement…').click();
    bouton(document.querySelector('.modal'), 'Annuler le désistement').click();
    await attendre();
    expect(m.benevoles.find((b) => b.id === LEA).Statut).toBe('Actif');
    expect(m.places.filter((p) => p.Benevole === LEA).map((p) => p.id)).toEqual([3]);
    expect(texte(container.querySelector('[role="status"]'))).toBe('Désistement de Léa Martin annulé.');
  });
});
