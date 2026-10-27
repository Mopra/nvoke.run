// Template campaigns (writer 'template'): every lead gets the steps' fixed
// text with its merge variables filled (TEMPLATE_VARIABLES in
// @nvoke/shared), no Claude call. The write job renders a batch in one go
// and queues it, so the campaign passes through 'writing' in seconds. A
// shared inbox (info@ and the like, nobody named) gets a step's `shared`
// variant when it has one. Steps a person edited are never rendered over.

import { renderTemplate, type CampaignLeadPreview, type CampaignStep, type TemplateValues } from '@nvoke/shared';
import type { Sql, TransactionSql } from 'postgres';
import { CAMPAIGN_COLUMNS, firstSendAfter, type CampaignRow } from './campaigns.js';
import { withFooter } from './footer.js';
import { nextSendAt } from './schedule.js';
import { replySubject } from './sender.js';
import { isSharedInbox } from './write.js';

type Db = Sql | TransactionSql;

export interface TemplateLead {
  id: string;
  address: string;
  email_kind: string | null;
  first_name: string | null;
  company_name: string;
  domain: string;
  timezone: string;
  /** The mailbox's display name, null when the lead has no mailbox. */
  sender_name: string | null;
}

/** A lead's merge values. `ref` is the first eight characters of its id, enough to find it again. */
export function templateValues(l: Pick<TemplateLead, 'id' | 'first_name' | 'company_name' | 'domain' | 'sender_name'>): TemplateValues {
  const sender = l.sender_name?.trim() || null;
  return {
    first: l.first_name?.trim().split(/\s+/)[0] || null,
    company: l.company_name,
    domain: l.domain,
    sender_first: sender?.split(/\s+/)[0] ?? null,
    sender_name: sender,
    ref: l.id.slice(0, 8),
  };
}

/** A lead's emails from the templates: one subject for the thread (step 1's) and a body per step. */
export function renderSteps(steps: CampaignStep[], lead: Omit<TemplateLead, 'timezone'>): { subject: string; bodies: string[] } {
  const values = templateValues(lead);
  const shared = isSharedInbox(lead);
  const variant = (s: CampaignStep) => (shared ? s.template?.shared : undefined);
  const first = steps[0]!.template;
  const subject = renderTemplate(variant(steps[0]!)?.subject ?? first?.subject ?? '', values).trim();
  const bodies = steps.map((s) => renderTemplate(variant(s)?.body ?? s.template?.body ?? '', values).trim());
  return { subject, bodies };
}

/** The columns renderSteps needs, for a query on `campaign_leads l`. */
export const TEMPLATE_LEAD_COLUMNS = `l.id, l.address, l.first_name, l.company_name, l.domain, l.timezone,
  (select e.kind from emails e where e.id = l.email_id) as email_kind,
  (select m.display_name from mailboxes m where m.id = l.mailbox_id) as sender_name`;

/**
 * Renders the campaign's 'writing' leads among `leadIds` and queues them, as
 * runWriteJob does with what Claude wrote. Returns how many were written.
 */
export async function writeTemplates(sql: Sql, campaignId: string, leadIds: string[], now: Date): Promise<number> {
  return sql.begin(async (tx) => {
    const [c] = await tx<CampaignRow[]>`select ${tx.unsafe(CAMPAIGN_COLUMNS)} from campaigns c where c.id = ${campaignId} for update`;
    if (!c || c.writer !== 'template') return 0;
    const leads = await tx<TemplateLead[]>`
      select ${tx.unsafe(TEMPLATE_LEAD_COLUMNS)} from campaign_leads l
      where l.id in ${tx(leadIds)} and l.campaign_id = ${campaignId} and l.status = 'writing'
      for update of l
    `;
    for (const l of leads) {
      await saveSteps(tx, l.id, c.steps, l, 1);
      const sendAt = c.started_at ? nextSendAt({ after: firstSendAfter(c, now), timezone: l.timezone, schedule: c.schedule }) : null;
      await tx`update campaign_leads set status = 'queued', written_at = ${now}, next_send_at = ${sendAt} where id = ${l.id}`;
    }
    return leads.length;
  });
}

/**
 * Renders the steps not sent yet again for a template campaign's queued and
 * active leads (or one), after its steps or senders changed. Edited steps stay as they are.
 */
