import type React from 'react';
import { SCENES, sec } from '../timeline';
import { TakeScene } from './TakeScene';

/*
 * 0:09 to 0:46, the product story. Each beat: the caption says its line over
 * the window at rest, steps aside, then the camera pushes in on what the line
 * is about (a rect the rig measured; placeholders stand in until then). Rough
 * moves for now: retime against the real takes and their marks.
 */

/*
 * Rule for every beat: the caption says its line over the window at rest and
 * leaves before the camera pushes in, so a zoomed window never runs into type.
 */

/** 0:09 Paste your site: type the domain, Read my site, the reading screen. */
export const Paste: React.FC = () => (
  <TakeScene
    take="journey"
    duration={SCENES.paste.duration}
    caption={{ text: 'Paste your site.', enterAt: 6, duration: sec(2.1) }}
    camera={[
      { at: sec(1.9), dur: 90, rect: 'siteField', fill: 0.55, maxZoom: 1.6 },
      { at: sec(4.8), dur: 90 },
    ]}
  />
);

/** 0:16 The profile and its searches land; Start the first. The aura rises with it (AURA_KEYS). */
export const Start: React.FC = () => (
  <TakeScene
    take="journey"
    fromMark={{ mark: 'suggestions', offset: -1200 }}
    duration={SCENES.start.duration}
    caption={{ text: 'It plans the searches.', enterAt: 6, duration: sec(2.2) }}
    camera={[
      { at: sec(2.1), dur: 80, rect: 'suggestion', fill: 0.7, maxZoom: 1.5 },
      { at: sec(4.6), dur: 80 },
    ]}
  />
);

/** 0:22 The search runs, sped up: counters climb, rows land with Valid badges. */
export const Results: React.FC = () => (
  <TakeScene
    take="journey"
    fromMark={{ mark: 'first-row', offset: -600 }}
    playbackRate={2.6}
    duration={SCENES.results.duration}
    caption={{
      text: 'Real companies. Real people. Verified emails.',
      enterAt: 6,
      size: 84,
      stagger: 4,
      duration: sec(3),
    }}
    camera={[
      { at: sec(2.8), dur: 100, rect: 'counters', fill: 0.78 },
      { at: sec(6.4), dur: 110, rect: 'first-company', fill: 0.86 },
      { at: sec(9.6), dur: 80 },
    ]}
  />
);

/** 0:33 Draft openers: each company gets a first line built on its own site. */
export const Opener: React.FC = () => (
  <TakeScene
    take="journey"
    fromMark={{ mark: 'drafting', offset: -1500 }}
    playbackRate={1.4}
    duration={SCENES.opener.duration}
    caption={{ text: 'An opener for each one.', enterAt: 6, duration: sec(2.4) }}
    camera={[
      { at: sec(2.6), dur: 100, rect: 'first-company', fill: 0.88, ease: 'spring' },
      { at: sec(7.2), dur: 60 },
    ]}
  />
);

/** 0:41 Export CSV, then the line the brand stands on. */
export const Export: React.FC = () => (
  <TakeScene
    take="journey"
    fromMark={{ mark: 'export', offset: -2400 }}
    duration={SCENES.export.duration}
    caption={{ text: 'We find. You send.', enterAt: sec(3.4), duration: SCENES.export.duration }}
    camera={[
      { at: sec(0.3), dur: 90, rect: 'exportButton', fill: 0.3, maxZoom: 1.5 },
      { at: sec(2.9), dur: 70 },
    ]}
  />
);
