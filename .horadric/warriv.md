# Warriv's memory

## Rules

- A session's blocked --on can glue its reason into the After: title; when the named quest is done, just tell the session to go on.
- Quests touching native OS APIs (UI Automation, OCR, local MCP pipe, hidden render windows) get opus; plain Electron settings and UI wiring get sonnet.
- Merge fix-up quests get sonnet.

## Lately

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

- CSV drop merge fix should land; the real OS drop and the enriched file write were never tested by hand, and a CSV dropped mid search is lost if the app quits (jobs live in the renderer).
- "Desktop: live in the tray and start at login" was never checked on screen (tray menu, Account start-at-login switch). Capture now retries and says so clearly when the display is locked; the human should run capture with the screen on and look at the tray and Account shots.
- Check the notifications merge fix lands; the Account notifications switch and badge were never seen on screen either.
- Hotkey merge fix landed; the quick command window and the Account shortcut row were never seen on screen.
- Check the second local SQLite merge fix ("Fix the merge of fix-the-merge-of-desktop-local-sqlite") lands; its screens were only checked offscreen, never with capture.
