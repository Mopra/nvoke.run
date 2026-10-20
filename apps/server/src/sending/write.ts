// The write job (docs/sending/plan.md): Claude writes every step of a
// campaign's sequence for a batch of its leads. Step 1 comes from the
// sender's site profile, the step's brief, the person and what the
// company's own pages say (its opener and quote when there is one); the
// follow ups are short bumps in the same thread. Claude writes the subject
// and body only: the signature, the "why you" line and how to stop are a
// fixed footer the sender appends (footer.ts), so they cannot drift.
//
// Each email is checked before it is kept: plain text, a sane length, no
// links, no placeholders, no sign-off. A lead whose emails fail goes
// 'failed' with skip_reason 'write_failed' and is never sent.

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { z } from 'zod';
import type { CampaignStep, SiteProfileFields } from '@nvoke/shared';
import { AiError, type Ai } from '../ai/client.js';
import { loadEnv } from '../env.js';
import { domainPages } from '../leads/domain-cache.js';
import type { SitePage } from '../leads/page-text.js';
import { getSiteProfile } from '../profile/site-profile.js';
import type { Job, WritePayload } from '../worker/queue.js';
import { CAMPAIGN_COLUMNS, firstSendAfter, type CampaignRow } from './campaigns.js';
import { WRITE_BATCH } from './enroll.js';
import { nextSendAt } from './schedule.js';

/** Under this many words, or the email is not kept. The prompt asks for fewer. */
export const MAX_WORDS = 120;
const MIN_WORDS = 8;
const SUBJECT_MAX = 80;

/** What Claude answers for step 1. Keys are the `l1`, `l2` ... of the prompt. */
export const ClaudeFirstEmails = z.object({
  emails: z.array(
    z.object({
      lead: z.string().describe('The key of the lead, e.g. "l1".'),
      subject: z.string().nullable().describe('The subject line, or null when nothing honest can be written.'),
      body: z.string().nullable().describe('The plain text body, greeting first, no sign-off. Null with subject.'),
    }),
  ),
});
export type ClaudeFirstEmails = z.infer<typeof ClaudeFirstEmails>;

/** What Claude answers for the follow ups: one body per later step. */
export const ClaudeFollowUps = z.object({
  leads: z.array(
    z.object({
      lead: z.string().describe('The key of the lead, e.g. "l1".'),
      steps: z.array(
        z.object({
          step: z.number().int().describe('The step number, 2 or higher, as given.'),
          body: z.string().describe('The plain text body of that follow up, no sign-off.'),
        }),
      ),
    }),
  ),
});
export type ClaudeFollowUps = z.infer<typeof ClaudeFollowUps>;

const RULES = `- Plain text. No links, no web addresses, no email addresses, no attachments mentioned.
- Says only what the sender profile, the briefs and the company's pages state. Never invent facts, numbers, customers, results, names or a shared history, and never claim the sender saw, used or knows anything beyond the sender profile.
- No placeholders or merge tags, no brackets, no exclamation marks, no flattery ("impressive", "love", "amazing", "great work") and no dashes as punctuation.
- Ends with its last sentence. No sign-off, no name, no signature, no line about why they get the email or how to stop: the sender adds those under every email.`;

const SYSTEM_FIRST = `You write the first cold email from the sender to one person at a company, for each lead given. It goes out from the sender's own mailbox as plain text, to one person, so it reads like a short note one professional writes to another.

Each email:
- Does what the brief for step 1 asks, for this company.
- Opens with "Hi <first name>," when a first name is given, else "Hi,". Never guess a name.
- Then one or two sentences on something specific the company's pages state (the opener and its quote, when given, are checked facts you may use), tied to the sender's offer in plain words. Then the offer and one simple question as the call to action.
- Under 100 words in the body. A subject of 2 to 6 plain words, lowercase except names, no clickbait.
- Written in English.
${RULES}

When the pages and the profile give nothing honest to say to this company, answer subject and body as null. A null is better than a vague email.`;

const SYSTEM_FOLLOW = `You write the follow ups of a cold email sequence, for each lead given. Each follow up goes out in the same thread as the first email, a few days later, only when the person has not replied.

Each follow up:
- Does what its brief asks. Never repeats the first email, never says "just following up" or "bumping this".
- Opens with "Hi <first name>," when a first name is given, else "Hi,".
- Under 60 words in the body, in English.
${RULES}`;

