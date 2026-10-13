import type { CompaniesPage, HealthResponse, LeadFilters, Search, User } from '@nvoke/shared';

/**
 * The typed bridge between the renderer and the main process. The preload
 * script exposes exactly this shape on `window.nvoke`, and the main process
 * registers a handler for every channel listed here.
 */

export const IpcChannel = {
  getAppInfo: 'app:get-info',
  openExternal: 'app:open-external',
  getHealth: 'api:get-health',
  apiRequest: 'api:request',
  exportCsv: 'api:export-csv',
  /** Renderer to main, fire and forget, payload DragCsv. */
  startDragCsv: 'leads:start-drag-csv',
  /** Renderer to main, payload SaveEnriched, answers SaveEnrichedResult. */
  saveEnriched: 'files:save-enriched',
  /** Renderer to main, payload a path written by saveEnriched. */
  revealFile: 'files:reveal',
  authGetState: 'auth:get-state',
  authSignIn: 'auth:sign-in',
  authCancel: 'auth:cancel',
  authSignOut: 'auth:sign-out',
  /** Main to renderer push, payload AuthState. */
  authChanged: 'auth:changed',
  windowGetChrome: 'window:get-chrome',
  windowSetTheme: 'window:set-theme',
  windowSetTitleBarColors: 'window:set-title-bar-colors',
  /** Main to renderer push, payload WindowState. */
  windowStateChanged: 'window:state-changed',
  desktopGetSettings: 'desktop:get-settings',
  desktopSetOpenAtLogin: 'desktop:set-open-at-login',
  desktopSetHotkey: 'desktop:set-hotkey',
  /** Quick window to main, fire and forget. */
  quickHide: 'quick:hide',
  /** Quick window to main, fire and forget, payload a route hash. */
  quickOpenInMain: 'quick:open-in-main',
  /** Quick window to main, fire and forget, payload a height in px. */
  quickSetHeight: 'quick:set-height',
  /** Main to quick window push, every time the window is shown. */
  quickShown: 'quick:shown',
  /** Main to quick window push after each show, payload FrontTab or null. */
  quickFrontTab: 'quick:front-tab',
  /** Quick window to main, no payload: reads the front tab after asking macOS for permission. */
  quickReadFrontTab: 'quick:read-front-tab',
  desktopSetLocalCrawl: 'desktop:set-local-crawl',
  /** Main to renderer push, payload DesktopCommand. */
  desktopCommand: 'desktop:command',
  localSearches: 'local:searches',
  localSearch: 'local:search',
  localCompanies: 'local:companies',
  localRefresh: 'local:refresh',
  localStatus: 'local:status',
  /** Main to renderer push, payload LocalChange. */
  localChanged: 'local:changed',
  mcpGetSetup: 'mcp:get-setup',
  mcpAddToClaudeDesktop: 'mcp:add-to-claude-desktop',
  /** Main to renderer push, payload string[]: the MCP clients connected now. */
  mcpClientsChanged: 'mcp:clients-changed',
  desktopSetInboxEnabled: 'desktop:set-inbox-enabled',
  /** Opens a native folder picker in main. No path ever comes from the renderer. */
  desktopChooseInboxFolder: 'desktop:choose-inbox-folder',
  desktopOpenInboxFolder: 'desktop:open-inbox-folder',
  /** Main to renderer push, payload InboxFile. */
  inboxFile: 'inbox:file',
  /** Renderer to main: the listener is mounted, send what is waiting. */
  inboxReady: 'inbox:ready',
  /** Renderer to main, payload InboxDone. */
  inboxDone: 'inbox:done',
  /** Renderer to main, payload InboxFailed. */
  inboxFailed: 'inbox:failed',
  notificationsGetSettings: 'notifications:get-settings',
  notificationsSetEnabled: 'notifications:set-enabled',
  /** Renderer to main, fire and forget, payload a search id. */
  notificationsMarkSeen: 'notifications:mark-seen',
  /** Main to renderer push, payload a search id: a notification was clicked. */
  notificationsOpenSearch: 'notifications:open-search',
  /** Quick window to main, fire and forget: hide and let the user drag a box on the screen. */
  grabStart: 'grab:start',
  /** Quick window to main: open the OS screen recording settings (macOS). */
  grabOpenSettings: 'grab:open-settings',
  /** Grab overlay to main: the frozen frame of the display it covers, as GrabFrame. */
  grabGetFrame: 'grab:get-frame',
  /** Grab overlay to main, fire and forget, payload GrabRect. */
  grabSelect: 'grab:select',
  /** Grab overlay to main, fire and forget. */
  grabCancel: 'grab:cancel',
  /** Main to quick window push, payload GrabState. */
  grabState: 'grab:state',
} as const;

