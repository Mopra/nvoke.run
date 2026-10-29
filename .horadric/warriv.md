# Warriv's memory

## Rules

- A session's blocked --on can glue its reason into the After: title; when the named quest is done, just tell the session to go on.
- Quests touching native OS APIs (UI Automation, OCR, local MCP pipe, hidden render windows) get opus; plain Electron settings and UI wiring get sonnet.
- Merge fix-up quests get sonnet.
- Desktop features live in one file per feature (ipc/features, preload/features, main/features, screens/account, capture/shots, docs/desktop); new desktop quests should add files there and may run in parallel.
- Quest notes that change code say to edit with the Edit tool, not Python or perl scripts (they write CRLF and garble UTF-8 here, lore #93).
- When telling a session to run checks, tell it to wait for its heavy run in the same turn and report completed, never to stop and wait.

## Lately

- 2026-10-29 Hourly round: no change. Only the clip 1 verdict is open, the owner's; main fd3d191 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Hourly round: no change. Only the clip 1 verdict is open, the owner's; main bfc48fd is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Round as the human left: no change. Only the clip 1 verdict is open, the owner's; main 4499f1e is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Hourly round: no change. Only the clip 1 verdict is open, the owner's; main 3852da6 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Round as the human left: no change. Only the clip 1 verdict is open, the owner's; main f414692 is 175ef1c plus memory, green. Nothing to do. Compacted memory.
- 2026-10-29 Hourly round: no change. Only the clip 1 verdict is open, the owner's; main 7b6259f is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Round as the human left: no change. Only the clip 1 verdict is open, the owner's; main 5ea85a9 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Hourly round: no change. Only the clip 1 verdict is open, the owner's; main 9df2e12 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Hourly round: no change. Only the clip 1 verdict is open, the owner's; main 6920088 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Round as the human left: no change. Only the clip 1 verdict is open, the owner's; main 0a2c523 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Hourly round: no change. Only the clip 1 verdict is open, the owner's; main e400fdb is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Hourly round: no change. Only the clip 1 verdict is open, the owner's; main c700551 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Round as the human left: the human marked the names cleanup, Common Crawl measure and Day3 retry quests done. Only the clip 1 verdict is open, the owner's. Main 1b56059 is 175ef1c plus memory, green. No aim open, nothing to file.
- 2026-10-29 Hourly round: no change. All four open quests still wait on the owner; main cded6d1 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Round as the human left: no change. All four open quests still wait on the owner; main d63f969 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Round as the human left: no change. All four open quests still wait on the owner; main 1db83f6 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Round as the human left: nothing moved since the last round. All four open quests wait on the owner (clip 1 verdict, CC trial resume, names fix deploy and prod run, server deploy for Day3). Main 4209f47 is 175ef1c plus memory, green. Nothing to do.
- 2026-10-29 Hourly round: all four open quests wait on the owner (clip verdict, CC trial resume, names fix prod run, server deploy for Day3). Main 4ff33d7 is 175ef1c plus memory, already green. Nothing to do.
- 2026-10-29 Round after names fix merge landed (175ef1c, checks green). Noted the names cleanup quest now waits only on the owner's deploy and prod run. Other three still wait on the owner.
- 2026-10-29 Round after hotspot split landed (main 657cc81, checks green). Names fix d9141b8 still unmerged and conflicts with the split CLI: filed 'Merge cli names fix (d9141b8) onto main's split CLI' (sonnet, full checks). Others still wait on the owner.
- 2026-10-29 Round after personal emails landed (db525a8, migration 1899) as the human left. Noted the Day3 rewrite now waits only on the human's server deploy (its wake check resumes it). Hotspot split fix-up still runs; checks quest waits for it.
- 2026-10-29 Hourly round: both merge fix-ups (personal emails, hotspot split) still run, main at 5cd875a plus memory commits. Three quests wait on the owner, Day3 rewrite waits on the personal emails merge and deploy. Nothing to do.
- 2026-10-29 Woken: personal emails merge fix-up stopped while its checks queued behind another heavy run (cherry-pick done, migration renamed to 1899). Told it to wait in the same turn, delete the branch and report completed.
- 2026-10-29 Woken: hotspot split finished but conflicted in cli.ts with 3dea710 (sending campaign own search). Fix-up already running; told it to port that change into cli/sending.ts.
- 2026-10-29 Earlier: personal emails (db525a8), hotspot split (657cc81), founders campaign (3dea710, 0ae0bd53 in review), new launches fix (5cd875a) and names fix (175ef1c) landed after merge fix-ups, all green. Told stalled sessions to wait in the same turn. Left the names prod cleanup and the B2B pause with the owner.
- 2026-10-28 Checks on main after template campaigns and lead move: green at f084fb7. Common Crawl resume left with the owner. 5 lore notes (#88 to #93), CRLF trap hit three sessions.
- 2026-10-27 Writer fixes, fixed text campaigns, footer language, Microsoft 365 OAuth and full API CRUD landed green (6a8a11c, 8637547, 26709c2, fb1d7dc). Many quiet rounds. 4 lore notes (#75 to #78).
- 2026-10-26 Own Claude key and own search key checked green at b7277ed. Quiet rounds otherwise.
- 2026-10-23 Quiet rounds, main green at 013e55f. 9 lore notes (#63 to #71).
- 2026-10-22 Checks green after Sonar and black key (a5d760c), pipeline and Majestic seed (753f866), Common Crawl index (8f58c67), Postgres 18 move (013e55f). Owner stopped the 100k Common Crawl trial. Day3 and exit1 campaigns landed. 3 lore notes (#53 to #55).
- 2026-10-21 /app 404 fix (6584776) and sending, cost and pricing checks green at 19b9849.
- 2026-10-20 Checks quests after WCAG, studio teaser, SMTP relay, test reel and world cut, all green (b599672 last). Held checks while the human's sending work was in flight. GA4 events landed (cc48271). 5 lore notes (#40 to #44).
- 2026-10-19 Site display look checks filed; quiet rounds at green 261ecfd.
- 2026-10-18 Day: after each batch of the human's direct commits (guarded fetch, free search fallback, registry keys dropped, working scene, US/UK examples, launch film and teaser, Field look, searches table, type scale, site device look) filed a 'Checks on main after ...' quest (sonnet); all landed green, one tiny fix (4769fea). Held checks back while the human had half done work dirty in the tree. Brave top-up (402) blocked, with the human. Desktop v0.1.1 and v0.1.2 shipped by the human.
- 2026-10-17 Day: filed Go public quests (Openers, Journey check, Dev DB UTF8, Local leads website lookup, Desktop render crawl benchmark); settled many merge fix-ups (sonnet, keep both sides, merge newest main last) and stalls only waiting on own agents. Crawl hit rate 60.0% to 66.9%. Marked Go public reached once local leads merged (4f69814). Registry keys blocked on accounts (later dropped by the human). Checks quests after Search more, phone layouts and lead quality work, all green.
- 2026-10-16 Quiet: only the macOS test, with the human; human's own GA4 consent and video plan commits.
- 2026-10-14 Week of desktop native features: OCR grab, notifications, front-tab hotkey, watched inbox, local SQLite copy, local render crawl, local lead search and MCP landed after many merge fix-ups in the shared desktop files. Look back led to the per-feature split (17661b4) and its rule. macOS Grab test needs a Mac, with the human (dropped 2026-10-17). Many quiet hourly rounds.
- 2026-10-13 Round after round of merge fix-ups (tray, hotkey, notifications, SQLite, CSV drop, local MCP) given sonnet; filed the capture UnknownVizError quest; set Model lines on 9 native-app quests.

## Open

- Name cleanup quest marked done by the human 2026-10-29 (175ef1c); not confirmed whether the prod --apply ran.
- B2B outbound campaign 0989f5a9 re-paused 2026-10-29; check it stays paused. Founders campaign 0ae0bd53 landed in status review (0 overlap, enroll skips companies the sender wrote to in 90 days); the owner reads its first emails and starts it.
- Server deployed at f084fb7 by the human (writer fix, templates, lead move live); checked green at f084fb7 on 2026-10-28.
- Full API CRUD (90add6a) and Microsoft mailbox OAuth (6a8a11c, admin consent 8637547): green at 8637547 2026-10-27, deployed with the Entra values in the VPS .env (lore #88); no real mailbox sent or read yet.
- Own Claude key and own search key (1d00d96 to b7277ed, 2026-10-26): checked green at b7277ed and deployed; never seen on screen, no live Anthropic or Serper call yet. OptiPeople (mpg@optipeople.dk) is on emails_60000 and in SENDING_USERS; the owner's own Clerk plan emails_100000 is invalid (asked them whether to change it to emails_60000, the human's).
- Square promo clips: clip 1 at ~/Downloads/nvoke-clip-1-emails.mp4, engine unmerged on branch square-promo-video-clips-in-the-tools (aa2d1f2); waits on the owner's verdict before clips 2 to 4.
- Day3 and exit1 campaigns landed (fd7a709 to 2f2c5ad, 2026-10-22), internal only; Sonar and the black key checked green at a5d760c; pipeline, recheck and Majestic seed green at 753f866; seed and Common Crawl index green at 8f58c67 (2026-10-22); Postgres 18 move green at 013e55f.
- Common Crawl: 100k trial load stopped by the owner at 554 rows (403s from Common Crawl), resumable from /opt/nvoke/cc on the VPS; resume or undo is the owner's. Both trial and measure quests marked done by the human (2026-10-29), outcome unrecorded; and the full 20M load spend (VPS Postgres disk now, since 013e55f) goes to the owner.
- Production OpenRouter out of credits since 2026-10-21: Describe your customer and the people step fail until the owner tops up.

- Sending (internal only since b7cecd4), cost, pricing and people job work by the human, 8ce3cc9 to 19b9849. File no sending quests without an Aim. Checked green at 19b9849 on 2026-10-21.
- GA4 sign_up and file_download events landed (cc48271) and were pushed live; file_download is a key event, sign_up can be starred in GA4 Admin only after the first one arrives (the human's).
- Brave prepaid credit empty since 2026-10-18 (402): the human tops up and runs nv sources resume brave --prod. Free search fallback (Mwmbl) landed in 94a8266, shipped with the 2026-10-20 server deploy.
- Go public aim reached (2026-10-17); site, server and desktop 0.1.3 shipped 2026-10-20. 55 quests landed since the last ship; shipping is the human's.
- /app 307 redirect fix (6584776) not live until the site deploys; Wolf Valencia (qa-audit.com) reported it. The human's.
- SMTP relays (b4611da) need vps-us-1 set up and SMTP_RELAYS in the VPS .env (deploy/README.md); the human's.
- Journey check landed (2678983); sign-up form for a new account never exercised. Shipped 2026-10-20.
- Openers landed (8672ee6, b1b1d38); never seen live.
- Start from your website landed (85efa14); its Claude calls go through OpenRouter (OPENROUTER_API_KEY, noted as set on the VPS). Its screens and a live site profile never seen; live on nvoke.run since 2026-10-20.
- OCR grab landed (1dbb036); its screens never seen with capture. macOS Grab test dropped by the human (2026-10-17): fix on bug reports.
- CSV drop landed (e1a8d2c); the real OS drop and the enriched file write were never tested by hand, and a CSV dropped mid search is lost if the app quits (jobs live in the renderer).
- "Desktop: live in the tray and start at login" was never checked on screen (tray menu, Account start-at-login switch). The human should run capture with the screen on and look at the tray and Account shots.
- Notifications landed (9d23c82, f0613da); the Account notifications switch and badge were never seen on screen.
- Hotkey merge fix landed; the quick command window, the Account shortcut row and the copied-domain lookup (9c23b6d) were never seen on screen.
- Front-tab hotkey landed (be23bea). Never verified: macOS AppleScript path, Firefox and Brave, the real hotkey over a live window.
- Watched inbox landed (7c41ce0). Never verified: the real folder watch in Electron, OS notifications, capture of the Account inbox row.
- Local SQLite copy landed (f749f19); its screens were only checked offscreen, never with capture.
- Local lead search landed (6031ccd); its command bar results never seen on screen beyond capture typing.
- Per-feature split landed (17661b4); watch whether the next desktop quests still conflict on merge.
- Results screen closest() fix landed (ce13749); its capture log was not seen clean.
- Local render crawl landed (42fa77c). Never seen: the hidden render window against a live site, and capture of the Account opt-in.
