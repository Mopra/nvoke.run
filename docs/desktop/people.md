# People first

nvoke used to hand back info@ and hello@. The server now returns named
people (`Email.person` with first name, last name, title and seniority),
how each address was found (`Email.foundVia`), how sure it is
(`Email.confidence`) and how well each company fits (`Company.fit`), with
decision makers first. The desktop shows people first and starts from a
plain words description of the customer.

## New search: Describe your customer

Plain `#/new` (New search, Cmd+N, the tray, the Searches empty state) opens
`screens/DescribeCustomer.tsx`:

- "Who do you sell to?" in display type over one large textarea. Enter finds
  leads, Shift+Enter breaks the line. Empty and submitted: "Say who you sell
  to first."
- Example pills under it fill the textarea. With a site profile on the
  account, the first pill is its audience, marked "From your site".
- Optional lines: What you sell (the site profile's `offer` stands in until
  the user types, marked "From your site"), Countries (chips plus the
  searchable `CountryPicker` in add mode; "any country" clears them) and
  Cities or regions (comma separated, up to 30).
- "Keep finding new leads", a switch, on by default.
- Primary action "Find leads": `POST /v1/searches` with kind `icp`, limit
  1000 (or the plan's cap when lower), then `PATCH /v1/searches/:id
  { ongoing: true }` when the switch is on (`useStartIcp`,
  `lib/start-search.ts`). The results open either way; a failed switch only
  toasts and the results screen has the switch too.
- "Other ways to search": Start from your website (`#/new?kind=website`),
  Local businesses, Web search, New launches, Paste a list (the manual form,
  `#/new?kind=local` and so on, which links back with "Describe your
  customer instead").

The command bar lists "Describe your customer" first among its actions. In
the quick window typed text offers "Find leads: ..." (an `icp` search,
limit 1000, switched to ongoing, its hint says "1,000 to start, then keeps
finding more") next to the web or local search. It comes first only when
the text reads like a description (five words or more, or joining words
like "with" and "that") and not like a local search, so "dental clinics
aarhus" keeps the web search first (`parseQuickIcp`, `lib/quick-search.ts`).

## Results

Columns: Company, People, Found on (Location for local searches), actions.

- Company: name, domain, and for scored companies a thin fit bar with
  "Strong fit", "Good fit", "Loose fit" or "Weak fit" (`fitLabel`); the
  number is in the tooltip.
- People: each person on two lines. Name, title and a quiet "Decision
  maker" badge (founder, executive, director: `isDecisionMaker`), then the
  address in monospace (click copies), how it was found and the
  verification badge. How found: "On their site" (page, or the crawl cache
  of an earlier search), "Pattern, server confirmed" (a pattern guess the
  mail server accepted) or "Pattern guess" (catch-all domain or not yet
  checked), with the long version on hover.
- Order: founders, executives, directors, managers, staff, other personal
  addresses, then role inboxes (`orderEmails`, `lib/people.ts`).
- Role inboxes are hidden where a company has a person. A company with no
  person shows its inboxes, marked "Role inbox" and "No named person found
  yet". The Role inboxes pill in the dock shows them everywhere.
- Dock filters, all pills: Decision makers, Verified (verification
  `valid`), Role inboxes. The text filter, the count, Export CSV, copy (Cmd
  or Ctrl C on selected rows), drag out and openers are as before. The CSV
  carries first_name, last_name, title, seniority, found_via and confidence.
- Decision makers and Verified are server filters (`decisionMakers=true`,
  `verification=valid` on `GET /v1/searches/:id/companies`), applied the
  same way by the local copy, so the count is always the filtered total.
  Under a filter a company showing only an inbox makes no "no person" claim,
  since its people may just have been filtered out.
- While a search runs only the first page of companies is polled every 2
  seconds; when rows were added past the last loaded page the whole list is
  read again every eighth poll, and once more when the search ends.
- A plain words search shows "Keeps finding new leads" with a switch under
  the numbers (`PATCH /v1/searches/:id`, optimistic, rolled back on error),
  hidden on a search the quota stopped. It stays disabled while any switch
  for that search is in flight, New search's own included. Errors toast at
  the hook, so they show even after the screen that asked is gone; the
  quick window, which has no toasts, says so under the progress. An ongoing
  search that ended is read again every minute.

## Live

- `Search.stageNote` is the progress line wherever one is shown
  (`progressCaption`): under the bar on the results, on the Searches row,
  in the quick window.
- The glass island shows the running search's title, its stage note (from
  1100px wide; narrower windows keep the small bar) and its verified count.
- Rows that arrive while a search runs rise in (`useFreshRows`); the first
  load and rows scrolled back into view stay still.
- Searches marks an ongoing search that ended with "keeps finding new
  leads".

## Local copy

Companies are stored whole as JSON, so person, foundVia, confidence and fit
survive the copy and the offline read. The narrow `tags` column holds a
format mark (` t3`) and `verification:kind:role` per email (role `dm`
decision maker, `pp` other named person, `na` no name) so the `people` and
`decisionMakers` filters run in SQL. On open, any search with rows lacking
the mark (written by an older app, which also stripped the people fields,
or by one after a downgrade) loses its stored companies and is marked
unsynced, so the next sync fetches it whole. A file that cannot be opened
or upgraded is deleted and refilled by sync.

## Mock and capture

The mock returns people with titles, seniority, found via and confidence,
catch-all domains whose pattern guesses stay guesses, fit on `icp`
companies, stage notes while an `icp` search runs (planning, directories,
web search, team pages, mail servers) and answers `PATCH` (400
`not_ongoing` for other kinds). It seeds an ongoing `icp` search that ended
and one that runs for a few minutes. `capture` shoots `04a` to `04d`
(Describe your customer, filled, the country panel, details) and `17` to
`17d` (the island with a stage note, a running and an ended `icp` search,
the Decision makers and Role inboxes filters).
