import type { DesktopSettings } from '../contract';

/** The watched inbox folder: a CSV put there is enriched in the background. */
export const InboxChannel = {
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
} as const;

export interface InboxSettings {
  /** The watched inbox folder is on: a CSV put there is enriched in the background. Off until the user turns it on. */
  inboxEnabled: boolean;
  /** Where the inbox is, `Documents/nvoke/inbox` unless the user picked another folder. */
  inboxFolder: string;
  /** Why the inbox is not watching, for example the folder can't be created. Null when it works. */
  inboxError: string | null;
}

export interface InboxDesktopApi {
  /** Starts or stops watching the inbox folder, creating it when needed. */
  setInboxEnabled(enabled: boolean): Promise<DesktopSettings>;
  /** Opens a folder picker and watches the chosen folder. Resolves with the unchanged settings when dismissed. */
  chooseInboxFolder(): Promise<DesktopSettings>;
  /** Shows the inbox folder in the file manager. */
  openInboxFolder(): Promise<void>;
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

export interface InboxBridge {
  inbox: InboxApi;
}
