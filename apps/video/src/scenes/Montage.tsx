import type React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { AppWindow } from '../components/AppWindow';
import { Camera } from '../components/Camera';
import { Caption } from '../components/Caption';
import { useStage, type Box } from '../layout';
import { Easing, interpolate } from 'remotion';
import { markTime, TAKE_HEIGHT, TAKE_WIDTH, useTake, type Take } from '../takes';
import { theme } from '../theme';
import { MONTAGE, MONTAGE_CUT, type MontageCut } from '../timeline';

const drag = Easing.bezier(0.33, 0, 0.2, 1);

/**
 * Grab from screen's box being dragged over the list, between the rig's
 * `drag` and `dropped` marks: the screen dims outside it, a crosshair pulls
 * the corner. The rig reads the box straight away, so the film draws the drag.
 */
function GrabDrag({ take, t }: { take: Take; t: number }) {
  const box = take.rects['grabBox'];
  const start = markTime(take, 'drag');
  const end = markTime(take, 'dropped');
  if (!box || !end || t < start - 200 || t > end + 120) return null;
  const k = interpolate(t, [start, end - 250], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: drag });
  const fade = interpolate(t, [start - 200, start, end, end + 120], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const w = Math.max(2, box.w * k);
  const h = Math.max(2, box.h * k);
  const cx = box.x + w;
  const cy = box.y + h;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: fade, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: box.x,
          top: box.y,
          width: w,
          height: h,
          borderRadius: 10,
          border: `3px solid ${theme.primary}`,
          background: 'oklch(0.57 0.215 268 / 0.08)',
          boxShadow: '0 0 0 9999px oklch(0.2 0.01 265 / 0.22)',
        }}
      />
      <svg width={48} height={48} viewBox="-24 -24 48 48" style={{ position: 'absolute', left: cx - 24, top: cy - 24 }}>
        <path d="M0 -18 V18 M-18 0 H18" stroke="white" strokeWidth={7} strokeLinecap="round" />
        <path d="M0 -18 V18 M-18 0 H18" stroke="oklch(0.2 0.01 265)" strokeWidth={3} strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Cut({ take, word, rect, from, rate = 1 }: MontageCut) {
  const stage = useStage();
  const state = useTake(take);
  const startFrom = from ? Math.max(0, (from.mark ? markTime(state.take, from.mark) : 0) + from.offset) : 0;
  const wide = stage.format === 'wide';
  // Wide: the word holds the left third, the window bleeds off the right edge.
  const w = stage.width * 0.64;
  const h = (w * TAKE_HEIGHT) / TAKE_WIDTH;
  const box: Box = wide ? { x: stage.width * 0.4, y: (stage.height - h) / 2, w, h } : stage.window;
  return (
    <AbsoluteFill>
      <Camera
        box={box}
        take={state.take}
        // A slow drift in for the length of the cut, toward what the cut is about.
        keys={[{ at: 0, dur: MONTAGE_CUT, rect, fill: 0.95, maxZoom: 1.12, anchor: { x: box.x + box.w / 2, y: box.y + box.h / 2 } }]}
      >
        <AppWindow
          take={take}
          box={box}
          startFrom={startFrom}
          playbackRate={rate}
          overlay={take === 'grab' ? (t) => <GrabDrag take={state.take} t={t} /> : undefined}
        />
      </Camera>
      <Caption
        text={word}
        duration={MONTAGE_CUT}
        enterAt={4}
        exit={12}
        size={wide ? 112 : 104}
        align={wide ? 'left' : 'center'}
        x={stage.width * 0.07}
        y={wide ? stage.height / 2 : undefined}
        style={wide ? { width: stage.width * 0.3 } : undefined}
      />
    </AbsoluteFill>
  );
}

/** 0:46 to 0:60. One cut per bar, one word per cut. */
export const Montage: React.FC = () => (
  <AbsoluteFill>
    {MONTAGE.map((cut, i) => (
      <Sequence key={cut.take} from={i * MONTAGE_CUT} durationInFrames={MONTAGE_CUT} premountFor={30}>
        <Cut {...cut} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
