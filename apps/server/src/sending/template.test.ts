import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CreateCampaignRequest, renderTemplate, unknownVariables, type CampaignStep, type TemplateValues } from '@nvoke/shared';
import type { Ai } from '../ai/client.js';
import { ensureAccount } from '../leads/quota.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { CampaignError, createCampaign, getCampaign, updateCampaign, updateWrittenStep } from './campaigns.js';
import { footer } from './footer.js';
import { previewLead, renderSteps } from './template.js';
import { silentLog } from './test-seed.js';
import { runWriteJob } from './write.js';

const VALUES: TemplateValues = { first: 'Anna', company: 'Volvo', domain: 'volvo.se', sender_first: 'Morten', sender_name: 'Morten Pradsgaard', ref: 'ab12cd34' };

describe('renderTemplate', () => {
  it('fills every variable', () => {
    expect(renderTemplate('Hej {first}, {company} ({domain}). /{sender_first}, {sender_name} [{ref}]', VALUES)).toBe(
      'Hej Anna, Volvo (volvo.se). /Morten, Morten Pradsgaard [ab12cd34]',
    );
  });

  it('drops an empty variable with the space before it', () => {
    expect(renderTemplate('Hej {first},\n\nText.', { ...VALUES, first: null })).toBe('Hej,\n\nText.');
  });

  it('uses the fallback when the value is empty', () => {
    expect(renderTemplate('Hej {first|där},', { ...VALUES, first: '' })).toBe('Hej där,');
    expect(renderTemplate('Hej {first|där},', VALUES)).toBe('Hej Anna,');
  });

  it('names unknown variables', () => {
    expect(unknownVariables('Hej {frist} at {company} {foo|x}')).toEqual(['frist', 'foo']);
  });
});

describe('template schemas', () => {
  const base = { name: 'T', source: 'list' as const, searchId: '11111111-1111-4111-8111-111111111111', mailboxIds: ['22222222-2222-4222-8222-222222222222'] };

  it('takes template steps for a template campaign', () => {
    const r = CreateCampaignRequest.safeParse({ ...base, writer: 'template', steps: [{ waitDays: 0, template: { subject: 'Hi', body: 'Hej {first},' } }] });
    expect(r.success).toBe(true);
  });

  it('refuses a typo, a missing template and a missing first subject', () => {
    const typo = CreateCampaignRequest.safeParse({ ...base, writer: 'template', steps: [{ waitDays: 0, template: { subject: 'Hi', body: 'Hej {frist},' } }] });
    expect(typo.success).toBe(false);
    const brief = CreateCampaignRequest.safeParse({ ...base, writer: 'template', steps: [{ waitDays: 0, brief: 'Say hi.' }] });
    expect(brief.success).toBe(false);
    const noSubject = CreateCampaignRequest.safeParse({ ...base, writer: 'template', steps: [{ waitDays: 0, template: { body: 'Hej' } }] });
    expect(noSubject.success).toBe(false);
  });

  it('still needs a brief for a Claude campaign', () => {
    const r = CreateCampaignRequest.safeParse({ ...base, steps: [{ waitDays: 0, template: { subject: 'Hi', body: 'Hej' } }] });
    expect(r.success).toBe(false);
  });
});

describe('renderSteps', () => {
  const steps: CampaignStep[] = [
    { waitDays: 0, template: { subject: 'Till {company}', body: 'Hej {first},\nNamed.', shared: { subject: 'Till {company} (info)', body: 'Hej,\nShared.' } } },
    { waitDays: 3, template: { body: 'Igen {first|där}.' } },
  ];
  const lead = { id: 'abcdef12-0000-4000-8000-000000000000', address: 'anna@volvo.se', email_kind: 'personal', first_name: 'Anna Maria', company_name: 'Volvo', domain: 'volvo.se', sender_name: 'Morten P' };

  it('renders a named lead with the step 1 subject for the thread', () => {
    expect(renderSteps(steps, lead)).toEqual({ subject: 'Till Volvo', bodies: ['Hej Anna,\nNamed.', 'Igen Anna.'] });
  });

  it('gives a shared inbox its variant, and the plain text where a step has none', () => {
    const info = { ...lead, address: 'info@volvo.se', email_kind: 'generic', first_name: null };
    expect(renderSteps(steps, info)).toEqual({ subject: 'Till Volvo (info)', bodies: ['Hej,\nShared.', 'Igen där.'] });
  });
});

