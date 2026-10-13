import type { Search } from '@nvoke/shared';

/**
 * Which finished drop searches to announce and how many leads are still
 * unseen. Pure, so the polling in notifier.ts stays thin and this is tested.
 */

export interface NotifyState {
  /** False until the first poll after sign-in, which only records what already exists. */
  baselined: boolean;
  /** Searches already announced (or too old to announce). */
  notified: string[];
  /** Searches the user opened (or that predate the baseline). */
  seen: string[];
}

export const EMPTY_STATE: NotifyState = { baselined: false, notified: [], seen: [] };

export interface Delivery {
  searchId: string;
  dropName: string;
  companies: number;
  validEmails: number;
}

export interface Plan {
  deliveries: Delivery[];
  /** Valid emails in finished drop searches the user has not opened. */
  unseen: number;
  state: NotifyState;
}

type DropSearch = Extract<Search, { kind: 'drop' }>;

/** A drop search worth telling the user about: finished, with at least one valid address. */
export function isDelivery(search: Search): search is DropSearch {
  return search.kind === 'drop' && search.status === 'done' && search.emailsValid > 0;
}

export function planPoll(searches: Search[], state: NotifyState): Plan {
  const delivered = searches.filter(isDelivery);
  const present = new Set(searches.map((s) => s.id));
  const prune = (ids: string[]): Set<string> => new Set(ids.filter((id) => present.has(id)));
  const notified = prune(state.notified);
  const seen = prune(state.seen);

  if (!state.baselined) {
    for (const s of delivered) {
      notified.add(s.id);
      seen.add(s.id);
    }
    return { deliveries: [], unseen: 0, state: { baselined: true, notified: [...notified], seen: [...seen] } };
  }

  const deliveries: Delivery[] = [];
  let unseen = 0;
  for (const s of delivered) {
    if (!notified.has(s.id)) {
      deliveries.push({ searchId: s.id, dropName: s.params.dropName, companies: s.companiesFound, validEmails: s.emailsValid });
      notified.add(s.id);
    }
    if (!seen.has(s.id)) unseen += s.emailsValid;
  }
  return { deliveries, unseen, state: { baselined: true, notified: [...notified], seen: [...seen] } };
}

/** Marks a search as opened and recounts. */
export function markSeen(searches: Search[], state: NotifyState, searchId: string): Plan {
  const next: NotifyState = {
    ...state,
    notified: state.notified.includes(searchId) ? state.notified : [...state.notified, searchId],
    seen: state.seen.includes(searchId) ? state.seen : [...state.seen, searchId],
  };
  const seen = new Set(next.seen);
  const unseen = searches.filter(isDelivery).reduce((n, s) => (seen.has(s.id) ? n : n + s.emailsValid), 0);
  return { deliveries: [], unseen, state: next };
}

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "14 new launches, 9 valid emails". */
export function deliveryBody(d: Delivery): string {
  return `${plural(d.companies, 'new launch', 'new launches')}, ${plural(d.validEmails, 'valid email', 'valid emails')}`;
}

export function parseState(raw: string): { enabled: boolean; state: NotifyState } {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-500) : []);
    return {
      enabled: data['enabled'] !== false,
      state: { baselined: data['baselined'] === true, notified: ids(data['notified']), seen: ids(data['seen']) },
    };
  } catch {
    return { enabled: true, state: EMPTY_STATE };
  }
}

/** 5x3 digit glyphs for the Windows taskbar overlay, one row per string. */
const GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

export const BADGE_SIZE = 32;

/**
 * A BGRA bitmap of the count in white on the iris accent, as a filled circle.
 * Counts above 99 show 99. Used where the OS has no native badge number.
 */
export function badgeBitmap(count: number): Buffer {
  const text = String(Math.min(99, Math.max(0, Math.floor(count))));
  const scale = text.length > 1 ? 3 : 4;
  const glyphW = 3 * scale;
  const glyphH = 5 * scale;
  const gap = scale;
  const width = text.length * glyphW + (text.length - 1) * gap;
  const left = Math.round((BADGE_SIZE - width) / 2);
  const top = Math.round((BADGE_SIZE - glyphH) / 2);
  const buf = Buffer.alloc(BADGE_SIZE * BADGE_SIZE * 4);
  const r = BADGE_SIZE / 2;
  for (let y = 0; y < BADGE_SIZE; y++) {
    for (let x = 0; x < BADGE_SIZE; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      if (dx * dx + dy * dy > r * r) continue;
      let white = false;
      for (let i = 0; i < text.length && !white; i++) {
        const gx = x - (left + i * (glyphW + gap));
        const gy = y - top;
        if (gx < 0 || gy < 0 || gx >= glyphW || gy >= glyphH) continue;
        white = GLYPHS[text[i]!]![Math.floor(gy / scale)]![Math.floor(gx / scale)] === '1';
      }
      // The accent is oklch(0.57 0.215 268), about #5b5bf0, stored as BGRA.
      buf.set(white ? [0xff, 0xff, 0xff, 0xff] : [0xf0, 0x5b, 0x5b, 0xff], (y * BADGE_SIZE + x) * 4);
    }
  }
  return buf;
}
