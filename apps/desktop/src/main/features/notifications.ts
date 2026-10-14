import type { MainContext } from '../context';
import { Notifier, registerNotificationIpc } from '../notifications/notifier';

/** Native notifications and the badge when a drop delivers. docs/desktop/notifications.md. */
export function registerNotifications(ctx: MainContext): void {
  const notifier = new Notifier(ctx.session, () => ctx.mainWindow);
  ctx.on('auth', (state) => notifier.onAuth(state));
  if (ctx.captureDir) return;
  registerNotificationIpc(notifier);
  ctx.on('started', (state) => notifier.onAuth(state));
}
