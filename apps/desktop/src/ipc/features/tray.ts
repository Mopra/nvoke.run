import type { DesktopSettings } from '../contract';

/** The tray (menu bar on macOS) and start at login. The tray menu reaches the renderer as a DesktopCommand. */
export const TrayChannel = {
  desktopSetOpenAtLogin: 'desktop:set-open-at-login',
} as const;

export interface TraySettings {
  /**
   * Start nvoke at login, hidden in the tray (menu bar on macOS) with no
   * window. Turned on by the first sign-in; the user can turn it off on Account.
   */
  openAtLogin: boolean;
}

export interface TrayDesktopApi {
  /** Registers or removes the login item and returns the saved settings. */
  setOpenAtLogin(enabled: boolean): Promise<DesktopSettings>;
}
