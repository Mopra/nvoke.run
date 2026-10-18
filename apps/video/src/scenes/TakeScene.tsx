import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { AppWindow } from '../components/AppWindow';
import { Camera, type CameraKey } from '../components/Camera';
import { Caption, type CaptionProps } from '../components/Caption';
import { useStage } from '../layout';
import { useTake } from '../takes';
import type { TakeName } from '../timeline';

export interface TakeSceneProps {
  take: TakeName;
  /** Scene length in frames. */
  duration: number;
  /** Caption shown over the scene; its duration defaults to the whole scene. */
  caption?: Omit<CaptionProps, 'duration'> & { duration?: number };
  camera?: CameraKey[];
  /** Ms into the take where the scene starts. */
  startFrom?: number;
  playbackRate?: number;
}

/**
 * The common shape of a storyboard beat: the window at rest under a caption,
 * the take playing, and a camera that pushes in once the caption has said its
 * line. The caption sits outside the camera so a push never scales the type.
 */
export const TakeScene: React.FC<TakeSceneProps> = ({ take, duration, caption, camera = [], startFrom = 0, playbackRate = 1 }) => {
  const stage = useStage();
  const state = useTake(take);
  return (
    <AbsoluteFill>
      <Camera box={stage.window} keys={camera} take={state.take}>
        <AppWindow take={take} box={stage.window} startFrom={startFrom} playbackRate={playbackRate} />
      </Camera>
      {caption && <Caption {...caption} duration={caption.duration ?? duration} />}
    </AbsoluteFill>
  );
};
