/** Grab from screen: a box over a company list, read by the OS text engine. */
export const GrabChannel = {
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

export interface GrabBridge {
  grab: GrabApi;
}
