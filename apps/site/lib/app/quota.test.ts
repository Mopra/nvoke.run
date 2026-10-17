import { describe, expect, it } from 'vitest';
import type { Plan } from '@nvoke/shared';
import { listPollInterval, planName, ONGOING_POLL_MS, POLL_MS, quotaState, searchPollInterval, stoppedByQuota } from './quota';

const me = (plan: Plan, used: number, limit: number) => ({
  plan,
  usage: { period: '2026-10', emailsVerified: used, emailsLimit: limit },
});

describe('quotaState', () => {
  it('is quiet while most of the allowance is left', () => {
    expect(quotaState(me('free', 10, 50))).toMatchObject({ used: 10, limit: 50, left: 40, share: 20, level: 'ok', nextPlan: 'emails_1000' });
  });

  it('points at the next plan from 80 percent', () => {
    expect(quotaState(me('free', 40, 50)).level).toBe('low');
    expect(quotaState(me('emails_1000', 799, 1000)).level).toBe('ok');
    expect(quotaState(me('emails_1000', 800, 1000))).toMatchObject({ level: 'low', nextPlan: 'emails_2500' });
  });

  it('is out at the limit, and never below zero left', () => {
    expect(quotaState(me('free', 50, 50))).toMatchObject({ left: 0, share: 100, level: 'out' });
    expect(quotaState(me('free', 53, 50))).toMatchObject({ left: 0, share: 100, level: 'out' });
  });

  it('has no next plan on the top plan', () => {
    expect(quotaState(me('emails_100000', 100_000, 100_000)).nextPlan).toBeNull();
  });
});

describe('planName', () => {
  it('names plans the way the app shows them', () => {
    expect(planName('free')).toBe('Free');
    expect(planName('emails_2500')).toBe('2,500 emails');
  });
});

describe('stoppedByQuota', () => {
  it('knows a search the allowance stopped from other failures', () => {
    expect(stoppedByQuota({ status: 'failed', error: 'quota_exceeded' })).toBe(true);
    expect(stoppedByQuota({ status: 'failed', error: 'source_unavailable' })).toBe(false);
    expect(stoppedByQuota({ status: 'done', error: null })).toBe(false);
  });
});

describe('polling', () => {
  it('polls the list only while something runs', () => {
    expect(listPollInterval(undefined)).toBe(false);
    expect(listPollInterval([{ status: 'done' }, { status: 'failed' }])).toBe(false);
    expect(listPollInterval([{ status: 'done' }, { status: 'queued' }])).toBe(POLL_MS);
  });

  it('polls one search until it ends', () => {
    expect(searchPollInterval({ status: 'running' })).toBe(POLL_MS);
    expect(searchPollInterval({ status: 'canceled' })).toBe(false);
    expect(searchPollInterval(undefined)).toBe(false);
  });

  it('polls slowly while an ended search keeps filling', () => {
    expect(searchPollInterval({ status: 'done', ongoing: true })).toBe(ONGOING_POLL_MS);
    expect(searchPollInterval({ status: 'running', ongoing: true })).toBe(POLL_MS);
    expect(listPollInterval([{ status: 'done', ongoing: true }, { status: 'done' }])).toBe(ONGOING_POLL_MS);
    expect(listPollInterval([{ status: 'done', ongoing: true }, { status: 'running' }])).toBe(POLL_MS);
  });
});
