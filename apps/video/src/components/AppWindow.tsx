import type React from 'react';
import { OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Box } from '../layout';
import { useStage } from '../layout';
import { TAKE_HEIGHT, TAKE_RADIUS, TAKE_WIDTH, useTake } from '../takes';
import { msToFrames, type TakeName } from '../timeline';
import { Cursor } from './Cursor';
import { TakePlaceholder } from './TakePlaceholder';

export interface AppWindowProps {
  take: TakeName;
  /** Where the window sits, in frame pixels. Its aspect should be 16:9. */
  box: Box;
  /** Ms into the take where this scene starts playing. */
  startFrom?: number;
  playbackRate?: number;
  /** Draw the take's pointer. */
  cursor?: boolean;
  /** How strongly the window lifts off the canvas, 0 to 1. Scenes raise it for a hero moment. */
  lift?: number;
  /** Drawn over the take in its own 2400x1350 pixels, given the take time in ms. */
  overlay?: (t: number) => React.ReactNode;
  style?: React.CSSProperties;
}

/** The time in the take (ms) shown at the current frame of this scene. */
export function useTakeTime(startFrom = 0, playbackRate = 1) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return startFrom + (frame / fps) * 1000 * playbackRate;
}

/**
 * One take, presented as a floating Windows 11 window: rounded mask (8
 * logical px), a hairline rim, and a layered shadow that ends in a faint iris
 * tint so the window belongs to the aura. The take plays at its native
 * 2400x1350 inside a scaled layer, so the cursor and rects share its pixels.
 */
export const AppWindow: React.FC<AppWindowProps> = ({
  take: name,
  box,
  startFrom = 0,
  playbackRate = 1,
  cursor = true,
  lift = 0.6,
  overlay,
  style,
}) => {
  const { unit } = useStage();
  const state = useTake(name);
  const t = useTakeTime(startFrom, playbackRate);
  const s = box.w / TAKE_WIDTH;
  const radius = TAKE_RADIUS * s;
  const u = unit;
  const shadow = [
    `0 ${0.5 * u}px ${1 * u}px oklch(0.25 0.02 265 / 0.1)`,
    `0 ${4 * u}px ${12 * u}px -${2 * u}px oklch(0.25 0.02 265 / ${0.06 + lift * 0.04})`,
    `0 ${30 * u}px ${70 * u}px -${24 * u}px oklch(0.25 0.03 265 / ${0.08 + lift * 0.08})`,
    `0 ${80 * u}px ${150 * u}px -${50 * u}px oklch(0.4 0.12 268 / ${0.06 + lift * 0.1})`,
  ].join(', ');

  const native: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TAKE_WIDTH,
    height: TAKE_HEIGHT,
    transform: `scale(${s})`,
    transformOrigin: '0 0',
  };

  return (
    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, ...style }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: radius, boxShadow: shadow }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', isolation: 'isolate' }}>
        <div style={native}>
          {state.hasVideo ? (
            <OffthreadVideo
              src={staticFile(`takes/${name}.mp4`)}
              trimBefore={Math.round(msToFrames(startFrom))}
              playbackRate={playbackRate}
              muted
              style={{ width: TAKE_WIDTH, height: TAKE_HEIGHT, display: 'block' }}
            />
          ) : (
            <TakePlaceholder take={state.take} />
          )}
          {overlay?.(t)}
        </div>
      </div>
      {/* Hairline rim and a top specular edge, above the content. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          boxShadow: `inset 0 0 0 ${Math.max(1, 1 * u)}px oklch(0.2 0.01 265 / 0.12), inset 0 ${Math.max(1, 1 * u)}px 0 oklch(1 0 0 / 0.6)`,
          pointerEvents: 'none',
        }}
      />
      {cursor && (state.hasVideo ? !state.placeholder : true) && (
        <div style={native}>
          <Cursor take={state.take} t={t} />
        </div>
      )}
    </div>
  );
};
