import {describe, expect, it} from 'vitest';
import {Magasin} from '../store.js';
import {regrouperParJour} from './derive.js';
import {construireJournee} from './journee.js';
import {HUGO, jeuJournee, LEA, NINA, PAUL, REMI, SOFIA, TOM, ZOE} from './journee-fixtures.js';
import {ameliore, echangesPourPlace, placesPourBenevole, preparerMoteur, scenariosPourPlace} from './scenarios.js';

function contexte(options, modifier = () => {}) {
  const jeu = jeuJournee(options);
  modifier(jeu);
  const m = new Magasin(jeu);
  return {journee: construireJournee(m, regrouperParJour(m.macroCreneaux)[0]), moteur: preparerMoteur(m)};
}

const resume = (scenarios) => scenarios.map((sc) => sc.mouvements.map((mv) => `${mv.benevoleId}:${mv.de ?? '-'}>${mv.vers ?? '-'}`).join(' '));

describe('scenariosPourPlace', () => {
  it('classe d’abord celui qui réunit un binôme, puis le remplaçant direct, puis les chaînes selon ce qu’elles sacrifient', () => {
    const {journee, moteur} = contexte();
    const {scenarios} = scenariosPourPlace(journee, moteur, 4); // A2 #2, vide, 18h-22h
    expect(resume(scenarios)).toEqual([
      `${PAUL}:->4`, // réunit Tom et Paul
      `${ZOE}:->4`,
      `${NINA}:7>4 ${ZOE}:->7`, // Nina quitte la restauration qu'elle souhaite
      `${HUGO}:2>4 ${ZOE}:->2`, // sépare Léa et Hugo
      `${LEA}:1>4 ${ZOE}:->1`, // sépare Léa et Hugo, et Léa rate la Fanfare
    ]);
    expect(ameliore(scenarios[1])).toBe(true); // couvrir une place est déjà un gain
  });

  it('écarte, avec sa raison, qui ne peut ni venir ni être remplacé, et un absent à l’appel', () => {
    const {journee, moteur} = contexte();
    const {ecartes} = scenariosPourPlace(journee, moteur, 4);
    const raisons = new Map(ecartes.map((e) => [e.benevoleId, e.raison]));
    expect(raisons.get(SOFIA)).toMatch(/pas disponible/); // même libérée de B1, elle ne l'est pas le soir
    expect(raisons.get(TOM)).toMatch(/déjà pris/);
    expect(raisons.get(REMI)).toMatch(/absent·e à l’appel/);
  });

  it('remplace un absent à l’appel sans jamais le reproposer', () => {
    const {journee, moteur} = contexte();
    const {scenarios} = scenariosPourPlace(journee, moteur, 5); // B1 #1, tenue par Rémi, absent
    expect(resume(scenarios)[0]).toBe(`${ZOE}:->5`);
    expect(scenarios.flatMap((sc) => sc.mouvements.map((mv) => mv.benevoleId))).not.toContain(REMI);
  });

  it('ne touche jamais une place verrouillée, ni pour la couvrir ni pour y prendre quelqu’un', () => {
    const verrouillee = contexte({}, (jeu) => { jeu.places[3].Verrouillee = true; });
    expect(scenariosPourPlace(verrouillee.journee, verrouillee.moteur, 4)).toMatchObject({verrouillee: true, scenarios: []});

    const donneuseVerrouillee = contexte({}, (jeu) => { jeu.places[6].Verrouillee = true; }); // R1 #1, Nina
    const {scenarios, ecartes} = scenariosPourPlace(donneuseVerrouillee.journee, donneuseVerrouillee.moteur, 4);
    expect(resume(scenarios).some((s) => s.startsWith(`${NINA}:`))).toBe(false);
    expect(ecartes.find((e) => e.benevoleId === NINA)?.raison).toMatch(/verrouillée/);
  });
});

describe('echangesPourPlace', () => {
  it('propose les échanges possibles et « un libre la remplace », jamais avec un absent', () => {
    const {journee, moteur} = contexte();
    const {scenarios, ecartes} = echangesPourPlace(journee, moteur, 3); // A2 #1, Tom
    expect(resume(scenarios)).toEqual([
      `${ZOE}:->3 ${TOM}:3>-`,
      `${PAUL}:->3 ${TOM}:3>-`,
      `${TOM}:3>7 ${NINA}:7>3`, // Nina quitterait la restauration
    ]);
    expect(ecartes.map((e) => e.benevoleId)).toEqual([LEA, HUGO, SOFIA]);
    expect(scenarios.some(ameliore)).toBe(false); // aucun ne réunit Tom et Paul : A2 #2 reste à part
  });
});

describe('placesPourBenevole', () => {
  it('liste les places à couvrir qu’une personne libre peut prendre, la plus utile d’abord', () => {
    const {journee, moteur} = contexte();
    const {scenarios, ecartes} = placesPourBenevole(journee, moteur, PAUL);
    expect(resume(scenarios)).toEqual([`${PAUL}:->4`, `${PAUL}:->8`]);
    expect(ecartes).toEqual([{etiquette: 'B1 #1', raison: 'pas disponible sur tous ses créneaux'}]);
  });
});
