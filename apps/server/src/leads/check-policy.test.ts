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
const person = (more: Partial<PolicySelf> = {}): PolicySelf => ({ kind: 'personal', first_name: 'Anna', last_name: 'Berg', seniority: null, title: null, ...more });
const named = (verification: PolicyEmail['verification'], more: Partial<PolicyEmail> = {}) => e('personal', verification, { first_name: 'Ole', last_name: 'Holm', ...more });
const ceo = (verification: PolicyEmail['verification']) => named(verification, { seniority: 'founder', title: 'CEO' });

const settled = { crawlPending: false, peoplePending: false, checkInboxes: false };
const inboxes = { ...settled, checkInboxes: true };
const generic: PolicySelf = { kind: 'generic', first_name: null, last_name: null, seniority: null, title: null };
const unnamed: PolicySelf = { kind: 'personal', first_name: null, last_name: null, seniority: null, title: null };
const hr = person({ seniority: 'manager', title: 'HR Manager' });

describe('checkTier', () => {
  it('sorts addresses into named people, unnamed, off target and role inboxes', () => {
    expect(checkTier(person())).toBe('primary');
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

  it('checks off-target staff only when the company has no valid decision maker or commercial lead', () => {
    expect(checkPolicy(hr, [ceo('valid')], settled)).toBe('skip');
    expect(checkPolicy(hr, [named('valid', { seniority: 'staff', title: 'Account Executive' })], settled)).toBe('skip');
    expect(checkPolicy(hr, [ceo(null)], settled)).toBe('defer');
    expect(checkPolicy(hr, [named('valid', { seniority: 'staff', title: 'Developer' })], settled)).toBe('check');
    expect(checkPolicy(hr, [ceo('invalid')], settled)).toBe('check');
    expect(checkPolicy(person({ seniority: 'founder', title: 'Founder & HR' }), [], { ...settled, crawlPending: true })).toBe('check');
  });

  it('never lets off-target directors wait on each other', () => {
    const hrDirector = named(null, { seniority: 'director', title: 'HR Director' });
    const finance = named(null, { seniority: 'director', title: 'Finance Director' });
    const support = named(null, { seniority: 'director', title: 'Head of Support' });
    expect(checkPolicy(person({ seniority: 'director', title: 'HR Director' }), [finance, support], settled)).toBe('check');
    expect(checkPolicy(person({ seniority: 'director', title: 'Finance Director' }), [hrDirector, support], settled)).toBe('check');
    expect(checkPolicy(generic, [hrDirector, finance], inboxes)).toBe('check');
  });

  it('decides without waiting when forced', () => {
    expect(checkPolicy(hr, [ceo(null)], { ...settled, force: true })).toBe('check');
    expect(checkPolicy(hr, [ceo('valid')], { ...settled, crawlPending: true, force: true })).toBe('skip');
  });
});

describe('stillToCheck', () => {
  it('counts what the never short projection can still expect to be checked', () => {
    expect(stillToCheck(person(), [ceo('valid')], false)).toBe(true);
    expect(stillToCheck(hr, [ceo('valid')], false)).toBe(false);
    expect(stillToCheck(hr, [ceo(null)], false)).toBe(true);
    expect(stillToCheck(unnamed, [named('valid')], false)).toBe(false);
    expect(stillToCheck(generic, [], false)).toBe(false);
    expect(stillToCheck(generic, [], true)).toBe(true);
  });
});
