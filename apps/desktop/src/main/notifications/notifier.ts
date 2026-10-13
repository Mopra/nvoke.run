import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, nativeImage, Notification } from 'electron';
import { SearchListResponse, type Search } from '@nvoke/shared';
import { IpcChannel, type AuthState, type NotificationSettings } from '../../ipc/contract';
import { bridgeRequest, type ApiClient } from '../api-bridge';
import {
  BADGE_SIZE,
  EMPTY_STATE,
  badgeBitmap,
  deliveryBody,
  markSeen,
  parseState,
  planPoll,
  type Delivery,
  type NotifyState,
  type Plan,
} from './plan';

/** How often main asks for the user's searches while signed in. One cheap GET. */
const POLL_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tells the user a drop delivered, even when the window is hidden: a native
 * notification (click opens the search) and an unseen count on the dock
 * (macOS) or the taskbar button (Windows). It polls GET /v1/searches from
 * main, so nothing new is needed on the server. The OS decides whether a
 * toast shows: Focus (macOS) and Focus Assist (Windows) hold it back, and a
 * focused nvoke window skips it, since the user is already looking.
 */
export class Notifier {
  private enabled = true;
  private state: NotifyState = EMPTY_STATE;
  private searches: Search[] = [];
  private signedIn = false;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private readonly file = join(app.getPath('userData'), 'notifications.json');

  constructor(
    private readonly client: ApiClient,
    /** The main window. The quick window never shows a badge or opens a search. */
    private readonly mainWindow: () => BrowserWindow | null,
  ) {
    try {
      const saved = parseState(readFileSync(this.file, 'utf8'));
      this.enabled = saved.enabled;
      this.state = saved.state;
    } catch {
      // First launch: notifications on, nothing announced yet.
    }
  }

  settings(): NotificationSettings {
    return { enabled: this.enabled, supported: Notification.isSupported() };
  }

  setEnabled(enabled: boolean): NotificationSettings {
    this.enabled = enabled;
    this.save();
    if (!enabled) this.setBadge(0);
    this.restart();
    return this.settings();
  }

  /** Called on every auth change. A new sign-in starts from a clean slate. */
  onAuth(auth: AuthState): void {
    const signedIn = auth.status === 'signed-in';
    if (signedIn === this.signedIn) return;
    this.signedIn = signedIn;
    if (!signedIn) {
      this.state = EMPTY_STATE;
      this.searches = [];
      this.save();
      this.setBadge(0);
    }
    this.restart();
  }

  /** The user opened a search: it no longer counts as unseen. */
  searchOpened(searchId: string): void {
    if (!this.enabled || !this.signedIn) return;
    this.apply(markSeen(this.searches, this.state, searchId));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private restart(): void {
    this.stop();
    if (!this.enabled || !this.signedIn) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const res = await bridgeRequest(this.client, 'GET', '/v1/searches');
      if (!res.ok || !this.enabled || !this.signedIn) return;
      const parsed = SearchListResponse.safeParse(res.data);
      if (!parsed.success) return;
      this.searches = parsed.data.searches;
      const plan = planPoll(this.searches, this.state);
      this.apply(plan);
      for (const delivery of plan.deliveries) this.notify(delivery);
    } finally {
      this.polling = false;
    }
  }

  private apply(plan: Plan): void {
    this.state = plan.state;
    this.save();
    this.setBadge(plan.unseen);
  }

  private notify(delivery: Delivery): void {
    if (!Notification.isSupported()) return;
    const win = this.mainWindow();
    // The user is looking at nvoke: the results show up on screen anyway.
    if (win && win.isVisible() && win.isFocused()) return;
    const toast = new Notification({ title: delivery.dropName, body: deliveryBody(delivery), silent: false });
    toast.on('click', () => this.open(delivery.searchId));
    toast.show();
  }

  private open(searchId: string): void {
    const win = this.mainWindow();
    if (!win || win.isDestroyed() || !UUID.test(searchId)) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send(IpcChannel.notificationsOpenSearch, searchId);
    this.searchOpened(searchId);
  }

  private setBadge(count: number): void {
    if (process.platform === 'win32') {
      const win = this.mainWindow();
      if (!win || win.isDestroyed()) return;
      if (count <= 0) {
        win.setOverlayIcon(null, '');
        return;
      }
      const icon = nativeImage.createFromBitmap(badgeBitmap(count), { width: BADGE_SIZE, height: BADGE_SIZE });
      win.setOverlayIcon(icon, `${count} unseen leads`);
      return;
    }
    // Dock badge on macOS, launcher count on Linux desktops that have one.
    app.setBadgeCount(count);
  }

  private save(): void {
    try {
      writeFileSync(this.file, JSON.stringify({ enabled: this.enabled, ...this.state }));
    } catch {
      // Losing the seen list only means one extra notification.
    }
  }
}

/** IPC for the notification setting. Every handler validates its input. */
export function registerNotificationIpc(notifier: Notifier): void {
  ipcMain.handle(IpcChannel.notificationsGetSettings, () => notifier.settings());
  ipcMain.handle(IpcChannel.notificationsSetEnabled, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    return notifier.setEnabled(enabled);
  });
  ipcMain.on(IpcChannel.notificationsMarkSeen, (_event, searchId: unknown) => {
    if (typeof searchId === 'string' && UUID.test(searchId)) notifier.searchOpened(searchId);
  });
}
