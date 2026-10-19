import { Fragment } from 'react';

/**
 * A title whose words rise into place one after another when it first shows,
 * as the site's headlines do (apps/site/components/site/home/reveal.tsx). The
 * words stay real text for screen readers and selection. A new text replays
 * the rise; under reduced motion the words are simply there.
 */
export function RevealWords({ text, step = 55 }: { text: string; step?: number }) {
  const words = text.split(' ');
  return (
    <Fragment key={text}>
      {words.map((word, i) => (
        <Fragment key={i}>
          <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
            <span className="inline-block motion-safe:animate-word-in" style={{ animationDelay: `${i * step}ms` }}>
              {word}
            </span>
          </span>
          {i < words.length - 1 && ' '}
        </Fragment>
      ))}
    </Fragment>
  );
}
