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
