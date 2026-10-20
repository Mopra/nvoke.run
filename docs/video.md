# Videos

How nvoke's product videos are made, so the next one is a day of work, not a
week. Everything is code: the app records itself, Remotion cuts the film, the
sound is synthesized. Nothing costs money.

## What works

The teaser (`Teaser` in `apps/video`) is the house style. The owner signed it
off on 2026-10-18 as "almost perfect". Keep to it:

- **Nothing teaser crossed with Teenage Engineering.** Black, white dots, one
  accent (the app's signal orange, `ink.signal`), dot matrix type (Doto),
  tiny mono labels in the corners. The mark at the end is the orange keycap.
  Cryptic and deadpan, not a demo.
- **Short.** About 29 s, one idea per bar, cut on the beat.
- **Sound design, not music.** Clicks, ticks, pings, a sub thump, a scan
  sweep, a magnet snap and a dry 100 BPM beat, all synthesized. Key clicks
  land on the real keystrokes from the recording.
- **A deadpan synthetic voice** saying as little as it can. Kokoro's
  `af_heart` (calm, US) at speed 0.9 is the voice.
- **The real app in macro.** Extreme close-ups of the recorded UI, tilted,
  with a shallow focus band. Never the whole window explained.

**The studio cut** (`TeaserStudio`, `src/studio/`, 2026-10-20) is the same
teaser finished like a studio would, waiting on the owner's verdict: takes in
the app's dark finish (`journey-dark`, so the macro shots no longer flash
grey against the black), a real lens (`Lens.tsx`: the take on a 3D plane the
camera yaws across, three layer depth of field, a focus pull at each cut,
bloom on bright pixels), grain and glitch tears over everything
(`Finish.tsx`), glyphs that strike hot and settle (`Words.tsx`), motion blur
on the ending, and one new bar, the hero (`Hero.tsx`): the whole panel as a
slab turning in the dark with a rim light, on bar 6 of the beat played twice,
a sub drop and air. Thirteen bars, about 31 s. The sound is mastered after
the render (`scripts/master.mjs`, -14 LUFS, -1 dBTP).

What was rejected, so it is not tried again: a 70 s keynote walkthrough
("bland and boring"), and a 29 s "presentation" cut with captions, slide
transitions and stock music ("I'm not doing a keynote"). Stock music from
Pixabay read as "tech demo".

## The pieces

1. **Recording rig** (`apps/desktop/src/main/capture/film/`). The real
   Electron window, scripted on demo data, recorded with ffmpeg's `ddagrab`
   at device scale 2 (2400x1350 takes) so macro shots stay sharp.
   - `scenes.ts`: one `Scene` per take (`setup` off camera, `act` on camera).
     `journey` is paste site, suggestions, search running, done, openers,
     export, in one take. The montage takes are `command`, `people`,
     `ongoing`, `drop`, `agents`, `quick` and `grab`.
   - `director.ts`: real input events (hover and press states show), pointer
     paths on an arc, human typing, and a log of every pointer move, click,
     key, named `mark` and measured `rect`. The film draws its own cursor
     from that log and times sounds and cuts by it.
   - `set.ts`, `stage.ts`: a stage window that shows made up web pages (a
     retail blog, a brand's site) where the main window sits, for beats over
     other apps, and the quick window placed over the frame.
   - `place.ts`: at a forced device scale on a two monitor desktop Electron
     misreports displays, so windows are placed in physical pixels by
     measuring and nudging. Dead center is a tie between displays: the frame
     sits 2 px left of center.
   - The cast is `apps/desktop/src/renderer/src/lib/mock/film.ts`
     (`VITE_FILM=1`): Brightlane, a London Shopify studio, and ten made up UK
     brands with founders, verified emails and openers.
2. **Takes.** `pnpm --filter @nvoke/desktop film [scene ...]` records and
   then crops each take into `apps/video/public/takes/<scene>.mp4` and
   `.json` (gitignored). Keep the screen unlocked and the top left corner
   uncovered: a flash there marks frame 0. `--process` redoes only the
   cropping. The take JSON is the contract with the film (`src/takes.ts`).
3. **Sound** (`apps/video/scripts/teaser-audio.py`, run notes at its top).
   `kit` synthesizes `public/teaser/sfx/*.wav` and `beat.wav`, `voice`
   speaks the lines with Kokoro (kokoro-onnx, local) into
   `public/teaser/voice/<voice>/`, `check` prints levels and spectrograms.
   Generated files are gitignored; rerun the script to get them back.
4. **Film** (`apps/video`, Remotion 4). `src/teaser/` is the teaser:
   `timing.ts` (the beat grid: `at(bar, beat)`), `DotField.tsx`,
   `Macro.tsx`, `Type.tsx` (dot matrix words, corner HUD), `Teaser.tsx`
   (shots and every sound on the grid, master level `MIX`). The `Launch` and
   `Film` compositions are the rejected cuts, kept for parts.

## Commands

```bash
pnpm --filter @nvoke/desktop film journey         # record and crop a take
pnpm --filter @nvoke/desktop film --process       # crop again only
cd apps/video
pnpm studio                                       # preview and scrub
npx remotion render src/index.ts Teaser out/teaser.mp4               # 1440p master
npx remotion render src/index.ts Teaser out/teaser-720p.mp4 --scale=0.5
npx remotion render src/index.ts TeaserVertical out/teaser-vertical.mp4
npx remotion render src/index.ts TeaserStudio out/teaser-studio-raw.mp4
node scripts/master.mjs out/teaser-studio-raw.mp4 out/teaser-studio.mp4   # loudness, every final render
```

`pnpm --filter @nvoke/desktop film --dark journey` records a take in the dark
finish as `journey-dark`, beside the light one.

Run renders through `horadric heavy`. Check the mix after a change with
`ffmpeg -i out.mp4 -af volumedetect -vn -f null -` (peaks below -3 dB), and
master every final render with `scripts/master.mjs`.

## Making the next one

1. Write the script as bars: one idea per bar, at most one short voice line.
2. Add any new take as a `Scene` in `scenes.ts` with marks at the moments the
   film cuts on, record it, and look at frames (`ffmpeg -ss` stills) before
   cutting.
3. Add the lines to `LINES` in `teaser-audio.py` and run `voice` with
   `af_heart`.
4. Build the cut in a new folder under `apps/video/src/` from the teaser's
   parts, place every sound with `at()`, and register it in `Root.tsx`.
5. Render stills on a sheet to check framing, then a 720p preview for the
   owner, who judges the motion and the sound.

## Gotchas

- The takes show the app as it looked when recorded. After a redesign,
  record again before cutting a new film, then check the macro shots' `focus`
  points on stills: they are take pixels. The teaser's shots are the site
  field, the stat screens counting (`counters` rect) and the first opener.
- The device's head (ports, plate, display strip) fills the top 40% of the
  1200x675 film window, so the journey scrolls the companies up before the
  openers land. A taller window does not fit the screen at device scale 2.
- The quick window reads the front browser tab of whoever records. The film
  set turns that off (`readsFrontTab`); keep it off.
- The Account page shows local paths in the MCP setup lines; the `agents`
  scene blurs them.
- A covering window ruins a take; the rig raises its windows to the
  screen saver level, but stay off the keyboard while it records.
