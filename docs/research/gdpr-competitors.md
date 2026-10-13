# GDPR practices of B2B email finders, and what nvoke should copy

Research date: 13 October 2026. Sources are the vendors' own public pages (privacy policies, GDPR pages, terms) plus regulator publications and law firm summaries. Every claim links to its source. Where a page could not be fetched or said nothing, the report says so. This is research, not legal advice: have a Danish data protection lawyer review the final setup.

## 1. Short version

1. **Danish law is the binding constraint for nvoke's Danish customers, not GDPR.** Markedsføringsloven §10 bans unsolicited marketing email to "nogen", which the Forbrugerombudsmand reads as every recipient: consumers, companies, `info@` mailboxes and named employees alike. An email that asks for consent is itself marketing. The sender is liable, and a lead company can be co-liable under the rules on "medvirken". ([Forbrugerombudsmanden, Spamforbuddet vejledning 2021](https://forbrugerombudsmanden.dk/media/bjajzdv1/vejledning-om-spamforbuddet-2021-a.pdf), chapters 3, 7 and 12)
2. **A shared cache of personal emails makes nvoke a controller, with its own Article 14 duty.** Every vendor with a central database (Hunter, Apollo, Kaspr, Lusha, ZoomInfo, RocketReach, Cognism) calls itself controller for it. Only Dropcontact claims processor status, and it does so because it stores nothing.
3. **"Disproportionate effort" is a weak shield when you hold the person's email address.** Bisnode (Poland) lost on it all the way to the Supreme Administrative Court. The UK tribunal in Experian also rejected it for 5.3 million people. The EDPB's 2026 draft scraping guidelines say it "should not be routinely relied upon" outside archiving, research and statistics, and give an example where having direct contact details means you must notify individually.
4. **Kaspr is the closest precedent.** CNIL fined it €240,000 in December 2024 for collecting beyond what people expected, rolling 5 year retention, late English-only notices and vague answers about sources. To comply it deleted its whole database.
5. **The most defensible models are**: Dropcontact (compute on demand, keep nothing, act as processor) or Cognism (central database, but notify every person within the GDPR deadline, with an opt-out). Most US vendors (ZoomInfo, Seamless.AI, RocketReach, Apollo) publish a notice on their website and an opt-out form, and say little about individual notification.

## 2. Comparison table

Legend: "Not stated" means the page I read did not cover it. "Unverified" means I could not load the page.

