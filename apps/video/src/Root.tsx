import type React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import { Film, type FilmProps } from './Film';
import { Launch, type LaunchProps } from './launch/Launch';
import { LAUNCH_DURATION } from './launch/timing';
import { Reel, REEL_DURATION } from './studio/Reel';
import { Studio, STUDIO_DURATION, WORLD_INSERTS } from './studio/Studio';
import { Teaser, type TeaserProps } from './teaser/Teaser';
import { TEASER_DURATION } from './teaser/timing';
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

const withTeaserTakes: CalculateMetadataFunction<TeaserProps> = async ({ props }) => ({
  props: { ...props, takes: await loadTakes() },
});

const teaser = {
  component: Teaser,
  durationInFrames: TEASER_DURATION,
  fps: FPS,
  defaultProps: { takes: placeholderTakes(), voice: 'af_heart' },
  calculateMetadata: withTeaserTakes,
} as const;

const studio = {
  ...teaser,
  component: Studio,
  durationInFrames: STUDIO_DURATION,
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
    {/* The teaser, studio finish: dark takes, a real lens, grain, the hero bar, 31 s. */}
    <Composition id="TeaserStudio" width={2560} height={1440} {...studio} />
    <Composition id="TeaserStudioVertical" width={1080} height={1920} {...studio} />
    {/* The studio cut with a real world clip on each line of the voice. */}
    <Composition id="TeaserWorld" width={2560} height={1440} {...studio} defaultProps={{ ...teaser.defaultProps, inserts: WORLD_INSERTS }} />
    {/* A test of generated real world clips cut against the app, 12 s. */}
    <Composition id="RealReel" width={2560} height={1440} {...studio} component={Reel} durationInFrames={REEL_DURATION} />
    {/* The teaser: Nothing style, dots and sound, 29 s. */}
    <Composition id="Teaser" width={2560} height={1440} {...teaser} />
    <Composition id="TeaserVertical" width={1080} height={1920} {...teaser} />
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
