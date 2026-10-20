# How nvoke meets Article 14 (information where data is not obtained from the person)

Status: draft, 13 October 2026, revised 20 October 2026 for sending (section 4.4). Contains an open decision for the lawyer (section 5). Sources cited as [R] refer to `docs/research/gdpr-competitors.md`.

## 1. Why Article 14 applies

We collect email addresses from company websites, not from the people themselves. For every address that is personal data (all `personal` addresses, and `generic` ones that identify a person, such as a sole trader's kontakt@) Article 14 requires us to give the information in Art 14(1) and (2):

- within a reasonable period, at the latest one month after collection (Art 14(3)(a));
- at the latest at the first communication with the person, if we use the data to contact them (Art 14(3)(b));
- at the latest when the data is first disclosed to another recipient (Art 14(3)(c)).

Point (c) matters most for us: a customer sees the address minutes after we collect it. So any notice we give individually would have to go out before or at the moment the customer sees the address.

The exemption in Art 14(5)(b) (impossible or disproportionate effort) is narrow. Bisnode lost on it at the Polish Supreme Administrative Court, which said exceptions to transparency are interpreted restrictively and that a website notice was not enough where Bisnode held contact details [R28][R29][R31]. The UK tribunal in Experian also rejected it [R32]. EDPB Guidelines 03/2026 (draft) say it "should not be routinely relied upon" outside archiving, research and statistics, and Example 3 says that where contact details are held and the data is recent, people must be informed individually [R42].

## 2. What the notice says

The public notice is part B of the privacy policy, "People whose business contact details nvoke finds". It covers everything in Art 14(1) and (2), following EDPB 03/2026 paras 30 and 31 [R42]:

1. Who we are: nvoke, legal entity, CVR, address (TODO), contact privacy@nvoke.run. No DPO.
2. Purposes: a prospecting research tool that helps businesses find other businesses and their published contact points.
3. Legal basis: legitimate interest, Art 6(1)(f), with a plain summary of the balancing (`lia.md`) and an offer to send the full summary on request.
4. Categories: work email address, whether it looks like a role mailbox or a named one, the page it was found on, the result of a deliverability check, and business listing data (company name, website, location, phone, category).
5. Recipients: our customers (businesses that search with nvoke) and our sub-processors by name.
6. Transfers: whether lead data leaves the EU (intended: no).
7. Retention: generic cache 12 months from first collection and sooner when the page no longer shows it; search results (including named addresses) 12 months; verification checks 30 days; the record of which addresses a customer was charged for 12 months; opt-out hashes forever, and why.
8. Rights: access, rectification, erasure, restriction, objection (Art 21, which we always honour for this data), complaint to Datatilsynet with its address and website.
9. Sources: the exact source types (company websites: homepage, contact, about, team, impressum, privacy and legal pages; OpenStreetMap; Brave Search results; Product Hunt; Hacker News Show HN through Algolia), and that an access request returns the exact page URL for each address.
10. How we crawl: user agent `nvokebot/1.0 (+https://nvoke.run/bot)`, robots.txt honoured, no logins, no CAPTCHAs, page and rate limits, and how to block us.
11. The SMTP check: we ask the mail server whether the mailbox exists and never send a message.
12. How to opt out: link to `/opt-out` (address or whole domain, immediate).

Language: Danish and English, matching the Kaspr lesson that English-only notices are not enough for local audiences [R13]. Other EU languages when we have customers searching those markets in volume (open item).

## 3. Where the notice is

- `nvoke.run/privacy`, Danish and English, the section above. Linked from every page footer.
- `nvoke.run/bot`, linked from the crawler's user agent string, so any site owner who sees nvokebot in their logs lands on an explanation, the notice and the opt-out.
- `nvoke.run/opt-out`, linked from both.
- In every first email nvoke sends for a customer: a line saying where the address was found and how to stop (section 4.4).
- Customer terms require customers to give their own Art 14 information at their first contact with a person and to name nvoke as the source if asked (CNIL guidance [R35], Dropcontact practice [R16]).

## 4. Decision on individual notification

### 4.1 Generic role mailboxes (info@, kontakt@, salg@): public notice only

Decision: we do not email generic addresses to notify them. (A customer's campaign may email them; that email carries its own notice, section 4.4.) Reasoning:

- Most role mailboxes are not personal data: they identify a function of a company, not a person [R46]. Article 14 does not reach them.
- Where a role mailbox does identify a person (a one-person business), the person is the business owner who published the address so the business can be contacted. The impact of our processing is low (`lia.md`, 4.5), the address is in the shared cache for at most 12 months, and the crawler and the notice are easy to find from the website's own logs.
- An email to info@ asking nothing and selling nothing is a legal notice, not marketing. But sending one to every generic mailbox we find, unasked by any customer, would mean nvoke mailing every business it ever finds, which is the exact behaviour Danish §10 rules aim at, and would be read as spam by many recipients. We judge that this would harm people more than it helps them.
- Honest weakness: for the minority of generic addresses that do identify a person, we are relying on Art 14(5)(b), which Bisnode and EDPB Example 3 say is weak when the controller holds the address. We accept this as a grey zone risk, kept small by the 12 month cap and the opt-out.

### 4.2 Personal addresses (firstname@): not shared, deleted with the search, public notice only for now

Current decision: personal addresses are never put in the shared cache. They exist only in the result set of the customer whose search found them and are deleted with that search (at the latest 12 months after it was created). We give the public notice and the opt-out, and we do not email the person unless a customer's campaign does (section 4.4).

Our reasoning:

- Not building a central database of named people is the main safeguard. Every vendor with such a database calls itself controller and carries a heavy Art 14 duty [R1][R7][R12][R20][R25]; Kaspr and Bisnode are the cautionary cases [R13][R28].
- The customer who receives the address is an independent controller and must inform the person at first contact (Art 14(3)(b)), which is also when it matters most to the person.
- Emailing every personal address the moment it is found would turn nvoke into a bulk sender to people who never heard of us, would happen minutes before the customer's own contact, and would be the one email from nvoke the person ever gets.

The honest problem: this is very close to the Bisnode facts. We hold the email address, so informing the person individually is not impossible and not obviously disproportionate. Disclosure to the customer happens almost at once (Art 14(3)(c)), so a website notice is our only notice at the moment of disclosure. A regulator could well find that we must notify individually. The alternative reading, that nvoke only acts on the customer's instructions for these per-search results (processor, like Dropcontact [R15][R17]) and the Art 14 duty sits with the customer, is not our current position: we decide the sources, the pages and the method, which looks like a controller.

### 4.3 Options if the lawyer says individual notice is needed

1. Email an Art 14 notice to each personal address when it is first found, before it is shown to the customer, and hold the address back until the notice is sent. One notice per address for all time (track by hash), no marketing content, link to opt-out. Cost: an outbound mail setup and reputation risk, and a short delay in results. This is the Cognism model [R22][R23].
2. Return personal addresses only for companies that publish no generic address. Fewer people affected, so the notice volume is smaller, but the legal question is the same for those that remain.
3. Stop returning personal addresses. Removes the problem; loses many small businesses as leads.
4. Restructure as processor for personal addresses (customer instructs, customer gives notice). Needs a DPA with each customer and changes in how much we decide; may not be credible.

### 4.4 Email sent through nvoke: the notice is in the first email

Since 20 October 2026 nvoke writes and sends campaigns from the customer's own mailbox. The customer is the sender, so the first communication (Art 14(3)(b)) is the customer's email, and nvoke puts the notice in it. Every email ends with a footer the AI does not write: the sender's signature (or name), then a fixed line saying the address was found on the company's own website, and how to stop ("Reply stop and I will not write again."). Every email also carries a one-click `List-Unsubscribe` header. A stop or unsubscribe goes on that sender's list (`send_suppressions`); the global `/opt-out` still ends everything.

This is the Cognism model from option 1 below, given at the first contact by the sender rather than as a separate email from nvoke. It covers the people who are emailed. It does not change the question in section 5 for people who are found and shown but never emailed.

## 5. Open question for the lawyer

Is a public notice plus opt-out enough for personal work addresses that nvoke holds only inside one customer's search result and deletes with it, given Bisnode (III OSK 2538/21) and EDPB 03/2026 Example 3? If not, is option 1 (email notice before disclosure) the right fix, and would such an email itself raise a Markedsføringsloven §10 issue? (We assume it does not, because it contains no marketing, but the Forbrugerombudsmand reads "marketing" broadly [R43].)
