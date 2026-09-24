/**
 * Vérifie sur la vue Agenda (§8, vue 1 du parcours) ce qui a été validé à la
 * main sur la maquette réelle mais n'avait encore aucun test : une soirée
 * qui déborde sur le lendemain reste un seul bloc rattaché au jour de
 * festival de la veille (§6.2), le glisser-déplacer et le redimensionnement
 * s'accrochent au quart d'heure plutôt que de poser une heure arbitraire, et
 * un document neuf sans aucun macro-créneau reste affichable.
 */
import {beforeEach, describe, expect, it} from 'vitest';
import type {Modele} from '../domain/types';
import {Magasin} from '../store';
import {epochDepuisHeureLocale} from '../temps';
import {montrerAgenda} from './agenda';

function modeleVide(): Modele {
  return {
    equipes: [], lieux: [], benevoles: [], missions: [], artistes: [],
    macroCreneaux: [], sousCreneaux: [], besoins: [], groupes: [],
    positionsGroupe: [], places: [], disponibilites: [], souhaitsMissions: [], affinites: [], presences: [],
  };
}

const VENDREDI = {annee: 2026, mois: 7, jour: 17};

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  return () => container.remove();
});

describe('document neuf, sans aucun macro-créneau', () => {
  it("s'affiche sur un cadre 9h-18h par défaut plutôt qu'une grille dégénérée, sans lever", () => {
    const m = new Magasin(modeleVide());
    expect(() => montrerAgenda(container, m)).not.toThrow();
    expect(container.querySelectorAll('.macro-bloc')).toHaveLength(0);
    const libellesAxe = Array.from(container.querySelectorAll('.agenda__axis-tick')).map((el) => el.textContent);
    expect(libellesAxe[0]).toBe('09h');
    expect(libellesAxe.at(-1)).toBe('18h');
    expect(container.querySelector('button')?.textContent).toContain('Nouveau jour');
  });
});

describe('soirée à cheval sur minuit (§6.2)', () => {
  function modeleSoiree(): Modele {
    const debut = epochDepuisHeureLocale({...VENDREDI, heures: 18});
    const fin = epochDepuisHeureLocale({...VENDREDI, jour: VENDREDI.jour + 1, heures: 2}); // 2h le samedi matin
    return {
      ...modeleVide(),
      macroCreneaux: [{id: 1, Nom: 'Soirée', Debut: debut, Fin: fin}],
      sousCreneaux: [
        {id: 1, Macro_creneau: 1, Mission: null, Libelle: '18h-19h', Debut: debut, Fin: debut + 3600},
        {
          id: 2, Macro_creneau: 1, Mission: null, Libelle: '00h-01h',
          Debut: epochDepuisHeureLocale({...VENDREDI, jour: VENDREDI.jour + 1, heures: 0}),
          Fin: epochDepuisHeureLocale({...VENDREDI, jour: VENDREDI.jour + 1, heures: 1}),
        },
        {
          id: 3, Macro_creneau: 1, Mission: null, Libelle: '01h-02h',
          Debut: epochDepuisHeureLocale({...VENDREDI, jour: VENDREDI.jour + 1, heures: 1}),
          Fin: fin,
        },
      ],
    };
  }

  it('reste un seul jour, un seul bloc, avec ses sous-créneaux du petit matin rattachés à la veille', () => {
    const m = new Magasin(modeleSoiree());
    montrerAgenda(container, m);

    // Un seul jour de festival affiché (pas un deuxième pour le samedi matin).
    expect(container.querySelectorAll('.agenda__day-head')).toHaveLength(1);
    expect(container.querySelector('.agenda__day-head .jour')?.textContent?.toLowerCase()).toContain('vendredi');

    // Un seul bloc macro-créneau, pas deux morceaux orphelins de part et
    // d'autre de minuit.
    const blocs = container.querySelectorAll('.macro-bloc');
    expect(blocs).toHaveLength(1);

    // Ses trois sous-créneaux, y compris ceux du samedi matin, vivent dans ce
    // même bloc.
    expect(blocs[0]!.querySelectorAll('.sous-bloc')).toHaveLength(3);
    expect(blocs[0]!.textContent).toContain('00h-01h');
    expect(blocs[0]!.textContent).toContain('01h-02h');

    // Le repère de minuit est posé une fois, à l'intérieur du bloc continu.
    expect(container.querySelectorAll('.agenda__minuit')).toHaveLength(1);
  });
});