function attr(v: string): string {
  return v.replace(/[<>"]/g, ' ');
}

/** Untrusted text inside a block: the block's own tags are taken out, so it cannot close or open one. */
function inner(v: string): string {
  return v.replace(/<\/?(sender|brief|lead|page|title|description|opener|quote|first_email)\b[^>]*>/gi, ' ');
}

function senderBlock(profile: SiteProfileFields | null): string {
  if (!profile) return '<sender>Not given. Use only what the briefs say about the sender.</sender>';
  const lines = [
    `Name: ${profile.name}`,
    `What they do: ${profile.summary}`,
    `Offer: ${profile.offer}`,
    `Sells to: ${profile.audience}`,
    profile.proofPoints.length ? `Proof: ${profile.proofPoints.join('; ')}` : '',
  ].filter(Boolean);
  return `<sender>\n${inner(lines.join('\n'))}\n</sender>`;
}

function briefBlock(steps: CampaignStep[], from: number): string {
  return steps
    .map((s, i) => ({ ...s, step: i + 1 }))
    .filter((s) => s.step >= from)
    .map((s) => `<brief step="${s.step}" wait_days="${s.waitDays}">\n${inner(s.brief)}\n</brief>`)
    .join('\n');
}

export interface WriteLead {
  key: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  companyName: string;
  domain: string;
  category: string | null;
  location: string | null;
  opener: { line: string; quote: string | null; sourceUrl: string | null } | null;
  pages: SitePage[];
}

function leadMeta(l: WriteLead): string {
  const meta = [`key="${l.key}"`, `company="${attr(l.companyName)}"`, `domain="${l.domain}"`];
  if (l.firstName) meta.push(`first_name="${attr(l.firstName)}"`);
  if (l.lastName) meta.push(`last_name="${attr(l.lastName)}"`);
  if (l.title) meta.push(`title="${attr(l.title)}"`);
  if (l.category) meta.push(`category="${attr(l.category)}"`);
  if (l.location) meta.push(`location="${attr(l.location)}"`);
  return meta.join(' ');
}

/** The prompt for step 1: the sender, the brief, then each lead with its company's pages. */
export function firstPrompt(profile: SiteProfileFields | null, steps: CampaignStep[], leads: WriteLead[]): string {
  const blocks = leads.map((l) => {
    const parts: string[] = [];
    if (l.opener) {
      parts.push(`<opener>${inner(l.opener.line)}</opener>`);
      if (l.opener.quote) parts.push(`<quote url="${attr(l.opener.sourceUrl ?? '')}">${inner(l.opener.quote)}</quote>`);
    }
    for (const p of l.pages) {
      parts.push(`<page url="${attr(p.url)}">\n<title>${attr(p.title)}</title>\n<description>${attr(p.description)}</description>\n${inner(p.text)}\n</page>`);
    }
    return `<lead ${leadMeta(l)}>\n${parts.join('\n')}\n</lead>`;
  });
  return `${senderBlock(profile)}\n\n${briefBlock(steps.slice(0, 1), 1)}\n\n${blocks.join('\n\n')}`;
}

/** The prompt for the follow ups: the sender, the later briefs, then each lead with its first email. */
export function followUpPrompt(
  profile: SiteProfileFields | null,
  steps: CampaignStep[],
  leads: Array<WriteLead & { subject: string; body: string }>,
): string {
  const blocks = leads.map(
    (l) => `<lead ${leadMeta(l)}>\n<first_email subject="${attr(l.subject)}">\n${inner(l.body)}\n</first_email>\n</lead>`,
  );
  return `${senderBlock(profile)}\n\n${briefBlock(steps, 2)}\n\n${blocks.join('\n\n')}`;
}

/** Placeholders and markup an email must not hold: {{first_name}}, [Company], <name>, %NAME%. */
const MERGE_TAG = /[{}[\]<>]|%[A-Za-z_]+%|\b(first ?name|last ?name|company ?name|your name)\b/i;
const LINK = /https?:\/\/|www\.|\S+@\S+\.\w|\b[\w-]+\.(com|net|org|io|co|ai|app|dev|run|so|xyz|dk|de|uk|eu|se|no|nl|fr|es|it|us|ca|au)\b/i;
const FLATTERY = /\b(impressive|amazing|awesome|incredible|love what you|great work|big fan)\b/i;
const SIGN_OFF = /^(best|cheers|thanks|thank you|regards|kind regards|best regards|warm regards|all the best|talk soon|sincerely)\b[\s,.!]*$/i;
const STOP_LINE = /unsubscribe|opt[ -]?out|reply (with )?["']?stop\b|found your (email|address)/i;

/** Dashes used as punctuation become commas, as in openers.ts. */
function undash(s: string): string {
  return s.replace(/[ \t]*[\u2013\u2014][ \t]*/g, ', ').replace(/ -{1,2} /g, ', ');
}

/**
 * Cleans a written body and keeps it only when it holds to the rules: no
 * links, no placeholders, no flattery, between MIN_WORDS and MAX_WORDS. A
 * sign-off Claude added anyway, and any line about stopping, is cut: the
 * footer says those.
 */
export function checkBody(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let lines = undash(raw.replace(/\r\n?/g, '\n'))
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim());
  lines = lines.filter((l) => !STOP_LINE.test(l));
  // A sign-off in the last three lines cuts from there: "Best,\nAnna".
  for (let i = Math.max(0, lines.length - 3); i < lines.length; i++) {
    if (SIGN_OFF.test(lines[i]!)) {
      lines = lines.slice(0, i);
      break;
    }
  }
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || MERGE_TAG.test(text) || LINK.test(text) || FLATTERY.test(text)) return null;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS || words > MAX_WORDS) return null;
  return text;
}

