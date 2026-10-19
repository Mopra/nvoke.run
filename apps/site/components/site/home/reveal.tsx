'use client';

import { useInView } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

/**
 * A headline whose words rise into place one after another when it scrolls
 * into view. Each line is a string; the words stay real text for readers
 * and search engines. Reduced motion shows it at once (motion-reduce).
 */
export function RevealHeading({
  id,
  lines,
  className,
  as: Tag = 'h2',
}: {
  id?: string;
  lines: string[];
  className?: string;
  as?: 'h1' | 'h2';
}) {
  const [ref, inView] = useInView<HTMLHeadingElement>('0px 0px -10% 0px', true);
  let n = 0;
  return (
    <Tag ref={ref} id={id} className={className}>
      {lines.map((line) => (
        <span key={line} className="block">
          {line.split(' ').map((word, i) => {
            const delay = n++ * 55;
            return (
              <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                <span
                  className={cn(
                    'inline-block transition-[transform,opacity,filter] duration-700 ease-out-soft motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:blur-none motion-reduce:transition-none',
                    inView ? 'translate-y-0 opacity-100 blur-none' : 'translate-y-[0.6em] opacity-0 blur-[6px]',
                  )}
                  style={{ transitionDelay: inView ? `${delay}ms` : '0ms' }}
                >
                  {word}
                </span>
                {' '}
              </span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}
