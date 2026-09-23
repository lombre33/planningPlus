/**
 * `value`/`defaultValue`/`checked`/`defaultChecked`/`selected` doivent être
 * posés comme propriété DOM, pas comme attribut HTML (voir le doc-comment
 * de `PROPRIETES_DOM`, `dom.ts`) — défaut constaté en vrai sur le panneau
 * disponibilités le 2026-09-23 : `value` posé en attribut sur un champ
 * `datetime-local` laissait `.value` vide à l'écran malgré la valeur portée
 * par l'élément.
 */
import {describe, expect, it} from 'vitest';
import {h} from './dom';

describe('h() : value/defaultValue/checked/defaultChecked/selected en propriété', () => {
  it("pose `value` comme propriété sur un input, pas seulement comme attribut", () => {
    const input = h('input', {type: 'text', value: 'Bonjour'});
    expect(input.value).toBe('Bonjour');
  });

  it("`defaultValue` pose la propriété `.value` — l'attribut `defaultValue` n'existe pas côté DOM", () => {
    const input = h('input', {type: 'text', defaultValue: 'Bonjour'});
    expect(input.value).toBe('Bonjour');
  });

  it('pose `value` comme propriété sur un select (pas d’attribut `value` côté DOM pour ce tag)', () => {
    const select = h('select', null,
      h('option', {value: 'a'}, 'A'),
      h('option', {value: 'b'}, 'B'),
    );
    select.value = 'b';
    expect(select.value).toBe('b');
  });

  it('`checked` pose la propriété sur une case à cocher', () => {
    const coche = h('input', {type: 'checkbox', checked: true});
    const decoche = h('input', {type: 'checkbox', checked: false});
    expect(coche.checked).toBe(true);
    expect(decoche.checked).toBe(false);
  });

  it('`selected` pose la propriété sur une option', () => {
    const option = h('option', {value: 'a', selected: true}, 'A');
    expect(option.selected).toBe(true);
  });

  it("laisse les autres attributs inchangés (comportement existant préservé)", () => {
    const bouton = h('button', {type: 'button', class: 'btn btn--primary', disabled: true, id: 'go'}, 'Go');
    expect(bouton.getAttribute('type')).toBe('button');
    expect(bouton.className).toBe('btn btn--primary');
    expect(bouton.disabled).toBe(true);
    expect(bouton.id).toBe('go');
  });
});
