# Demo video plan

## Goal

Show one search going from two words to a CSV of working emails, in real time, with no talking. Viewers should leave knowing three things: it's two fields, it reads the companies' own websites, and every email is checked with the mail server.

Where it runs:

- **Homepage hero** (`apps/site/app/page.tsx`, under the tagline): the 15 to 20 second loop, muted, autoplay.
- **X and LinkedIn**: the full cut, plus the 1080x1350 vertical version for the feed.
- **Product Hunt**: the full cut as the first gallery item, with the loop as the thumbnail GIF.

## The demo search

**Local businesses: "Dentists" in "Austin, TX", limit 100.** It matches the homepage copy, OpenStreetMap covers it well, and dental practices publish `info@` and `frontdesk@` style addresses that verify cleanly.

Backup: "Physiotherapists" in "Manchester". Do a dry run first and use whichever one gives more valid emails. Never use a Danish target (Markedsføringsloven §10).

For the desktop shots: a **New launches** drop (last 7 days) and a Grab from screen over a "top startups" list.

## Full cut (75 seconds)

| # | Time | Shot | Caption |
|---|------|------|---------|
| 1 | 0 to 4 | Web app, empty New search screen, cursor in the first field | Find companies. Get emails that actually work. |
| 2 | 4 to 10 | Type "Dentists", then "Austin, TX", set the limit to 100, press Start | Two fields. That's the whole form. |
| 3 | 10 to 22 | Search progress: companies counting up, the iris aura rising | nvoke finds the companies and reads their own websites. |
| 4 | 22 to 32 | Results fill in, emails appear with sources (sped up 4x, with a "4x" tag) | Home, contact, about, team, imprint. Up to eight pages a site. |
| 5 | 32 to 42 | Verification badges flip to valid, catch-all, invalid. Zoom on a valid badge | Every address checked with its mail server. No guessing. |
| 6 | 42 to 50 | Filter to valid, the count reads "46 valid of 83" | Keep what works. Throw out the rest. |
| 7 | 50 to 56 | Export CSV, it opens in a spreadsheet | One click to your CRM. |
| 8 | 56 to 68 | Desktop: the quick window over another app, Grab from screen, then a drop notification | Desktop does more: grabs from your screen and drops fresh leads every morning. |
| 9 | 68 to 75 | End card: logo, nvoke.run, "50 verified emails free" | Start free. nvoke.run |

## Hero loop (18 seconds)

Shots 2, 3, 5 and 6 only, with no captions (the hero headline already says it). Fade the last frame into the first so the loop is seamless. Export as MP4 (H.264, under 2 MB) and as WebM. Use a GIF only where video isn't allowed.

## Recording

- **Web app**: a clean browser profile (no extensions, no bookmarks bar) at 100% zoom, light theme, window exactly 1920x1080. Sign in with a dedicated demo account on a paid plan so the quota is never in shot.
- **Desktop**: a real account for the drop and Grab shots. For screens that need nothing live, use the capture profile's demo data (`pnpm --filter @nvoke/desktop capture`). Record on Windows 11 so Mica shows, with a calm wallpaper.
- **Recorder**: Screen Studio (macOS) for automatic cursor zoom, or OBS at 60 fps with zooms added in the edit. Record at 1920x1080 and 60 fps. Crop the vertical 1080x1350 cut from the same takes, keeping the action centered.
- **Pace**: real speed for typing and clicks. Speed up waiting and say so on screen. Never fake a result.

## Blur

- Any email at a personal mailbox (`firstname@`, `firstname.lastname@`) and any personal name. Leave role addresses (`info@`, `hello@`, `frontdesk@`) unblurred.
- The account avatar and email address, and any API key on Account.
- Browser tabs, the bookmarks bar, and OS notifications that aren't from nvoke.

## Sound

No voiceover: captions carry it, and most feeds autoplay muted. Use one quiet instrumental track (licensed, from Artlist or Epidemic Sound) on the full cut. Add a soft click sound on Start and Export. The hero loop has no audio.

## Checklist

- [ ] Dry-run both searches and pick the one with more valid emails
- [ ] Set up the demo account on a paid plan, with a clean browser profile, light theme and 1920x1080 window
- [ ] Record the web app takes (shots 1 to 7) at 60 fps
- [ ] Record the desktop takes (shot 8) on Windows 11 with Mica
- [ ] Edit the 75 s cut and the 18 s loop, and crop the 1080x1350 vertical cut
- [ ] Blur pass: personal emails, names, account details
- [ ] Captions checked for the voice, with no em dashes, en dashes or `--`
- [ ] Export MP4 and WebM for the hero, MP4 for social, GIF for Product Hunt
- [ ] Put the loop in the homepage hero, muted, autoplay, `playsInline`, with a poster frame
