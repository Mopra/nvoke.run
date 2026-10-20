# Lead quality: final report

The mission (2026-10-17 to 2026-10-18): would we use nvoke to find nvoke's
own customers and write to them? This is the honest end state, measured on
real runs of the `nvoke-customers` eval search: "Founders of B2B
companies, outbound and lead generation agencies, freelancers, SDRs and
small sales teams that do cold outbound in the EU and the US."

## Before and after

Baseline: the old pipeline, four keyword searches for that customer, 60
minutes, production SMTP limits (`baseline.md`). Final: the deployed
pipeline, one plain words search, run on the VPS with a hard spend cap
(owner approved, at most $2.50). The final run crashed at 23.6 minutes on
a bug it found (a web server answering with HTTP status 999 killed the
process; fixed and deployed in 1794f19), so
its numbers cover 23.6 minutes, not 60.

| bar | target | baseline (60 min) | final (23.6 min) |
|---|--:|--:|--:|
| verified emails | 300 in 60 min, keeps filling | 47 | **270** (on pace for 300 in about 26 min) |
| named people (first, last, title) among verified | 70% | 0% | **83%** (223 of 270) |
| decision makers among verified | 50% | 0% | **68%** (183 of 270) |
| role inboxes among verified | (lower is better) | about half | **0** |
| would email, blind sample of 30 | 25 | 5 | **16** |
| companies that clearly fit (judge, 25) | (none) | 40% | **84%** (21 of 25) |
| short search keeps pushing, says what it does | yes | no | **yes** (4 rounds in 23 min, live note) |
| cost per verified email | fits the ladder ($0.005 entry to $0.0015 top) | $0.003 (Brave only, no AI) | **$0.0036** (Brave $0.56, Claude $0.41) |

Where it stands against the six done criteria:

1. **Very likely, not proven.** 270 verified in 23.6 minutes, and the
   search was still adding rounds when the process died. A full 60 minute
   run is still owed.
2. **Pass.** 83% named with a title.
3. **Pass.** 68% decision makers.
4. **Fail.** 16 of 30 (bar 25). See "What is still weak".
5. **Pass.** Short searches are held, re-planned and widened (new niches,
   countries, cities, list pages, job posts), ongoing searches get a daily
   round, and the progress line says what is happening.
6. **Partly.** $0.0036 a verified email is under the entry plan's $0.005
   but above the top plan's $0.0015. At scale the Brave cache (7 days,
   shared by every account) and the domain crawl cache cut repeat cost;
   the eval counts every request as paid.

## What changed

- Discovery: a plain words search ("Who do you sell to?") that plans 15 to
  40 queries in tiers, mines list pages and public job posts (companies
  hiring sales people), scores fit from snippets and homepages, and widens
  by itself when it comes up short. Mwmbl as a free fallback when Brave
  refuses.
- People: names and titles from team, about and imprint pages (heuristics,
  Haiku as fallback), a WordPress bug that wiped whole pages fixed, people
  per company built into addresses from the domain's pattern and confirmed
  in one SMTP session per domain (decoy first for catch-all).
- Verification: per mail provider pacing, IPv6 first (the VPS's IPv4 port
  25 is throttled), decision makers checked first, role inboxes and
  off-target staff only on request or as a last resort, never charged
  when skipped.
- Product: web app and desktop open on "Who do you sell to?", list people
  first with decision maker and verification badges, show the live note,
  keep finding new leads daily, check shared inboxes on request with the
  count and the allowance shown first, CSV with name, title, seniority,
  source and confidence.
- Eval: `pnpm eval` (9 fixed searches, LLM judges, cost), results in
  `apps/server/.bench/eval/`, the log in `progress.md`.

## The 30 leads the judge reviewed (final run, random, seed 20261018)