/** The appearance the user picked. `system` follows the OS. */
export type ThemeSource = 'system' | 'light' | 'dark';

/**
 * How the frameless window is dressed on this platform, so the renderer can
 * leave room for the native controls and let the material show through.
 * - `material`: `vibrancy` (macOS), `mica` (Windows 11) or `none` (opaque).
 * - `controls`: `traffic-lights` sit top left in the sidebar (macOS),
 *   `overlay` buttons sit top right over the toolbar (Windows, Linux).
 */
export interface WindowChrome {
  platform: 'darwin' | 'win32' | 'linux' | 'other';
  material: 'vibrancy' | 'mica' | 'none';
  controls: 'traffic-lights' | 'overlay';
  /** Height in px of the draggable title strip the controls live in. */
  titleBarHeight: number;
  theme: ThemeSource;
  state: WindowState;
}

export interface WindowState {
  focused: boolean;
  fullscreen: boolean;
  maximized: boolean;
}

/** Colors for the Windows and Linux caption buttons, as #rrggbb. The background may be `transparent`. */
export interface TitleBarColors {
  color: string;
  symbolColor: string;
}

export interface WindowApi {
  getChrome(): Promise<WindowChrome>;
  /** Sets nativeTheme.themeSource so the window material follows the app theme. */
  setTheme(theme: ThemeSource): Promise<void>;
  /** Repaints the native caption buttons to match the toolbar. No-op on macOS. */
  setTitleBarColors(colors: TitleBarColors): Promise<void>;
  /** Subscribes to focus, fullscreen and maximize changes. Returns an unsubscribe function. */
  onStateChange(listener: (state: WindowState) => void): () => void;
}

export interface NotificationSettings {
  /** Native notifications and the unseen badge for finished drops. */
  enabled: boolean;
  /** False when the OS cannot show notifications. */
  supported: boolean;
}

export interface NotificationsApi {
  getSettings(): Promise<NotificationSettings>;
  setEnabled(enabled: boolean): Promise<NotificationSettings>;
  /** The search was opened, so its leads no longer count on the badge. */
  markSeen(searchId: string): void;
  /** Subscribes to a click on a drop notification. Returns an unsubscribe function. */
  onOpenSearch(listener: (searchId: string) => void): () => void;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  electron: string;
  /** Base URL of apps/server, for display. */
  apiUrl: string;
}

/**
 * Sign-in state as the renderer sees it. The device token stays in the main
 * process and never crosses the bridge.
 */
export type AuthState =
  | { status: 'signed-out'; error?: string }
  /** The browser is open on the sign-in page and the app waits for nvoke://auth/callback. */
  | { status: 'pending' }
  /** `user` is null while the profile loads or when the server is unreachable. */
  | { status: 'signed-in'; user: User | null };

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * The answer to `request()`. It never rejects: `ok: true` with the parsed JSON
 * body (null for 204), or `ok: false` with the HTTP status and the server's
 * `error` string. Status 0 means the network failed or the call was refused.
 */
export type BridgeResponse = { ok: true; status: number; data: unknown } | { ok: false; status: number; error: string };

export type ExportResult =
  /** Written to `filePath`. */
  | { saved: true; filePath: string }
  /** The user dismissed the save dialog, or the export failed with `error`. */
  | { saved: false; error?: string };

export interface AuthApi {
  getState(): Promise<AuthState>;
  /** Opens the sign-in page in the system browser. */
  signIn(): Promise<void>;
  /** Abandons a pending browser sign-in. */
  cancelSignIn(): Promise<void>;
  /** Revokes the device session on the server and forgets the token. */
  signOut(): Promise<void>;
  /** Subscribes to state changes. Returns an unsubscribe function. */
  onChange(listener: (state: AuthState) => void): () => void;
}

