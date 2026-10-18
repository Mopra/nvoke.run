import type React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import { Film, type FilmProps } from './Film';
import { Launch, type LaunchProps } from './launch/Launch';
import { LAUNCH_DURATION } from './launch/timing';
import { loadTakes, placeholderTakes } from './takes';
import { DURATION, FPS } from './timeline';
import './fonts';

/** Reads public/takes/ before any frame renders; missing takes become placeholders. */
const withTakes: CalculateMetadataFunction<FilmProps> = async ({ props }) => ({
  props: { ...props, takes: await loadTakes() },
});

const withLaunchTakes: CalculateMetadataFunction<LaunchProps> = async ({ props }) => ({
  props: { ...props, takes: await loadTakes() },
});

const launch = {
  component: Launch,
  durationInFrames: LAUNCH_DURATION,
  fps: FPS,
  defaultProps: { takes: placeholderTakes() },
  calculateMetadata: withLaunchTakes,
} as const;

const shared = {
  component: Film,
  durationInFrames: DURATION,
  fps: FPS,
  defaultProps: { takes: placeholderTakes() },
  calculateMetadata: withTakes,
} as const;

export const Root: React.FC = () => (
  <>
    {/* The launch cut: about 29 s on the music's grid. */}
    <Composition id="Launch" width={2560} height={1440} {...launch} />
    <Composition id="LaunchSquare" width={1440} height={1440} {...launch} />
    <Composition id="LaunchVertical" width={1080} height={1920} {...launch} />
    {/* The long walkthrough, 70 s. */}
    <Composition id="Film" width={2560} height={1440} {...shared} />
    <Composition id="FilmSquare" width={1440} height={1440} {...shared} />
    <Composition id="FilmVertical" width={1080} height={1920} {...shared} />
  </>
);