export async function rerenderTemplates(tx: Db, c: Pick<CampaignRow, 'id' | 'steps' | 'writer'>, leadId?: string): Promise<number> {
  if (c.writer !== 'template') return 0;
  const leads = await tx<Array<TemplateLead & { next_step: number }>>`
    select ${tx.unsafe(TEMPLATE_LEAD_COLUMNS)}, l.next_step from campaign_leads l
    where l.campaign_id = ${c.id} and l.status in ('queued', 'active') and l.claimed_at is null
      ${leadId ? tx`and l.id = ${leadId}` : tx``}
  `;
  for (const l of leads) {
    await saveSteps(tx, l.id, c.steps, l, l.next_step);
    // Steps the campaign no longer has go too, unless sent.
    await tx`delete from campaign_steps_written where campaign_lead_id = ${l.id} and step > ${c.steps.length} and step >= ${l.next_step}`;
  }
  return leads.length;
}

async function saveSteps(tx: Db, leadId: string, steps: CampaignStep[], lead: Omit<TemplateLead, 'timezone'>, fromStep: number): Promise<void> {
  const { subject, bodies } = renderSteps(steps, lead);
  // Follow ups go out in the same thread, so they carry the first subject (the sender adds "Re: ").
  const rows = bodies
    .map((body, i) => ({ campaign_lead_id: leadId, step: i + 1, subject, body }))
    .filter((r) => r.step >= fromStep);
  if (rows.length === 0) return;
  await tx`
    insert into campaign_steps_written ${tx(rows, 'campaign_lead_id', 'step', 'subject', 'body')}
    on conflict (campaign_lead_id, step) do update set subject = excluded.subject, body = excluded.body
    where not campaign_steps_written.edited
  `;
}

interface PreviewRow extends TemplateLead {
  steps: CampaignStep[];
  writer: CampaignRow['writer'];
  footer: string | null;
  signed: boolean;
  site_domain: string | null;
  mailbox_address: string | null;
  signature: string | null;
}

/**
 * One lead's emails as the sender would send them now: the written text (or,
 * for a template campaign, the templates rendered for a lead not written yet)
 * with the signature and footer under it. A step sent already shows its
 * subject; the subject of a follow up is the thread's, with "Re: ". Null when
 * the lead is not the user's.
 */
export async function previewLead(sql: Db, userId: string, id: string, leadId: string): Promise<CampaignLeadPreview | null> {
  const [l] = await sql<PreviewRow[]>`
    select ${sql.unsafe(TEMPLATE_LEAD_COLUMNS)}, c.steps, c.writer, c.footer, c.signed,
      coalesce(c.product ->> 'domain', (select sp.domain from site_profiles sp where sp.clerk_user_id = l.clerk_user_id)) as site_domain,
      m.address as mailbox_address, m.signature
    from campaign_leads l
    join campaigns c on c.id = l.campaign_id
    left join mailboxes m on m.id = l.mailbox_id
    where l.id = ${leadId} and l.campaign_id = ${id} and l.clerk_user_id = ${userId}
  `;
  if (!l) return null;
  const written = await sql<{ step: number; subject: string; body: string }[]>`
    select step, subject, body from campaign_steps_written where campaign_lead_id = ${leadId} order by step
  `;
  const sent = await sql<{ step: number; at: Date }[]>`
    select step, min(at) as at from messages
    where campaign_lead_id = ${leadId} and direction = 'out' and kind = 'step' and step is not null group by step
  `;
  const rendered = l.writer === 'template' ? renderSteps(l.steps, l) : null;
  const steps: CampaignLeadPreview['steps'] = [];
  for (let n = 1; n <= l.steps.length; n++) {
    const w = written.find((s) => s.step === n);
    const subject = w?.subject ?? rendered?.subject;
    const body = w?.body ?? rendered?.bodies[n - 1];
    if (subject === undefined || body === undefined) continue;
    steps.push({
      step: n,
      subject: n > 1 ? replySubject(subject) : subject,
      text: withFooter(body, {
        signature: l.signature ?? '',
        displayName: l.sender_name ?? '',
        siteDomain: l.site_domain,
        domain: l.domain,
        leadKey: l.id,
        text: l.footer,
        signed: l.signed,
      }),
      written: !!w,
      sentAt: sent.find((s) => s.step === n)?.at.toISOString() ?? null,
    });
  }
  return { steps, from: l.mailbox_address };
}