/** Settings for how the app lives on the computer, kept in userData by the main process. */
export interface DesktopSettings {
  /**
   * Start nvoke at login, hidden in the tray (menu bar on macOS) with no
   * window. Turned on by the first sign-in; the user can turn it off on Account.
   */
  openAtLogin: boolean;
  /** The global shortcut that opens the quick window, in Electron's accelerator format. */
  hotkey: string;
  /** Why the shortcut is not active, for example another app holds it. Null when it works. */
  hotkeyError: string | null;
  /** The watched inbox folder is on: a CSV put there is enriched in the background. Off until the user turns it on. */
  inboxEnabled: boolean;
  /** Where the inbox is, `Documents/nvoke/inbox` unless the user picked another folder. */
  inboxFolder: string;
  /** Why the inbox is not watching, for example the folder can't be created. Null when it works. */
  inboxError: string | null;
  /**
   * Read sites that refuse our servers or need JavaScript from this computer,
   * in a hidden window while it is idle (docs/SPEC.md, "Local render crawl").
   * Off by default.
   */
  localCrawl: boolean;
}

/** A table file that landed in the inbox and has stopped growing. `id` is opaque: main maps it back to the path. */
export interface InboxFile {
  id: string;
  fileName: string;
  /** The text of the file, at most 5 MB. */
  text: string;
}

/** The enriched CSV for an inbox file. Main writes it to the done folder and moves the original away. */
export interface InboxDone {
  id: string;
  csv: string;
  /** For the notification: companies with a valid address, and companies in all. */
  valid: number;
  total: number;
}

export type InboxFailure = 'quota' | 'signed-out' | 'empty' | 'error';

/** The inbox file could not be enriched. It stays where it is. */
export interface InboxFailed {
  id: string;
  reason: InboxFailure;
}

export type InboxResult = { saved: true; filePath: string } | { saved: false; error: string };

/** The watched inbox folder, as the renderer takes part in it. */
export interface InboxApi {
  /** Subscribes to files that are ready. Returns an unsubscribe function. */
  onFile(listener: (file: InboxFile) => void): () => void;
  /** Tells main the listener is mounted, so files that arrived earlier are sent. */
  ready(): void;
  done(result: InboxDone): Promise<InboxResult>;
  failed(failure: InboxFailed): Promise<void>;
}

/**
 * Something the main process asks the renderer to do, for example from the
 * tray menu: open a new search, the searches list or one search.
 */
export type DesktopCommand =
  | { name: 'new-search' }
  | { name: 'searches' }
  | { name: 'search'; id: string }
  /** Any screen, as a route hash such as `#/drops`. Sent by the quick window. */
  | { name: 'route'; hash: string };

export interface DesktopApi {
  getSettings(): Promise<DesktopSettings>;
  /** Registers or removes the login item and returns the saved settings. */
  setOpenAtLogin(enabled: boolean): Promise<DesktopSettings>;
  /**
   * Registers a new global shortcut for the quick window. A clash with another
   * app does not throw: the old shortcut stays and `hotkeyError` says why.
   */
  setHotkey(accelerator: string): Promise<DesktopSettings>;
  /** Starts or stops watching the inbox folder, creating it when needed. */
  setInboxEnabled(enabled: boolean): Promise<DesktopSettings>;
  /** Opens a folder picker and watches the chosen folder. Resolves with the unchanged settings when dismissed. */
  chooseInboxFolder(): Promise<DesktopSettings>;
  /** Shows the inbox folder in the file manager. */
  openInboxFolder(): Promise<void>;
  /** Turns the local render crawl on or off and returns the saved settings. */
  setLocalCrawl(enabled: boolean): Promise<DesktopSettings>;
  /** Subscribes to commands from the tray. Returns an unsubscribe function. */
  onCommand(listener: (command: DesktopCommand) => void): () => void;
}

/** What the clipboard held when the quick window opened: one domain, URL or email address, else null. */
export type QuickClipboard = { domain: string; from: 'domain' | 'url' | 'email' } | null;

/**
 * The site in the browser tab that was in front when the shortcut was pressed.
 * - `read`: the address bar named `domain`.
 * - `ask`: macOS only. Reading needs the user's Automation permission, which
 *   has not been asked for this browser yet; `readFrontTab()` asks.
 * - `denied`: macOS only. The user refused that permission.
 */
