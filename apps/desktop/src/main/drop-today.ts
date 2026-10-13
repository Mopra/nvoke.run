import type { Search } from '@nvoke/shared';

/** What today's drops delivered, for the tray menu. */
export interface DropToday {
  /** Verified emails from drop searches made since local midnight. */
  leads: number;
  /** The drop searches made today, newest first. */
  searchIds: string[];
}

function startOfDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function dropToday(searches: Search[], now = new Date()): DropToday {
  const since = startOfDay(now);
  const today = searches
    .filter((s) => s.kind === 'drop' && Date.parse(s.createdAt) >= since)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { leads: today.reduce((n, s) => n + s.emailsValid, 0), searchIds: today.map((s) => s.id) };
}

/** The tray line: "Today’s drops: 12 leads", or a quiet line before the first drop of the day. */
export function dropTodayLabel(today: DropToday): string {
  if (today.searchIds.length === 0) return 'No drop leads yet today';
  const n = today.leads.toLocaleString('en-US');
  return `Today’s drops: ${n} ${today.leads === 1 ? 'lead' : 'leads'}`;
}
