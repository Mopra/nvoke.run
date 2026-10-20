import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEDULE, type CampaignSchedule } from '@nvoke/shared';
import { MAX_OFFSET_MS, mailboxCapacity, nextSendAt, pickDue, stepSendAt, type DueLead, type MailboxSlot } from './schedule.js';

const DAY = 86_400_000;
const MIN = 60_000;
const at = (iso: string) => new Date(iso);
const zero = () => 0;
const almostOne = () => 0.999999;

/** The wall clock in `timeZone` as `YYYY-MM-DD HH:mm, Wkd`. */
function wall(d: Date, timeZone: string): string {
  const p: Record<string, string> = {};
  const f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}, ${p.weekday}`;
}

describe('mailboxCapacity', () => {
  const start = at('2026-10-01T10:00:00Z');

  it('ramps a cold mailbox: 5 on day 1, 3 more a day, up to the cap', () => {
    const cold = { dailyCap: 30, warm: false, rampStartedAt: start };
    expect(mailboxCapacity(cold, 0, start)).toBe(5);
    expect(mailboxCapacity(cold, 0, new Date(start.getTime() + DAY - 1))).toBe(5);
    expect(mailboxCapacity(cold, 0, new Date(start.getTime() + DAY))).toBe(8);
    expect(mailboxCapacity(cold, 0, new Date(start.getTime() + 2 * DAY))).toBe(11);
    expect(mailboxCapacity(cold, 0, new Date(start.getTime() + 8 * DAY))).toBe(29);
    expect(mailboxCapacity(cold, 0, new Date(start.getTime() + 9 * DAY))).toBe(30);
    expect(mailboxCapacity(cold, 0, new Date(start.getTime() + 90 * DAY))).toBe(30);
  });

  it('never ramps past a low cap', () => {
    expect(mailboxCapacity({ dailyCap: 3, warm: false, rampStartedAt: start }, 0, start)).toBe(3);
    expect(mailboxCapacity({ dailyCap: 10, warm: false, rampStartedAt: start }, 0, new Date(start.getTime() + 5 * DAY))).toBe(10);
  });

  it('gives a warm mailbox its whole cap from the first day', () => {
    expect(mailboxCapacity({ dailyCap: 50, warm: true, rampStartedAt: start }, 0, start)).toBe(50);
  });

  it('subtracts the last 24 hours and never goes below zero', () => {
    const warm = { dailyCap: 30, warm: true, rampStartedAt: start };
    expect(mailboxCapacity(warm, 12, start)).toBe(18);
    expect(mailboxCapacity(warm, 30, start)).toBe(0);
    expect(mailboxCapacity(warm, 45, start)).toBe(0);
    expect(mailboxCapacity({ ...warm, warm: false }, 7, start)).toBe(0);
  });

  it('reads a ramp that starts in the future as day 1', () => {
    expect(mailboxCapacity({ dailyCap: 30, warm: false, rampStartedAt: new Date(start.getTime() + DAY) }, 0, start)).toBe(5);
  });
});

describe('nextSendAt', () => {
  const s = DEFAULT_SCHEDULE;

  it('keeps an instant inside the window, with no offset', () => {
    // Tuesday 11:20 in Copenhagen.
    const after = at('2026-10-20T09:20:00Z');
    expect(nextSendAt({ after, timezone: 'Europe/Copenhagen', schedule: s, random: zero })).toEqual(after);
  });

  it('waits for the window to open in the recipient zone', () => {
    // 06:00 UTC is 02:00 in New York: opens at 09:00 there, 13:00 UTC.
    const got = nextSendAt({ after: at('2026-10-20T06:00:00Z'), timezone: 'America/New_York', schedule: s, random: zero });
    expect(got.toISOString()).toBe('2026-10-20T13:00:00.000Z');
    expect(wall(got, 'America/New_York')).toBe('2026-10-20 09:00, Tue');
  });

  it('moves past the close to the next working day', () => {
    // Tuesday 17:30 in Sydney goes to Wednesday 09:00.
    const got = nextSendAt({ after: at('2026-10-20T06:30:00Z'), timezone: 'Australia/Sydney', schedule: s, random: zero });
    expect(wall(got, 'Australia/Sydney')).toBe('2026-10-21 09:00, Wed');
  });

  it('skips the weekend', () => {
    // Friday 2026-10-23 at 18:00 in London goes to Monday 09:00.
    const got = nextSendAt({ after: at('2026-10-23T17:00:00Z'), timezone: 'Europe/London', schedule: s, random: zero });
    expect(wall(got, 'Europe/London')).toBe('2026-10-26 09:00, Mon');
  });

  it('reads the weekday in the recipient zone, not in UTC', () => {
    // Saturday 2026-10-24 23:30 UTC is already Sunday in Tokyo, and Saturday in Los Angeles.
    const sat = at('2026-10-24T23:30:00Z');
    expect(wall(nextSendAt({ after: sat, timezone: 'Asia/Tokyo', schedule: s, random: zero }), 'Asia/Tokyo')).toBe('2026-10-26 09:00, Mon');
    const weekend: CampaignSchedule = { days: [6], startHour: 9, endHour: 17 };
    // 16:30 on Saturday in Los Angeles is still inside a Saturday window.
    expect(nextSendAt({ after: sat, timezone: 'America/Los_Angeles', schedule: weekend, random: zero })).toEqual(sat);
    // 08:30 on Sunday in Tokyo is inside a Sunday morning window.
    expect(nextSendAt({ after: sat, timezone: 'Asia/Tokyo', schedule: { days: [7], startHour: 8, endHour: 12 }, random: zero })).toEqual(sat);
    expect(wall(nextSendAt({ after: sat, timezone: 'Asia/Tokyo', schedule: weekend, random: zero }), 'Asia/Tokyo')).toBe('2026-10-31 09:00, Sat');
  });

  it('handles half hour zones', () => {
    // 03:00 UTC is 08:30 in Kolkata: opens at 09:00, 03:30 UTC.
    expect(nextSendAt({ after: at('2026-10-20T03:00:00Z'), timezone: 'Asia/Kolkata', schedule: s, random: zero }).toISOString()).toBe('2026-10-20T03:30:00.000Z');
  });

  it('opens at 09:00 local on both sides of a European clock change', () => {
    // Europe moves to summer time on Sunday 2026-03-29 and back on Sunday 2026-10-25.
    const before = nextSendAt({ after: at('2026-03-27T00:00:00Z'), timezone: 'Europe/Berlin', schedule: s, random: zero });
    const afterSpring = nextSendAt({ after: at('2026-03-28T12:00:00Z'), timezone: 'Europe/Berlin', schedule: s, random: zero });
    expect(before.toISOString()).toBe('2026-03-27T08:00:00.000Z');
    expect(afterSpring.toISOString()).toBe('2026-03-30T07:00:00.000Z');
    const autumn = nextSendAt({ after: at('2026-10-24T12:00:00Z'), timezone: 'Europe/Berlin', schedule: s, random: zero });
    expect(autumn.toISOString()).toBe('2026-10-26T08:00:00.000Z');
  });

  it('opens at the right hour on the day of a US clock change', () => {
    const every: CampaignSchedule = { days: [1, 2, 3, 4, 5, 6, 7], startHour: 9, endHour: 17 };
    // Sunday 2026-03-08: New York springs forward at 02:00.
    const spring = nextSendAt({ after: at('2026-03-08T05:00:00Z'), timezone: 'America/New_York', schedule: every, random: zero });
    expect(spring.toISOString()).toBe('2026-03-08T13:00:00.000Z');
    // Sunday 2026-11-01: back at 02:00.
    const fall = nextSendAt({ after: at('2026-11-01T05:00:00Z'), timezone: 'America/New_York', schedule: every, random: zero });
    expect(fall.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('opens a window that starts inside a skipped hour just after the gap', () => {
    const early: CampaignSchedule = { days: [7], startHour: 2, endHour: 6 };
    const got = nextSendAt({ after: at('2026-03-08T00:00:00Z'), timezone: 'America/New_York', schedule: early, random: zero });
    // 02:00 does not exist that night; the clocks read 03:00 one hour into the day's 02:00.
    expect(wall(got, 'America/New_York')).toBe('2026-03-08 03:00, Sun');
  });

  it('closes a window at midnight when it ends at 24', () => {
    const late: CampaignSchedule = { days: [2], startHour: 20, endHour: 24 };
    const got = nextSendAt({ after: at('2026-10-20T21:59:00Z'), timezone: 'UTC', schedule: late, random: almostOne });
    expect(got.getTime()).toBeLessThan(at('2026-10-21T00:00:00Z').getTime());
    expect(got.getTime()).toBeGreaterThanOrEqual(at('2026-10-20T21:59:00Z').getTime());
  });

  it('adds up to 90 minutes and stays inside the window', () => {
    const open = at('2026-10-20T07:00:00Z'); // 09:00 in Copenhagen
    const late = nextSendAt({ after: at('2026-10-20T05:00:00Z'), timezone: 'Europe/Copenhagen', schedule: s, random: almostOne });
    expect(late.getTime() - open.getTime()).toBeLessThanOrEqual(MAX_OFFSET_MS);
    expect(late.getTime() - open.getTime()).toBeGreaterThan(MAX_OFFSET_MS - MIN);
    // Ten minutes before the close there are only ten minutes to spread over.
    const close = at('2026-10-20T15:00:00Z');
    const squeezed = nextSendAt({ after: new Date(close.getTime() - 10 * MIN), timezone: 'Europe/Copenhagen', schedule: s, random: almostOne });
    expect(squeezed.getTime()).toBeLessThan(close.getTime());
    expect(squeezed.getTime()).toBeGreaterThan(close.getTime() - 10 * MIN);
  });

  it('spreads over random draws and is never before `after` or outside hours', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const zones = ['Europe/London', 'America/Los_Angeles', 'Asia/Singapore', 'Pacific/Auckland', 'America/Sao_Paulo'];
    for (let i = 0; i < 400; i++) {
      const after = new Date(at('2026-01-01T00:00:00Z').getTime() + Math.floor(random() * 365 * DAY));
      const timezone = zones[i % zones.length]!;
      const got = nextSendAt({ after, timezone, schedule: s, random });
      expect(got.getTime()).toBeGreaterThanOrEqual(after.getTime());
      const [, time, weekday] = /^\S+ (\d\d:\d\d), (\w+)$/.exec(wall(got, timezone))!;
      expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).toContain(weekday);
      expect(time! >= '09:00' && time! < '17:00').toBe(true);
    }
  });

  it('reads an unknown zone as UTC', () => {
    const got = nextSendAt({ after: at('2026-10-20T06:00:00Z'), timezone: 'Mars/Olympus', schedule: s, random: zero });
    expect(got.toISOString()).toBe('2026-10-20T09:00:00.000Z');
  });
});

describe('stepSendAt', () => {
  it('waits the days, then the next open window', () => {
    // Sent Thursday 10:00 in London, three days later is Sunday: Monday 09:00.
    const got = stepSendAt({ prevSentAt: at('2026-10-22T09:00:00Z'), waitDays: 3, timezone: 'Europe/London', schedule: DEFAULT_SCHEDULE, random: zero });
    expect(wall(got, 'Europe/London')).toBe('2026-10-26 09:00, Mon');
  });

  it('keeps the time of day when the target day is open', () => {
    // Monday 14:00 in Chicago plus two days is Wednesday 14:00.
    const got = stepSendAt({ prevSentAt: at('2026-10-19T19:00:00Z'), waitDays: 2, timezone: 'America/Chicago', schedule: DEFAULT_SCHEDULE, random: zero });
    expect(wall(got, 'America/Chicago')).toBe('2026-10-21 14:00, Wed');
  });

  it('sends a zero wait step in the next open moment', () => {
    const prev = at('2026-10-20T10:00:00Z');
    expect(stepSendAt({ prevSentAt: prev, waitDays: 0, timezone: 'UTC', schedule: DEFAULT_SCHEDULE, random: zero })).toEqual(prev);
  });
});

describe('pickDue', () => {
  const now = at('2026-10-20T10:00:00Z');
  const lead = (id: string, mailboxId: string, domain: string, minutesAgo: number): DueLead => ({ id, mailboxId, domain, nextSendAt: new Date(now.getTime() - minutesAgo * MIN) });
  const slot = (id: string, over: Partial<MailboxSlot> = {}): MailboxSlot => ({ id, capacity: 10, lastSendAt: null, sentToDomainToday: {}, ...over });

  it('takes the most overdue lead per mailbox, one each', () => {
    const due = [lead('a1', 'A', 'x.com', 5), lead('a2', 'A', 'y.com', 30), lead('b1', 'B', 'z.com', 1)];
    expect(pickDue(due, [slot('A'), slot('B')], now).map((l) => l.id)).toEqual(['a2', 'b1']);
  });

  it('leaves leads that are not due yet', () => {
    expect(pickDue([lead('a1', 'A', 'x.com', -1)], [slot('A')], now)).toEqual([]);
    expect(pickDue([lead('a1', 'A', 'x.com', 0)], [slot('A')], now).map((l) => l.id)).toEqual(['a1']);
  });

  it('keeps 4 minutes between sends of one mailbox', () => {
    const due = [lead('a1', 'A', 'x.com', 10)];
    expect(pickDue(due, [slot('A', { lastSendAt: new Date(now.getTime() - 3 * MIN) })], now)).toEqual([]);
    expect(pickDue(due, [slot('A', { lastSendAt: new Date(now.getTime() - 4 * MIN) })], now)).toHaveLength(1);
  });

  it('respects capacity and unknown mailboxes', () => {
    const due = [lead('a1', 'A', 'x.com', 10), lead('c1', 'C', 'x.com', 10)];
    expect(pickDue(due, [slot('A', { capacity: 0 })], now)).toEqual([]);
  });

  it('writes one domain at most twice a day per mailbox, and moves on to the next lead', () => {
    const due = [lead('a1', 'A', 'Acme.com', 20), lead('a2', 'A', 'other.io', 10)];
    const full = slot('A', { sentToDomainToday: { 'acme.com': 2 } });
    expect(pickDue(due, [full], now).map((l) => l.id)).toEqual(['a2']);
    const once = slot('A', { sentToDomainToday: { 'acme.com': 1 } });
    expect(pickDue(due, [once], now).map((l) => l.id)).toEqual(['a1']);
    // Another mailbox may still write to that domain.
    expect(pickDue([lead('b1', 'B', 'acme.com', 5)], [full, slot('B')], now)).toHaveLength(1);
  });

  it('does not change its input', () => {
    const due = [lead('a1', 'A', 'x.com', 1), lead('a2', 'A', 'y.com', 9)];
    pickDue(due, [slot('A')], now);
    expect(due.map((l) => l.id)).toEqual(['a1', 'a2']);
  });
});
