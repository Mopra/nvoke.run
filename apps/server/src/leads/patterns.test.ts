import { describe, expect, it } from 'vitest';
import { applyPattern, candidates, firstNameParts, inferPattern, lastNameParts, matchPerson, nameFromLocal } from './patterns.js';

describe('name parts', () => {
  it('spells Nordic and German letters the usual way first, then the other', () => {
    expect(firstNameParts('Søren')).toEqual(['soren', 'soeren']);
    expect(lastNameParts('Kjær')).toEqual(['kjaer']);
    expect(firstNameParts('Åse')).toEqual(['ase', 'aase']);
    expect(lastNameParts('Müller')).toEqual(['mueller', 'muller']);
    expect(lastNameParts('Görtz')).toEqual(['goertz', 'gortz']);
    expect(lastNameParts('Bräuer')).toEqual(['braeuer', 'brauer']);
    expect(lastNameParts('Strauß')).toEqual(['strauss']);
    expect(firstNameParts('José')).toEqual(['jose']);
  });

  it('drops apostrophes, keeps the first given name and handles hyphens and particles', () => {
    expect(lastNameParts("O'Brien")).toEqual(['obrien']);
    expect(firstNameParts('Anna Maria')).toEqual(['anna']);
    expect(firstNameParts('Anne-Marie')).toEqual(['annemarie', 'anne-marie', 'anne']);
    expect(lastNameParts('Berg-Hansen')).toEqual(['berghansen', 'berg-hansen', 'berg', 'hansen']);
    expect(lastNameParts('van der Berg')).toEqual(['vanderberg', 'berg']);
  });

  it('applies every pattern', () => {
    expect(applyPattern('first.last', 'anna', 'berg')).toBe('anna.berg');
    expect(applyPattern('flast', 'anna', 'berg')).toBe('aberg');
    expect(applyPattern('firstl', 'anna', 'berg')).toBe('annab');
    expect(applyPattern('lastf', 'anna', 'berg')).toBe('berga');
    expect(applyPattern('l.first', 'anna', 'berg')).toBe('b.anna');
    expect(applyPattern('last', 'anna', '')).toBeNull();
    expect(applyPattern('first', 'anna', '')).toBe('anna');
  });
});

describe('inferPattern', () => {
  it('picks the pattern that explains most known addresses', () => {
    expect(
      inferPattern([
        { local: 'anna.berg', firstName: 'Anna', lastName: 'Berg' },
        { local: 'soeren.kjaer', firstName: 'Søren', lastName: 'Kjær' },
        { local: 'ole', firstName: 'Ole', lastName: 'Holm' },
      ]),
    ).toEqual({ pattern: 'first.last', support: 2, total: 3 });
    expect(inferPattern([{ local: 'jmueller', firstName: 'Jan', lastName: 'Müller' }])).toMatchObject({ pattern: 'flast' });
  });

  it('breaks ties by the prior and gives null when nothing fits', () => {
    expect(inferPattern([{ local: 'jensen', firstName: 'Jensen', lastName: 'Jensen' }])).toMatchObject({ pattern: 'first' });
    expect(inferPattern([{ local: 'sales', firstName: 'Anna', lastName: 'Berg' }])).toBeNull();
    expect(inferPattern([])).toBeNull();
  });
});

describe('matchPerson', () => {
  const people = [
    { id: 1, firstName: 'Anna', lastName: 'Berg' },
    { id: 2, firstName: 'Anna', lastName: 'Holm' },
    { id: 3, firstName: 'Søren', lastName: 'Kjær' },
  ];

  it('finds the owner by any pattern and spelling', () => {
    expect(matchPerson('anna.berg', people)).toMatchObject({ person: { id: 1 }, pattern: 'first.last' });
    expect(matchPerson('aholm', people)).toMatchObject({ person: { id: 2 }, pattern: 'flast' });
    expect(matchPerson('soeren', people)).toMatchObject({ person: { id: 3 }, pattern: 'first' });
    expect(matchPerson('SK', people)).toBeNull();
  });

  it('refuses to guess between two people', () => {
    expect(matchPerson('anna', people)).toBeNull();
    expect(matchPerson('info', people)).toBeNull();
  });
});

describe('candidates', () => {
  it('follows the prior without a pattern, with the second spelling early', () => {
    expect(candidates({ firstName: 'Anna', lastName: 'Berg' }, null, 5).map((c) => c.local)).toEqual([
      'anna',
      'anna.berg',
      'annaberg',
      'aberg',
      'a.berg',
    ]);
    expect(candidates({ firstName: 'Søren', lastName: 'Kjær' }, null, 4).map((c) => c.local)).toEqual([
      'soren',
      'soren.kjaer',
      'soeren',
      'sorenkjaer',
    ]);
  });

  it('gives one or two with a known pattern', () => {
    expect(candidates({ firstName: 'Søren', lastName: 'Kjær' }, 'first.last', 5)).toEqual([
      { local: 'soren.kjaer', pattern: 'first.last' },
      { local: 'soeren.kjaer', pattern: 'first.last' },
    ]);
    expect(candidates({ firstName: 'Anna', lastName: 'Berg' }, 'flast', 5).map((c) => c.local)).toEqual(['aberg', 'anna']);
    expect(candidates({ firstName: 'Anna', lastName: 'Berg' }, 'flast', 1)).toHaveLength(1);
  });

  it('copes with a missing last name', () => {
    expect(candidates({ firstName: 'Anna', lastName: '' }, null, 5).map((c) => c.local)).toEqual(['anna']);
  });
});

describe('nameFromLocal', () => {
  it('reads first.last, first_last and first-last when both parts read as a name', () => {
    expect(nameFromLocal('anna.berg')).toEqual({ firstName: 'Anna', lastName: 'Berg' });
    expect(nameFromLocal('john_smith')).toEqual({ firstName: 'John', lastName: 'Smith' });
    expect(nameFromLocal('lars-nielsen')).toEqual({ firstName: 'Lars', lastName: 'Nielsen' });
    expect(nameFromLocal('Mette.Hansen+news')).toEqual({ firstName: 'Mette', lastName: 'Hansen' });
  });

  it('leaves lone first names, initials, functions and unknown first parts unnamed', () => {
    for (const local of ['max', 'jd', 'j.smith', 'anna.b', 'accounts.payable', 'web.design', 'sales.team', 'press.office', 'xq.berg', 'anna.berg.dk', 'anna.anna']) {
      expect(nameFromLocal(local), local).toBeNull();
    }
    // Words of a company or a page are not a last name.
    expect(nameFromLocal('anna.marketing')).toBeNull();
    // Double first names are one first name.
    for (const local of ['anne-marie', 'hans-peter', 'karl-heinz', 'jean-luc', 'marie-louise']) expect(nameFromLocal(local), local).toBeNull();
    expect(nameFromLocal('anne.marie')).toEqual({ firstName: 'Anne', lastName: 'Marie' });
  });

  it('takes a first name the site printed even when it is not a common one', () => {
    expect(nameFromLocal('zlatko.berg')).toBeNull();
    expect(nameFromLocal('zlatko.berg', [{ firstName: 'Zlatko', lastName: 'Ibsen' }])).toEqual({ firstName: 'Zlatko', lastName: 'Berg' });
  });
});