export function checkSubject(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const subject = undash(raw)
    .replace(/\s+/g, ' ')
    .replace(/^(re|fwd?):\s*/i, '')
    .trim();
  if (!subject || subject.length > SUBJECT_MAX || MERGE_TAG.test(subject) || LINK.test(subject)) return null;
  return subject;
}

export interface WriteDeps {
  sql: Sql;
  ai: Ai;
  log: Logger;
  now?: () => Date;
  /** SENDING_USERS: only their campaigns are written. Read from the environment when left out. */
  users?: readonly string[];
}

/** The payload of a write job, defensively read. */
export function writePayload(job: Job): WritePayload {
  const ids = job.payload.leadIds;
  return {
    campaignId: typeof job.payload.campaignId === 'string' ? job.payload.campaignId : '',
    leadIds: Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string').slice(0, WRITE_BATCH) : [],
  };
}

interface LeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string;
  domain: string;
  timezone: string;
  category: string | null;
  location: string | null;
  opener_status: string | null;
  opener: string | null;
  opener_quote: string | null;
  opener_source_url: string | null;
}

type Written = { subject: string; bodies: string[] };

async function fail(sql: Sql, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`
    update campaign_leads set status = 'failed', skip_reason = 'write_failed'
    where id in ${sql(ids)} and status = 'writing'
  `;
}

/** A 'writing' campaign with no lead left in 'writing' is ready for review. */
async function settleCampaign(sql: Sql, campaignId: string): Promise<void> {
  await sql`
    update campaigns c set status = 'review'
    where c.id = ${campaignId} and c.status = 'writing'
      and not exists (select 1 from campaign_leads l where l.campaign_id = c.id and l.status = 'writing')
  `;
}

/**
 * The write job: two Claude calls for up to WRITE_BATCH leads of one
 * campaign. A campaign of a user outside SENDING_USERS is left as it is.
 */
