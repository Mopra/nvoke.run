# Data protection impact assessment (DPIA), lead data

Status: first version, 13 October 2026. Written by the nvoke team, not by a lawyer. Covers the lead data activity (finding companies, crawling, classifying, verifying, caching and exporting email addresses). Customer accounts and billing are low risk and not assessed here (see `ropa.md`). Read with `lia.md` (necessity and balancing) and `article-14.md` (transparency).

Sources cited as [R] refer to `docs/research/gdpr-competitors.md`.

## 1. Is a full DPIA required?

Article 35(1) requires a DPIA where processing is "likely to result in a high risk". The Article 35(3) list does not match directly: no evaluation or profiling of people, no special categories, no monitoring of a public area.

The EDPB (WP248 rev.01) says a DPIA is generally needed when two or more of its nine criteria are met. Our honest reading:

| WP248 criterion | Met? |
|---|---|
| 1. Evaluation or scoring | No. Classification labels an address, not a person. |
| 2. Automated decisions with legal or similar effect | No. |
| 3. Systematic monitoring | No. One-off crawl of business pages, read again only when a later search finds the company more than 90 days after the last visit. |
| 4. Sensitive or highly personal data | No. |
| 5. Large scale | Likely, over time. Every customer search crawls up to 1,000 companies, across the EU. |
| 6. Matching or combining datasets | Yes. Company listings from OSM, Brave, Product Hunt and HN are combined with addresses from the company's website. |
| 7. Vulnerable data subjects | No. |
| 8. Innovative technology | No. Crawling and SMTP checks are established. |
| 9. Prevents data subjects from exercising rights | Partly. People do not know we hold their address unless they find our notice (see `article-14.md`). |

Two criteria are met (5 and 6) and a third partly (9). CNIL also recommends a DPIA for tools that reuse public data for prospecting [R35]. Datatilsynet's published list of processing that always requires a DPIA should be checked by the lawyer (not verified by us).

**Conclusion: we treat a DPIA as required.** This document is our DPIA. It is concise, not a placeholder, but the lawyer should confirm it is sufficient or tell us what to add. If residual risk were high after mitigations, Article 36 prior consultation with Datatilsynet would apply. We assess it as medium (section 4), so we do not plan to consult, subject to the lawyer's view.

## 2. Description

- **Data subjects:** people whose work email address appears on a company's public website, mostly owners and employees of small and medium businesses; sole traders whose business details identify them.
- **Data:** email address, `generic` or `personal` label, source URL, first and last seen, verification result, MX host. Company name, website, location, phone and category from the listing. Since 2026-10-17 also the names and job titles of people a company publishes on its own site (team, about, imprint pages), with the page they came from, and business addresses built for those people from the domain's address pattern and confirmed by an SMTP RCPT probe (`found_via` = `pattern`, with a confidence). No social profiles, no private or consumer data, nothing behind a login.
- **Sources:** OpenStreetMap (Nominatim, Overpass), Brave Search API, Product Hunt, Hacker News Show HN (through Algolia), and the companies' own websites.
- **Recipients:** the customer who ran the search (in the app and as CSV). Generic addresses can be served to any customer whose search finds that company. Sub-processors listed in `ropa.md`.
- **Storage:** Supabase Postgres (EU region, TODO confirm), worker on a VPS (host and region TODO).
- **Retention:** generic cache 12 months from first collection (never renewed) and sooner if a recrawl no longer finds the address; searches with companies and emails 12 months from creation; verification cache 30 days; billing ledger (`billed_emails`) 12 months; suppression hashes forever. Enforced by the worker's hourly purge (`apps/server/src/leads/retention.ts`).

## 3. Risks

Scale: likelihood and severity are each Low, Medium or High. "Before" is without the listed mitigations, "after" is with them.

