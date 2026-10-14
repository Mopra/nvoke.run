/**
 * The typed bridge between the renderer and the main process. The preload
 * script exposes exactly `NvokeApi` on `window.nvoke`, and the main process
 * registers a handler for every channel in `IpcChannel`.
 *
 * Each feature keeps its channels and types in `features/<feature>.ts`. A new
 * feature adds one line to each list below, so parallel work does not collide.
 */
import { ApiChannel, type ApiBridge } from './features/api';
import { AppChannel, type AppBridge } from './features/app';
import { AuthChannel, type AuthBridge } from './features/auth';
import { CsvDropChannel, type CsvDropBridge } from './features/csv-drop';
import { DesktopChannel, type DesktopCoreApi } from './features/desktop';
import { DragOutChannel, type DragOutBridge } from './features/drag-out';
import { GrabChannel, type GrabBridge } from './features/grab';
import { InboxChannel, type InboxBridge, type InboxDesktopApi, type InboxSettings } from './features/inbox';
import { LocalChannel, type LocalBridge } from './features/local';
import { LocalCrawlChannel, type LocalCrawlDesktopApi, type LocalCrawlSettings } from './features/local-crawl';
import { McpChannel, type McpBridge } from './features/mcp';
import { NotificationsChannel, type NotificationsBridge } from './features/notifications';
import { QuickChannel, type QuickBridge, type QuickDesktopApi, type QuickSettings } from './features/quick';
import { TrayChannel, type TrayDesktopApi, type TraySettings } from './features/tray';
import { WindowChannel, type WindowBridge } from './features/window';

export * from './features/api';
export * from './features/app';
export * from './features/auth';
export * from './features/csv-drop';
export * from './features/desktop';
export * from './features/drag-out';
export * from './features/grab';
export * from './features/inbox';
export * from './features/local';
export * from './features/local-crawl';
export * from './features/mcp';
export * from './features/notifications';
export * from './features/quick';
export * from './features/tray';
export * from './features/window';

export const IpcChannel = {
  ...ApiChannel,
  ...AppChannel,
  ...AuthChannel,
  ...CsvDropChannel,
  ...DesktopChannel,
  ...DragOutChannel,
  ...GrabChannel,
  ...InboxChannel,
  ...LocalChannel,
  ...LocalCrawlChannel,
  ...McpChannel,
  ...NotificationsChannel,
  ...QuickChannel,
  ...TrayChannel,
  ...WindowChannel,
} as const;

/** Settings for how the app lives on the computer, kept in userData by the main process. */
export interface DesktopSettings
  extends
    InboxSettings,
    LocalCrawlSettings,
    QuickSettings,
    TraySettings {}

/** `window.nvoke.desktop`. */
export interface DesktopApi
  extends
    DesktopCoreApi,
    InboxDesktopApi,
    LocalCrawlDesktopApi,
    QuickDesktopApi,
    TrayDesktopApi {}

export interface DesktopBridge {
  desktop: DesktopApi;
}

export interface NvokeApi
  extends
    ApiBridge,
    AppBridge,
    AuthBridge,
    CsvDropBridge,
    DesktopBridge,
    DragOutBridge,
    GrabBridge,
    InboxBridge,
    LocalBridge,
    McpBridge,
    NotificationsBridge,
    QuickBridge,
    WindowBridge {}
