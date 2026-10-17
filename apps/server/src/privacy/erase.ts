// Erasure (GDPR Article 17) and objection (Article 21): suppress an address or
// a domain so it is never collected again, then delete every stored copy.

import type { Sql } from 'postgres';
import { suppress, type SuppressionSource } from '../leads/suppression.js';
import { parseAddress, parseDomain, type PrivacyTarget } from './target.js';

/** Rows removed per table, for the operator's log. */
export interface EraseResult {
  target: PrivacyTarget;
  emails: number;
  domainEmails: number;
  domains: number;
  companies: number;
  emailChecks: number;
  billedEmails: number;
  searchesRecounted: number;
}

function normalize(target: PrivacyTarget): PrivacyTarget {
  if ('address' in target) {
    const address = parseAddress(target.address);
    if (!address) throw new Error(`not an email address: ${target.address}`);
    return { address };
  }
  const domain = parseDomain(target.domain);
  if (!domain) throw new Error(`not a domain: ${target.domain}`);
  return { domain };
}

/**
 * Suppresses the target and deletes it everywhere: per-search emails, the
 * shared cache (domain_emails, domains), the verification cache
 * (email_checks), the billing ledger (billed_emails) and, for a domain, the
 * companies found on it in every user's searches. A domain covers its
 * subdomains and every address on them.
 *
 * suppress() runs in its own transaction and goes first, so the hash is in
 * place before anything else and the worker stops collecting at once. The
 * remaining deletes run in a second transaction. Every step is idempotent,
 * so a failure halfway is fixed by running erase again.
 *
 * Search counters (companies_found, companies_crawled, emails_found,
 * emails_valid) are recounted from the remaining rows for every search that
 * lost something. usage.emails_verified is left alone: it is a count with no
 * address in it, and the month was already billed.
 */
export async function erase(sql: Sql, input: PrivacyTarget, source: SuppressionSource = 'admin'): Promise<EraseResult> {
  const target = normalize(input);
  const isAddress = 'address' in target;
  const domain = isAddress ? '' : target.domain;
  const sub = `%.${domain}`;

  // What suppress() is about to delete, counted first so the result is complete.
  const before = isAddress
    ? await sql<{ emails: number; domain_emails: number; domains: number; searches: string[] }[]>`
        select
          (select count(*)::int from emails where address = ${target.address}) as emails,
          (select count(*)::int from domain_emails where address = ${target.address}) as domain_emails,
          0 as domains,
          array(select distinct search_id::text from emails where address = ${target.address}) as searches`
    : await sql<{ emails: number; domain_emails: number; domains: number; searches: string[] }[]>`
        select
          (select count(*)::int from emails
            where split_part(address, '@', 2) = ${domain} or split_part(address, '@', 2) like ${sub}) as emails,
          (select count(*)::int from domain_emails
            where domain = ${domain} or domain like ${sub}
               or split_part(address, '@', 2) = ${domain} or split_part(address, '@', 2) like ${sub}) as domain_emails,
          (select count(*)::int from domains where domain = ${domain} or domain like ${sub}) as domains,
          array(
            select search_id::text from emails
              where split_part(address, '@', 2) = ${domain} or split_part(address, '@', 2) like ${sub}
            union
            select search_id::text from companies where domain = ${domain} or domain like ${sub}
          ) as searches`;
  const counted = before[0]!;

  await suppress(sql, target, source);

  return sql.begin(async (tx) => {
    let companies = 0;
    let emailChecks: number;
    let billedEmails: number;
    if (isAddress) {
      emailChecks = (await tx`delete from email_checks where address = ${target.address}`).count;
      billedEmails = (await tx`delete from billed_emails where address = ${target.address}`).count;
      // Kept page text and openers are stripped of addresses, but one written oddly may slip through.
      const like = `%${target.address.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      await tx`delete from domain_pages where text ilike ${like} or title ilike ${like} or description ilike ${like}`;
      await tx`
        update companies set opener_status = null, opener = null, opener_quote = null, opener_source_url = null, opener_at = null
        where opener ilike ${like} or opener_quote ilike ${like}
      `;
    } else {
      // Cached addresses on this domain that a different domain's site listed.
      await tx`delete from domain_emails
          where split_part(address, '@', 2) = ${domain} or split_part(address, '@', 2) like ${sub}`;
      // Emails of these companies go with them (on delete cascade).
      companies = (await tx`delete from companies where domain = ${domain} or domain like ${sub}`).count;
      // Launches on the domain in the drops feed.
      await tx`delete from feed_items where domain = ${domain} or domain like ${sub}`;
      emailChecks = (
        await tx`delete from email_checks
          where split_part(address, '@', 2) = ${domain} or split_part(address, '@', 2) like ${sub}`
      ).count;
      billedEmails = (
        await tx`delete from billed_emails
          where split_part(address, '@', 2) = ${domain} or split_part(address, '@', 2) like ${sub}`
      ).count;
    }

    let searchesRecounted = 0;
    if (counted.searches.length > 0) {
      searchesRecounted = (
        await tx`
          update searches s set
            companies_found   = (select count(*)::int from companies c where c.search_id = s.id),
            companies_crawled = (select count(*)::int from companies c where c.search_id = s.id and c.crawl_status <> 'pending'),
            emails_found      = (select count(*)::int from emails e where e.search_id = s.id),
            emails_valid      = (select count(*)::int from emails e where e.search_id = s.id and e.verification = 'valid')
          where s.id in ${tx(counted.searches)}`
      ).count;
    }

    return {
      target,
      // Addresses on other domains that a deleted company listed went with it and are not counted here.
      emails: counted.emails,
      domainEmails: counted.domain_emails,
      domains: counted.domains,
      companies,
      emailChecks,
      billedEmails,
      searchesRecounted,
    };
  });
}
