/** Updates from GitHub Releases and the What's new card after one. docs/desktop/updates.md. */
export const UpdatesChannel = {
  updatesGetState: 'updates:get-state',
  updatesCheck: 'updates:check',
  /** Restarts into the downloaded update, or on macOS opens its download. */
  updatesInstall: 'updates:install',
  /** Main to renderer push, payload an UpdateState. */
  updatesChanged: 'updates:changed',
  updatesGetWhatsNew: 'updates:get-whats-new',
  /** The user closed the card: it stays closed until the next update. */
  updatesDismissWhatsNew: 'updates:dismiss-whats-new',
  /** Main to renderer push, payload a WhatsNew. The capture run uses it to show the card. */
  updatesWhatsNew: 'updates:whats-new',
} as const;

/**
 * - `unsupported`: a development build, or a Linux install that is not an AppImage.
 * - `available`: macOS only. Unsigned builds cannot install themselves, so the user downloads it.
 * - `ready`: downloaded, installs on restart (or by itself while the window is hidden).
 */
export type UpdateStatus = 'unsupported' | 'idle' | 'checking' | 'downloading' | 'available' | 'ready' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  /** The running version. */
  current: string;
  /** The newer version, while downloading, available or ready. */
  version: string | null;
  /** Download progress, 0 to 100, while downloading. */
  percent: number | null;
  /** When the last check finished, epoch ms. */
  checkedAt: number | null;
  error: string | null;
}

export interface ReleaseNoteEntry {
  version: string;
  items: string[];
}

/** The releases installed since the user last saw the app, newest first. */
export interface WhatsNew {
  version: string;
  notes: ReleaseNoteEntry[];
}

export interface UpdatesApi {
  getState(): Promise<UpdateState>;
  /** Checks now. Resolves with the state once the check has started. */
  check(): Promise<UpdateState>;
  install(): Promise<void>;
  onChange(listener: (state: UpdateState) => void): () => void;
  /** Null unless this is the first start after an update. */
  getWhatsNew(): Promise<WhatsNew | null>;
  dismissWhatsNew(): Promise<void>;
  onWhatsNew(listener: (whatsNew: WhatsNew) => void): () => void;
}

export interface UpdatesBridge {
  updates: UpdatesApi;
}
