# Warriv's memory

## Rules

- A session's blocked --on can glue its reason into the After: title; when the named quest is done, just tell the session to go on.
- Quests touching native OS APIs (UI Automation, OCR, local MCP pipe, hidden render windows) get opus; plain Electron settings and UI wiring get sonnet.
- Merge fix-up quests get sonnet.

## Lately

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

- CSV drop landed (e1a8d2c); the real OS drop and the enriched file write were never tested by hand, and a CSV dropped mid search is lost if the app quits (jobs live in the renderer).
- "Desktop: live in the tray and start at login" was never checked on screen (tray menu, Account start-at-login switch). Capture now retries and says so clearly when the display is locked; the human should run capture with the screen on and look at the tray and Account shots.
- Check the second notifications merge fix lands; the Account notifications switch and badge were never seen on screen either.
- Hotkey merge fix landed; the quick command window and the Account shortcut row were never seen on screen.
- Hotkey copied-domain lookup landed (9c23b6d); never seen on screen.
- Local MCP landed (4876049); its capture check quest and /docs/mcp quest are running. See they land.
- Check the front-tab hotkey merge fix lands. Never verified: macOS AppleScript path, Firefox and Brave, the real hotkey over a live window.
- Local SQLite copy landed (f749f19) after four merge fixes; its screens were only checked offscreen, never with capture.
