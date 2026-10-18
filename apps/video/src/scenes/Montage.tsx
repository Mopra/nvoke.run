import type React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { AppWindow } from '../components/AppWindow';
import { Camera } from '../components/Camera';
import { Caption } from '../components/Caption';
import { useStage, type Box } from '../layout';
import { TAKE_HEIGHT, TAKE_WIDTH, useTake } from '../takes';
import { MONTAGE, MONTAGE_CUT, type TakeName } from '../timeline';

function Cut({ take, word, rect }: { take: TakeName; word: string; rect?: string }) {
  const stage = useStage();
  const state = useTake(take);
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
        <AppWindow take={take} box={box} />
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