describe('accrochage au quart d\'heure', () => {
  function modeleUnMacro(): {modele: Modele; debut: number; fin: number} {
    const debut = epochDepuisHeureLocale({...VENDREDI, heures: 10});
    const fin = epochDepuisHeureLocale({...VENDREDI, heures: 12});
    return {
      modele: {...modeleVide(), macroCreneaux: [{id: 1, Nom: 'Journée', Debut: debut, Fin: fin}]},
      debut, fin,
    };
  }

  function glisser(cible: Element, deltaPx: number): void {
    cible.dispatchEvent(new MouseEvent('mousedown', {clientX: 0, bubbles: true}));
    document.dispatchEvent(new MouseEvent('mousemove', {clientX: deltaPx}));
    document.dispatchEvent(new MouseEvent('mouseup', {clientX: deltaPx}));
  }

  it('déplacer le bloc pose un nouveau début arrondi au quart d\'heure, durée conservée', () => {
    const {modele, debut, fin} = modeleUnMacro();
    const m = new Magasin(modele);
    montrerAgenda(container, m);

    const bloc = container.querySelector('.macro-bloc') as HTMLElement;
    const entete = bloc.querySelector('.macro-bloc__head') as HTMLElement;
    // Le bloc commence exactement au bord gauche de la plage (macro seul sur
    // sa journée) : sa largeur en pixels correspond donc uniquement à sa
    // durée, ce qui permet de retrouver px-par-minute sans dépendre d'une
    // constante interne à agenda.ts.
    expect(bloc.style.left).toBe('0px');
    const dureeMinutes = (fin - debut) / 60;
    const pxParMinute = parseFloat(bloc.style.width) / dureeMinutes;

    // Glisse d'une valeur qui ne tombe pas sur un multiple de 15 minutes
    // (20 minutes brutes) : doit s'accrocher au quart d'heure le plus proche
    // (15 minutes), pas rester sur une heure arbitraire.
    glisser(entete, pxParMinute * 20);

    const macroApres = m.macroCreneaux[0]!;
    expect(macroApres.Debut).toBe(debut + 15 * 60);
    expect(macroApres.Fin - macroApres.Debut).toBe(fin - debut); // durée inchangée
  });

  it('redimensionner par le bord droit pose une nouvelle fin arrondie au quart d\'heure', () => {
    const {modele, debut, fin} = modeleUnMacro();
    const m = new Magasin(modele);
    montrerAgenda(container, m);

    const bloc = container.querySelector('.macro-bloc') as HTMLElement;
    const poigneeDroite = bloc.querySelector('.macro-bloc__resize--droite') as HTMLElement;
    const dureeMinutes = (fin - debut) / 60;
    const pxParMinute = parseFloat(bloc.style.width) / dureeMinutes;

    // Élargit de 20 minutes brutes : doit s'arrondir à 15 minutes de plus,
    // pas rester sur la valeur brute.
    glisser(poigneeDroite, pxParMinute * 20);

    const macroApres = m.macroCreneaux[0]!;
    expect(macroApres.Debut).toBe(debut);
    expect(macroApres.Fin).toBe(fin + 15 * 60);
  });

  it('redimensionner par le bord gauche pose un nouveau début arrondi, sans toucher la fin', () => {
    const {modele, debut, fin} = modeleUnMacro();
    const m = new Magasin(modele);
    montrerAgenda(container, m);

    const bloc = container.querySelector('.macro-bloc') as HTMLElement;
    const poigneeGauche = bloc.querySelector('.macro-bloc__resize--gauche') as HTMLElement;
    const dureeMinutes = (fin - debut) / 60;
    const pxParMinute = parseFloat(bloc.style.width) / dureeMinutes;

    // Réduit de 20 minutes brutes en tirant le bord gauche vers la droite :
    // doit s'arrondir à 15 minutes de moins sur le début.
    glisser(poigneeGauche, pxParMinute * 20);

    const macroApres = m.macroCreneaux[0]!;
    expect(macroApres.Debut).toBe(debut + 15 * 60);
    expect(macroApres.Fin).toBe(fin);
  });
});
