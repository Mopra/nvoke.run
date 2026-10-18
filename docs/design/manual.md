# nvoke design manual

nvoke looks like an instrument, not a web page. The desktop app is built as
a device: a warm grey chassis with a lip along the top edge, ports for the
navigation, a name plate, a speaker grille that lights up while the machine
works, a black display with dot matrix figures, and a panel of keycaps,
tags, LEDs and hairline channel rows. This manual says where that comes
from, what the rules are, and how to carry it to the website and the web
app. The parts live in code: tokens in `packages/theme/field.css`, utilities
in `apps/desktop/src/renderer/src/index.css`, the device in
`components/AppShell.tsx`, the primitives in `components/ui/`.

The inspiration shots are in `inspiration/`, the app as it is today in
`app/`.

## Why an instrument

A lead finder is a tool people run, watch and read off. It has a limit to
set, a state to see at a glance (running, done, stopped), figures that
matter (companies, emails, valid) and a few actions that are either big
(start, stop, export) or small (filter, copy). That is the job of a sampler
or a mixer too: set a few knobs, press a key, watch the display. The device
metaphor gives every one of those things a native form instead of a generic
web control, and it gives the product a face nobody else in the category
has. Lead tools look like dashboards. nvoke looks like a machine you own.

## The inspiration

Three sources, in this order of weight.

### Teenage Engineering

The EP-133 K.O. II, the OP-1 field and the field series (TX-6, TP-7, CM-15)
are the direct references. What we took:

- **One accent, spent with intent.** Orange is the only color. It marks
  the one key to press (RECORD, SAMPLE, COMMIT), the knob you turn most, the
  lit LED, the running state. Everything else is grey, off-white or black.
- **The chassis and its parts.** A warm grey body; a lighter plate that
  holds the name; a black display strip; keycaps in three tones (light,
  dark, grey) and one orange; a grille; a knob. Every control is a real
  object with a lip, a shadow and travel when pressed.
- **Labels everywhere, tiny.** Mono capitals, letter spaced, printed on the
  panel: BPM, METRONOME, GAIN, SWING. Brackets that group keys under a name.
  An LED above the key it belongs to. It reads like an instrument panel, not
  a form.
- **The grid shows.** Keys, labels and gaps sit on a module and the panel
  does not hide it. Columns align across the whole device.
- **Figures on a screen.** Big dot matrix numerals, lit with a glow, with
  ghost segments behind them (the "888" under a "34").
- **Playful parts on serious engineering.** Chunky keys, an orange knob,
  toy-like icons, all inside precise alignment. The product takes the work
  seriously and itself lightly.

What we left out: the katakana and the model numerals (K.O. II, TP-7). They
are decoration from another market. nvoke's plate says what the machine
does instead: FIND, CRAWL, VERIFY. No skeuomorphic textures (brushed metal,
screws), no rounded "friendly" pills: the parts are square with small radii.

### Dieter Rams and Braun

The grammar under Teenage Engineering: the ET66 calculator, the T3 radio,
the SK4. Order from a grid, one color for the primary function, labels that
say exactly what a control does, nothing that does not need to be there.
Ten principles; the one we lean on most is "as little design as possible":
every part on the panel has a job.

### Swiss typography

The labels are set the way an instrument panel or a technical sheet would
be: small sans or mono capitals, letter spaced, left aligned on the grid,
hairlines instead of boxes. Big type is light, not bold. Hierarchy comes
from size and weight, never from color (except the one orange).

## Principles

1. **It is a device.** Every screen is a panel on the same machine. The
   chassis, ports, plate, grille and display never change; only the panel
   does. On the web there is no chassis, but the parts are the same.
2. **One orange.** Orange means: the primary action, the running state, the
   chosen state, the figure that matters most (what is left). Never a second
   orange thing on the same panel if one would do. Never orange as
   decoration.
3. **Keys have travel.** A button is a keycap: square, a lip at its foot, a
   mono capital label, and it sinks 2px when pressed. Light keys for
   secondary actions, dark keys for navigation, grey keys for the quiet
   ones, one orange key for the action.
4. **Figures live on screens.** A number that matters sits on a black
   display in the dot matrix face, lit, with ghost segments behind it. A
   number that merely informs is thin display type on the chassis.
5. **Labels are printed.** Captions, column headers, units and states are
   mono capitals at 11.5px with 0.07em tracking, muted. Prose is the grotesk
   at 14px, never mono.
6. **Hairlines, not boxes.** Rows are divided by 1px lines on the chassis.
   The only boxes are the parts that are physically objects: keys, tags,
   screens, plates, knobs.
7. **LEDs tell state.** A 6px dot: off is chassis grey, on is orange with a
   glow, done is green, failed is red, caution is amber. An LED sits above
   the key it belongs to, or before the state it names.
8. **Light and dark are two finishes.** The same device in a light and a
   black edition. Nothing moves; only the material changes. Orange and the
   screen stay the same.