| # | would email | name | title | company | address | judge |
|---|---|---|---|---|---|---|
| 1 | yes | Phil Swanson | Managing Director | Beanstalk Marketing (beanstalkmarketing.co.uk) | `phil@beanstalkmarketing.co.uk` | MD of marketing agency, valid |
| 2 | no | Linda Truong | Head of Digital | Paragon Marketing (paragonmarketing.co.uk) | `linda.truong@paragonmarketing.co.uk` | Head of Digital, not core buyer at marketing firm; weaker fit |
| 3 | no | Bill Blaskiewicz | Chief Financial Officer | Isaless (isaless.com) | `bill.blaskiewicz@isaless.com` | CFO, not relevant to lead finding |
| 4 | yes | Michal Jeník | Agency Lead | Lead Magnet (leadmagnet.cz) | `michal@leadmagnet.cz` | Agency lead at lead gen agency |
| 5 | no | Pawel Marek |  | Instream Group (instreamgroup.com) | `pawel.marek@instreamgroup.com` | No title, unclear relevance |
| 6 | no | Simon Izart | Account Manager | Acceor (acceor.com) | `simon.izart@acceor.com` | Account manager, not decision maker |
| 7 | no | Rene Sildvee | Databases and special solutions & Fontakt Partner | Fontakt (fontakt.com) | `rene.sildvee@fontakt.com` | Databases role at a data provider, competitor-ish |
| 8 | yes | Natalia Mentrycka | VP & Marketing Consultant | Getsales (getsales.pl) | `n.mentrycka@getsales.pl` | VP at lead gen/marketing agency |
| 9 | yes | Monika Joshevska | Group COO and Country Manager | Sopro (sopro.io) | `monika@sopro.io` | COO/country manager at outbound firm, decision maker |
| 10 | no | Erik Witt | CPO | Baqend GmbH (speedkit.com) | `erik.witt@speedkit.com` | CPO at web performance product company, poor fit |
| 11 | yes | William Gilchrist | CEO / Founder | Konsyg (konsyg.com) | `william@konsyg.com` | CEO founder of B2B company |
| 12 | no | Paula Bates |  | Toucan Telemarketing (toucantelemarketing.co.uk) | `paula@toucantelemarketing.co.uk` | No title, telemarketing; unclear role |
| 13 | yes | Greg Grdodian | CEO | Lead Generation Companies in London (reachmarketing.com) | `greg.grdodian@reachmarketing.com` | CEO of lead gen agency |
| 14 | yes | Sean Sullivan | VP- Sales & Operations | Lead Generation Companies in London (reachmarketing.com) | `sean.sullivan@reachmarketing.com` | VP Sales at lead gen agency |
| 15 | no | Stephanie Schneider | Assistenz der Geschäftsführung | 2bs Salesconsult Gmbh (2bs-sales.de) | `s.schneider@2bs-sales.de` | Executive assistant, not decision maker |
| 16 | yes | Piotr Wolniewicz | CEO hotLead.pl | hotLead (hotlead.pl) | `piotr@hotlead.pl` | CEO of lead gen company |
| 17 | yes | Clare Rafferty | Director | Paragon Marketing (paragonmarketing.co.uk) | `clare.rafferty@paragonmarketing.co.uk` | Director at marketing agency |
| 18 | yes | Phil Richardson | Founder | Shortlist Marketing (shortlistmarketing.co.uk) | `prichardson@shortlistmarketing.co.uk` | Founder of marketing agency |
| 19 | no | Nick Shaw | leading occupational psychology expert | Spotted Zebra (spottedzebra.co.uk) | `nick.shaw@spottedzebra.co.uk` | Occupational psychology firm, poor fit |
| 20 | yes | Richard Lane | Chief Commercial Officer | durhamlane (durhamlane.com) | `richard.lane@durhamlane.com` | CCO at B2B sales firm, relevant |
| 21 | no | Ash Smith | VP Customer Success | Valutico (valutico.com) | `a.smith@valutico.com` | Customer success VP, not relevant |
| 22 | yes | Guillaume Bilcke | Head of Sales | Beyoursales (beyoursales.com) | `guillaume@beyoursales.com` | Head of Sales at outsourced sales company |
| 23 | yes | Benjamin Tänzer | Managing Director & CEO | MAX ASP Gmbh (maxasp.com) | `benjamin.taenzer@maxasp.com` | CEO/MD of B2B company |
| 24 | no | Jonas Friedemann |  | Suxxeed (suxxeed.de) | `jonas.friedemann@suxxeed.de` | No title, unclear relevance |
| 25 | no | Ana Jaansalu | Sales Growth Partner | Fontakt (fontakt.com) | `ana.jaansalu@fontakt.com` | Sales growth partner at data provider, competitor-ish |
| 26 | yes | Joe Podmore | Director | Leadly (leadly.co.uk) | `joe@leadly.co.uk` | Director at lead gen agency |
| 27 | no | Mario Pfennig | Leiter Talentmanagement | Suxxeed (suxxeed.de) | `mario.pfennig@suxxeed.de` | Talent management lead, not relevant |
| 28 | no | Stefan Puriss | CMO/CSO | Baqend GmbH (speedkit.com) | `stefan.puriss@speedkit.com` | CMO at web performance product company, weak fit |
| 29 | yes | Josh Clarke | Founder | Builtforb2b (builtforb2b.com) | `josh@builtforb2b.com` | Founder of B2B agency |
| 30 | yes | Joris Siroo | CEO Pivote Marketing | Pivote Marketing (pivotemarketing.com) | `joris.siroo@pivotemarketing.com` | CEO of marketing agency |

