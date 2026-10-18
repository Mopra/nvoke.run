import type React from 'react';
import { SCENES, sec } from '../timeline';
import { TakeScene } from './TakeScene';

/*
 * 0:09 to 0:46, the product story. Each beat: the caption says its line over
 * the window at rest, steps aside, then the camera pushes in on what the line
 * is about (a rect the rig measured; placeholders stand in until then). Rough
 * moves for now: retime against the real takes and their marks.
 */

/** 0:09 Paste your site. */
export const Paste: React.FC = () => (
  <TakeScene
    take="paste-site"
    duration={SCENES.paste.duration}
    caption={{ text: 'Paste your site.', enterAt: 10, duration: sec(3.2) }}
    camera={[
      { at: sec(2.9), dur: 100, rect: 'siteField', fill: 0.62 },
      { at: sec(5.6), dur: 80 },
    ]}
  />
);

/** 0:16 Start a suggested search; the aura rises with it (AURA_KEYS). */
export const Start: React.FC = () => (
  <TakeScene
    take="start-search"
    duration={SCENES.start.duration}
    caption={{ text: 'It plans the searches.', enterAt: 10, duration: sec(3) }}
    camera={[
      { at: sec(2.6), dur: 90, rect: 'suggestion', fill: 0.6 },
      { at: sec(4.6), dur: 70 },
    ]}
  />
);

/** 0:22 Counters tick, rows land with Valid badges. */
export const Results: React.FC = () => (
  <TakeScene
    take="results"
    duration={SCENES.results.duration}
    caption={{
      text: 'Real companies. Real people. Verified emails.',
      enterAt: 10,
      size: 84,
      stagger: 5,
      duration: sec(4.2),
    }}
    camera={[
      { at: sec(3.9), dur: 100, rect: 'counters', fill: 0.62 },
      { at: sec(6.6), dur: 110, rect: 'rows', fill: 0.86 },
      { at: sec(9.6), dur: 80 },
    ]}
  />
);

/** 0:33 One person: decision maker, and the opener written for them. */
export const Opener: React.FC = () => (
  <TakeScene
    take="opener"
    duration={SCENES.opener.duration}
    caption={{ text: 'An opener for each one.', enterAt: 10, duration: sec(3.1) }}
    camera={[
      { at: sec(2.8), dur: 90, rect: 'personRow', fill: 0.8, ease: 'spring' },
      { at: sec(4.8), dur: 100, rect: 'opener', fill: 0.62 },
    ]}
  />
);

/** 0:41 Export CSV. */
export const Export: React.FC = () => (
  <TakeScene
    take="export"
    duration={SCENES.export.duration}
    caption={{ text: 'We find. You send.', enterAt: 10, duration: SCENES.export.duration }}
    camera={[{ at: sec(1.2), dur: 140, zoom: 1.12, focus: { x: 1800, y: 400 } }]}
  />
);
