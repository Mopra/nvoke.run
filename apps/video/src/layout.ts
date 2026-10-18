import { useVideoConfig } from 'remotion';
import { TAKE_HEIGHT, TAKE_WIDTH } from './takes';

export type Format = 'wide' | 'square' | 'vertical';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Stage {
  format: Format;
  width: number;
  height: number;
  /** Type scale: 1 on the 2560x1440 master. */
  unit: number;
  /** Where the app window rests while a caption sits above it. */
  window: Box;
  /** The window centered in the frame, for the cold open's float in. */
  windowCentered: Box;
  /** Vertical center of the caption band above the window. */
  captionY: number;
  /** Max caption width before it wraps. */
  captionWidth: number;
}

const fit = (w: number): Pick<Box, 'w' | 'h'> => ({ w, h: (w * TAKE_HEIGHT) / TAKE_WIDTH });

/**
 * Responsive framing. The master (16:9) sets the look: the window at about
 * 56% of the width under a caption band. Square and vertical reuse the same
 * scenes with a bigger window share and a taller caption band.
 */
export function useStage(): Stage {
  const { width, height } = useVideoConfig();
  const ratio = width / height;
  const format: Format = ratio > 1.2 ? 'wide' : ratio > 0.8 ? 'square' : 'vertical';

  if (format === 'wide') {
    const unit = height / 1440;
    const { w, h } = fit(width * 0.56);
    const y = height * 0.3;
    return {
      format,
      width,
      height,
      unit,
      window: { x: (width - w) / 2, y, w, h },
      windowCentered: { x: (width - w) / 2, y: (height - h) / 2, w, h },
      captionY: y * 0.54,
      captionWidth: width * 0.8,
    };
  }
  if (format === 'square') {
    const unit = width / 1700;
    const { w, h } = fit(width * 0.86);
    const y = height * 0.36;
    return {
      format,
      width,
      height,
      unit,
      window: { x: (width - w) / 2, y, w, h },
      windowCentered: { x: (width - w) / 2, y: (height - h) / 2, w, h },
      captionY: y * 0.52,
      captionWidth: width * 0.86,
    };
  }
  const unit = width / 1500;
  const { w, h } = fit(width * 0.92);
  const y = height * 0.4;
  return {
    format,
    width,
    height,
    unit,
    window: { x: (width - w) / 2, y, w, h },
    windowCentered: { x: (width - w) / 2, y: (height - h) / 2, w, h },
    captionY: y * 0.6,
    captionWidth: width * 0.86,
  };
}
