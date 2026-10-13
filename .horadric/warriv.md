# Warriv's memory

## Rules

- Quests touching native OS APIs (UI Automation, OCR, local MCP pipe, hidden render windows) get opus; plain Electron settings and UI wiring get sonnet.
- Merge fix-up quests get sonnet.

## Lately

- 2026-10-13 Hotkey quest finished but conflicted on merge; fix-up already running, gave it sonnet.
- 2026-10-13 Notifications quest finished but conflicted on merge; fix-up already running, gave it sonnet.
- 2026-10-13 Round after the capture fix landed (retry plus a clear message when the display is locked): 6 quests running, nothing blocked, nothing to do.
- 2026-10-13 Round after "search kind domains" landed: 7 quests running, 3 waiting, nothing blocked, nothing to do.
- 2026-10-13 Round after the tray merge fix landed: 7 quests running, nothing blocked, nothing to do.
- 2026-10-13 Tray quest finished but conflicted in main/index.ts; fix-up already running, gave it sonnet. Capture UnknownVizError hit a second quest, so filed "Desktop: find why capture fails with UnknownVizError".
- 2026-10-13 Look back: the day was clean (1 quest done, 1 merged, nothing repeated).
- 2026-10-13 Round after "drag leads out" landed: nothing blocked. Set Model lines on the 9 unstarted native-app quests.

## Open

- "Desktop: live in the tray and start at login" was never checked on screen (tray menu, Account start-at-login switch). Capture now retries and says so clearly when the display is locked; the human should run capture with the screen on and look at the tray and Account shots.
- Check the notifications merge fix lands; the Account notifications switch and badge were never seen on screen either.
- Check the hotkey merge fix lands; the quick command window and the Account shortcut row were never seen on screen.
