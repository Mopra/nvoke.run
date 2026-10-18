# Search more

A search is a list you build, not a one-off. When a search ends with few
companies, the user widens it in place and the new finds join the same list.

## Results screen

- **Search more** sits under the numbers of every ended search (`done`,
  `failed`, `canceled`) that a drop did not make, in the `...` menu, in the
  failed banner next to Run again, and as the action of the empty state.
- When the search ended with none, or under half of its limit, a line next
  to the button invites it: "Only 12 so far. Widen it: another place or
  trade adds to this list." The wording follows the kind.
- The button swaps the numbers for the New search sentence of the search's
  kind (`components/SearchForm.tsx`, shared with New search), filled with
  the latest run's words. The kind is fixed. The limit reads "up to N more".
  A list starts empty: paste what is new. Escape or Cancel closes it.
- Submit sends `POST /v1/searches/:id/more`. The returned search replaces
  the cached one (search and list), the editor closes and the screen goes
  live again: polling, progress, aura. A toast names the run.
- Under the title, a search with more than one run lists each run's title
  and how many companies it added (`RunsLine`, from `runsAdded`).
- Errors toast with the API's message: `search_running`, `kind_mismatch`,
  `source_unavailable`, and `quota_exceeded` with Upgrade.
- Run again stays: it still starts a separate search.
- **Continue** sits next to Search more on a stopped (`canceled`) search
  of a kind that has a limit (not a pasted list) and that stopped short of
  it. It sends `/more` with the latest run's words and the rest of that
  run's limit, so the search goes on where it left off, into the same list,
  without the editor (`continueInput` in `components/SearchMore.tsx`). The
  Stop key on a running search is red. A stopped describe search gets the
  same Continue key next to its "Keeps finding new leads" switch; it turns
  the switch on, which is how such a search goes on (docs/desktop/people.md).

## Local copy

A search that runs again holds companies the local copy never fetched.
`LocalStore.replaceSearches` drops the synced mark of a stored search that
turns active or whose `runs` grew, so the API serves its companies until
the next sync fetches them. That covers a run that started and finished
between two sync passes.

## Mock and capture

The mock transport answers `/more` like the server: the run counts from the
companies the search holds, new companies are made from the new run's
words, and `runs` is filled. `capture` shoots `08e-search-more` (the
editor) and `08f-search-more-running` last, since it sends the demo search
running again.