export async function runWriteJob(deps: WriteDeps, payload: WritePayload): Promise<void> {
  const { sql } = deps;
  const users = deps.users ?? loadEnv().SENDING_USERS;
  if (!payload.campaignId || payload.leadIds.length === 0 || users.length === 0) return;
  const [campaign] = await sql<CampaignRow[]>`
    select ${sql.unsafe(CAMPAIGN_COLUMNS)} from campaigns c where c.id = ${payload.campaignId} and c.clerk_user_id in ${sql(users)}`;
  if (!campaign) return;
  const rows = await sql<LeadRow[]>`
    select l.id, l.first_name, l.last_name, l.title, l.company_name, l.domain, l.timezone,
      co.category, co.location, co.opener_status, co.opener, co.opener_quote, co.opener_source_url
    from campaign_leads l
    left join companies co on co.id = l.company_id
    where l.id in ${sql(payload.leadIds)} and l.campaign_id = ${campaign.id} and l.status = 'writing'
    order by l.id
  `;
  if (rows.length === 0) return settleCampaign(sql, campaign.id);

  const userId = campaign.clerk_user_id;
  const pages = await domainPages(sql, [...new Set(rows.map((r) => r.domain))]);
  const leads = rows.map(
    (r, i): WriteLead & { id: string } => ({
      id: r.id,
      key: `l${i + 1}`,
      firstName: r.first_name,
      lastName: r.last_name,
      title: r.title,
      companyName: r.company_name,
      domain: r.domain,
      category: r.category,
      location: r.location,
      opener: r.opener_status === 'done' && r.opener ? { line: r.opener, quote: r.opener_quote, sourceUrl: r.opener_source_url } : null,
      pages: pages.get(r.domain) ?? [],
    }),
  );
  const profile = (await getSiteProfile(sql, userId))?.profile ?? null;
  const steps = campaign.steps;
  const written = new Map<string, Written>();

  try {
    const first = await deps.ai.structured({
      userId,
      task: 'write',
      tier: 'quality',
      system: SYSTEM_FIRST,
      prompt: firstPrompt(profile, steps, leads),
      schema: ClaudeFirstEmails,
      toolName: 'save_emails',
      toolDescription: 'Saves the first email per lead key.',
      effort: 'low',
      maxTokens: 700 * leads.length + 2000,
    });
    const byKey = new Map(first.data.emails.map((e) => [e.lead.trim(), e]));
    for (const l of leads) {
      const answer = byKey.get(l.key);
      const subject = checkSubject(answer?.subject);
      const body = checkBody(answer?.body);
      if (subject && body) written.set(l.id, { subject, bodies: [body] });
    }

    const follow = leads.filter((l) => written.has(l.id));
    if (steps.length > 1 && follow.length > 0) {
      const res = await deps.ai.structured({
        userId,
        task: 'write',
        tier: 'bulk',
        system: SYSTEM_FOLLOW,
        prompt: followUpPrompt(
          profile,
          steps,
          follow.map((l) => ({ ...l, subject: written.get(l.id)!.subject, body: written.get(l.id)!.bodies[0]! })),
        ),
        schema: ClaudeFollowUps,
        toolName: 'save_follow_ups',
        toolDescription: 'Saves the follow up bodies per lead key.',
        effort: 'low',
        maxTokens: 400 * follow.length * (steps.length - 1) + 2000,
      });
      const byLead = new Map(res.data.leads.map((e) => [e.lead.trim(), e]));
      for (const l of follow) {
        const answer = byLead.get(l.key);
        const w = written.get(l.id)!;
        for (let step = 2; step <= steps.length; step++) {
          const body = checkBody(answer?.steps.find((s) => s.step === step)?.body);
          if (!body) {
            written.delete(l.id);
            break;
          }
          w.bodies.push(body);
        }
      }
    }
  } catch (err) {
    // Claude declined, gave nothing usable, or the budget is spent: retrying would not help.
    if (!(err instanceof AiError)) throw err;
    deps.log.warn({ err, userId, campaignId: campaign.id, leads: leads.length }, 'write: Claude failed');
    await fail(sql, leads.map((l) => l.id));
    return settleCampaign(sql, campaign.id);
  }

  const now = deps.now?.() ?? new Date();
  await sql.begin(async (tx) => {
    // Read again: the campaign may have been started while Claude wrote.
    const [c] = await tx<CampaignRow[]>`select ${tx.unsafe(CAMPAIGN_COLUMNS)} from campaigns c where c.id = ${campaign.id}`;
    if (!c) return;
    for (const l of leads) {
      const w = written.get(l.id);
      if (!w) continue;
      // Follow ups go out in the same thread, so they carry the first subject (the sender adds "Re: ").
      const stepRows = w.bodies.map((body, i) => ({ campaign_lead_id: l.id, step: i + 1, subject: w.subject, body }));
      await tx`
        insert into campaign_steps_written ${tx(stepRows, 'campaign_lead_id', 'step', 'subject', 'body')}
        on conflict (campaign_lead_id, step) do update set subject = excluded.subject, body = excluded.body
        where not campaign_steps_written.edited
      `;
      const timezone = rows.find((r) => r.id === l.id)!.timezone;
      const sendAt = c.started_at ? nextSendAt({ after: firstSendAfter(c, now), timezone, schedule: c.schedule }) : null;
      await tx`
        update campaign_leads set status = 'queued', written_at = ${now}, next_send_at = ${sendAt}
        where id = ${l.id} and status = 'writing'
      `;
    }
  });
  await fail(sql, leads.filter((l) => !written.has(l.id)).map((l) => l.id));
  await settleCampaign(sql, campaign.id);
  deps.log.info({ userId, campaignId: campaign.id, leads: leads.length, written: written.size }, 'write: batch done');
}

/** A write job that ran out of attempts leaves its leads failed, so the campaign can still go to review. */
export async function onWriteGaveUp(deps: Pick<WriteDeps, 'sql'>, payload: WritePayload): Promise<void> {
  if (payload.leadIds.length === 0) return;
  await fail(deps.sql, payload.leadIds);
  if (payload.campaignId) await settleCampaign(deps.sql, payload.campaignId);
}
