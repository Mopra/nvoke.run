import { Menu, Notification, Tray, nativeImage, type MenuItemConstructorOptions, type NativeImage } from 'electron';
import { SearchListResponse } from '@nvoke/shared';
import type { DesktopCommand } from '../ipc/contract';
import { dropToday, dropTodayLabel, type DropToday } from './drop-today';
import trayIco from '../../resources/tray.ico?asset&asarUnpack';
import trayPng from '../../resources/tray.png?asset&asarUnpack';
import trayTemplate from '../../resources/trayTemplate.png?asset&asarUnpack';
import trayTemplate2x from '../../resources/trayTemplate@2x.png?asset&asarUnpack';

/**
 * The tray icon (menu bar on macOS). nvoke keeps running there when the
 * window closes, and the menu opens the window, starts a new search, shows
 * what today's drops delivered and quits.
 */

/** How often the drop line refreshes on its own. Hovering the icon also refreshes it. */
const REFRESH_MS = 10 * 60_000;
const HOVER_REFRESH_MS = 30_000;

export interface TrayOptions {
  /** Shows and focuses the main window. */
  open(): void;
  /** Shows the window and hands the renderer a command. */
  command(command: DesktopCommand): void;
  quit(): void;
  /** GET /v1/searches through the signed-in session, or null when signed out. */
  fetchSearches(): Promise<Response | null>;
}

export const TRAY_PLACE = process.platform === 'darwin' ? 'menu bar' : 'tray';

function icon(): NativeImage | string {
  if (process.platform === 'win32') return trayIco;
  if (process.platform !== 'darwin') return trayPng;
  const image = nativeImage.createFromPath(trayTemplate);
  image.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(trayTemplate2x).toPNG() });
  image.setTemplateImage(true);
  return image;
}

export class AppTray {
  private readonly tray: Tray;
  private today: DropToday | null = null;
  private signedIn = false;
  private lastRefresh = 0;
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly options: TrayOptions) {
    this.tray = new Tray(icon());
    this.tray.setToolTip('nvoke');
    // Windows and Linux: a click opens the window, the menu sits on right click.
    // macOS: any click opens the menu, as menu bar items do.
    if (process.platform !== 'darwin') this.tray.on('click', () => options.open());
    this.tray.on('mouse-enter', () => {
      if (Date.now() - this.lastRefresh > HOVER_REFRESH_MS) void this.refresh();
    });
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
    this.render();
  }

  setSignedIn(signedIn: boolean): void {
    this.signedIn = signedIn;
    if (!signedIn) this.today = null;
    this.render();
    if (signedIn) void this.refresh();
  }

  /** Reads today's drop searches. Failures keep the last known line. */
  async refresh(): Promise<void> {
    if (!this.signedIn) return;
    this.lastRefresh = Date.now();
    try {
      const res = await this.options.fetchSearches();
      if (!res?.ok) return;
      const { searches } = SearchListResponse.parse(await res.json());
      this.today = dropToday(searches);
      this.render();
    } catch {
      // Offline or a server hiccup: the next refresh tries again.
    }
  }

  /** Says once, on the first close, that nvoke keeps running. */
  notifyStillRunning(): void {
    const title = 'nvoke is still running';
    const content = `Drops and searches keep going. Open nvoke or quit it from the ${TRAY_PLACE}.`;
    if (process.platform === 'win32') {
      this.tray.displayBalloon({ title, content, iconType: 'none', icon: nativeImage.createFromPath(trayPng) });
    } else if (Notification.isSupported()) {
      new Notification({ title, body: content, silent: true }).show();
    }
  }

  destroy(): void {
    clearInterval(this.timer);
    this.tray.destroy();
  }

  private render(): void {
    const { open, command, quit } = this.options;
    const today = this.today;
    const drops: MenuItemConstructorOptions[] = this.signedIn
      ? [
          { type: 'separator' },
          {
            label: today ? dropTodayLabel(today) : 'Checking today’s drops',
            enabled: !!today && today.searchIds.length > 0,
            click: () => {
              const ids = today?.searchIds ?? [];
              command(ids.length === 1 && ids[0] ? { name: 'search', id: ids[0] } : { name: 'searches' });
            },
          },
        ]
      : [];
    const menu = Menu.buildFromTemplate([
      { label: 'Open nvoke', click: open },
      { label: 'New search', enabled: this.signedIn, click: () => command({ name: 'new-search' }) },
      ...drops,
      { type: 'separator' },
      { label: 'Quit nvoke', click: quit },
    ]);
    this.tray.setContextMenu(menu);
  }
}