export type FrontTab =
  | { status: 'read'; browser: string; domain: string }
  | { status: 'ask'; browser: string }
  | { status: 'denied'; browser: string };

/** The small command window that opens over any app from the global shortcut. */
export interface QuickApi {
  /** Hides the window and gives focus back to the app that was in front. */
  hide(): void;
  /** Hides the window and shows the main window on a screen, given as a route hash like `#/searches/ID`. */
  openInMain(hash: string): void;
  /** Fits the window to its content, in CSS px. */
  setHeight(height: number): void;
  /**
   * Fires each time the window is shown, so it can start fresh, with what the
   * clipboard named at that moment. The clipboard is read only then. Returns
   * an unsubscribe function.
   */
  onShown(listener: (clipboard: QuickClipboard) => void): () => void;
  /**
   * Fires shortly after each show with the site in the front browser tab, or
   * null (no browser in front, Linux, or nothing readable). The tab is read
   * only when the shortcut opens the window. Returns an unsubscribe function.
   */
  onFrontTab(listener: (tab: FrontTab | null) => void): () => void;
  /**
   * macOS, after an `ask` tab: asks for the Automation permission (macOS shows
   * its prompt the first time) and reads the tab. Null when nothing was read.
   */
  readFrontTab(): Promise<FrontTab | null>;
}

export type SaveEnrichedResult =
  /** Written to `filePath`, next to the original. */
  | { saved: true; filePath: string }
  | { saved: false; error: string };

/** Files dropped on the window and the enriched copy written next to them. */
export interface FilesApi {
  /**
   * The path of a file from a drop event, or '' when it has none. Runs in the
   * preload (`webUtils.getPathForFile`); the renderer reads the file's text itself.
   */
  pathFor(file: File): string;
  /**
   * Writes `csv` as `<name>.nvoke.csv` in the folder of `sourcePath`, a CSV,
   * TSV or TXT file that must exist. Main works out the name, never the
   * renderer, and replaces an earlier enriched copy.
   */
  saveEnriched(sourcePath: string, csv: string): Promise<SaveEnrichedResult>;
  /** Shows a file written by `saveEnriched` in the file manager. Refuses any other file. */
  reveal(filePath: string): Promise<void>;
}

/** How the local copy of the user's leads stands. All zero when signed out. */
export interface LocalStatus {
  /** Whether the last sync reached the server. Null before the first attempt. */
  online: boolean | null;
  syncing: boolean;
  /** ISO time of the last sync that reached the server. */
  syncedAt: string | null;
  searches: number;
  companies: number;
  emails: number;
}

/** Pushed after a sync or a delete changed the local copy. */
export interface LocalChange {
  status: LocalStatus;
  /** Searches whose companies were replaced or removed locally. */
  searchIds: string[];
  /** True when searches were added, changed or removed, so the list changed. */
  searchesChanged: boolean;
}

/** `LeadFilters` with an offset page. `limit` is 1 to 500, 200 by default. */
export type LocalCompaniesQuery = LeadFilters & { offset?: number; limit?: number };

/** Same companies and total as `CompaniesPage`, with an offset instead of a cursor. */
export type LocalCompaniesPage = Omit<CompaniesPage, 'nextCursor'> & { nextOffset: number | null };

/**
 * The copy of searches, companies and checked emails the main process keeps
 * in SQLite in userData. It mirrors what the API returns: a search or address
 * the API stops returning is deleted here too, and sign out wipes it.
 */
export interface LocalApi {
  /** The synced searches, newest first. Null when there is no local copy. */
  searches(): Promise<Search[] | null>;
  search(id: string): Promise<Search | null>;
  /**
   * Filters a finished search's companies locally, with the semantics of
   * `GET /v1/searches/:id/companies`. Null when the search is not synced yet
   * or still running.
   */
  companies(searchId: string, query: LocalCompaniesQuery): Promise<LocalCompaniesPage | null>;
  /** Re-fetches one search's companies in the background. */
  refresh(searchId: string): Promise<void>;
  status(): Promise<LocalStatus>;
  /** Subscribes to changes. Returns an unsubscribe function. */
  onChange(listener: (change: LocalChange) => void): () => void;
}

