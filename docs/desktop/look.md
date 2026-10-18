# Look

The desktop app has two looks on top of light and dark. **Calm** is the
default: the translucent canvas, glass island and iris accent described in
CLAUDE.md. **Field** is an instrument panel in the Braun and Teenage
Engineering line: a warm grey chassis, an off-white plate for cards, one
signal orange, keycap buttons that sink when pressed, a black display strip
with dot matrix figures, tiny mono capital labels, numbered channel rows with
hairlines and LED status dots.

The user picks the look on Account, under Appearance. It is stored locally as
`nvoke.look` and applied as `data-look="field"` on `<html>` (Calm has no
attribute). `lib/look.ts` holds the store (`useLook`, `setLook`, `initLook`,
called from `main.tsx`); it also repaints the caption buttons, since the look
changes the canvas colors.

## How it is built

- `packages/theme/theme.css` has `[data-look="field"]` and
  `[data-look="field"].dark` token blocks after `.dark`. Because the light
  block comes after `.dark` in the cascade, the dark block must set every
  token the light one sets. Field also sets the faces: Space Grotesk for text,
  JetBrains Mono for labels and Doto for the screen (`--font-lcd`), bundled
  from `@fontsource-variable` so they load offline. Three tokens exist in
  every look for the display: `screen`, `screen-foreground`, `screen-dim`.
- `apps/desktop/src/renderer/src/index.css` defines the `field:` variant and
  the parts: `key`, `key-primary`, `key-down` (keycaps), `screen`, `lcd`,
  `cap` (panel label), `led`, `led-on`. In Field the canvas is opaque (the
  window material would thin the chassis) and `glass` becomes a plate.
- Components carry the Field look as `field:` classes next to their Calm
  classes, so Calm is untouched. Where the markup must differ (the segmented
  progress meter, the stat screens, the channel numbers) the component
  branches on `useLook()`.
- Capture: `src/main/capture/shots/look.ts` screenshots the main screens in
  Field (`30-field-*`) and puts the look back.

Adding a screen: style it for Calm first, then add `field:` classes using the
parts above. Keep orange for the primary action, running progress and the
chosen state; everything else is grey, plate or black screen.
