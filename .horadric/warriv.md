# Warriv's memory

## Rules

- A session's blocked --on can glue its reason into the After: title; when the named quest is done, just tell the session to go on.
- Quests touching native OS APIs (UI Automation, OCR, local MCP pipe, hidden render windows) get opus; plain Electron settings and UI wiring get sonnet.
- Merge fix-up quests get sonnet.
- Desktop features live in one file per feature (ipc/features, preload/features, main/features, screens/account, capture/shots, docs/desktop); new desktop quests should add files there and may run in parallel.
- When telling a session to run checks, tell it to wait for its heavy run in the same turn and report completed, never to stop and wait.

## Lately

- 2026-10-17 Round after 'Checks on main after lead quality and ongoing searches' landed: done with no fix commits, read as green at d98544d. Log dry but for the registry keys (human's), no aim open. Nothing to file; shipping is the human's.
- 2026-10-17 Round as the human left: tree clean, the human committed never short, Who do you sell to? and the verifier fix (4c3b405 to d98544d) unchecked, so filed 'Checks on main after lead quality and ongoing searches' (sonnet). Registry keys still with the human.
- 2026-10-17 Round as the human left: the human committed the lead quality work (542be05 eval, 1d23e4f people, 73f76dd describe your customer, 27f016c ongoing searches schema) but 87 files are still dirty (ongoing searches mid build). Did not file checks: they would run against half done work in the shared tree. Registry keys still with the human.

- 2026-10-17 Round as the human left: unchanged (only registry keys, with the human; no aim; main only memory commits past checked 5247bab). Nothing to do; shipping is the human's.
- 2026-10-17 Hourly round: unchanged (only registry keys, with the human; no aim; main only memory commits past checked 5247bab; lead quality work still uncommitted in the tree). Nothing to do; shipping is the human's.
- 2026-10-17 Round after 'Checks on main after the phone layouts' landed: done with no fix commits, read as green at 5247bab. Log dry but for the registry keys (human's), no aim open. Nothing to file; shipping is the human's.
- 2026-10-17 Round as the human left: the Search more checks landed; the human then committed phone layouts (18fa1b4, cf76931) unchecked, so filed 'Checks on main after the phone layouts' (sonnet). Registry keys still with the human; large uncommitted lead quality work sits in the shared tree (not a quest). Shipping is the human's.

- 2026-10-17 Registry keys quest (Companies House, CVR) blocked on accounts only the human can register; left with them, noted it does not block people data.
- 2026-10-17 Hourly round: the human committed Search more (POST /v1/searches/:id/more), /vs pages and UX polish straight to main (4f69814 to 13b0a8f), unchecked. Filed 'Checks on main after Search more and UX polish' (sonnet).
- 2026-10-17 Hourly round: unchanged (17 done, none open, no aim; no code commits past checked 4f69814). Nothing to do; shipping is the human's.
- 2026-10-17 Hourly round: unchanged (17 done, none open, no aim; no code commits past checked 4f69814). Nothing to do; shipping is the human's.
- 2026-10-17 Hourly round: unchanged (17 done, none open, no aim; main only memory commits past checked 4f69814). Nothing to do; shipping is the human's.
- 2026-10-17 Round as the human left: Checks on main done with no report and no commits (code unchanged since 4f69814), read as green. Log dry, no aim open, nothing to file; shipping is the human's.
- 2026-10-17 Round as the human left: log dry, no aim. Main unchecked after 29 landings, so filed 'Checks on main before the next ship' (sonnet). The human dropped the macOS Grab test (fix on bug reports).
- 2026-10-17 Round after the place lookup merge landed: nothing new since the last wake (all 16 done, no aim open). Nothing to do; 29 quests since the last ship, shipping is the human's.
- 2026-10-17 Woke on a dry log: local leads merge landed (6984c31 to 4f69814), so every part of Go public is on main. Marked the aim reached. Filed nothing; it still needs a ship to reach nvoke.run, which is the human's.
- 2026-10-17 Local leads (38% to 56% per OSM place) conflicted on merge in cli.ts; told its fix-up to keep both sides, check in one turn and merge newest main last.
- 2026-10-17 Woke on a dry log: every part of Go public has landed except the local leads merge fix (in the log as started, worktree branch with no commits yet). Gave it sonnet, filed nothing, aim stays open until it lands. Turnstile secret is set (done by the main session).
- 2026-10-17 Round after the desktop render crawl landed (422d1a5): combined hit rate 62.2% to 66.9%; local crawl now on by default (session's Assumed line, the human may overrule). Only 'Local leads' still running; aim stays open until it lands. Nothing to file. 28 quests since the last ship, shipping is the human's.
- 2026-10-17 Round after the crawl hit rate merge fix landed (50347ae): gain was small (60.0% to 62.2%), so filed its two named levers for the aim, side by side: 'Local leads: find the website of places that list none' (opus, server) and 'Desktop render crawl: count it in the benchmark and send it more companies' (opus, desktop). 27 quests since the last ship, shipping is the human's.
- 2026-10-17 Crawl hit rate finished (60.0% to 62.2%) but conflicted on merge; fix-up already running, gave it sonnet and told it to keep both sides, adapt site profile callers, check in one turn and merge newest main last.
- 2026-10-17 Round as the human left: Dev DB UTF8 landed (bed77ad). Only crawl hit rate running; three blocks with the human (macOS test, Push leads, Turnstile secret). Aim waits on crawl hit rate. Nothing to do; 26 quests since the last ship, shipping is the human's.

- 2026-10-17 Round after Journey check landed (2678983): openers fixed (thinking tokens), signed-in sign-up redirect, tool CTAs. Filed 'Dev DB: embedded Postgres in UTF8 on Windows' (sonnet) from its Not changed list. Crawl hit rate still running; aim stays open until it lands. 25 quests since the last ship, shipping is the human's.
- 2026-10-17 Crawl hit rate stopped after an uncommitted sample retry fix with nothing running; told it to commit, rerun failed countries once, then freeze the sample (shortfall noted) and go on to baseline and improvements without stopping.
- 2026-10-17 Round as the human left: journey check now running, crawl hit rate running, three blocks with the human. Nothing to do.
- 2026-10-17 Round after Openers landed (8672ee6, b1b1d38): Push leads blocked by its own timebox, left with the human (aim is met without it). Filed 'Journey check: paste your site to a CSV with openers, end to end' (sonnet) for the aim. Crawl hit rate still running. 24 quests since the last ship, left shipping to the human.
- 2026-10-17 Crawl hit rate stopped again, only waiting on its own web sample slice after stopping a duplicate watcher; noted, no message sent.
- 2026-10-17 Crawl hit rate stopped again, only waiting on its own web and local sample slices; noted, no message sent.
- 2026-10-17 Openers per company stopped again, only waiting for its own review agent (8a6cfc1, tests green); noted, no message sent.
- 2026-10-17 Openers per company stopped only to wait for its own desktop agent; noted, no message sent. Its Assumed lines (domain_pages text cache, verbatim quote guard, no separate opener cap) stand.
- 2026-10-17 Crawl hit rate stopped again, only waiting on its own Hamburg Overpass retry; noted, no message sent.
- 2026-10-17 Round after Start from your website landed (85efa14): Openers now running (opus), crawl hit rate running, Push leads waits on Openers, Turnstile and macOS test with the human. Nothing to file; 23 quests since the last ship, left shipping to the human.
- 2026-10-17 Crawl hit rate stopped mid sample build (Overpass timeouts, 4 of 10 local queries); gave it opus and told it to cache and retry, accept a short local share, freeze the sample and go on with a commit per step.
- 2026-10-17 Start from your website finished but conflicted on merge; fix-up already running, gave it sonnet and told it to keep both sides, renumber its migration if needed, check in one turn and merge newest main last.
- 2026-10-17 Start from your website stopped again, only waiting for its desktop screens agent; noted, no message sent.
- 2026-10-17 Start from your website stopped only to wait for its own three background agents; noted, no message sent.
- 2026-10-17 Round after free tool pages landed (2582b1e): Turnstile blocked as expected on the VPS secret, left with the human. Start from your website and crawl hit rate running, Openers and Push leads waiting. 22 quests since the last ship, left shipping to the human.
- 2026-10-17 Free tool pages finished but conflicted on merge; fix-up already running, gave it sonnet and told it to keep both sides, check in one turn and merge newest main last.
- 2026-10-17 Free tool pages stopped to wait for its own review (5da0c53, tests green); told it to finish the review, recheck and mark done in one turn.

- 2026-10-17 Look back: the day was clean (1 done, 1 merged, nothing repeated); the day gave 3 lore notes (never send, worktree install and vitest root, ANTHROPIC_API_KEY on the VPS).
- 2026-10-17 Round after the Claude client foundation landed (966628d): Start from your website, free tools and crawl hit rate running; set models on Openers (opus), Push leads (sonnet), Turnstile (sonnet). 21 quests since the last ship, left shipping to the human.

- 2026-10-16 Look back: the day was clean (0 quests done, 0 merged, nothing repeated).
- 2026-10-16 Hourly round: unchanged (only the macOS test, with the human; no aim open). Main moved only by the human's own commits (GA4 consent, demo video plan). Nothing to do; 20 quests since the last ship, left shipping to the human.
- 2026-10-15 Woke again for the macOS Grab test block; already with the human with notes, nothing else open, no aim. Nothing to do.
- 2026-10-14 Hourly round: unchanged (only the macOS test, with the human; no aim open). Nothing to do; 20 quests since the last ship, left shipping to the human.
- 2026-10-14 Hourly round: unchanged (only the macOS test, with the human; no aim open). Nothing to do; 20 quests since the last ship, left shipping to the human.
- 2026-10-14 Round as the human left (again): unchanged (only the macOS test, with the human; no aim open). Nothing to do; 20 quests since the last ship, left shipping to the human.
- 2026-10-14 Round as the human left: unchanged (only the macOS test, with the human; no aim open). Nothing to do; 20 quests since the last ship, left shipping to the human.
- 2026-10-14 Hourly rounds (three in a row): unchanged (only the macOS test, with the human; no aim open). Nothing to do; 20 quests since the last ship, left shipping to the human.
- 2026-10-14 Woke again for the macOS Grab test block; already handed to the human with notes, nothing else open. Nothing to do.
- 2026-10-14 Hourly round: only the human's direct Linux executable fix (5d27f5d) since the last round; macOS test still with the human, no aim open. Nothing to do; 20 quests since the last ship, left shipping to the human.
- 2026-10-14 Hourly rounds (six in a row): unchanged (only the macOS test, with the human; no aim open; no checks stone exists to cast). Nothing to do; 20 quests since the last ship, left shipping to the human.
- 2026-10-14 Hourly round: nothing moved since the per-feature split landed (only the macOS test, with the human; no aim open). Nothing to do; 20 quests since the last ship, left shipping to the human.
- 2026-10-14 Round after the per-feature split landed (17661b4): dropped the --after chaining rule. Only the macOS test remains, with the human; no aim open. 20 quests since the last ship, left shipping to the human.
- 2026-10-14 Per-feature split finished but conflicted on merge; fix-up already running, gave it sonnet and told it to keep the split layout, fold main's newer additions into the feature files, check in one turn and merge newest main last.
- 2026-10-14 Round after local lead search landed (6031ccd, 6f6e0ed): split refactor running on opus, macOS test with the human, no aim open. Nothing to do; 19 quests since the last ship, left shipping to the human.
- 2026-10-14 Local lead search finished but conflicted on merge; fix-up already running, gave it sonnet and told it to keep both sides, check in one turn and merge newest main last. The split refactor waits on it.
- 2026-10-14 Look back: 19 merge conflicts all in the desktop hotspot files (contract, preload, main/index, Account, capture, SPEC); filed 'split the IPC contract, preload, main wiring and Account into one file per feature' (opus, after local search). Local search quest stalled a third time with work uncommitted on f749f19; told it to commit, merge main, check and report in one turn. Two rules added.
- 2026-10-14 Hourly round: still unchanged (local lead search running, macOS test with the human, no aim open). Nothing to do; 18 quests since the last ship, left shipping to the human.
- 2026-10-14 Hourly round: nothing moved since the last one (local lead search still running, macOS test still with the human, no aim open). Nothing to do; 18 quests since the last ship, left shipping to the human.
- 2026-10-14 Round after the results screen closest() fix landed (ce13749): local lead search still running, macOS test still with the human, no aim open. Nothing to do; 18 quests since the last ship, left shipping to the human.
- 2026-10-14 Round: local lead search still running, macOS test still with the human. Filed 'fix target?.closest is not a function' (sonnet) from the capture check's unfiled finding. 17 quests since the last ship; left shipping to the human.
- 2026-10-14 Round after the local render crawl merge fix landed (42fa77c): local lead search still running, macOS test still with the human, no aim open. Nothing to do; 17 quests since the last ship, left shipping to the human.
- 2026-10-14 Local render crawl finished but conflicted on merge; fix-up already running, gave it sonnet and told it to keep both sides (refused and js_only beside blocked) and merge newest main last.
- 2026-10-14 Round after the osascript error quest landed (5ed455b): 2 running with models, macOS test still with the human, nothing to do. 16 quests since the last ship; left shipping to the human.
- 2026-10-14 Round after the OCR grab landed (1dbb036): told 'show the real osascript error' to merge main and go on. 15 quests since the last ship; left shipping to the human.
- 2026-10-14 OCR grab merge fix conflicted too (contract, capture, main, preload, desktop.ts, SPEC). Second fix-up running: gave it sonnet, told it to keep both sides and merge newest main last.
- 2026-10-14 macOS Grab test blocked: needs a Mac, left with the human. Filed 'show the real osascript error' (sonnet, after the OCR merge fix) for the one watch point that needs no Mac. Notifications landed (9d23c82, f0613da).
- 2026-10-14 Round after the front-tab hotkey merge fix landed (be23bea) and the capture check landed (bf05ff2): OCR grab conflicted on merge, gave its fix-up sonnet and told it to keep both sides and merge newest main last; gave the macOS Grab test quest opus.
- 2026-10-14 Round as the human left: 6 running (two notifications/hotkey merge fixes, OCR grab, local render crawl, local lead search, MCP capture check), all with models, nothing blocked, no aim open. Nothing to do.
- 2026-10-14 Fourth notifications merge fix conflicted too (contract, main, preload, Account, SPEC). Fifth fix-up running: gave it sonnet, told it to keep both sides, merge newest main last and finish at once.
- 2026-10-14 Third notifications merge fix conflicted too (contract, main, preload, api, bridge, mock, types, Account, SPEC). Fourth fix-up already running: gave it sonnet, told it to keep both sides and merge newest main last.
- 2026-10-14 Round after the watched inbox merge fix landed (7c41ce0): 6 running, nothing blocked, nothing to do.
- 2026-10-14 Local lead search quest stopped again, still only waiting on its queued tests; no new message sent.
- 2026-10-14 Local lead search quest stopped only to wait for tests queued behind the capture check's heavy job; gave it sonnet and told it to finish when they report.
- 2026-10-14 Second notifications merge fix conflicted too (contract, main, preload, Account, SPEC). Third fix-up already running: gave it sonnet, told it to keep both sides and merge newest main last.
- 2026-10-14 Front-tab hotkey merge fix conflicted again (preload, SPEC). Second fix-up already running: gave it sonnet, told it to keep both sides and merge newest main last.
- 2026-10-14 Watched inbox quest finished but conflicted on merge; fix-up already running, gave it sonnet and told it to keep both sides and merge newest main last.
- 2026-10-13 Round after /docs/mcp landed (3658b05): 7 running, nothing blocked, nothing to do.
- 2026-10-13 Round after the local MCP merge fix landed (4876049): its check and /docs/mcp quests started; gave both sonnet. 7 running, nothing blocked.
- 2026-10-13 Front-tab hotkey quest finished but conflicted on merge; fix-up already running, gave it sonnet and told it to keep both sides and merge newest main last.
- 2026-10-13 Notifications merge fix conflicted too (contract, main, preload, App, Account, SPEC). Second fix-up already running: gave it sonnet, told it to keep both sides and merge main last.
- 2026-10-13 Local MCP quest finished but conflicted on merge; fix-up already running, gave it sonnet and told it to merge newest main last.
- 2026-10-13 Round after the fourth SQLite merge fix landed (f749f19): 7 running, nothing blocked, nothing to do.
- 2026-10-13 Third SQLite merge fix conflicted too (contract.ts, preload). Fourth fix-up already running: gave it sonnet, told it to keep both sides and merge main as its very last step.
- 2026-10-13 Round after the CSV drop merge fix landed (e1a8d2c): gave the third SQLite fix-up sonnet; 7 running, 1 waiting on it, nothing else to do.
- 2026-10-13 Woke with a cut-off message that named no event; quest list unchanged since the last round, both blocked quests still wait on running merge fixes. Nothing to settle.
- 2026-10-13 Round after "hotkey looks up a copied domain" landed: SQLite merge conflicted a third time; told the third fix-up to merge newest main right before finishing. Everything else running or waiting cleanly.
- 2026-10-13 CSV drop quest conflicted on merge; fix-up already running, gave it sonnet. Its Assumed lines (no XLSX, extra domain column, jobs in renderer) stand as written.
- 2026-10-13 SQLite merge fix-up conflicted again (main moved under it); second fix-up already running, gave it sonnet.
- 2026-10-13 Round: 6 running, 1 waiting cleanly on the SQLite merge fix, notifications and SQLite fixes still running, nothing to do.
- 2026-10-13 "Hotkey looks up a copied domain" got a tangled After: line from its own blocked --on; hotkey merge fix had landed, so told it to bring in main and build.
- 2026-10-13 Local SQLite copy quest finished but conflicted on merge; fix-up already running, gave it sonnet.
- 2026-10-13 Hotkey quest finished but conflicted on merge; fix-up already running, gave it sonnet.
- 2026-10-13 Notifications quest finished but conflicted on merge; fix-up already running, gave it sonnet.
- 2026-10-13 Round after the capture fix landed (retry plus a clear message when the display is locked): 6 quests running, nothing blocked, nothing to do.
- 2026-10-13 Round after "search kind domains" landed: 7 quests running, 3 waiting, nothing blocked, nothing to do.
- 2026-10-13 Round after the tray merge fix landed: 7 quests running, nothing blocked, nothing to do.
- 2026-10-13 Tray quest finished but conflicted in main/index.ts; fix-up already running, gave it sonnet. Capture UnknownVizError hit a second quest, so filed "Desktop: find why capture fails with UnknownVizError".
- 2026-10-13 Look back: the day was clean (1 quest done, 1 merged, nothing repeated).
- 2026-10-13 Round after "drag leads out" landed: nothing blocked. Set Model lines on the 9 unstarted native-app quests.

## Open

- Registry keys (COMPANIES_HOUSE_API_KEY, CVR_USER/CVR_PASSWORD) with the human since 2026-10-17; UK and DK directors by name wait on them.
- Go public aim reached (2026-10-17) but not shipped. Shipping is the human's.
- Journey check landed (2678983); sign-up form for a new account never exercised. Go public needs a ship, which is the human's.
- Openers landed (8672ee6, b1b1d38); never seen live.
- Start from your website landed (85efa14); its Claude calls go through OpenRouter (OPENROUTER_API_KEY, noted as set on the VPS). Its screens and a live site profile never seen; needs a ship to reach nvoke.run.

- OCR grab landed (1dbb036); its screens never seen with capture. Osascript error quest landed (5ed455b). macOS Grab test dropped by the human (2026-10-17): fix on bug reports.
- Main checked green at d98544d (2026-10-17), ready for the human to ship (33 quests since the last ship).
- CSV drop landed (e1a8d2c); the real OS drop and the enriched file write were never tested by hand, and a CSV dropped mid search is lost if the app quits (jobs live in the renderer).
- "Desktop: live in the tray and start at login" was never checked on screen (tray menu, Account start-at-login switch). Capture now retries and says so clearly when the display is locked; the human should run capture with the screen on and look at the tray and Account shots.
- Notifications landed (9d23c82, f0613da); the Account notifications switch and badge were never seen on screen.
- Hotkey merge fix landed; the quick command window and the Account shortcut row were never seen on screen.
- Hotkey copied-domain lookup landed (9c23b6d); never seen on screen.
- Local MCP, /docs/mcp and its capture check all landed (bf05ff2).
- Front-tab hotkey landed (be23bea). Never verified: macOS AppleScript path, Firefox and Brave, the real hotkey over a live window.
- Watched inbox landed (7c41ce0). Never verified: the real folder watch in Electron, OS notifications, capture of the Account inbox row.
- Local SQLite copy landed (f749f19) after four merge fixes; its screens were only checked offscreen, never with capture.
- Local lead search landed (6031ccd); its command bar results never seen on screen beyond capture typing.
- Per-feature split landed (17661b4); watch whether the next desktop quests still conflict on merge.
- Results screen closest() fix landed (ce13749); its capture log was not seen clean.
- Local render crawl landed (42fa77c). Never seen: the hidden render window against a live site, and capture of the Account opt-in.
