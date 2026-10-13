# Privacy requests runbook

How to answer people who write to **privacy@nvoke.run** about their data.
nvoke has no transactional email, so you answer by hand from that mailbox.

| Request | GDPR | What you do |
|---|---|---|
| "What do you have on me?" | Access, Article 15 | Check identity, `privacy export`, send the JSON |
| "Delete me" | Erasure, Article 17 | `privacy erase <address>` |
| "Stop using my data" | Objection, Article 21 | Same as erasure: `privacy erase <address>` |
| "Don't collect anything from our company" | Objection for a domain | `privacy erase <domain>` |
| "Don't crawl our site" (no personal data asked about) | | `privacy suppress-domain <domain>` |

Self-service exists for the last four: the opt-out page on nvoke.run calls
`POST /v1/privacy/opt-out`, which does the same as `privacy erase` at once.
You can point people there, but never require it.

## Deadlines

Answer **within one month of receipt** (Article 12(3)). If a request is
complex or there are many, you may extend by two more months, but you must
tell the person within the first month and say why. Answer even when you hold
nothing: "We hold no data about this address."

Requests are free. You may refuse or charge only for requests that are
manifestly unfounded or excessive, and must explain why.

## Identity

- **Erasure, objection, domain opt-out:** no check needed. They only remove
  data, so a request in someone else's name cannot hurt them. Just do it.
- **Access:** the export is personal data, so send it only to the address it
  is about. If the request came from that address, reply to it. If it came
  from somewhere else, reply asking them to write again from the address in
  question (or, for several addresses on a company domain, from an address on
  that domain). Do not ask for ID documents.

## Running the commands

The commands run on the VPS against the production database (`DATABASE_URL`
in `/opt/nvoke/.env`), which the CLI only uses with `--prod`; the `nv`
helper below adds it. They print the database host first; check it.

```bash
ssh vps-eu-1
cd /opt/nvoke/app
nv() { sudo -u nvoke env PATH=/opt/nvoke-node/bin:$PATH HOME=/opt/nvoke \
  bash -c 'set -a; . /opt/nvoke/.env; set +a; exec corepack pnpm --silent --filter @nvoke/server cli "$@" --prod' _ "$@"; }

nv privacy export jane@acme.dk > /tmp/export.json   # access
nv privacy erase jane@acme.dk                        # erasure or objection
nv privacy erase acme.dk                             # a whole domain and its subdomains
nv privacy suppress-domain acme.dk                   # stop crawling, keep company rows
```

`erase` and `suppress-domain` take `--source email` (the default),
`opt_out_page`, `bot_page` or `admin`. Both are idempotent: if one fails
halfway, run it again.

What each does:

- `export` prints JSON: suppression entries, cached copies (where the address
  was published, first and last seen), every copy in a customer search (which
  customer, when, the source page, verification result), the verification
  cache and the billing ledger.
- `erase <address>` adds the address to the suppression list (stored as a
  sha256 hash only) and deletes it from customer searches, the shared cache,
  the verification cache and the billing ledger. Search counters are
  recounted.
- `erase <domain>` does the same for every address on the domain and its
  subdomains, and also deletes the companies found on it from every
  customer's searches.
- `suppress-domain <domain>` adds the domain to the suppression list and
  deletes its cached and found addresses, but keeps company rows (name,
  website, phone) in existing searches.

The suppression list is kept forever. It is the only way to make sure a
crawl never collects the address again.

## What to send back

**Access:** attach the export (or paste it) and add, in plain words:

- Purpose: B2B prospecting research. Customers search for companies and see
  contact addresses published on those companies' own websites.
- Source: the public web page in `sourceUrl`.
- Recipients: the nvoke customers listed under `searches` (say how many; do
  not name them unless asked and you have a basis to).
- Retention: shared cache 12 months from first seen, customer searches 12
  months, verification results 30 days, billing record 12 months.
- Their rights: erasure, objection, complaint to Datatilsynet
  (datatilsynet.dk).

Then delete `/tmp/export.json`.

**Erasure or objection:** "We have deleted <address> from nvoke and added it
to our suppression list, so it will not be collected again. Customers who
exported it before today hold their own copies; we cannot delete those."

**Domain:** the same, for "every address on <domain> and its subdomains".

## Logging

Keep a request log outside the repo (a private spreadsheet is fine) with:
date received, type, date answered, the command run, and the outcome. Refer
to the person by the mail thread, not by copying their address into the log.
Keep the mail thread itself for 3 years as proof the request was handled,
then delete it.
