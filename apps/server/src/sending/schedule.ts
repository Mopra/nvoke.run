// When sends go out (docs/sending/plan.md): the cold ramp of a mailbox, the
// recipient's working hours in their own timezone, and which due leads one
// send tick may take. Pure: the clock and the dice come in as arguments.

import type { CampaignSchedule } from '@nvoke/shared';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** A cold mailbox sends this many on its first day... */
export const RAMP_START = 5;
/** ...and this many more each day after, up to its cap. */
export const RAMP_STEP = 3;
/** The most a send lands after the earliest instant it could, kept inside the window. */
export const MAX_OFFSET_MS = 90 * MINUTE_MS;
/** The least time between two sends from one mailbox. */
export const MIN_GAP_MS = 4 * MINUTE_MS;
/** The most sends to one recipient domain per mailbox per day. */
export const MAX_PER_DOMAIN = 2;

/**
 * Sends a mailbox has left now: its daily cap (or the ramp's figure for a
 * cold mailbox, 5 on the first day and 3 more each day after) minus what it
 * sent in the last 24 hours. Day 1 is the 24 hours from `rampStartedAt`.
 */
export function mailboxCapacity(m: { dailyCap: number; warm: boolean; rampStartedAt: Date }, sentLast24h: number, now: Date): number {
  let limit = m.dailyCap;
  if (!m.warm) {
    const day = Math.max(0, Math.floor((now.getTime() - m.rampStartedAt.getTime()) / DAY_MS));
    limit = Math.min(m.dailyCap, RAMP_START + RAMP_STEP * day);
  }
  return Math.max(0, limit - sentLast24h);
}

interface LocalTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday, 1 is Monday. */
  weekday: number;
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** A formatter for `timezone`, or for UTC when the name is not a zone the runtime knows. */
function formatFor(timezone: string): Intl.DateTimeFormat {
  let f = formats.get(timezone);
  if (f) return f;
  const options: Intl.DateTimeFormatOptions = {
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
  };
  try {
    f = new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone });
  } catch {
    f = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
  }
  formats.set(timezone, f);
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function localTime(at: Date, timezone: string): LocalTime {
  const parts: Record<string, string> = {};
  for (const p of formatFor(timezone).formatToParts(at)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday!] ?? 1,
  };
}

/** How far the zone is ahead of UTC at `ms`, in milliseconds. */
function offsetAt(ms: number, timezone: string): number {
  const t = localTime(new Date(ms), timezone);
  const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant the zone's clocks read this wall time. A wall time skipped by
 * a spring forward lands just after the gap, at the same distance from the
 * start of the day as the clocks show.
 */
function zonedInstant(year: number, month: number, day: number, hour: number, timezone: string): number {
  const wall = Date.UTC(year, month - 1, day, hour);
  // The offsets a day and a half either side: at most one change lies between.
  const before = offsetAt(wall - 36 * HOUR_MS, timezone);
  const after = offsetAt(wall + 36 * HOUR_MS, timezone);
  const reads = [wall - before, wall - after].filter((t) => offsetAt(t, timezone) === wall - t);
  // Fall back: the earlier of the two instants. Spring forward: none reads it.
  return reads.length > 0 ? Math.min(...reads) : wall - before;
}

/**
 * The first instant at or after `after` inside the schedule's days and hours
 * in `timezone`, plus a random offset of up to 90 minutes that never leaves
 * that day's window. An unknown zone is read as UTC.
 */
export function nextSendAt(o: { after: Date; timezone: string; schedule: CampaignSchedule; random?: () => number }): Date {
  const random = o.random ?? Math.random;
  const { days, startHour, endHour } = o.schedule;
  const after = o.after.getTime();
  const start = localTime(o.after, o.timezone);
  // Two weeks always holds an open window: a schedule has at least one day.
  for (let k = 0; k < 15; k++) {
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + k));
    const weekday = ((date.getUTCDay() + 6) % 7) + 1;
    if (!days.includes(weekday)) continue;
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const open = zonedInstant(y, m, d, startHour, o.timezone);
    const close = zonedInstant(y, m, d, endHour, o.timezone);
    const from = Math.max(after, open);
    const room = close - from;
    if (room <= 0) continue;
    const offset = Math.floor(Math.min(1, Math.max(0, random())) * Math.min(MAX_OFFSET_MS, room - 1000));
    return new Date(from + Math.max(0, offset));
  }
  return new Date(after);
}

/** When a follow up goes: `waitDays` after the step before it, then into the next open window. */
export function stepSendAt(o: { prevSentAt: Date; waitDays: number; timezone: string; schedule: CampaignSchedule; random?: () => number }): Date {
  return nextSendAt({
    after: new Date(o.prevSentAt.getTime() + Math.max(0, o.waitDays) * DAY_MS),
    timezone: o.timezone,
    schedule: o.schedule,
    random: o.random,
  });
}

export interface DueLead {
  id: string;
  mailboxId: string;
  domain: string;
  nextSendAt: Date;
}

export interface MailboxSlot {
  id: string;
  /** Sends left now, from mailboxCapacity. */
  capacity: number;
  lastSendAt: Date | null;
  /** Sends from this mailbox in the last 24 hours, by recipient domain. */
  sentToDomainToday: Record<string, number>;
}

/**
 * The leads one send tick may send: the most overdue first, at most one per
 * mailbox, none from a mailbox that sent in the last 4 minutes or has no
 * capacity left, and none to a domain this mailbox already wrote to twice
 * today. A mailbox missing from `mailboxes` sends nothing.
 */
export function pickDue(due: DueLead[], mailboxes: MailboxSlot[], now: Date): DueLead[] {
  const slots = new Map(mailboxes.map((m) => [m.id, m]));
  const used = new Set<string>();
  const picked: DueLead[] = [];
  const ordered = due
    .filter((l) => l.nextSendAt.getTime() <= now.getTime())
    .sort((a, b) => a.nextSendAt.getTime() - b.nextSendAt.getTime());
  for (const lead of ordered) {
    if (used.has(lead.mailboxId)) continue;
    const slot = slots.get(lead.mailboxId);
    if (!slot || slot.capacity <= 0) continue;
    if (slot.lastSendAt && now.getTime() - slot.lastSendAt.getTime() < MIN_GAP_MS) continue;
    const domain = lead.domain.toLowerCase();
    const toDomain = Object.entries(slot.sentToDomainToday).reduce((n, [d, c]) => (d.toLowerCase() === domain ? n + c : n), 0);
    if (toDomain >= MAX_PER_DOMAIN) continue;
    used.add(lead.mailboxId);
    picked.push(lead);
  }
  return picked;
}
