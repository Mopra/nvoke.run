# Crawl benchmark

How many companies end with at least one email, measured on a fixed sample
of company websites with the production crawler (`apps/server/src/leads/crawl.ts`).
Every crawl change is measured against it before it ships.

```bash
pnpm --filter @nvoke/server cli bench crawl --label <name> --compare baseline
pnpm --filter @nvoke/server cli bench fill      # OSM places per local query
pnpm --filter @nvoke/server cli bench sample    # rebuild the sample (rarely)
```

## Method

- **Sample**: `apps/server/bench/crawl-sample.json`, built once by
  `cli bench sample` on 2026-10-17 and frozen. Local: OpenStreetMap through
  the local search adapter, 10 places per query over 15 niche and city
  queries in DK, SE, NO, NL, UK, IE and the US. Launches: the last 30 days
  of Show HN. Web: there is no Brave key on development machines, so the web
  slice is businesses with an official website on Wikidata (DK, NO, DE, UK,
  US, 15 each). That leans towards larger companies than a Brave keyword
  search returns.
- **Shortfall**: 275 sites, not 300. Local 100 of 100. Launches 100 of 100.
  Web 75 of 100: the Wikidata queries for Sweden and the Netherlands timed
  out three times. Architect in Hamburg failed on every public Overpass
  mirror (timeouts and 5xx) and is not in the sample.
- **Crawl**: the same limits as the worker. robots.txt on every hop, one
  request per second per host, at most 8 pages and 2 MB per site, the
  `nvokebot` user agent, no CAPTCHA or login is ever passed (docs/legal).
- **Cache**: responses are kept in `apps/server/.bench/http` (gitignored).
  A re-run reads the same pages as the run before, so a change is measured
  against the same web. Pages a change asks for that no earlier run fetched
  are fetched live, under the same rules.
- **Columns**: *with email* is sites with at least one address after the
  own domain rule (`selectForCompany`). *Deliverable* is sites with an
  address whose domain has a mail server (MX, or an address record). SMTP
  probes are not run: port 25 is throttled or blocked on the machines that
  run this. *Generic* and *personal* count sites with at least one address
  of that kind. *Pages* is the average pages fetched per site, *median s*
  the median crawl time per site.

## Baseline

Commit 580674f, crawled live on 2026-10-17.

| baseline | sites | with email | deliverable | generic | personal | emails | done | failed | blocked | refused | js_only | pages | median s |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| local | 100 | 72 (72.0%) | 72 (72.0%) | 45 | 36 | 203 | 86 | 11 | 0 | 1 | 2 | 3.7 | 4.2 |
| web | 75 | 45 (60.0%) | 44 (58.7%) | 36 | 33 | 189 | 55 | 8 | 2 | 6 | 4 | 4.3 | 6.4 |
| launches | 100 | 48 (48.0%) | 48 (48.0%) | 41 | 12 | 63 | 82 | 2 | 1 | 1 | 14 | 3.8 | 4.2 |
| all | 275 | 165 (60.0%) | 164 (59.6%) | 122 | 81 | 455 | 223 | 21 | 3 | 8 | 20 | 3.9 | 4.3 |

What the misses are:

- **Failed (21)**: 16 are "robots.txt unreachable", which in practice means
  the host does not resolve or refuses the connection: often the bare domain
  has no DNS and only www answers, or the reverse. The rest are a 404 or
  409 homepage and two timeouts.
- **js_only (20)**: app shells, 14 of them launches. Only the desktop's
  local render crawl can read these.
- **done without an email (58)**: the homepage linked no page we recognise,
  or the address is hidden in a way the extractor does not undo.

## Changes, one at a time

Each run reads the cached pages of the runs before it and fetches only the
pages it newly asks for. Gained and lost are sites that went from no email
to some, or back, against the run before (`--compare`).

### 1. Extraction: obfuscations, microdata, hCard

`packages/shared/src/crawl/extract.ts`. Cloudflare email protection
(`data-cfemail` and `/cdn-cgi/l/email-protection#`) and JSON-LD `email`
were already decoded, so this step adds what was missing: `(a)` as the at
sign inside brackets, Polish, Finnish and Portuguese words for dot, zero
width characters and soft hyphens inside an address, full width at signs,
`data-user` plus `data-domain` attributes, text reversed with CSS
(`direction: rtl` with `bidi-override`), `aria-label`, schema.org
`itemprop="email"` and hCard `.email` / `.u-email`.

| extraction | sites | with email | deliverable | generic | personal | emails | done | failed | blocked | refused | js_only | pages | median s |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| all | 275 | 165 (60.0%) | 164 (59.6%) | 122 | 81 | 455 | 223 | 21 | 3 | 8 | 20 | 3.9 | 4.0 |

No change: 0 gained, 0 lost, the same 455 addresses. None of the 1,534
pages the baseline read hides an address in these ways. The first version
also joined a dot padded with spaces ("info@acme . dk") and found 18 more
addresses, every one of them junk (`info@relatedcode.com.we` from
"info@relatedcode.com. We"), so that rule was dropped and a test keeps it
out. The rest stays: cheap, tested, and it costs nothing on pages that do
not use it.

