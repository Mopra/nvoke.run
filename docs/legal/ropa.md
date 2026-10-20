# Record of processing activities (GDPR Article 30(1))

Status: draft, 13 October 2026. Update this file whenever a table, source, sub-processor or retention rule changes.

## Controller

| | |
|---|---|
| Name | nvoke (legal entity name TODO) |
| CVR | TODO |
| Address | TODO, Denmark |
| Contact | privacy@nvoke.run |
| Representative in the EU | Not needed (established in Denmark) |
| Data protection officer | None appointed. Art 37 does not require one: our core activity is not regular and systematic monitoring of individuals on a large scale, and we process no special categories. Lawyer to confirm. |
| Supervisory authority | Datatilsynet |

## Activity 1: Customer accounts and billing

| Field | Entry |
|---|---|
| Purpose | Create and run customer accounts, sign in to the desktop app and site, provide the service, meter usage against the plan, take payment, support, bookkeeping. |
| Legal basis | Art 6(1)(b) contract for the account and service. Art 6(1)(c) legal obligation for bookkeeping records (Bogføringsloven). Art 6(1)(f) legitimate interest for security logs and abuse prevention. |
| Data subjects | Customers (individual users, usually employees or owners of business customers). |
| Categories of data | Clerk user id, name, email, profile image (held by Clerk). Plan and plan sync time, monthly usage counts (`accounts`, `usage`). Searches the customer ran with their parameters and results (`searches`, `companies`, `emails`). Device sessions (sha256 of the device token, device name, user agent, created, last used and revoked times), one-time sign-in codes (hashed, 5 minutes). Addresses the customer was charged for (`billed_emails`). Billing details (card data held by Clerk Billing and its payment provider, never by nvoke). Server logs (request metadata, IP address in systemd journal). |
| Recipients | Sub-processors only: Clerk (identity and billing), payment provider behind Clerk Billing (TODO confirm, likely Stripe), Supabase (database), VPS host (API and worker), Vercel (website and sign-in pages). |
| Transfers outside the EU/EEA | Clerk and Vercel are US companies; Stripe if used. Basis: EU-US Data Privacy Framework where the vendor is certified, otherwise the vendor's SCCs. TODO: confirm each vendor's certification and DPA. |
| Retention | Account and usage: while the account is active. TODO: define deletion after account closure (proposal: 30 days). Searches with results: 12 months from creation, or sooner if the customer deletes them. Device sessions: kept after sign out as revoked rows (TODO: delete revoked and stale sessions, proposal 90 days). Sign-in codes: 5 minutes, single use. `billed_emails`: 12 months after billing, enforced by the hourly purge (open item: store hashes instead of plain addresses). The public privacy policy promises deletion of account and usage data at most 12 months after closure; no code does this yet. Bookkeeping records: 5 years after the end of the financial year (held mainly by the billing provider). Server logs: TODO set journald retention (proposal: 30 days). |
| Security measures | TLS everywhere. Device tokens and auth codes stored only as sha256 hashes; the desktop keeps its token encrypted with the OS keychain (`safeStorage`). PKCE sign-in. Database with RLS on and no policies, so only the server role reads it. Secrets only in `/opt/nvoke/.env` on the VPS, owned by a dedicated `nvoke` user. Electron sandbox and context isolation. |

## Activity 2: Lead data (finding, crawling, verifying and serving business email addresses)

| Field | Entry |
|---|---|
| Purpose | Provide a prospecting research tool: find companies matching a customer's search, find the contact email addresses those companies publish on their own websites, check that the addresses can receive mail, and show and export them to the customer. Keep a shared cache of generic addresses to avoid re-crawling the same sites. Keep a suppression list to honour opt-outs. |
| Legal basis | Art 6(1)(f) legitimate interest. Assessment in `lia.md`. Suppression list: Art 6(1)(c) and (f), to honour objections under Art 21 permanently. |
| Role | nvoke is controller for collection, classification, verification, the shared cache and the suppression list. The customer is an independent controller for its own use of the results once shown or exported. Whether nvoke is controller or processor for personal addresses held only in one customer's search is an open question (see `lawyer-brief.md`); we treat ourselves as controller, which is the stricter position. |
| Data subjects | People whose work email address is published on a company's public website (owners, employees); sole traders identifiable from business listings. |
| Categories of data | Email address with a `generic` or `personal` label, source URL, first and last seen, verification result (`valid`, `invalid`, `risky`, `catch_all`, `unknown`) and MX host. Company name, domain, website, location, phone, category from the listing. sha256 hashes of opted-out addresses and domains. Names and job titles of staff as published on the company's own site, with the source page; addresses built from the domain's pattern for those people, with `found_via` and a confidence (since 2026-10-17). No special categories or social profiles. |
| Sources | OpenStreetMap (Nominatim, Overpass), Brave Search API, Mwmbl's public search API (free fallback when Brave is out, keywords only), Product Hunt, Hacker News Show HN (through Algolia's HN Search API), and the companies' own public websites (max 8 pages, robots.txt honoured). |
| Recipients | The customer whose search found the company. Generic addresses (`domain_emails`) can be served to any customer whose search finds that company. Personal addresses only to the customer whose search found them. Sub-processors: Supabase (database), VPS host (worker that crawls and verifies). Sources that receive the customer's keywords, not addresses: Brave Search, Nominatim and Overpass, Product Hunt, Algolia. Mail servers of the companies receive an SMTP RCPT probe for each address. |
| Transfers outside the EU/EEA | None intended for lead data: Supabase EU region and an EU VPS (TODO confirm both). Brave Search receives only the customer's keyword. |
| Retention | `domain_emails` (generic only): 12 months after `first_seen`, never reset, and deleted when a recrawl no longer finds the address. `domains`: recheck 90 days after a crawl, 7 days after a failed or blocked crawl; the row is dropped 12 months after `recheck_at` if the domain was not crawled again. `searches` with `companies` and `emails` (including personal addresses): 12 months after the search was created, or earlier if the customer deletes the search. `email_checks`: 30 days. `billed_emails`: 12 months after billing. `suppressions`: forever. Enforced by the worker's hourly purge (`apps/server/src/leads/retention.ts`). Opt-out and erasure delete from every table, `billed_emails` included (`apps/server/src/privacy/erase.ts`). |
| Security measures | As activity 1. In addition: suppression stored as hashes only; personal addresses never in the shared cache; the crawler identifies itself and keeps to robots.txt, page and byte caps and 1 request per second per domain; the SMTP probe never sends a message. |
| Rights handling | `/opt-out` page and `POST /v1/privacy/opt-out` (email or domain, immediate). Access, erasure and objection by email to privacy@nvoke.run, handled with `cli privacy export`, `cli privacy erase` and `cli privacy suppress-domain` following `deploy/PRIVACY-RUNBOOK.md`. Target: answer within one month (Art 12(3)). |
| DPIA | Yes, `dpia.md`. |

