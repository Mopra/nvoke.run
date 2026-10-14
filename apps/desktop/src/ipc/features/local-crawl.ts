import type { DesktopSettings } from '../contract';

/** The local render crawl: sites the VPS could not read, read from this computer while it is idle. */
export const LocalCrawlChannel = {
  desktopSetLocalCrawl: 'desktop:set-local-crawl',
} as const;

export interface LocalCrawlSettings {
  /**
   * Read sites that refuse our servers or need JavaScript from this computer,
   * in a hidden window while it is idle (docs/desktop/local-crawl.md). Off by
   * default.
   */
  localCrawl: boolean;
}

export interface LocalCrawlDesktopApi {
  /** Turns the local render crawl on or off and returns the saved settings. */
  setLocalCrawl(enabled: boolean): Promise<DesktopSettings>;
}