| Vendor | Role for people in the database | Legal basis and LIA | Article 14 notice | Opt-out, erasure, suppression | Retention and refresh | Model | What customers must do | Generic vs personal |
|---|---|---|---|---|---|---|---|---|
| **Hunter.io** (France) | Controller for "Profile Data"; processor for data customers upload; customers are independent controllers [1] | Legitimate interest. Says it has done an LIA and a DPIA, summaries on request [1] | Not stated in the policy [1] | "Claim" page deletes all data for an address, including the source [3]. Bulk results rechecked and claimed contacts removed within about a month [2]. No explicit "never re-collect" statement | Kept while the info stays on public sources; removed "within 3 months if no longer on source pages" [1]. Bulk results deleted after 15 months with 30 days warning [2] | Central database from crawling public pages. Crawler respects robots.txt; drops private consumer addresses [1] | Independent controller, comply with data protection law, follow the DPA, indemnify Hunter [4] | API tags every address `personal` or `generic` and lets you filter on it [5]. Generated (pattern) emails labelled with a confidence score [1] |
| **Snov.io** | Mixed: processor for clients in some services, joint controller with clients for some search tools under a Joint Controllership Agreement [6] | Legitimate interest; says it ran an LIA with a balancing test [6] | Not stated [6] | Objection overrides its interests. "Clear from list" tool (app.snov.io/clear-email) removes the email so it "no longer appears in search results". Passes deletions on to current and future controllers [6] | Prospect info kept for use plus 3 months after account deletion; deleted on request. Email address retention not stated [6] | Central data plus client tools and extensions [6] | Clients must comply with data protection law when enriching [6] | Says it does not collect or generate personal (non-business) addresses [6] |
| **Apollo.io** (US) | Independent controller for its Contributor Database [7][9] | Legitimate interests of Apollo and its customers. No LIA mentioned [8] | Has a separate "processing notice" on its website telling people their data was added [8]. Does not say it emails people. No mention of disproportionate effort | Removal page and Privacy Center. Keeps a suppression file with the minimum data so a person is not re-added [7][8] | Deleted when no longer used or on objection. No fixed period [7][8] | Central database: web crawling at scale, third-party providers, plus data from customers' mailboxes via Email Finder and Open Tracker [8] | Customers must "independently analyze and ensure" lawful use, verify legal compliance of data, no spam, no resale, indemnify Apollo. ePrivacy not mentioned [10] | Business contact data only; personal addresses not explicitly excluded [7] |
| **Lusha** (Israel/US) | Lusha entities are joint controllers for Contacts; processor for licensees' own data [11] | Legitimate interests. No LIA described [11] | No individual notice described [11] | Removal page; data added to suppression list, kept as long as needed to honour opt-out. Tells customers who bought the data when erasure is done [11] | For the period used to provide the service, then archived. Not a fixed period [11] | Central database: "Community" members share CRM, email header and calendar data; brokers; email pattern inference [11] | Processing under its DPA; few explicit duties in the policy [11] | Excludes personal contact details from business partners' data [11] |
| **Kaspr** (France) | Controller [12] | Legitimate interests (its own, customers', contacts', anti-fraud) [12] | CNIL found notices only started in 2022, in English only. Post-order: notices in all EU languages [13][14] | Opt-out form at kaspr.privacy.saymine.io/kaspr; erasure by email [12] | 5 years from first collection, then auto-deleted; no rolling renewal (changed after CNIL order) [12][14] | Central database. Deleted its database and stopped LinkedIn collection to comply with CNIL [14] | Not stated in policy [12] | Not stated |
| **Dropcontact** (France) | Processor for enrichment; controller only for its own clients and prospects [15][17] | Pushes the legitimate interest and balancing test onto the customer [16] | Says Art 14 style duties do not reach it because it stores nothing; tells customers to inform contacts and to name Dropcontact as source if asked [16][18] | Customer must honour opt-outs immediately [16] | "Not stored or reused after processing"; data destroyed within one month after service ends [15] | **No database.** Real time algorithms from first name, last name and company only. EU servers (AWS) [15][17][18] | Keep LIA records per contact, honour opt-out, answer access and deletion requests [16] | Advises business addresses, not personal webmail; generic not discussed [16] |
| **lemlist** (France) | Policy covers only customer contact lists: customer is controller, lemlist is processor. Its own lead database is not covered [19] | Not stated for the database [19] | Not stated [19] | Not stated for the database [19] | 3 years for prospect data; unclear if it covers the database [19] | Has a lead database, but the privacy policy does not describe it [19] | Customers responsible for "obtaining the explicit consent" of the persons concerned [19] | Not stated |
| **RocketReach** (US) | Controller [20] | Its own and customers' legitimate interests. No LIA [20] | Policy says it also applies to listed professionals; no individual notice described [20] | Removal form at rocketreach.co/remove-profile. No suppression list described [20] | "As long as necessary"; no fixed period [20] | Central database: web scanning, brokers, inference, connected mailboxes [20] | Few duties stated in the policy [20] | Not stated |
| **Cognism** (UK) | Controller or processor depending on service; customers are independent controllers [21] | Legitimate interest under Art 6(1)(f). No LIA published [21][22] | **Notifies people.** Says it notifies business contacts "within GDPR timeframes" [22]; its help centre says it notified its whole database and notifies new people within 30 days (help centre blocked, seen only in search snippets) [23] | Privacy Centre or email erasure. Screens phone data against DNC and TPS lists [21][22] | Aims to delete business contact data 5 years after collection, earlier if inaccurate [21]. "Millions of daily database updates" [22] | Central database from vendors and customer data sharing [21] | Customers "contractually responsible" for compliance, must give notice and get consent where needed [21] | Generates approximate emails from company patterns [21] |
| **Seamless.AI** (US) | Controller [24] | Legitimate interests. No LIA [24] | Links an "Article 14 Notice" page that I could not read [24] | Privacy Request Center. No suppression list described. Will not remove company info [24] | "As long as reasonably required" [24] | Not stated in the policy [24] | Not stated [24] | Not stated |
| **ZoomInfo** (US) | Controller for profiles and its Contributory Network [25] | Legitimate interests of ZoomInfo, customers and partners. No LIA [25] | "Provides notice to all data subjects as required by GDPR Article 13 or 14"; method not described [25] | Removal at zoominfo.com/update/remove and Trust Center. No suppression list described. Never removes company profiles [25] | Tied to purpose; no fixed period [25] | Central database incl. data flowing from customers' integrations [25] | Customers solely responsible for their use, must give third parties notice, handle requests [25] | Not stated |
| **Skrapp** | Unverified: privacy and GDPR pages render only "Loading..." [26] | Unverified | Unverified | Unverified | Unverified | Email finder by name and company [26] | Unverified | Unverified |
| **Findymail** | The privacy policy covers only site users; calls itself controller [27] | Not stated for found emails | Not stated | "Opt out / Claim" link in footer, terms not described [27] | Not stated | Not stated | Not stated | Not stated |

