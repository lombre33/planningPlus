import {afterEach, describe, expect, it} from 'vitest';
import {demarrerApp} from './app';
import {jeuMinimal} from './dev/jeu-minimal';
import {normaliser} from './donnees/normaliser';
import {Magasin} from './store';

/** Test de fumée : monte chaque onglet de l'application sur un jeu de données
 *  (le plus pauvre, puis le plus riche) et vérifie qu'il se construit sans
 *  exception et produit du contenu. Filet de sécurité pour les vues qui n'ont
 *  pas de test dédié (Jour J, Terrain, Anomalies, Bénévole). */
describe.each([
  ['jeu minimal', () => new Magasin(jeuMinimal())],
  ['jeu réaliste', () => new Magasin(normaliser())],
])('démarrage de toutes les vues — %s', (_nom, creerMagasin) => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('chaque onglet se monte sans erreur et affiche un titre et du contenu', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const racine = document.getElementById('app')!;
    demarrerApp(racine, creerMagasin(), 'test');
    const boutons = Array.from(racine.querySelectorAll<HTMLButtonElement>('.rail__item'));
    expect(boutons.length).toBe(13);
    for (const bouton of boutons) {
      bouton.click();
      expect(racine.querySelector('h1')?.textContent, bouton.textContent ?? '').toBeTruthy();
      expect(racine.querySelector('.view')?.children.length, bouton.textContent ?? '').toBeGreaterThan(0);
    }
  });
});