## What is still weak

- **Off-target roles get checked.** 6 of the 14 noes are a CFO, an
  assistant, talent management, customer success, an account manager and a
  head of digital. They are verified when their company has no valid
  decision maker. A seller wants none of them. Fix: never check off-target
  titles automatically (they stay findable on request).
- **Named people without a title.** 3 noes. Fix: check untitled people only
  when the company has no titled one, and pull the title from the team
  card or LinkedIn snippet when present.
- **Company fit.** 5 noes: a web performance product, an occupational
  psychology firm, a data provider close to a competitor. The fit step
  keeps some product companies that only name "sales" or "B2B". Fix:
  stricter rule for product companies without visible outbound, and
  competitors (data and lead vendors) out by name.
- **Catch-all domains.** 182 addresses ended catch-all: pattern guesses on
  servers that accept anything. They are shown as guesses, never counted
  or charged, but they are a third of the people found.
- **Cost.** Fit scoring is 74% of the Claude spend. Homepage reads for
  every candidate above 20 are the next cut.
- **Registry directors** are out of scope. nvoke runs fully without
  registry keys (no Companies House, no CVR): people come from company
  sites, job posts and address patterns.
- **Proof.** The 60 minute bar and the 25 of 30 bar need one more real run
  after the three fixes above. It needs the owner's approval to spend.

## The outreach plan we would run with these leads

nvoke never sends. This is the plan for a human with their own inbox.

1. **Who.** The decision makers only (founder, CEO, managing director,
   head of sales or growth) at lead generation, outbound and appointment
   setting agencies and small B2B companies hiring SDRs, UK, DACH, Nordics,
   Benelux and the US. About two thirds of the verified list.
2. **What we say.** One short plain text email, no images, no tracking:
   their own agency, their lead cost, one number. "You buy or build lead
   lists for clients. nvoke finds named decision makers with verified
   emails from a plain sentence, 500 a month for $9. Want to try it free on
   your next client campaign?"
3. **Opener.** nvoke's openers feature drafts one first line per company
   from its own site (copy only), e.g. a client case or a niche they
   name.
4. **Volume and pace.** 20 to 30 a day from a warmed domain that is not
   nvoke.run, so a bad day never touches the product's sending reputation
   (nvoke.run sends only sign in mail).
5. **Follow up.** One reminder after 4 working days, then stop. Replies
   that say no go on nvoke's suppression list too.
6. **Legal.** B2B legitimate interest: business addresses of people in
   their professional role, a short reason in the email, an opt out line,
   the source page kept for every lead (it is in the CSV).
7. **Measure.** Reply rate and free trial starts per 100 sent, by segment
   (agency, SaaS founder, sales team). Drop the weakest segment after 300
   sends.