### What the table shows

- **Nobody publishes their LIA.** Hunter and Snov.io say they did one. Hunter offers a summary on request [1][6].
- **Suppression is explicit at Apollo, Lusha and Snov.io** [6][7][11]. Hunter deletes on claim but does not promise to block re-collection [1][3].
- **Only Cognism and Kaspr (after enforcement) describe notifying people directly** [13][22]. ZoomInfo asserts notice without saying how [25]. Everyone else relies on a website notice.
- **Retention:** fixed periods are rare. Hunter ties retention to the source page (gone from the page means gone within 3 months) [1]. Kaspr and Cognism use 5 years [12][21], and CNIL criticised Kaspr's 5 years mainly because it restarted on every update [13].
- **Customer terms** universally make the customer an independent controller responsible for lawful use and anti-spam rules [4][10][21][25].

## 3. Enforcement cases and what went wrong

### Kaspr, CNIL, France (SAN-2024-020, 5 December 2024, €240,000)
Chrome extension showing contact details of LinkedIn profiles, database of about 160 million contacts. Breaches [13]:
- **Legal basis:** it also collected details of people who had limited visibility to their 1st and 2nd degree connections. That exceeded what they could reasonably expect.
- **Retention:** 5 years, restarted on every profile update, so data was kept "disproportionately long".
- **Transparency (Art 12 and 14):** no notice until 2022, four years after launch, then English-only email with an opt-out link.
- **Access (Art 15):** generic "public sources" answers instead of all available source information.

Outcome: order with €10,000 per day penalty. CNIL closed it on 4 March 2026 after Kaspr **deleted its database**, stopped LinkedIn collection, stopped rolling retention, notified in all EU languages and answered complainants [14].

Lesson for nvoke: respect access restrictions (robots.txt, login walls), fix retention from first collection, notify in the person's language, and log the exact source URL per email.

### Bisnode, UODO, Poland (2019, about PLN 943,000)
Data broker that took business data from public registers (KRS, CEIDG). It emailed notices only to people whose address it held and posted a notice on its website for the rest, arguing that notifying everyone by post or phone was too costly (secondary sources put the postage at about PLN 33 million; not checked against the decision) [28][29][30].
- The Warsaw administrative court (II SA/Wa 1030/19, December 2019) rejected the disproportionate effort argument: cost alone does not qualify, and the exemption applies only where informing is close to impossible. A website notice was not enough where contact details were available [29][30].
- The Supreme Administrative Court (III OSK 2538/21, 20 September 2023) dismissed Bisnode's appeal, saying exceptions to transparency "should be interpreted restrictively". The fine amount went back to UODO because part of the case (former sole traders) was annulled [28][31].

