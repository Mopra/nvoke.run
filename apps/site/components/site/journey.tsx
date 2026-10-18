'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DescribeScene, EmptyScene, FindScene, HandoffScene, LoopScene } from '@/components/site/journey-scenes';
import { cn } from '@/lib/utils';

type Stage = {
  eyebrow: string;
  title: string;
  body: ReactNode;
  note?: string;
  scene: (seen: boolean) => ReactNode;
};

const STAGES: Stage[] = [
  {
    eyebrow: 'Day zero',
    title: 'An empty list',
    body: 'No leads and a number to hit. Every list you could buy went stale before you paid for it.',
    scene: () => <EmptyScene />,
  },
  {
    eyebrow: 'One minute',
    title: 'Say who you sell to',
    body: 'In your own words: "independent dental clinics in Austin". Or a trade and a city, a keyword, a list of domains, or just your website. nvoke turns it into a plan of searches.',
    scene: () => <DescribeScene />,
  },
  {
    eyebrow: 'nvoke works',
    title: 'It reads their sites and checks every address',
    body: 'nvoke finds the companies, opens up to eight pages per site and collects every published email. Then it asks each mail server if the mailbox exists. You pay for the ones that do.',
    scene: (seen) => <FindScene seen={seen} />,
  },
  {
    eyebrow: 'Your move',
    title: 'Send from the tool you already use',
    body: 'Export a CSV, copy the addresses, or pull them over the API. Import them into Instantly, Lemlist, HubSpot or Gmail and write the sequence there. nvoke never sends an email. Your tool does.',
    scene: () => <HandoffScene />,
  },
  {
    eyebrow: 'Every day after',
    title: 'Then put it on repeat',
    body: 'A drop watches Product Hunt, Show HN and Y Combinator and runs once a day, with a notification when new leads land. A webhook posts each verified lead to your URL, so Zapier, Make or Clay push it into your sequence. Nobody opens the app.',
    note: 'Drops and webhooks are in nvoke Desktop and the API. A described customer search can also keep finding new leads, a few a day.',
    scene: () => <LoopScene />,
  },
];

/**
 * The lead journey on the landing page: five stages on a vertical rail, the
 * iris lead dot travelling down it as each stage scrolls into view. Each
 * stage plays once when it is reached and pauses while off screen; the last
 * one loops. Without JavaScript, or with reduced motion, every stage shows in
 * its finished state (app/motion-journey.css).
 */
export function Journey() {
  const listRef = useRef<HTMLOListElement>(null);
  const [seen, setSeen] = useState<boolean[]>(() => STAGES.map(() => false));
  const [visible, setVisible] = useState<boolean[]>(() => STAGES.map(() => false));

  useEffect(() => {
    const list = listRef.current;
    // Reduced motion and old browsers keep the finished, still picture.
    if (!list || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const items = Array.from(list.children) as HTMLElement[];
    // From here on, stages wait for their turn (motion-journey.css).
    list.dataset.js = '';
    const indexOf = (el: Element) => items.indexOf(el as HTMLElement);

    // A stage counts as reached once its top is a third of the way up the screen.
    const reach = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = indexOf(e.target);
          reach.unobserve(e.target);
          setSeen((s) => s.map((v, j) => v || j <= i));
        }
      },
      { rootMargin: '0px 0px -30% 0px' },
    );
    // Animations run only while their stage is on screen.
    const watch = new IntersectionObserver((entries) => {
      setVisible((s) => {
        const next = [...s];
        for (const e of entries) next[indexOf(e.target)] = e.isIntersecting;
        return next;
      });
    });
    for (const el of items) {
      reach.observe(el);
      watch.observe(el);
    }
    return () => {
      reach.disconnect();
      watch.disconnect();
    };
  }, []);

  return (
    <ol ref={listRef} className="journey mx-auto max-w-5xl">
      {STAGES.map((stage, i) => {
        const last = i === STAGES.length - 1;
        return (
          <li
            key={stage.title}
            className="j-stage grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-5 sm:grid-cols-[1.5rem_minmax(0,1fr)] sm:gap-x-10"
            data-seen={seen[i] ? '' : undefined}
            data-visible={visible[i] ? '' : undefined}
            data-next={seen[i + 1] ? '' : undefined}
          >
            <div aria-hidden="true" className="flex flex-col items-center pt-1.5">
              <span className={cn('j-marker relative size-3 shrink-0 rounded-full', last && 'j-marker-loop')} />
              {last ? null : (
                <span className="j-segment relative mt-2 w-px flex-1 bg-border">
                  <span className="j-fill absolute inset-x-0 top-0 bg-primary" />
                  <span className="j-dot absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-glow" />
                </span>
              )}
            </div>
            <div
              className={cn(
                'grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16',
                !last && 'pb-24 sm:pb-36',
              )}
            >
              <div className="j-text max-w-md">
                <span className="text-sm font-medium text-muted-foreground tabular-nums">
                  {i + 1}. {stage.eyebrow}
                </span>
                <h3 className="mt-4 text-title font-semibold text-balance">{stage.title}</h3>
                <p className="mt-5 text-lg text-pretty text-muted-foreground">{stage.body}</p>
                {stage.note ? <p className="mt-5 text-sm text-pretty text-muted-foreground/80">{stage.note}</p> : null}
              </div>
              <div className="relative flex justify-center lg:justify-end">
                <div aria-hidden="true" className="j-aura aura pointer-events-none absolute -inset-[12%] rounded-full" />
                {stage.scene(Boolean(seen[i]))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
