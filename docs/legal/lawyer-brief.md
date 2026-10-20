# Brief for data protection counsel

nvoke (Danish company, CVR TODO), 13 October 2026. Contact: privacy@nvoke.run. Supporting documents in this folder: `lia.md`, `dpia.md`, `ropa.md`, `article-14.md`, and our desk research `docs/research/gdpr-competitors.md`.

## What nvoke does

nvoke is a paid desktop app for businesses researching other businesses. A customer searches, for example "dentists in Aarhus". Our server finds matching companies in public sources (OpenStreetMap, Brave Search API, Product Hunt, Hacker News Show HN), then crawls each company's own website: at most 8 pages (homepage, contact, about, team, impressum, privacy, legal) and 2 MB, robots.txt honoured, 1 request per second per domain, named user agent linking to an explanation page, no logins, no CAPTCHA solving. It extracts published email addresses and labels each `generic` (info@, kontakt@) or `personal` (firstname@). It checks deliverability with an MX lookup and an SMTP RCPT probe that never sends a message. The customer sees the results and can export CSV. nvoke never sends email. Since 2026-10-17 it also reads the names and job titles a company publishes about its own people (team, about, imprint pages), keeps the page each came from, and builds business addresses for those people from the domain's address pattern (anna@, anna.berg@), kept only when the company's mail server accepts the address in an RCPT probe. Guesses on servers that accept any address are labeled with a low confidence. No social profiles, nothing behind a login. Question for counsel: is pattern-built addressing of named staff covered by the same B2B legitimate interest as published addresses, given the source page and the opt-out list?

## Our positions

1. Legal basis: legitimate interest, Art 6(1)(f), relying on CJEU C-621/22 (KNLTB) for the commercial interest.
2. Roles: nvoke is controller for collection, verification, the shared cache and the suppression list. Each customer is an independent controller for its own use of exported results.
3. Split cache: generic addresses are cached and shared between customers (12 months from first collection, never renewed, removed sooner if no longer on the site). Personal addresses are never shared; they live only in the finding customer's search and are deleted with it, at the latest after 12 months. Verification results are kept 30 days.
4. Suppression: hashed opt-out list (address or domain), checked before storing, serving and export, kept forever. Public opt-out page, immediate, no confirmation.
5. Transparency: public Art 14 notice (Danish and English) on our privacy page, linked from the crawler's user agent. No individual notification today.
6. Danish marketing law: we position nvoke as a research tool, never "cold email". Customer terms require compliance with Markedsføringsloven §10 (prior consent for marketing email, including info@ and B2B) and forbid resale.
7. We have treated a DPIA as required and written one. Residual risk: medium.

## Questions

1. **Art 14 for personal addresses.** Is a public notice plus opt-out sufficient for personal work addresses we hold only inside one customer's search result, given Bisnode (NSA III OSK 2538/21) and EDPB Guidelines 03/2026 Example 3? If not, must we email each person an Art 14 notice before showing the address to the customer (Art 14(3)(c))? Would such a notice email itself count as marketing under §10?
2. **Art 14 for generic addresses** that identify a person (a sole trader's kontakt@). Is relying on Art 14(5)(b) defensible for these?
3. **§10 and medvirken.** Does positioning as a research tool, plus customer terms and an in-app notice before every CSV export, reduce our exposure to co-liability under the Forbrugerombudsmand's medvirken reading (vejledning 2021, chapter 12)? What else should we do (for example restrict exports, require customers to confirm a lawful basis, drop `.dk` personal addresses)?
4. **SMTP RCPT probes.** Is a deliverability probe that never sends a message processing we can base on legitimate interest? Any issue under the Danish Criminal Code or the ePrivacy rules (access to terminal equipment, data hacking provisions) or mail server terms?
5. **Controller or processor.** Is our controller position correct for personal addresses held only in one customer's results, or are we a processor for those (Dropcontact model)? Would processor status be credible, and would it move the Art 14 duty to the customer? Are we joint controllers with customers anywhere?
6. **Retention.** Are 12 months for the generic cache (from first collection), 12 months for customer search results, 30 days for verification results, and forever for opt-out hashes proportionate? Is a forever unsalted sha256 hash of an opted-out address acceptable?
7. **Sources' terms.** Is our use consistent with the OpenStreetMap ODbL and the Nominatim and Overpass usage policies (storing listing data, attribution in exports), the Brave Search API terms (storing and reselling derived results; section 3(b)(i) forbids storing, caching or building a database of search results beyond transient storage, and we keep result pages in `web_search_cache` for 7 days), Serper's terms (they say nothing on caching; the results are Google's), and Product Hunt's API terms? Does a website's terms of use that forbid scraping bind us when robots.txt allows the crawl (CNIL's 2020 guidance says it does)?
8. **DPIA and Art 36.** Is our DPIA sufficient, and does anything on Datatilsynet's list of processing requiring a DPIA apply? Should we consult Datatilsynet?
9. **DPO.** Do we need to appoint one under Art 37?
10. **Customer terms.** Please review or draft the clauses: independent controller, GDPR and §10 compliance, Art 14 notice at first contact, honouring objections and passing them back, no resale, no consumer marketing, indemnity. Do we need a data sharing agreement with each customer?
11. **Other EU markets.** Customers may search Germany, Sweden or the UK. Which national e-marketing rules or notice language requirements should the terms or product address first?
