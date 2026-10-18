import type React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import { Film, type FilmProps } from './Film';
import { loadTakes, placeholderTakes } from './takes';
import { DURATION, FPS } from './timeline';
import './fonts';

/** Reads public/takes/ before any frame renders; missing takes become placeholders. */
const withTakes: CalculateMetadataFunction<FilmProps> = async ({ props }) => ({
  props: { ...props, takes: await loadTakes() },
});

const shared = {
  component: Film,
  durationInFrames: DURATION,
  fps: FPS,
  defaultProps: { takes: placeholderTakes() },
  calculateMetadata: withTakes,
} as const;

export const Root: React.FC = () => (
  <>
    {/* The master: 1440p, 60 fps. */}
    <Composition id="Film" width={2560} height={1440} {...shared} />
    <Composition id="FilmSquare" width={1440} height={1440} {...shared} />
    <Composition id="FilmVertical" width={1080} height={1920} {...shared} />
  </>
);