Lesson: if you hold the email address, you are expected to use it to notify.

### Experian, UK ICO and First-tier Tribunal (2023)
The tribunal mostly sided with Experian (and found its consumer information portal met the Article 14 content requirements) but still held that notifying 5.3 million people from open sources was a considerable expense, not disproportionate effort [32]. UK law, but persuasive on the same Article 14 text.

### Clearview AI, CNIL (2022, €20 million) and Dutch AP (2024, €30.5 million)
Scraped faces from the public web. No legal basis, rights not honoured, no cooperation, plus special category (biometric) data [33][34]. Extreme case, but it established that "publicly available" is not a legal basis.

### CNIL guidance on reusing publicly available data for prospecting (30 April 2020)
After inspections of scraping tools, CNIL said: public contact data is still personal data; check the source site's terms (scraping sites that forbid it is unlawful); give Article 14 information including the source **no later than the first communication**; electronic marketing needs prior consent under French rules; minimise; sign an Art 28 contract with any scraping provider; DPIA recommended [35].

### Dutch AP scraping guidance (May 2024) and the CJEU KNLTB ruling (C-621/22, 4 October 2024)
The AP said scraping by private parties is "almost always" unlawful because purely commercial interests cannot be legitimate interests [36][37]. The CJEU then held that commercial interests cannot be categorically excluded, subject to strict necessity and the person's reasonable expectations [38][39]. So legitimate interest is available to nvoke, but only with a real balancing test.

### EDPB
- **Guidelines 1/2024 on legitimate interest** (draft adopted 8 October 2024): three step test, sector habit alone does not create reasonable expectations, and consent is often the appropriate basis for marketing related processing [40][41]. I could not confirm a final version.
- **Guidelines 03/2026 on web scraping for generative AI** (draft adopted 7 July 2026, consultation to 30 October 2026) [42]. Written for AI training, but the reasoning carries over to any scraper:
  - para 27: Art 14(5)(b) "should not be routinely relied upon" outside archiving, research and statistics.
  - para 28: weigh number of people, age of data, safeguards.
  - para 30 and 31: if relying on it, publish the full Art 14 information, including precise sources, the crawler's characteristics and ideally the scraped domains and collection dates.
  - Example 3: where you can contact people and the data is recent, you must inform individually.
  - para 45: no robots.txt does not equal consent.
  - para 64: robots.txt, CAPTCHA and login walls reduce reasonable expectations.
  - para 66: mitigations include excluding sources by default, an opt-out list that works even before collection, deleting unnecessary data quickly.

### Denmark
- **Forbrugerombudsmanden, spamforbuddet (updated 25 June 2021)** [43]:
  - §10 applies "uanset om henvendelsen sendes til en forbruger, en virksomhed, en offentlig myndighed" and regardless of whether it goes to "en generel postkasse, fx info@virksomhed.dk" or a named employee (chapter 3).
  - Consent must come from the person who actually uses the address, even if the employer provides it (chapter 7).
  - "En henvendelse, hvor virksomheden beder om et samtykke, [er] i sig selv markedsføring" (chapter 7).
  - The sender is liable even when it buys leads; a lead company can be co-liable ("medvirken") (chapter 12). Fines under §37(3).
  - Keep consent evidence for 2 years after last use (chapter 11).
- **Datatilsynet:** I found **no Datatilsynet decision on scraping websites for contact data or on B2B email finders**. Its Article 14 decisions found (Advokatnævnet 2020, Bech-Bruun 2022) treat one month as the baseline and criticise late notice, but are not about marketing data [44][45]. Unverified beyond that; a search in Datatilsynet's own decision database is still worth doing.

## 4. Generic vs personal addresses

- Under GDPR, a role mailbox like `info@company.dk` is generally treated as company data, not personal data, while `firstname@company.dk` is personal data. This is the common reading of UK ICO guidance, seen only via secondary sources [46]. Exception: a sole trader's or one-person company's generic address can identify a person.
- Under Danish §10, the distinction does not matter for marketing: `info@` needs consent too [43].
- Hunter is the only vendor that exposes the split as a data field [5]. Snov.io and Lusha exclude private (non-business) addresses entirely [6][11]. Hunter drops private consumer addresses during crawling [1].

