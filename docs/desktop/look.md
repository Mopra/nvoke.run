# Look

The desktop app is an instrument panel in the Braun and Teenage Engineering
line: a warm grey chassis, an off-white plate for cards, one signal orange,
keycap buttons that sink when pressed, a black display strip with dot matrix
figures, tiny mono capital labels, numbered channel rows with hairlines and
LED status dots. Light and dark are two finishes of the same device.

## The device

`components/AppShell.tsx` draws it, top to bottom:

- **Ports**, along the top edge: the navigation, labelled like the sockets on
  a sampler (Searches, New, Results while a search is open, Drops; Find,
  Account and the power nub on the right). The lit one is where you are. The
  row is the window's drag handle, with room for the caption buttons.
- **The head**: the name plate (brand, katakana, the model line and a PLAN /
  USED / LEFT readout from `useMe`) and the speaker grille, which lights up
  as a spectrum while a search runs and goes dark at rest.
- **The display**: the black strip. One block per search on the left (lit
  orange while running, blue while queued), the running search's title in
  the dot matrix face with its stage note or meter, and the verified count
  on the right; at rest it reads READY and the month's figure. Pressing it
  opens the command bar.
- **The panel**: the screens. `PageHeader` renders a screen's back key and
  its own keys; `DisplayTitle` is a light display title with its figure as
  an orange cap label.

## The parts

- `packages/theme/field.css` holds the `:root` and `.dark` tokens, imported
  by the renderer right after `theme.css` (the marketing site keeps
  `theme.css` alone for now). Three tokens are the display: `screen`,
  `screen-foreground`, `screen-dim`. The faces are Space Grotesk for text,
  JetBrains Mono for labels and Doto for the screen (`--font-lcd`), bundled
  from `@fontsource-variable` so they load offline.
- `apps/desktop/src/renderer/src/index.css` defines the utilities: `key`,
  `key-primary`, `key-down` (keycaps), `screen`, `lcd`, `cap` (panel label),
  `led`, `led-on`, `knob-cap`. `glass` and `glass-strong` are a plate on the
  chassis. The canvas is opaque: the window material would thin it out.
- `components/ui/knob.tsx` is a knob with detents, used for the search
  limit: click, scroll, drag or arrow keys step it.

Keep orange for the primary action, running progress and the chosen state;
everything else is grey, plate or black screen.