### 2. Page picking: more languages, menus and footers, vCards

`packages/shared/src/crawl/pages.ts`. Contact, imprint, team and about
words in Dutch, French, Spanish, Italian, Portuguese, Polish and Finnish
(`nous-contacter`, `over-ons`, `mentions-legales`, `ota-yhteytta`,
`quienes-somos` and more), "find us" pages (`find-os`, `hitta-hit`,
`anfahrt`), links to `.vcf` files, and 10 points for a link inside the
site's header, nav, footer or menu, where sites put the pages they want
found.

| picking | sites | with email | deliverable | generic | personal | emails | done | failed | blocked | refused | js_only | pages | median s |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| all | 275 | 165 (60.0%) | 164 (59.6%) | 122 | 79 | 457 | 223 | 21 | 3 | 8 | 20 | 3.9 | 4.1 |

No change in sites: 0 gained, 0 lost. A first version moved `/impressum`
into the first three guessed paths in place of `/about` and lost
tunedaway.com, whose only address is on `/about`; the order was put back.

### 3. Contact form recipients

Reading the pages of the 58 sites that were crawled without an email showed
one address the extractor skipped: ukcdogs.com lists its mailboxes as the
`<option value>` of its contact form's recipient select. Form recipients
(`option[value]`, hidden `input[value]`) are now read like `title` and
`content`.

| forms | sites | with email | deliverable | generic | personal | emails | done | failed | blocked | refused | js_only | pages | median s |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| all | 275 | 166 (60.4%) | 165 (60.0%) | 122 | 80 | 461 | 223 | 21 | 3 | 8 | 20 | 3.9 | 4.1 |

1 gained (ukcdogs.com, 3 addresses), 0 lost. The same reading showed what
holds the rest back: 32 of the 57 left were read as the homepage alone, because
it links to no page with a contact word (one page sites, menus built by
script). That is what the next step is for.

### 4. Reaching the site: variants, client redirects, sitemap, guessed paths

`packages/shared/src/crawl/site.ts` and `apps/server/src/leads/crawl.ts`:

- **Address variants**: when the homepage fails, plain http, then the www
  twin (or the bare domain), over https and http.
- **Client redirects**: a meta refresh, or a script that sets `location` on
  a page with next to no text, is followed (twice at most), and a new
  domain it lands on counts as the company's own.
- **Sitemap**: when the homepage links to fewer than two likely pages, the
  sitemaps robots.txt declares (else `/sitemap.xml`) are read, at most two
  files, page sitemaps of an index first, and their likely pages join the
  queue. Pages whose last path segment is over 40 characters are posts, not
  contact pages, and are skipped.
- **Guessed paths after nothing**: when the linked pages held no address,
  `/contact`, `/kontakt`, `/about`, `/impressum` and the like are tried
  while the 8 page limit allows.

| reach | sites | with email | deliverable | generic | personal | emails | done | failed | blocked | refused | js_only | pages | median s |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| local | 100 | 73 (73.0%) | 73 (73.0%) | 45 | 37 | 209 | 86 | 11 | 0 | 1 | 2 | 4.7 | 5.0 |
| web | 75 | 48 (64.0%) | 47 (62.7%) | 38 | 34 | 194 | 56 | 7 | 2 | 6 | 4 | 5.2 | 7.2 |
| launches | 100 | 50 (50.0%) | 50 (50.0%) | 43 | 12 | 66 | 83 | 2 | 1 | 1 | 13 | 5.9 | 8.0 |
| all | 275 | 171 (62.2%) | 170 (61.8%) | 126 | 83 | 469 | 225 | 20 | 3 | 8 | 19 | 5.3 | 6.0 |

5 gained, 0 lost:

| site | how | found |
|---|---|---|
| jsonexlab.com | sitemap | support@jsonexlab.com on /privacy-policy/ |
| takestakes.com | sitemap | hello@tomreinert.de on /imprint/ |
| hjertingfysioterapi.dk | meta refresh to fysesbjerg.dk | fysesbjerg@fysesbjerg.dk |
| ostomycure.com | guessed paths after nothing: /contact and /about redirect to its real pages | info@, graeme.smith@ostomysecure.com |
| landsecurities.co.uk | https www refused, the bare http variant redirects to landsec.com | enquiries@, shareholderenquiries@landsec.com |

A first version without the slug rule also "gained" app.treechat.com with
support@coinbase.com, from a forum post its sitemap lists as
`/quest/fellow-twetchers-contact-coinbase-support-...`. The rule removed it.

The cost: 5.3 pages per site instead of 3.9 (sitemaps and guessed paths
count as pages), and a median of 6.0 s per site instead of 4.1. The 16
"robots.txt unreachable" failures did not move: every variant of those
hosts has no DNS record, so the sites are gone.

The desktop's local crawl (`apps/desktop/src/main/local-crawl/reader.ts`)
gains the variants, the meta refresh and the guessed paths through the same
shared rules. It reads no sitemap: its loader renders pages in a browser
window, which is not made for XML.

