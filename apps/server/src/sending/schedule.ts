// When sends go out (docs/sending/plan.md): the cold ramp, the recipient's
// working hours, and which due leads a send tick may take.

import type { CampaignSchedule } from '@nvoke/shared';

export function mailboxCapacity(m: { dailyCap: number; warm: boolean; rampStartedAt: Date }, sentLast24h: number, now: Date): number {
  void m; void sentLast24h; void now;
  throw new Error('not implemented');
}

export function nextSendAt(o: { after: Date; timezone: string; schedule: CampaignSchedule; random?: () => number }): Date {
  void o;
  throw new Error('not implemented');
}

export function stepSendAt(o: { prevSentAt: Date; waitDays: number; timezone: string; schedule: CampaignSchedule; random?: () => number }): Date {
  void o;
  throw new Error('not implemented');
}

export interface DueLead { id: string; mailboxId: string; domain: string; nextSendAt: Date }
export interface MailboxSlot { id: string; capacity: number; lastSendAt: Date | null; sentToDomainToday: Record<string, number> }

export function pickDue(due: DueLead[], mailboxes: MailboxSlot[], now: Date): DueLead[] {
  void due; void mailboxes; void now;
  throw new Error('not implemented');
}