9. **Motion is mechanical.** Keys sink, LEDs blink, the meter fills segment
   by segment, the knob springs to its detent, the display fades between
   lines. Nothing floats, bounces or blurs. Everything stops under reduced
   motion.
10. **Words are plain.** Short, specific, in the user's language. Labels say
    what a control does (START SEARCH, EXPORT CSV, CONTINUE). No marketing
    on the panel.

## Color

Tokens in `packages/theme/field.css`, set as oklch. Warm hue (about 100),
very low chroma, so the greys read as painted metal, not screen grey.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `background` | oklch(0.872 0.004 100) | oklch(0.215 0.003 100) | The chassis |
| `foreground` | oklch(0.21 0.004 100) | oklch(0.93 0.004 95) | Ink, dark keys |
| `card` | oklch(0.955 0.006 95) | oklch(0.265 0.003 100) | The plate, recessed fields |
| `secondary` | oklch(0.96 0.005 95) | oklch(0.31 0.003 100) | Light keys |
| `muted-foreground` | oklch(0.45 0.005 100) | oklch(0.73 0.005 100) | Labels, grey keys |
| `border` | oklch(0.2 0.005 100 / 0.16) | oklch(1 0 0 / 0.12) | Hairlines |
| `primary` | oklch(0.67 0.22 38) | oklch(0.7 0.21 40) | Orange |
| `screen` | oklch(0.13 0 0) | oklch(0.09 0 0) | The display |
| `screen-foreground` | oklch(0.95 0.02 260) | same | Lit segments |
| `screen-dim` | oklch(0.3 0 0) | oklch(0.24 0 0) | Ghost segments |
| `chart-1` | green | green | LED done, valid |
| `chart-2` | amber | amber | LED caution, risky |
| `chart-3` | blue | blue | LED queued |
| `destructive` | red | red | LED failed, Stop key |
| `glow` | orange, 45% | orange, 55% | Under the orange key |
| `highlight` | white, 75% | white, 12% | The line of light on the lip |

Rules: orange never on text longer than a label. Green, amber, blue and red
are LEDs and badges only, never surfaces. The screen is always black in
both finishes.

## Type

- **Space Grotesk** for everything read: body at 14px/20px, titles light
  (300) at 34 to 56px with tight tracking, figures light at 30 to 44px with
  tabular numerals. The grotesk has the slightly technical, slightly odd
  letterforms a panel wants (the single storey a, the straight y).
- **JetBrains Mono** for everything printed on the panel: labels and
  captions (11.5px, medium, 0.07em, uppercase), keys (12px, medium,
  0.07em, uppercase), tags (11px), domains and email addresses (at body
  size, no uppercase), small print like row subtitles (12px, uppercase,
  0.04em).
- **Doto** for the display: extra bold, dot matrix, tabular, always on a
  screen, always with the glow (`text-shadow` of the lit color). 17px on the
  strip, 30 to 44px on stat screens, 22px in the command bar.

Scale: 11 / 11.5 / 12 / 12.5 / 14 / 15 / 17 / 21 / 28 / 34 / 44 / 56. Never
smaller than 11px on anything a person has to read.

## The parts

Every part is a utility in `index.css`; the primitives in `components/ui/`
compose them.

- **Keycap** (`key`): 4px radius, inset lip (2px dark at the foot, 1px light
  at the top), a 2px solid shadow in the chassis tone and a short drop. On
  press: translate 2px down, the lip flattens. `key-primary` adds the orange
  glow. `key-down` is a key held (the chosen preset).
- **Tag** (`Badge`): a keycap without travel, 20px tall, 3px radius, mono
  11px capitals. Light, dark (`outline`), grey (`secondary`) or orange
  (`default`).
- **Screen** (`screen`): black, 4px radius, a 1px light line inset at the
  top. Content in `screen-foreground`; labels at 45% to 50%; ghost figures
  in `screen-dim`.
- **Figures** (`lcd`): Doto 800, tabular, glow. Ghost "888" behind,
  right aligned, same size.
- **Label** (`cap`): JetBrains Mono 11.5px, 500, 0.07em, uppercase, muted.
- **LED** (`led`, `led-on`): 6px, round. Off is chassis grey mixed 35% with
  ink. On is orange with a 6px glow.
- **Meter** (`LedMeter`): 16 segments, 2px apart, 10px tall, square. Lit
  orange from the left, dim orange for found but not crawled, grey off.
- **Knob** (`Knob`): orange cap with a radial highlight, a chassis collar,
  a white pointer, values as mono ticks around it. Click steps, scroll or
  drag turns, arrows step; it springs to the detent.
- **Bracket** (`KeyGroup`): a cap label centered on a 1px bracket over a
  group of keys, each key with its LED above (`LedKey`).
- **Plate** (`glass`): the lifted off-white panel with a hairline rim and
  a lip. Cards, dialogs, the name plate.
- **Recessed field** (`Input`, `PLATE`): card tone, 4px radius, an inset
  shadow, mono text. Placeholders at 90% of muted.
