import { describe, expect, it } from 'vitest';
import { checkPolicy, checkTier, stillToCheck, type PolicyEmail, type PolicySelf } from './check-policy.js';

const e = (kind: string, verification: PolicyEmail['verification'], more: Partial<PolicyEmail> = {}): PolicyEmail => ({
  kind,
  first_name: null,
  last_name: null,
  seniority: null,
  title: null,
  verification,
  skipped: null,
  ...more,
});
// Named people with a title, so primary unless a test says otherwise.
const person = (more: Partial<PolicySelf> = {}): PolicySelf => ({ kind: 'personal', first_name: 'Anna', last_name: 'Berg', seniority: 'staff', title: 'Developer', ...more });
const named = (verification: PolicyEmail['verification'], more: Partial<PolicyEmail> = {}) =>
  e('personal', verification, { first_name: 'Ole', last_name: 'Holm', seniority: 'staff', title: 'Developer', ...more });
const ceo = (verification: PolicyEmail['verification']) => named(verification, { seniority: 'founder', title: 'CEO' });

const settled = { crawlPending: false, peoplePending: false, checkInboxes: false };
const inboxes = { ...settled, checkInboxes: true };
const generic: PolicySelf = { kind: 'generic', first_name: null, last_name: null, seniority: null, title: null };
const unnamed: PolicySelf = { kind: 'personal', first_name: null, last_name: null, seniority: null, title: null };
const hr = person({ seniority: 'manager', title: 'HR Manager' });
const untitled = person({ seniority: null, title: null });
const seller = (verification: PolicyEmail['verification']) => named(verification, { seniority: 'staff', title: 'Account Executive' });

describe('checkTier', () => {
  it('sorts addresses into named people, untitled, unnamed, off target and role inboxes', () => {
    expect(checkTier(person())).toBe('primary');
    expect(checkTier(person({ seniority: 'founder', title: null }))).toBe('primary');
    expect(checkTier(untitled)).toBe('untitled');
    expect(checkTier(person({ seniority: null, title: '  ' }))).toBe('untitled');
    expect(checkTier(person({ seniority: 'executive', title: 'CFO' }))).toBe('off_target');
    expect(checkTier(unnamed)).toBe('unnamed');
    expect(checkTier(hr)).toBe('off_target');
    expect(checkTier(person({ seniority: 'director', title: 'HR Director' }))).toBe('off_target');
    expect(checkTier(generic)).toBe('role_inbox');
  });
});

