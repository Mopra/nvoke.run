/**
 * `sending` is the operator's tool for outreach from nvoke's sending engine
 * (docs/sending/plan.md, "Own products"). It picks the database like
 * `privacy` (--database-url, DATABASE_URL only with --prod, else
 * CLI_DATABASE_URL or the embedded Postgres) and prints it first. --user is
 * the Clerk user id of the account that sends.
 *
 *   sending import <file.json|file.csv> --user U [--label L] [--search ID]
 *       leads into an import search (sending/import.ts), or onto import ID.
 *       JSON: an array of ImportLead. CSV: a header row with domain, address,
 *       fit_reason and any of name, first_name, last_name, title, location,
 *       country, category, source_url. Bad rows are listed by line, the good
 *       ones imported.
 *   sending opt-outs --user U --sender day3.app [--sender exit1.dev] [--domain D]... <files...>
 *       per sender opt-outs from .csv, .txt and .json files
 *       (sending/opt-out-import.ts). Each --domain blocks the domain for every
 *       sender of the account.
 *   sending campaign <spec.json> --user U [--search ID]
 *       a draft campaign from a CreateCampaignRequest; `mailboxes`
 *       (addresses) may stand in for `mailboxIds`, and `search` (a
 *       CreateSearchRequest) queues the campaign's own search first.
 *   sending pool <name> --cap N --user U <mailbox addresses...>
 *       a mailbox pool with a shared daily cap, and those mailboxes in it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CreateCampaignRequest, CreateSearchRequest } from '@nvoke/shared';
import { ensureAccount } from '../leads/quota.js';
import { createSearch } from '../leads/repo.js';
import { createCampaign } from '../sending/campaigns.js';
import { importLeads, parseImportFile } from '../sending/import.js';
import { collectOptOuts, importOptOuts, parseBareDomain } from '../sending/opt-out-import.js';
import { opsDatabase, usage, type Args, type Command } from './shared.js';

/** `cli sending ...`: imports and setup for outreach from the sending engine (docs/sending/plan.md). */
async function sending(args: Args): Promise<void> {
  const [, action, ...rest] = args.positional;
  const flag = (n: string) => {
    const v = args.flags.get(n);
    return typeof v === 'string' ? v : undefined;
  };
  const user = flag('user');
  if (!user || !action || !['import', 'opt-outs', 'campaign', 'pool'].includes(action)) usage();

  if (action === 'import') {
    const file = rest[0];
    if (!file) usage();
    const { leads, errors } = parseImportFile(file, readFileSync(resolve(file), 'utf8'));
    for (const e of errors) console.error(`line ${e.line}: ${e.message}`);
    const { sql, close } = await opsDatabase(args);
    try {
      const result = await importLeads(sql, user, leads, { label: flag('label'), searchId: flag('search') });
      console.log(JSON.stringify({ ...result, badRows: errors.length }, null, 2));
    } finally {
      await close();
    }
    return;
  }

  if (action === 'opt-outs') {
    const senders = args.lists.get('sender') ?? [];
    const everyDomains = args.lists.get('domain') ?? [];
    if (senders.length === 0 || rest.length === 0) usage();
    const bad = [...senders, ...everyDomains].filter((d) => !parseBareDomain(d));
    if (bad.length > 0) throw new Error(`not a bare domain: ${bad.join(', ')}`);
    const optOuts = collectOptOuts(rest.map((f) => ({ name: f, text: readFileSync(resolve(f), 'utf8') })));
    console.error(`read ${optOuts.addresses.size} addresses and ${optOuts.domains.size} domains from ${rest.length} files`);
    const { sql, close } = await opsDatabase(args);
    try {
      const counts = await importOptOuts(
        sql,
        user,
        optOuts,
        senders.map((d) => parseBareDomain(d)!),
        everyDomains.map((d) => parseBareDomain(d)!),
      );
      for (const [sender, c] of Object.entries(counts)) {
        console.log(
          `${(sender || 'every sender').padEnd(14)} addresses ${String(c.addresses).padStart(5)}  domains ${String(c.domains).padStart(4)}  new rows ${c.added}`,
        );
      }
    } finally {
      await close();
    }
    return;
  }

  if (action === 'campaign') {
    const file = rest[0];
    if (!file) usage();
    const { mailboxes, search: searchSpec, ...spec } = JSON.parse(readFileSync(resolve(file), 'utf8')) as Record<string, unknown>;
    const search = flag('search');
    const searchReq = searchSpec && !search ? CreateSearchRequest.safeParse(searchSpec) : undefined;
    if (searchReq && !searchReq.success) throw new Error(searchReq.error.issues.map((i) => `search.${i.path.join('.')}: ${i.message}`).join('\n'));
    const { sql, close } = await opsDatabase(args);
    try {
      // Mailboxes by address, as the operator knows them.
      if (Array.isArray(mailboxes)) {
        const wanted = mailboxes.map((m) => String(m).trim().toLowerCase());
        const rows = await sql<{ id: string; address: string }[]>`
          select id, lower(address) as address from mailboxes where clerk_user_id = ${user} and lower(address) in ${sql(wanted)}
        `;
        const missing = wanted.filter((a) => !rows.some((r) => r.address === a));
        if (missing.length > 0) throw new Error(`no mailbox of ${user} at ${missing.join(', ')}`);
        spec.mailboxIds = wanted.map((a) => rows.find((r) => r.address === a)!.id);
      }
      // A stand-in id for the spec's own search, so the campaign parses before the search is queued.
      if (search) spec.searchId = search;
      else if (searchReq) spec.searchId = '00000000-0000-4000-8000-000000000000';
      const parsed = CreateCampaignRequest.safeParse(spec);
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
      if (searchReq?.success) {
        await ensureAccount(sql, user);
        const created = await createSearch(sql, user, searchReq.data, searchReq.data.limit ?? 100);
        console.error(`search ${created.id} (${created.kind}, limit ${created.limit}) queued`);
        parsed.data.searchId = created.id;
      }
      const campaign = await createCampaign(sql, user, parsed.data);
      console.log(JSON.stringify({ id: campaign.id, status: campaign.status, searchId: campaign.searchId, leads: campaign.leads }, null, 2));
    } finally {
      await close();
    }
    return;
  }

  const [name, ...addresses] = rest;
  const cap = Number(flag('cap'));
  if (!name || addresses.length === 0 || !Number.isInteger(cap) || cap < 1 || cap > 5000) usage();
  const { sql, close } = await opsDatabase(args);
  try {
    const wanted = addresses.map((a) => a.trim().toLowerCase());
    const moved = await sql.begin(async (tx) => {
      await tx`
        insert into send_pools (clerk_user_id, name, daily_cap) values (${user}, ${name}, ${cap})
        on conflict (clerk_user_id, name) do update set daily_cap = excluded.daily_cap
      `;
      return tx<{ address: string }[]>`
        update mailboxes set pool = ${name} where clerk_user_id = ${user} and lower(address) in ${tx(wanted)}
        returning lower(address) as address
      `;
    });
    const missing = wanted.filter((a) => !moved.some((m) => m.address === a));
    console.log(JSON.stringify({ pool: name, dailyCap: cap, mailboxes: moved.map((m) => m.address), missing }, null, 2));
    if (missing.length > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

export const sendingCommand: Command = {
  name: 'sending',
  usage: [
    '  cli sending import <file.json|file.csv> --user U [--label L] [--search ID] [--prod]',
    '  cli sending opt-outs --user U --sender DOMAIN... [--domain D]... <files...> [--prod]',
    '  cli sending campaign <spec.json> --user U [--search ID] [--prod]',
    '  cli sending pool <name> --cap N --user U <mailbox addresses...> [--prod]',
  ],
  run: sending,
};
