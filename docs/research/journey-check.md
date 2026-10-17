# Journey check: paste your site to a CSV with openers

Run on 2026-10-17 against the local stack: `cli db`, `dev:api`, `dev:worker`,
`dev:site`, in the Horadric browser pane, signed in to the Clerk dev instance.
OpenRouter worked (key from `apps/server/.env`). No Brave key locally.

## What I walked

1. `/sign-up`, then `/app` first run: the empty state offers "Start from your
   website" and four by-hand kinds. Fine.
2. `/app/new`, paste `nvoke.run`, "Plan my searches": profile and six suggested
   searches came back in about 20 seconds.
3. Start a suggestion. The web searches fail locally because
   `BRAVE_SEARCH_API_KEY` is unset; the failed row and results page show
   "Stopped by an error on our end. Run it again." with Run again. Clean, but see
   "Not changed". The launches suggestion ran in 38 seconds (4 companies, 3 valid
   emails).
4. Results page, "Draft opener" on a company with valid emails, CSV export.
5. Free tool (`/tools/website-email-extractor`), result, "Start free" into
   `/sign-up?utm_*`, then `/app`.

## What broke and what I fixed

- **Openers always failed** ("Opener failed", no cause). Haiku 5.5 thinks before
  it answers and the thinking counts against `max_tokens`. The cap was
  `300 * companies + 200` (500 for one company); one call used 370 tokens for a
  107 token answer and a bad draw hit the cap (`finish: length`). Now
  `1000 * companies + 2000` with `effort: 'low'`. A retry produced a quoted,
  verified opener and the CSV `opener` column carried it on every email row.
- **"Opener failed" gave no hint.** Now "Opener failed, draft it again".
- **`/sign-up` and `/sign-in` were blank for a signed-in visitor** (Clerk renders
  nothing). Both pages now redirect to `/app`.
- **A mistyped domain said "That address is private or local."** A domain that
  does not resolve now says it did not answer ("Check the address").
- **Tool CTAs still sold the old way** ("Name a trade and a place"). The result
  CTAs and the closing band now say: paste your site, nvoke finds who buys from
  you, reads, verifies and drafts an opener.

## Not changed

- Local worker logs show feed collectors failing with a Postgres encoding error
  ("character with byte sequence 0xe2 0x88 0x92 in encoding UTF8 has no
  equivalent"). It comes from the local embedded Postgres on Windows (a non UTF8
  server encoding); production Supabase is UTF8. Worth a look if a dev DB should
  match.
- The failed web search says "error on our end" when the server has no Brave key.
  Right for users in production; only a dev setup hits it, and the worker log
  names the cause.
- In a hidden browser pane, client side navigation and polling stall (timers are
  throttled), so Start did not move to the results page and an opener stayed on
  "Drafting" until reload. A visible tab is not affected; not a product bug.
- I did not create a new Clerk account (the pane was already signed in), so the
  sign-up form itself and the redirect after it were not exercised.