/**
 * How Claude Desktop, Claude Code and Cursor reach nvoke's local MCP server.
 * They start the app binary in Node mode on a small launcher that relays
 * stdio to a pipe in main, so they use this app's sign-in and no API key.
 */
export interface McpSetup {
  /** The `claude mcp add` line for Claude Code. */
  claudeCode: string;
  /** The JSON for Cursor's `~/.cursor/mcp.json`. */
  cursor: string;
  claudeDesktop: {
    configPath: string;
    /** Claude Desktop's config folder exists. */
    installed: boolean;
    /** The config already holds this exact nvoke entry. */
    added: boolean;
  };
  /** MCP clients connected now, by readable name. */
  clients: string[];
}

export type ClaudeDesktopResult =
  /** Written: `added` the first time, `updated` when an older entry was replaced. */
  | { status: 'added' | 'updated' | 'unchanged' | 'canceled' | 'not-installed' }
  | { status: 'error'; error: string };

export interface McpApi {
  getSetup(): Promise<McpSetup>;
  /** Asks for confirmation in a native dialog, then writes nvoke into claude_desktop_config.json. */
  addToClaudeDesktop(): Promise<ClaudeDesktopResult>;
  /** Subscribes to connected client changes. Returns an unsubscribe function. */
  onClientsChange(listener: (clients: string[]) => void): () => void;
}

/** A box the user dragged on the grab overlay, in CSS px from the display's top left. */
export interface GrabRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The display as it was when the grab started, frozen, for the overlay to paint under the box. */
export interface GrabFrame {
  /** A PNG data URL. It stays on this computer: main hands it only to the overlay window. */
  image: string;
  width: number;
  height: number;
}

/** One company read off the screen: a domain, or a name the server looks up. */
export interface GrabItem {
  text: string;
  kind: 'domain' | 'name';
}

/**
 * Where a screen grab is, pushed to the quick window. People are never in
 * `items`: personal addresses and names are dropped in main and only counted.
 */
export type GrabState =
  | { status: 'reading' }
  | { status: 'done'; items: GrabItem[]; people: number }
  | {
      status: 'error';
      /** `permission`: macOS screen recording is off. `ocr`: no text engine on this system. */
      reason: 'permission' | 'ocr' | 'empty' | 'failed';
      message: string;
    };

/** Grabbing a company list off the screen: a box, local OCR, a list to edit. */
export interface GrabApi {
  /** Hides the quick window and covers the display under the pointer with the grab overlay. */
  start(): void;
  /** Opens System Settings on Screen Recording (macOS). */
  openSettings(): void;
  /** Overlay only: the frozen frame to drag over. */
  getFrame(): Promise<GrabFrame | null>;
  /** Overlay only: the box to read. */
  select(rect: GrabRect): void;
  /** Overlay only: Esc, nothing read. */
  cancel(): void;
  /** Quick window: progress and the result. Returns an unsubscribe function. */
  onState(listener: (state: GrabState) => void): () => void;
}

export interface NvokeApi {
  getAppInfo(): Promise<AppInfo>;
  /** Opens an http(s) URL in the system browser. Other schemes are refused. */
  openExternal(url: string): Promise<void>;
  /** GET /health on apps/server, called from the main process. */
  getHealth(): Promise<HealthResponse>;
  /**
   * Calls apps/server from the main process, which attaches the device token.
   * `path` must start with `/v1/` and may carry a query string. A 401 signs
   * the app out and fires `auth.onChange`.
   */
  request(method: HttpMethod, path: string, body?: unknown): Promise<BridgeResponse>;
  /**
   * Shows a native save dialog and streams `GET /v1/searches/:id/export.csv`
   * to the chosen file. Never rejects.
   */
  exportCsv(searchId: string, defaultFileName: string): Promise<ExportResult>;
  /**
   * Call from a `dragstart` handler after `preventDefault()`. Main writes
   * `csv` to a temp file named `fileName` and starts a native file drag, so
   * the rows drop into Excel, Outlook, a CRM or a folder.
   */
  startDragCsv(fileName: string, csv: string): void;
  auth: AuthApi;
  files: FilesApi;
  local: LocalApi;
  inbox: InboxApi;
  window: WindowApi;
  desktop: DesktopApi;
  quick: QuickApi;
  mcp: McpApi;
  notifications: NotificationsApi;
  grab: GrabApi;
}