- **Hairline row**: `border-top: 1px border`, last row also bottom. Hover
  is a 3.5% ink fill, nothing else.
- **Shade** (`ScrollShade`): the chassis darkens over the last 96px of a
  panel that scrolls, only while there is more below.

## Anatomy of the device

Top to bottom, in `components/AppShell.tsx`:

1. **Rim and ports** (36px). The chassis catches the light along the top
   edge (`rim`). Ports hang from it: dark (SEARCHES, RESULTS, FIND), light
   with a notch (NEW), grey (DROPS, ACCOUNT). The lit one is orange. The
   power nub at the right is the window's only control. The whole row
   drags the window; a double click maximizes.
2. **Head**. The plate (mark, wordmark, FIND · CRAWL · VERIFY, the model
   line, PLAN / USED / LEFT) and the grille (16 by 6 holes). The grille is a
   level meter: each column is one poll of the running searches, its height
   the emails that poll brought.
3. **Display** (62px). Eight blocks on the left, one per search (orange
   running, blue queued, ringed when on screen). The running search's title
   in Doto with its stage note or meter; RUN / DONE; the verified count with
   ghost digits; a counter when several run. At rest: READY and the month's
   figure. The strip is a button: it opens the command bar.
4. **Panel**. The screen. Back key at the top left, the screen's own keys at
   the right. Title light, its figure as an orange cap. Then the content in
   hairline rows or on screens.

The window is frameless and transparent; the canvas draws 16px corners and
the line of light, square when maximized.

## Motion

- Keys: 80ms, translate and shadow only.
- LEDs: a 1.1s blink while something runs.
- Meter: segments switch on, 300ms color.
- Knob: 300ms spring to the detent.
- Display: 240ms fade between lines; 4s per search when several run.
- Grille: one column per poll, 200ms per hole.
- Screens and rows: `view-in` (360ms rise and unblur) once on entry;
  staggered rows.
- Everything respects `prefers-reduced-motion`.

## Voice

- Labels in capitals, two words at most: START SEARCH, SEARCH MORE,
  EXPORT CSV, CONTINUE, STOP.
- States as one word: RUNNING, DONE, STOPPED, FAILED, PLANNED.
- Prose in sentences, plain: "Only verified emails count. 840 left this
  month. Results are kept for 12 months."
- Figures first, units after: "339 · 254 VALID".
- No em dashes anywhere. No exclamation marks on the panel.

## Light and dark

Two finishes of the same device. The chassis goes from warm light grey to
warm near-black, the plate from off-white to dark grey, ink flips. Orange,
the screen, the LEDs and the glow stay the same. Nothing changes position
or shape. Check both finishes for every new part; the lip highlight and the
shade have their own values per finish.

## For the website and the web app

The site is the product's sheet, the web app is the product without the
chassis.

- **No fake device on the web.** Do not draw a window with ports around a
  marketing page. Use the parts: the plate as the hero's surface, keys for
  every call to action, a screen for figures and demos, caps for labels,
  hairline rows for lists, the grille as a motif only where something is
  live.
- **Chassis as the page.** The page background is the chassis tone, the
  lip highlight along the top of each section plate, content on plates and
  screens, never in rounded white cards with shadows.
- **The demo is real.** Where the site shows the app, show a live screen:
  the dot matrix figures counting, the meter filling. A screenshot in a
  browser frame is the old world.
- **Type stays.** Space Grotesk light for headlines at 44 to 72px, mono
  caps for eyebrows and labels, Doto only on screens. Body 15 to 16px on the
  site, 14px in the app.
- **Orange stays scarce.** One orange key per view. The pricing ladder's
  current step, the one CTA, the running thing.
- **The web app is the panel.** `/app` gets the same screens as the desktop
  panel: the searches table, the sentence with the knob, the stat screens,
  the key bar. A slim header carries the ports as tabs. No plate, no grille,
  no display strip: those are the desktop's premium face.

## Files

- Tokens: `packages/theme/field.css` (desktop); the site still imports
  `theme.css` until its redesign lands, then both share `field.css`.
- Parts: `apps/desktop/src/renderer/src/index.css` (`key`, `key-primary`,
  `key-down`, `screen`, `lcd`, `cap`, `led`, `led-on`, `knob-cap`, `rim`,
  `glass`).
- Device: `apps/desktop/src/renderer/src/components/AppShell.tsx` (ports,
  plate, grille, display, Panel, KeyGroup, LedKey, ScrollShade).
- Primitives: `apps/desktop/src/renderer/src/components/ui/` (button,
  badge, input, segmented, switch, select, dropdown-menu, dialog, tooltip,
  kbd, knob).
- Mark: `components/Logo.tsx`.
- Fonts: `@fontsource-variable/space-grotesk`, `jetbrains-mono`, `doto`.
- The concept this grew from: the K.O. II style HTML in this folder's
  history (October 2026).
