import type { MainContext } from '../context';
import type { QuickWindow } from '../quick-window';
import { ScreenGrab } from '../screen-grab';

/** Grab from screen, started from the quick window. docs/desktop/screen-grab.md. */
export function registerGrab(ctx: MainContext, quick: QuickWindow): ScreenGrab {
  const grab = new ScreenGrab({
    hide: () => quick.hide(false),
    reveal: () => quick.reveal(),
    send: (state) => quick.sendGrab(state),
    isSender: (sender) => quick.isSender(sender),
  });
  grab.registerIpc();
  ctx.onQuit(() => grab.destroy());
  return grab;
}