| # | Risk | Likelihood before | Severity | Mitigations | Residual |
|---|---|---|---|---|---|
| R1 | Customers use exports for unsolicited marketing email, in breach of Markedsføringsloven §10 or other national e-privacy rules. Recipients get spam; nvoke may be co-liable (medvirken) [R43]. | High | Medium | Positioning as research tool, never "cold email". Terms bind the customer to §10 and GDPR and forbid resale. Notice in the app before every CSV export (until the user turns it off) and in the results table. Label generic and personal. Suppression list honoured on export. | Medium. We cannot control what customers send. The largest risk. |
| R2 | People do not know we process their address, so they cannot object (transparency, Art 14). Bisnode shows a website notice may not be enough when the controller holds an email address [R28][R29]. | High | Medium | Public notice on `/privacy` (DA and EN), `/bot` page linked from the user agent, `/opt-out`. Personal addresses not shared and deleted with the search. | Medium for personal addresses, Low for generic ones. Open question for the lawyer, see `article-14.md`. |
| R3 | Personal addresses kept too long or spread across customers. | Medium | Medium | Personal addresses never enter the shared cache. Fixed 12 month retention per search. Purge job. | Low, provided the purge job runs and is monitored. |
| R4 | Wrong classification: a "generic" address is really one person's (sole trader's kontakt@, or `info.anna@`), or a private webmail address (gmail.com) is kept when the company has nothing on its own domain. | Medium | Medium | Rule based list of role words. Webmail addresses are always classified personal. Only generic addresses on the company's own domain enter the shared cache (`isCacheable`). Own-domain addresses win over off-domain ones. Suppression and retention apply. | Low to medium: a sole trader's kontakt@ on their own domain can still be cached as generic. |
| R5 | SMTP probes are seen as abusive by mail servers, or reveal to the server owner that someone is checking an address. | Medium | Low | No message sent. One connection per MX host at a time. Catch-all remembered per domain. Results cached 30 days. MX-only fallback. | Low. No regulator guidance found. |
| R6 | Crawling pages the site owner did not want crawled, or breaching a site's terms. | Low | Medium | robots.txt honoured, named user agent with explanation page, no login, no CAPTCHA solving, page and byte caps, rate limit. Domain opt-out. | Low. Site terms are not read automatically; CNIL says scraping a site that forbids it in its terms is unlawful [R35]. Open item. |
| R7 | Source terms of use (OSM ODbL and Nominatim usage policy, Brave Search API terms, Product Hunt API terms) forbid this use or storage. | Medium | Medium | Respect rate limits and attribution. | Unknown until reviewed. Open item for the lawyer. |
| R8 | Opt-out abused: someone suppresses a competitor's domain, or the opt-out endpoint is used to test whether we hold an address. | Medium | Low | Same response whether or not we held the data. Rate limit. Suppression only removes data, it never exposes any. | Low. A malicious domain opt-out only hides a company from results. |
| R9 | Rights requests answered late or incompletely (Kaspr gave vague source answers [R13]). | Medium | Medium | privacy@nvoke.run, CLI `privacy export`, `privacy erase`, `privacy suppress-domain`, runbook `deploy/PRIVACY-RUNBOOK.md`, source URL per address. | Low, if the runbook is followed within one month. |
| R10 | Addresses live on outside the search: `billed_emails` keeps the plain address per customer for 12 months (so it is not charged twice), and customer CSV files already exported. | Medium | Low | `billed_emails` deleted 12 months after billing by the purge. `erase` (opt-out and `cli privacy erase`) deletes from every table, `billed_emails` and `email_checks` included. Exports outside our systems are the customer's responsibility as independent controller. | Low. Hashing `billed_emails` would lower it further (open item). |
| R11 | Security breach of the database exposes addresses and customer search history. | Low | Medium | RLS on with no policies (server-only access), secrets only on the server, device tokens hashed, direct connection only. Small data set per address. | Low. |
| R12 | Suppression hashes are themselves personal data (an unsalted sha256 of an address can be confirmed by anyone who knows the address). | Low | Low | Only hashes, no plain addresses. Needed to honour the objection. Kept forever because deleting them would allow re-collection. | Low. Justified under Art 17(3) and 21; lawyer to confirm. |

## 4. Overall residual risk

**Medium.** The architecture choices (split cache, suppression before collection, fixed retention, robots.txt, names only as the company itself publishes them for business contact) bring most risks down to low. Two risks stay medium and are mostly outside our technical control: customers sending unlawful marketing email (R1) and transparency towards owners of personal addresses (R2). R4 and R10 were lowered by code changes (webmail always personal, `billed_emails` expires after 12 months).

## 5. Actions

| Action | Owner | Status |
|---|---|---|
| Lawyer review of this DPIA, the LIA and `article-14.md` | Founder | Open |
| Decide on individual Art 14 email for personal addresses | Founder, after lawyer | Open |
| Treat webmail domains as personal and never cache them | Engineering | Done |
| Expire `billed_emails` after 12 months | Engineering | Done |
| Store hashes in `billed_emails` instead of plain addresses | Engineering | Open |
| Monitor the purge (runs hourly in the worker; alert if it has not run for a day) | Engineering | Open |
| Review OSM, Nominatim, Brave and Product Hunt terms | Lawyer | Open |
| Customer terms with §10, GDPR, Art 14 at first contact, no resale, indemnity | Lawyer | Open |
| Confirm Supabase region and VPS host and region | Engineering | Open |
| Re-run this DPIA when adding a source, extracting names, or sharing personal addresses | Everyone | Ongoing |