describe('checkPolicy', () => {
  it('checks named people at once, whatever else is going on', () => {
    expect(checkPolicy(person(), [], { crawlPending: true, peoplePending: true, checkInboxes: false })).toBe('check');
  });

  it('never checks a role inbox unless the search asks for it', () => {
    expect(checkPolicy(generic, [], settled)).toBe('skip');
    expect(checkPolicy(generic, [], inboxes)).toBe('check');
    expect(checkPolicy(generic, [e('personal', 'valid')], inboxes)).toBe('skip');
    expect(checkPolicy(generic, [named(null)], inboxes)).toBe('defer');
    expect(checkPolicy(generic, [], { ...inboxes, peoplePending: true })).toBe('defer');
    // It waits only for named people, never for another waiting address.
    expect(checkPolicy(generic, [e('personal', null), named(null, { title: 'HR Manager' })], inboxes)).toBe('check');
  });

  it('checks unnamed addresses only after the named people settle, and only when none is valid', () => {
    expect(checkPolicy(unnamed, [named('valid')], settled)).toBe('skip');
    // Any valid named person will do, off target too.
    expect(checkPolicy(unnamed, [named('valid', { title: 'Bookkeeper' })], settled)).toBe('skip');
    expect(checkPolicy(unnamed, [named(null)], settled)).toBe('defer');
    expect(checkPolicy(unnamed, [], { ...settled, crawlPending: true })).toBe('defer');
    expect(checkPolicy(unnamed, [named('invalid'), named('catch_all'), e('personal', null)], settled)).toBe('check');
    expect(checkPolicy(unnamed, [named(null, { title: 'HR Manager' })], settled)).toBe('check');
  });

  it('never checks off-target people, whatever else the company has', () => {
    expect(checkPolicy(hr, [], settled)).toBe('skip');
    expect(checkPolicy(hr, [ceo('invalid')], settled)).toBe('skip');
    expect(checkPolicy(hr, [named('valid')], settled)).toBe('skip');
    expect(checkPolicy(hr, [], { ...settled, crawlPending: true })).toBe('skip');
    expect(checkPolicy(person({ seniority: 'director', title: 'Finance Director' }), [], settled)).toBe('skip');
    expect(checkPolicy(person({ seniority: 'executive', title: 'Chief Financial Officer' }), [], settled)).toBe('skip');
    // A founder is never off target.
    expect(checkPolicy(person({ seniority: 'founder', title: 'Founder & HR' }), [], { ...settled, crawlPending: true })).toBe('check');
  });

  it('never lets a role inbox wait on off-target people', () => {
    const hrDirector = named(null, { seniority: 'director', title: 'HR Director' });
    const finance = named(null, { seniority: 'director', title: 'Finance Director' });
    expect(checkPolicy(generic, [hrDirector, finance], inboxes)).toBe('check');
  });

  it('checks a named person without a title only when the company has no valid decision maker or commercial person', () => {
    expect(checkPolicy(untitled, [], settled)).toBe('check');
    expect(checkPolicy(untitled, [ceo('valid')], settled)).toBe('skip');
    expect(checkPolicy(untitled, [seller('valid')], settled)).toBe('skip');
    // A valid titled person who is not a lead does not make it unnecessary.
    expect(checkPolicy(untitled, [named('valid')], settled)).toBe('check');
    expect(checkPolicy(untitled, [ceo('invalid'), named('catch_all', { title: 'HR Manager', seniority: 'manager' })], settled)).toBe('check');
  });

  it('lets a named person without a title wait for the titled primary people, never for other waiting addresses', () => {
    expect(checkPolicy(untitled, [ceo(null)], settled)).toBe('defer');
    expect(checkPolicy(untitled, [named(null)], settled)).toBe('defer');
    expect(checkPolicy(untitled, [], { ...settled, peoplePending: true })).toBe('defer');
    expect(checkPolicy(untitled, [ceo(null)], { ...settled, force: true })).toBe('check');
    // Another untitled person, an unnamed address, off target and role inboxes are not waited for.
    const other = named(null, { first_name: 'Eva', last_name: 'Lund', seniority: null, title: null });
    expect(checkPolicy(untitled, [other, e('personal', null), named(null, { title: 'HR Manager', seniority: 'manager' }), e('generic', null)], settled)).toBe('check');
    // A skipped primary is not open.
    expect(checkPolicy(untitled, [{ ...ceo(null), skipped: 'off_target' }], settled)).toBe('check');
  });

  it('decides without waiting when forced', () => {
    expect(checkPolicy(unnamed, [named(null)], { ...settled, force: true })).toBe('check');
    expect(checkPolicy(unnamed, [named('valid')], { ...settled, crawlPending: true, force: true })).toBe('skip');
    expect(checkPolicy(hr, [ceo(null)], { ...settled, force: true })).toBe('skip');
  });
});

describe('stillToCheck', () => {
  it('counts what the never short projection can still expect to be checked', () => {
    expect(stillToCheck(person(), [ceo('valid')], false)).toBe(true);
    expect(stillToCheck(hr, [ceo('valid')], false)).toBe(false);
    expect(stillToCheck(hr, [], false)).toBe(false);
    expect(stillToCheck(untitled, [ceo(null)], false)).toBe(true);
    expect(stillToCheck(untitled, [ceo('valid')], false)).toBe(false);
    expect(stillToCheck(unnamed, [named('valid')], false)).toBe(false);
    expect(stillToCheck(generic, [], false)).toBe(false);
    expect(stillToCheck(generic, [], true)).toBe(true);
  });
});
