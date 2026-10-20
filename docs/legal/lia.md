# Legitimate interest assessment (LIA)

Status: draft, 13 October 2026, revised 20 October 2026 for sending (activities G and H). Written by the nvoke team, not by a lawyer. To be reviewed by a Danish data protection lawyer (see `lawyer-brief.md`). Review again when the pipeline, sources or retention change, and at least once a year.

Controller: nvoke (Danish company; legal name, CVR number and address TODO). Contact: privacy@nvoke.run.

Legal basis assessed: GDPR Article 6(1)(f), legitimate interest. Consent is not practical here (we cannot ask people before we know their address, and asking by email would itself be marketing under Danish rules, see below). Contract and legal obligation do not apply.

Sources cited as [R] refer to `docs/research/gdpr-competitors.md` and its numbered sources, for example [R42] is EDPB Guidelines 03/2026.

## 1. The processing in scope

| # | Activity | Personal data involved |
|---|---|---|
| A | Find companies in public sources (OpenStreetMap Nominatim and Overpass, Brave Search API, the Mwmbl search API as a free fallback, Product Hunt, Show HN through Algolia's HN Search API) | Company name, website, address, phone, category. Personal data only where the business is a sole trader or the listing names a person. |
| B | Crawl the company's own public website (max 8 pages and 2 MB: homepage, contact, about, team, impressum, privacy, legal). Respect robots.txt, 1 request per second per domain, named user agent `nvokebot/1.0 (+https://nvoke.run/bot)`, no logins, no CAPTCHA solving. | Email addresses published on those pages, with the source URL. |
| C | Classify each address as `generic` (a role mailbox such as info@, kontakt@, salg@) or `personal` (anything else, such as firstname@). Rule based on the local part, and always `personal` on webmail domains (gmail.com, hotmail.com and similar). | The address. |
| D | Verify each address: syntax, disposable domain list, MX lookup, SMTP RCPT probe that never sends a message, catch-all detection with a random decoy address. | The address, the result (`valid`, `invalid`, `risky`, `catch_all`, `unknown`), the MX host, a timestamp. Cached in `email_checks` for 30 days. |
| E | Shared cache of crawl results across customers: `domains` (crawl status and dates) and `domain_emails` (generic addresses only, with source URL and first and last seen). | Generic addresses. These are personal data only where they identify a person, for example a one-person business. |
| F | Personal addresses in the result set of the customer whose search found them (`emails`, per search), shown in the app and exported to CSV by that customer. Never shared with other customers. | Personal work email addresses, source URL, verification result. |
| G | Write outreach emails for a customer's campaign: Claude (through OpenRouter) drafts each step from the customer's own site profile, the recipient company's public pages and the person's published name and title. | Name, job title, work address, company page text. |
| H | Send those emails on the customer's instructions from the customer's own mailbox (their SMTP server, their name and domain), and read replies in that mailbox over IMAP to stop the sequence on a reply, bounce or opt-out. | Address, the sent text, reply text, delivery and bounce results. |

Roles for G and H: the customer is the sender and the controller for its outreach; nvoke writes and sends as the customer's processor. nvoke stays controller for the lead data (A to F). See `ropa.md`, activity 3.

Out of scope here: customer accounts and billing (Article 6(1)(b), contract; see `ropa.md`).

## 2. Purpose test: is there a legitimate interest?

**Our interest.** Running a business that helps companies find other companies they may want to sell to, partner with or research: a prospecting research tool. This is a commercial interest. The CJEU held in KNLTB (C-621/22, 4 October 2024) that a commercial interest can be a legitimate interest, as long as it is lawful and the processing is strictly necessary and passes the balancing test [R38][R39]. The Dutch AP's earlier view that purely commercial interests never qualify [R36][R37] is no longer good law on that point.

**Our customers' interest.** Finding the right contact point at a business (usually the published company mailbox) to start a business conversation. This is an interest of third parties, which Article 6(1)(f) allows us to count.

**Lawfulness of the interest.** The interest is only legitimate if the end use is lawful. In Denmark, Markedsføringsloven §10 requires prior consent for marketing email to any recipient, including companies, info@ mailboxes and named employees, and treats an email asking for consent as marketing itself [R43]. So "send unsolicited marketing email to Danish addresses" is not a legitimate interest we can rely on. Since 20 October 2026 nvoke writes and sends email for customers, so it no longer leans on "research tool only". It leans on what the product will and will not do:

- the customer is the sender: their mailbox, their name, their domain, their campaign, started by a person in the web app;
- recipients in Denmark and Germany are blocked in code (`BLOCKED_COUNTRIES`), not by a setting, because both require prior consent for B2B email;
- bind customers by our terms to follow the law of the recipient's country, never to email consumers, and to accept the country gate and the caps;
- show the rule in the app before every CSV export (until the user turns it off) and next to the results, since exports still leave our control.

Open, and accepted by the owner on 20 October 2026 as a business risk: whether §10 also covers email a Danish company sends to recipients abroad. If it does, sending for Danish customers (nvoke itself included) to any country needs consent. Whether the gate and the terms keep nvoke clear of co-liability ("medvirken", [R43] chapter 12) is also for the lawyer.

**Conclusion of step 1:** a legitimate interest exists, provided the country gate and the customer terms are real and enforced. Open item: lawyer to confirm.

## 3. Necessity test: is the processing needed for that interest, and is there a less intrusive way?

| Activity | Necessary? | Less intrusive alternatives considered |
|---|---|---|
| A, finding companies | Yes. There is no lead without a company. | Using only company registries. Rejected for now because OSM and search results give the website, which registries often lack. Not more intrusive either way. |
| B, crawling | Yes, for the purpose of finding a published contact point. We fetch only the page types listed above, cap pages and bytes, and stop at the company's own site. | Asking the customer to look up each site by hand. Same data, far slower; does not reduce intrusion. |
| C, classification | Yes. It is a minimisation measure: it lets us share only generic addresses and keep personal ones out of the shared cache, and lets customers prefer role mailboxes. | None: removing it would increase intrusion. |
| D, SMTP verification | Arguable. The customer's interest is a working address; without verification a share of addresses bounce. Verification also lets us charge only for working addresses. The probe sends no message and the person never sees it. | MX-only check (already the fallback when port 25 is blocked). Less accurate but less intrusive. We keep the full probe because a bounced first contact is worse for the recipient's mail server than one RCPT probe, but this is a judgement call. |
| E, shared cache of generic addresses | Yes, as a minimisation and politeness measure: it avoids crawling the same small business again for every customer within 90 days. Only generic addresses are cached. | No cache (crawl every time). More requests to the same sites, same data held per customer anyway. Rejected. |
| G and H, writing and sending | Yes, for the customer's interest in starting a business conversation. Each campaign uses only the addresses its own search found, verified `valid`, at most one person per company by default. | Exports only, the customer sends from another tool. Same email reaches the person, without our gate, opt-out handling or caps. Rejected. |
| F, personal addresses per customer | The weakest point. Many small businesses publish only a named address (the owner's). Dropping personal addresses entirely would leave those businesses unreachable through the tool. | (1) Generic addresses only. Most protective, but loses the many small firms that have no role mailbox. (2) Return personal addresses only when no generic address exists for the company. A real middle ground, not built. Recorded as an option for review. |

Since 2026-10-17 nvoke also collects the names and job titles a company publishes about its own staff on its own site, and builds business addresses for named people from the domain's address pattern, kept only when the mail server accepts them, each with its source page and a confidence. Balancing: the data is what the business itself made public for contact, used for B2B contact only, with suppression on request. Data we deliberately do not collect: phone numbers of individuals, social profiles, anything behind a login, anything blocked by robots.txt, private consumer data. Phone and address come only from the business listing.

When a company has no address on its own domain, the selection keeps off-domain addresses (for example a sole trader's gmail.com address). Those are more likely to be private addresses, so webmail addresses are always classified `personal` and never enter the shared cache, and only generic addresses on the company's own domain are cached. See `dpia.md`, risk R4.

## 4. Balancing test

### 4.1 Nature of the data

Work contact data published by the business itself on its own website, for the purpose of being contacted. No special categories, no data about children, no financial data, no location tracking. Generic role addresses are usually company data rather than personal data, except for one-person businesses [R46].

### 4.2 Reasonable expectations

Factors that support expectation:

- The address was published by the business on its own public site, usually on a contact or impressum page, precisely so that others can make contact.
- Danish and German businesses are often legally required to publish contact details (impressum, CVR).
- We obey robots.txt and never pass login walls or CAPTCHAs. The EDPB treats these signals as shaping what people can expect (EDPB 03/2026 para 64 [R42]); Kaspr was fined largely because it collected data people had restricted [R13].
- The crawler names itself and links to a page that explains it and offers opt-out.

Factors against:

- Publishing an address for contact is not the same as expecting it to end up in a third party's lead tool and CSV export. The EDPB says that a sector habit alone does not create reasonable expectations (Guidelines 1/2024 [R40][R41]).
- An employee whose firstname@ address is on a team page did not choose to publish it; the employer did.
- No robots.txt does not mean consent (EDPB 03/2026 para 45 [R42]).

Assessment: reasonable expectations are fairly strong for generic role mailboxes and weaker for personal addresses of employees.

### 4.3 Impact on the individual

- Main possible harm: unwanted email. When nvoke sends, the email is plain text from a real person's mailbox, names where the address was found, and stops on one reply. Worst case is unsolicited email from several customers; per-sender caps and opt-outs limit each one, and the global opt-out stops all of them.
- SMTP probe: no message is delivered, nothing appears in the mailbox. Effect on the person is nil; effect on the mail server is one short connection, limited to one at a time per MX host and cached for 30 days.
- Loss of control: the person may not know we hold the address. Addressed by the public notice, the opt-out and the short retention, but see the Article 14 discussion in `article-14.md`.
- Scale: potentially many thousands of businesses. Larger scale weighs against us (EDPB 03/2026 para 28 [R42]).

### 4.4 Safeguards (already built or decided)

1. Split cache: only generic addresses are shared between customers (`domain_emails`). Personal addresses live only in the finding customer's search results and are deleted with that search.
2. Suppression list (`suppressions`, sha256 of the address or of `domain:` plus the registrable domain), checked before storing, before serving from cache and before export. Kept forever so an opted-out address is never collected again. This matches EDPB 03/2026 para 66 (an opt-out that works before collection) [R42] and Apollo, Lusha and Snov.io practice [R7][R11][R6].
3. Public opt-out at `/opt-out` (email or whole domain, immediate, no confirmation, same response whether or not we held the data so it cannot be used to probe our data), plus privacy@nvoke.run for access and objection.
4. Fixed retention from first collection, never renewed by a new search: generic cache rows 12 months after `first_seen`, and deleted sooner when a recrawl no longer finds them; searches with their companies and emails 12 months after creation; verification cache 30 days; billing ledger (`billed_emails`) 12 months after billing. The worker's hourly purge enforces this. This avoids Kaspr's rolling retention [R13].
5. Source URL stored per address so an access request can name the exact source [R13].
6. Crawl limits: page types, 8 pages, 2 MB, robots.txt, 1 request per second per domain, named user agent with an explanation page at `/bot`.
7. SMTP probe never sends DATA, uses one connection per MX host at a time, remembers catch-all domains, and falls back to MX-only when port 25 is blocked.
8. Public Article 14 notice on `/privacy` in Danish and English, with sources, crawler behaviour, recipients, retention and rights.
9. Customer terms: customer is an independent controller for its use of exports, must comply with GDPR and national e-marketing rules including §10, must give Article 14 information at first contact, honour objections, no resale.
10. Data stays in the EU (Supabase EU region, VPS location TODO confirm). Exception: text sent to Claude for writing (activity G) goes through OpenRouter to Anthropic in the US.
11. Sending (G, H), since 20 October 2026:
    - country gate: no sends to Denmark or Germany, decided at enroll and checked again before every send;
    - verification before sending: only `valid` addresses (`catch_all` only when the customer opts in);
    - every first email says where the address came from (the company's site) and how to stop, the Art 14 notice given by the sender; every email carries `List-Unsubscribe` with one-click unsubscribe (RFC 8058);
    - per-sender opt-outs (`send_suppressions`): a reply with "stop" or an unsubscribe ends all email from that customer to the address; the global opt-out still ends everything;
    - no tracking: no open pixel, no click redirects, no links in the body;
    - caps: 30 a day per warmed mailbox (50 at most), a slow ramp for new mailboxes, at most 2 per domain per mailbox a day, the recipient's working hours, never faster;
    - a person starts every campaign in the web app; agents can draft, not start;
    - a reply, bounce or opt-out stops the sequence; a mailbox with 3% hard bounces is paused.

### 4.5 Balancing result

| Activity | Result |
|---|---|
| A, finding companies | Passes. Mostly company data. |
| B, crawling within the stated limits | Passes, given robots.txt, limits and the named crawler. |
| C, classification | Passes. Reduces impact. |
| D, SMTP probe | Passes on balance. No message sent. No regulator guidance was found on RCPT probing as such (research doc, section 6). Open item for the lawyer. |
| E, shared cache of generic addresses | Passes. Low impact, strong expectations, short fixed retention, suppression. |
| G and H, writing and sending | Passes on balance, given the gate, the notice in the first email, the opt-outs and the caps. Depends on the §10 question below. |
| F, personal addresses per customer | Passes only narrowly, and depends on the Article 14 position (see `article-14.md`), on customers honouring §10, and on retention being enforced. This is the main residual risk. |

## 5. Open items

1. Lawyer to confirm whether the country gate and terms remove or reduce medvirken risk, and whether §10 reaches a Danish sender's email abroad (accepted as a risk for now).
2. Lawyer to confirm the Article 14 approach for personal addresses (website notice only versus individual email notice).
3. Consider returning personal addresses only when no generic address exists for the company (option 2 in section 3).
4. Done: webmail addresses (gmail.com, hotmail.com and similar) are always classified personal and never cached.
5. Decide whether `billed_emails` (plain address per customer, kept 12 months so an address is not charged twice) should store hashes instead. Erasure and retention both remove it. `email_checks` holds plain addresses shared across customers, but only for 30 days.
6. Fill in legal entity, CVR, VPS host and region.
7. Publish a short summary of this LIA on request, as Hunter does [R1].