### 5. Local fill rate: OSM places without a website

`cli bench fill` counts, for each local sample query, the OSM places that
match the niche by tag, how many have a website, and how many have no
website but an email (on the business's own domain, or on webmail). The
idea was to take the domain of an own domain email as the website.

| query | places | website | own email only | webmail only |
|---|--:|--:|--:|--:|
| dentist in Aarhus | 20 | 12 | 0 | 0 |
| accountant in Copenhagen | 7 | 2 | 0 | 0 |
| lawyer in Odense | 4 | 2 | 0 | 0 |
| physiotherapist in Amsterdam | 62 | 33 | 0 | 0 |
| car repair in Stockholm | 156 | 51 | 1 | 0 |
| electrician in Oslo | 6 | 2 | 0 | 0 |
| restaurant in Austin | 1114 | 573 | 0 | 1 |
| estate agent in Dublin | 116 | 66 | 1 | 0 |
| restaurant in Aalborg | 101 | 84 | 1 | 0 |
| physiotherapist in Esbjerg | 9 | 9 | 0 | 0 |
| car repair in Vejle | 9 | 5 | 0 | 0 |
| cafe in Malmö | 0 | 0 | 0 | 0 |
| bakery in Bergen | 38 | 20 | 1 | 0 |
| all | 1642 | 859 | 4 | 1 |

Five queries did not answer (every public Overpass mirror failed). Of
1,642 places, 859 (52%) have a website and 4 (0.2%) have only an own domain
email: the change would add half a percent of local companies. Not shipped.
It makes every Overpass query twice as long on mirrors that already time
out, and an email on an ISP domain (`kapper@ziggo.nl`) would turn the ISP's
homepage into the "company website". The other 48% of places have neither
a website nor an email in OSM; filling those means a web search per place
by name and address, which is the Brave fallback the local search already
has when OSM falls short.

### 6. Review fixes

A review of the changes found ways the new reach could pick up the wrong
site. Fixed before shipping, with tests:

- A refresh inside `<noscript>`, or `location` set in an `onclick`, is not
  a redirect. Only `<meta http-equiv="refresh">` outside `<noscript>` and
  `location` in an inline `<script>` count.
- A redirect to a platform (booking sites, parking landers' hosts, every
  domain in `isPlatformDomain`) is not followed, and a homepage that lands
  on one does not make it the company's own domain.
- The guessed paths run when there is no address on the company's own
  domain, not when there is no address at all: a page that only shows the
  web agency's address no longer stops the search.
- The desktop counts every homepage variant it loads against the 8 page
  limit.
- Compressed sitemaps (`.xml.gz`) are skipped instead of fetched and not
  read, and no redirect or sitemap is fetched once the 2 MB budget is spent.

| final | sites | with email | deliverable | generic | personal | emails | done | failed | blocked | refused | js_only | pages | median s |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| local | 100 | 73 (73.0%) | 73 (73.0%) | 45 | 37 | 209 | 86 | 11 | 0 | 1 | 2 | 5.1 | 5.1 |
| web | 75 | 48 (64.0%) | 47 (62.7%) | 38 | 34 | 194 | 56 | 7 | 2 | 6 | 4 | 5.6 | 8.2 |
| launches | 100 | 50 (50.0%) | 50 (50.0%) | 43 | 12 | 66 | 83 | 2 | 1 | 1 | 13 | 6.3 | 8.1 |
| all | 275 | 171 (62.2%) | 170 (61.8%) | 126 | 83 | 469 | 225 | 20 | 3 | 8 | 19 | 5.7 | 8.0 |

0 gained, 0 lost. The guessed paths now also run on sites whose only
addresses are someone else's, which costs 0.4 pages per site on average and
found nothing more on this sample.

## Before and after

| | sites with email | deliverable | emails | pages per site | median s |
|---|--:|--:|--:|--:|--:|
| baseline | 165 of 275 (60.0%) | 164 (59.6%) | 455 | 3.9 | 4.3 |
| after | 171 of 275 (62.2%) | 170 (61.8%) | 469 | 5.7 | 8.0 |

Six more companies end with an email, a 3.6% relative gain, none lost.
That is less than "much better", and the reading of the misses says why:

- **The server crawl already reads what is there.** Of the 57 sites crawled
  without an email after step 3, the pages fetched hold no address in any
  form the extractor misses, except the one form fix. Cloudflare and
  JSON-LD were already decoded before this work.
- **The rest is out of reach of a polite HTTP crawl.** 20 sites are gone
  (no DNS), 19 are JavaScript app shells and 8 refuse datacenter requests.
  Those 27 are what the desktop's local render crawl exists for, and it
  now shares every rule above. Many launches and one page sites simply
  publish no address: a contact form only, or nothing.
- **Bigger levers, not built here**: the desktop render crawl on more
  companies (it reads js_only and refused sites today, 27 of the 104 misses
  here), and a web search fallback per local place without a website.

Where the time goes: sitemaps and guessed paths add pages, so a site takes
about twice as long. With one request per second per host and many sites
crawled at once, that is throughput the worker has to spare.
