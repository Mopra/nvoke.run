import type { DesktopSettings } from '../contract';

/** The local render crawl: sites the VPS could not read, read from this computer while it is idle. */
export const LocalCrawlChannel = {
  desktopSetLocalCrawl: 'desktop:set-local-crawl',
} as const;

export interface LocalCrawlSettings {
  /**
   * Read the sites the server crawl could not from this computer, in a
   * hidden window while it is idle (docs/desktop/local-crawl.md). On until
   * the user turns it off.
   */
  localCrawl: boolean;
}

export interface LocalCrawlDesktopApi {
  /** Turns the local render crawl on or off and returns the saved settings. */
  setLocalCrawl(enabled: boolean): Promise<DesktopSettings>;
}