describe('footer signed', () => {
  it('leaves the signature out and keeps the lines', () => {
    const o = { signature: 'Morten\nOptiPeople', displayName: 'Morten', domain: 'volvo.se', text: 'Found on {domain}. Reply stop.' };
    expect(footer(o)).toBe('Morten\nOptiPeople\n\nFound on volvo.se. Reply stop.');
    expect(footer({ ...o, signed: false })).toBe('Found on volvo.se. Reply stop.');
  });
});

describe('template campaigns', () => {
  let db: TestDb;
  const NOW = new Date('2026-10-19T08:00:00Z');
  const noAi = {
    structured: () => {
      throw new Error('a template campaign called Claude');
    },
  } as unknown as Ai;

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await db.sql`truncate accounts, jobs cascade`;
  });

  async function setup() {
    await ensureAccount(db.sql, 'u1');
    const [m] = await db.sql<{ id: string }[]>`
      insert into mailboxes (clerk_user_id, address, display_name, provider, smtp_host, smtp_port, smtp_secure,
        imap_host, imap_port, username, secret, status, signature)
      values ('u1', 'morten@optipeople.se', 'Morten Pradsgaard', 'smtp', 'smtp.x.io', 465, true, 'imap.x.io', 993, 'm', 'sealed', 'active', 'Morten\nOptiPeople')
      returning id`;
    const [s] = await db.sql<{ id: string }[]>`insert into searches (clerk_user_id, kind, "limit") values ('u1', 'local', 50) returning id`;
    for (const [d, local, kind, first] of [
      ['volvo.se', 'anna', 'personal', 'Anna'],
      ['scania.se', 'info', 'generic', null],
    ] as const) {
      const [c] = await db.sql<{ id: string }[]>`
        insert into companies (search_id, clerk_user_id, name, domain, website, source)
        values (${s!.id}, 'u1', ${d.split('.')[0]!}, ${d}, ${`https://${d}/`}, 'test') returning id`;
      await db.sql`
        insert into emails (company_id, search_id, clerk_user_id, address, kind, verification, first_name)
        values (${c!.id}, ${s!.id}, 'u1', ${`${local}@${d}`}, ${kind}, 'valid', ${first})`;
    }
    const c = await createCampaign(
      db.sql,
      'u1',
      {
        name: 'Sweden',
        source: 'list',
        searchId: s!.id,
        mailboxIds: [m!.id],
        peopleOnly: false,
        writer: 'template',
        signed: false,
        footer: 'Adressen hittade jag på {domain}. Svara nej så hör jag inte av mig igen.',
        steps: [
          { waitDays: 0, template: { subject: 'Fråga till {company}', body: 'Hej {first},\n\nText.\n\n/{sender_first}', shared: { body: 'Hej,\n\nText till er.\n\n/{sender_first}' } } },
          { waitDays: 4, template: { body: 'Hej igen {first}. Ref {ref}.' } },
        ],
      },
      NOW,
    );
    return { campaign: c, mailboxId: m!.id };
  }

  async function runJobs() {
    const jobs = await db.sql<{ payload: { campaignId: string; leadIds: string[] } }[]>`select payload from jobs where type = 'write'`;
    for (const j of jobs) await runWriteJob({ sql: db.sql, ai: noAi, log: silentLog, users: ['u1'], now: () => NOW }, j.payload);
  }

  it('renders every lead without Claude, queues it and goes to review', async () => {
    const { campaign } = await setup();
    expect(campaign.writer).toBe('template');
    expect(campaign.signed).toBe(false);
    await runJobs();
    const leads = await db.sql<{ id: string; address: string; status: string }[]>`
      select id, address, status from campaign_leads where campaign_id = ${campaign.id} order by address`;
    expect(leads.map((l) => [l.address, l.status])).toEqual([
      ['anna@volvo.se', 'queued'],
      ['info@scania.se', 'queued'],
    ]);
    const steps = await db.sql<{ address: string; step: number; subject: string; body: string }[]>`
      select l.address, w.step, w.subject, w.body from campaign_steps_written w join campaign_leads l on l.id = w.campaign_lead_id
      where l.campaign_id = ${campaign.id} order by l.address, w.step`;
    const anna = leads[0]!;
    expect(steps).toEqual([
      { address: 'anna@volvo.se', step: 1, subject: 'Fråga till volvo', body: 'Hej Anna,\n\nText.\n\n/Morten' },
      { address: 'anna@volvo.se', step: 2, subject: 'Fråga till volvo', body: `Hej igen Anna. Ref ${anna.id.slice(0, 8)}.` },
      { address: 'info@scania.se', step: 1, subject: 'Fråga till scania', body: 'Hej,\n\nText till er.\n\n/Morten' },
      { address: 'info@scania.se', step: 2, subject: 'Fråga till scania', body: 'Hej igen. Ref ' + leads[1]!.id.slice(0, 8) + '.' },
    ]);
    expect((await getCampaign(db.sql, 'u1', campaign.id))!.status).toBe('review');

    const preview = await previewLead(db.sql, 'u1', campaign.id, anna.id);
    expect(preview!.from).toBe('morten@optipeople.se');
    expect(preview!.steps.map((s) => [s.step, s.subject, s.written])).toEqual([
      [1, 'Fråga till volvo', true],
      [2, 'Re: Fråga till volvo', true],
    ]);
    // No signature: the text signs itself, the campaign's footer line follows.
    expect(preview!.steps[0]!.text).toBe('Hej Anna,\n\nText.\n\n/Morten\n\nAdressen hittade jag på volvo.se. Svara nej så hör jag inte av mig igen.');
  });

  it('renders new text over unsent, unedited steps and keeps edits', async () => {
    const { campaign } = await setup();
    await runJobs();
    const [anna] = await db.sql<{ id: string }[]>`select id from campaign_leads where campaign_id = ${campaign.id} and address = 'anna@volvo.se'`;
    await updateWrittenStep(db.sql, 'u1', campaign.id, anna!.id, 2, { body: 'Hand written.' });
    await updateCampaign(db.sql, 'u1', campaign.id, {
      steps: [
        { waitDays: 0, template: { subject: 'Ny fråga', body: 'Hallå {first}.' } },
        { waitDays: 4, template: { body: 'Igen.' } },
      ],
    });
    const steps = await db.sql<{ step: number; subject: string; body: string }[]>`
      select step, subject, body from campaign_steps_written where campaign_lead_id = ${anna!.id} order by step`;
    expect(steps).toEqual([
      { step: 1, subject: 'Ny fråga', body: 'Hallå Anna.' },
      { step: 2, subject: 'Fråga till volvo', body: 'Hand written.' },
    ]);
  });

  it('refuses briefs on a template campaign', async () => {
    const { campaign } = await setup();
    await expect(updateCampaign(db.sql, 'u1', campaign.id, { steps: [{ waitDays: 0, brief: 'Say hi.' }] })).rejects.toBeInstanceOf(CampaignError);
  });

  it('previews a lead of another user as nothing', async () => {
    const { campaign } = await setup();
    const [l] = await db.sql<{ id: string }[]>`select id from campaign_leads where campaign_id = ${campaign.id} limit 1`;
    expect(await previewLead(db.sql, 'u2', campaign.id, l!.id)).toBeNull();
  });
});