## 5. What nvoke should adopt, in priority order

1. **Decide the controller question before building the shared cache.** Two defensible designs:
   - **(Recommended) Split the cache.** Share across customers only company-level data and generic role addresses (`info@`, `kontakt@`, `salg@`), plus domain facts (MX, catch-all, email pattern). Personal addresses (`firstname@`) are found per search, stored only in that customer's result set and deleted on schedule. nvoke acts as processor for those, like Dropcontact [15][17]. This avoids nvoke owning an Art 14 duty for a growing database of named people.
   - **If personal addresses go into a shared cache**, nvoke is controller for it (every database vendor says so [1][7][12][20][25]). Then send an Article 14 notice by email to each personal address within one month of first collection, and at the latest before first disclosure to a customer (Art 14(3)), as Cognism claims to do [22][23]. Do not rely on disproportionate effort: nvoke holds the address, which is exactly what sank Bisnode and Experian [29][32] and what EDPB Example 3 describes [42].
2. **Public opt-out page with a hashed suppression list.** Anyone can enter an email or domain, confirm by a link to that address, and be removed. Keep a sha256 of the address (or domain) so the crawler never re-collects it and searches never return it. This is what Apollo, Lusha and Snov.io do [7][8][11][6]. Also let a company opt out its whole domain. Link it from every Art 14 notice and from the site footer.
3. **Publish an Article 14 notice page now, even under option 1.** Content per EDPB para 30 and 31 [42]: who nvoke is, purposes, legal basis (legitimate interest), categories (name, work email, role, company), exact source types (company websites: contact, about, team, impressum pages; public maps listings), the crawler's user agent and robots.txt behaviour, recipients (customers), retention, rights, opt-out link, Datatilsynet complaint right. Danish and English at least, given Kaspr [13].
4. **Write an LIA and a short DPIA and keep them on file.** Hunter and Snov.io say they have one [1][6]; offer a summary on request, as Hunter does. Cover necessity (why personal addresses and not only generic ones), reasonable expectations (published on the company's own site for business contact), SMTP RCPT verification (no message sent, rate limited, no storing of server responses beyond a status), and mitigations from EDPB para 66 [42]. KNLTB means a commercial interest can count, but the balancing must be real [38].
5. **Crawl like the EDPB expects.** Respect robots.txt and do not bypass login walls or CAPTCHAs [42] (Kaspr's core breach was ignoring visibility restrictions [13]). Use a named user agent with a URL to the notice page. Stay within the page types you list. Drop private webmail addresses (gmail, hotmail and so on) and anything that is not on the company's own domain, as Hunter and Snov.io do [1][6].
6. **Store the source per address.** Keep the URL and first and last seen dates per email, so access requests can name the source (Kaspr was fined for vague answers [13]) and retention can follow the source.
7. **Retention with a fixed clock.**
   - Shared cache: re-check the source page every 90 days and delete an address within 90 days of it disappearing from the page (Hunter uses 3 months [1]). Hard cap of 12 months from first collection unless it is seen again on the source, and never extend just because a customer searched it (Kaspr's rolling renewal was the problem [13]). These numbers are a suggestion, not a regulator figure.
   - Customer result sets with personal addresses: keep while the customer's account is active, with an option for the customer to delete, and delete within 30 days of account closure (Dropcontact says one month [15]).
   - Verification results (SMTP probe outcome): keep only the status and a timestamp.
8. **Customer terms clause.** Make customers independent controllers responsible for their use, as Hunter, Apollo, Cognism and ZoomInfo do [4][10][21][25], and add the parts competitors leave out:
   - comply with GDPR and national e-marketing rules, and in Denmark Markedsføringsloven §10, which requires prior consent for marketing email to any address including `info@`, and treats a consent request email as marketing [43];
   - give recipients Article 14 information no later than first contact (CNIL [35]) and name nvoke as source if asked (Dropcontact's advice [16]);
   - honour objections and push them back to nvoke's suppression list (one click in the app);
   - no resale, no consumer marketing, no sensitive data (Apollo's restrictions [10]);
   - indemnity.
9. **Show the Danish rule in the product.** Because nvoke could be co-liable under "medvirken" [43], do not market nvoke as a cold-email tool for Danish recipients. Show a short note on export when results are Danish (`.dk` domains): email marketing needs prior consent, phone and letter are the alternatives. Label each address `generic` or `personal` like Hunter [5] so customers can choose.
10. **Answer rights requests fast and fully.** One inbox (privacy@), 30 day SLA, source URL in every access answer, erasure plus suppression in one step, and tell customers who received the address when it is erased (Lusha does this [11]).

## 6. What I could not verify

- Skrapp's privacy and GDPR pages did not render [26]. Findymail's policy covers only its own users [27]. lemlist's policy does not cover its lead database [19].
- Seamless.AI's linked "Article 14 Notice" was not readable [24].
- Cognism's help centre returned 403. The "whole database notified, new contacts within 30 days" claim comes from search snippets of its help centre [23] and is self-reported. Its compliance page only says "within GDPR timeframes" [22].
- Apollo's DPA statement (independent controller) comes from a search snippet of apollo.io/dpa [9].
- Dropcontact's privacy policy URL returned 404. Its CNIL audit claim is self-reported and the year differs between pages (2019 vs 2020) [15][18]. No CNIL publication confirming it was found.
- I did not read the Kaspr deliberation text on Légifrance, only CNIL's summaries [13][14].
- No final version of EDPB Guidelines 1/2024 was confirmed. Guidelines 03/2026 are a consultation draft aimed at AI training [42].
- No regulator guidance was found on SMTP RCPT probing as such.
- No Datatilsynet decision on web scraping for B2B contact data was found.

## Sources

1. Hunter privacy policy: https://hunter.io/privacy-policy
2. Hunter help, GDPR compliance: https://help.hunter.io/en/articles/1890029-gdpr-compliance
3. Hunter claim page: https://hunter.io/claim
4. Hunter terms of service: https://hunter.io/terms-of-service
5. Hunter API v2 docs (`type` field): https://hunter.io/api-documentation/v2
6. Snov.io privacy policy: https://snov.io/privacy-policy
7. Apollo privacy policy: https://www.apollo.io/privacy-policy
8. Apollo GDPR processing notice: https://www.apollo.io/privacy-policy/processing-notice
9. Apollo DPA (search snippet only): https://apollo.io/dpa
10. Apollo terms of service: https://www.apollo.io/terms
11. Lusha privacy policy: https://www.lusha.com/legal/privacy-policy/
12. Kaspr privacy policy: https://www.kaspr.io/privacy-policy
13. CNIL, Data scraping: KASPR fined €240,000: https://www.cnil.fr/en/data-scraping-kaspr-fined-eu240000
14. CNIL, Closure of the order issued against KASPR: https://www.cnil.fr/en/closure-order-issued-against-kaspr
15. Dropcontact, Do we store your data: https://www.dropcontact.com/help/do-we-store-your-data
16. Dropcontact, GDPR and cold emailing: https://www.dropcontact.com/help/gdpr-and-cold-emailing
17. Dropcontact, Data privacy and security overview: https://www.dropcontact.com/help/data-privacy-and-security-overview
18. Dropcontact, GDPR compliance: https://www.dropcontact.com/article/189-gdpr-compliance
19. lemlist privacy policy: https://www.lemlist.com/privacy-policy
20. RocketReach privacy policy: https://rocketreach.co/privacy
21. Cognism privacy policy: https://www.cognism.com/privacy-policy
22. Cognism compliance page: https://www.cognism.com/compliance
23. Cognism help centre, notified database (403, search snippet only): https://help.cognism.com/hc/en-gb/articles/34166247848082-What-Is-a-Notified-Database-and-Why-Is-It-Important
24. Seamless.AI privacy policy: https://seamless.ai/privacy-policy
25. ZoomInfo privacy policy: https://www.zoominfo.com/about-zoominfo/privacy-policy
26. Skrapp data policy and GDPR page: https://skrapp.io/privacy and https://skrapp.io/gdpr-compliance
27. Findymail privacy policy: https://www.findymail.com/privacy-policy
28. UODO, Bisnode judgment: https://uodo.gov.pl/en/553/1572
29. Herbert Smith Freehills on the Bisnode fine: https://www.hsfkramer.com/notes/data/2019-04/gdpr-fine-in-poland-gives-important-insight-into-the-requirements-of-article-14
30. IAPP, Polish court overturns DPA's first GDPR fine: https://iapp.org/news/a/polish-court-overturns-dpas-first-gdpr-fine
31. Digital Policy Alert, Supreme Administrative Court upholds Bisnode fine: https://digitalpolicyalert.org/event/15788-issued-supreme-administrative-court-ruling-upholding-personal-data-protection-office-fine-against-bisnode
32. Hunton, UK tribunal rules on ICO case against Experian: https://www.hunton.com/privacy-and-cybersecurity-law-blog/uk-tribunal-rules-on-direct-marketing-ico-case-against-experian
33. iubenda, CNIL fined Clearview AI €20 million: https://www.iubenda.com/en/blog/cnil-fined-clearview-ai-e20-million/
34. Hunton, Dutch regulator fines Clearview AI €30.5 million: https://www.hunton.com/privacy-and-cybersecurity-law-blog/dutch-regulator-fines-clearview-ai-30-5-million-euros
35. CNIL, La réutilisation des données publiquement accessibles en ligne à des fins de démarchage commercial: https://www.cnil.fr/fr/la-reutilisation-des-donnees-publiquement-accessibles-en-ligne-des-fins-de-demarchage-commercial
36. IAPP, Netherlands DPA issues guidance against web scraping: https://iapp.org/news/a/netherlands-dpa-issues-guidance-against-web-scraping
37. Pinsent Masons, Dutch web scraping guidance: https://www.pinsentmasons.com/out-law/news/dutch-web-scraping-guidance-warn-businesses-gdpr-breach-risk
38. Herbert Smith Freehills on CJEU C-621/22: https://www.hsfkramer.com/notes/data/2024-posts/CJEU--Commercial-interest-may-be-considered-necessary-for-controller-s-legitimate-interest-
39. Hogan Lovells, CJEU clears the air: https://www.hlc.com/en/publications/cjeu-clears-the-air-dutch-dpas-interpretation-of-legitimate-interests-is-too-strict
40. Hogan Lovells, EDPB guidelines on legitimate interest open for consultation: https://hlc.com/en/publications/new-rigorous-but-practical-edpb-guidelines-on-legitimate-interest-open-for-consultation
41. EDPB consultation page, Guidelines 1/2024: https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2024/guidelines-12024-processing-personal-data-based_ro?page=9
42. EDPB Guidelines 03/2026 on web scraping in the context of generative AI, v1.0: https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_2020603_webscraping_v1_en_0.pdf
43. Forbrugerombudsmanden, Spamforbuddet vejledning (updated 25 June 2021): https://forbrugerombudsmanden.dk/media/bjajzdv1/vejledning-om-spamforbuddet-2021-a.pdf
44. Datatilsynet decision 22 May 2020, Advokatnævnet (via Lovguiden): https://www.lovguiden.dk/dokument/datatilsynet/22-05-2020-kritik-af-offentlig-myndighed-for-manglende-overholdelse-af-oplysningspligten
45. Datatilsynet decision 29 November 2022, Bech-Bruun (via Lovguiden): https://www.lovguiden.dk/dokument/datatilsynet/29-11-2022-alvorlig-kritik-af-bech-bruun-for-manglende-oplysningspligt-i-advokatundersoegelse
46. SCL, B2B communications: a welcome ICO turnaround (secondary): https://www.scl.org/10176-b2b-communications-a-welcome-ico-turnaround/