## Activity 3: Sending on the customer's instructions (since 20 October 2026)

| Field | Entry |
|---|---|
| Purpose | Write outreach emails for a customer's campaign, send them from the customer's own mailbox in the recipient's working hours, read replies in that mailbox, and stop on a reply, bounce or opt-out. Plan: `docs/sending/plan.md`. |
| Role | The customer is the sender and the controller for its outreach. nvoke is its processor for writing and sending, and stays controller for the lead data (activity 2) and for the global suppression list. nvoke uses the same engine as a controller for its own outreach. Processor terms (Art 28) to be added to the customer terms. |
| Legal basis | The customer's: Art 6(1)(f) for B2B outreach where the recipient's national rules allow it. nvoke's own sends: Art 6(1)(f), `lia.md` activities G and H. |
| Data subjects | Recipients of campaigns (people at companies the customer's search found); the customer as sender. |
| Categories of data | Campaign leads (address, first name, company, country, time zone), written steps (subject and body), outgoing message metadata (Message-ID, from, to, subject, time, SMTP response), reply and bounce text, per-sender opt-out hashes (`send_suppressions`), mailbox settings and the sealed mailbox password. |
| Recipients | The recipient's mail server, through the customer's own mail provider (Google, Microsoft or another SMTP host). OpenRouter and Anthropic for writing. |
| Transfers outside the EU/EEA | Text for writing goes to OpenRouter and Anthropic in the US (TODO: DPF or SCCs). The customer's mail provider is the customer's choice. |
| Retention | Reply bodies 12 months, message metadata 24 months, written steps 30 days after the campaign ends (planned in `apps/server/src/leads/retention.ts`). `send_suppressions`: while the customer's account exists. Mailbox and its sealed password: until the customer removes it. Erasure of an address removes its campaign leads and messages. |
| Security measures | As activity 1. Mailbox passwords sealed with AES-256-GCM, key only in `/opt/nvoke/.env`, never returned by the API. Country gate (no sends to DK or DE), verified addresses only, caps per mailbox, one-click unsubscribe, no tracking. |

## Sub-processors

| Sub-processor | Used for | Data | Location | DPA and transfer basis |
|---|---|---|---|---|
| Clerk | Identity, sign-in, billing plans | Customer profile, sessions, plan | US | TODO: Clerk DPA, DPF or SCCs |
| Stripe, behind Clerk Billing (TODO confirm) | Card payments | Billing details | US and EU | TODO |
| Supabase | Postgres database | Everything in activities 1 and 2 | EU (TODO confirm region) | TODO: Supabase DPA |
| VPS host (TODO name) | API and worker | Everything in transit, logs | TODO | TODO |
| Vercel | Website, sign-in and billing pages | Visitor requests, customer session in transit | US and EU edge | TODO: Vercel DPA, DPF or SCCs |
| OpenRouter, Anthropic | Writing campaign emails with Claude | Recipient company page text, name, title; the customer's site profile | US | TODO: DPAs, DPF or SCCs, no training on API data |
| Brave Search | Web search source | Customer search keywords | US | TODO: check API terms; no personal data intended |
| OpenStreetMap Foundation (Nominatim), public Overpass servers (overpass-api.de, fallback overpass.private.coffee) | Local search source | Location names and tags from the customer's search | UK and EU | Not processors; public APIs under their usage policies |
| Product Hunt, Algolia (HN Search API for Show HN) | Launch search source | Keyword filters | US | Not processors; public APIs under their terms |

OSM, Overpass, Product Hunt and Algolia are sources rather than processors; they are listed because the customer's search terms are sent to them.
