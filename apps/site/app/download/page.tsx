import type { Metadata } from 'next';
import Link from 'next/link';
import { MacSignedOutWindow } from '@/components/mockups/screens';
import { Stage } from '@/components/mockups/stage';
import { DownloadPicker } from '@/components/site/download-picker';
import { LogoMark } from '@/components/site/logo';
import { Container, PageHeader } from '@/components/site/section';
import { getDownloads } from '@/lib/download';

export const metadata: Metadata = {
  title: 'nvoke Desktop',
  description: 'nvoke Desktop for Windows, macOS and Linux: the power tools, on the same account and plan as the web app.',
  alternates: { canonical: '/download' },
};

const STEPS = [
  'Download and install it.',
  'Open it and sign in with your nvoke account. No account yet? You get one, on the Free plan.',
  'Your searches from the browser are already there. Hit New search for the next one.',
];

const POWERS = [
  ['Reads the sites servers can’t', 'Sites that refuse servers or need JavaScript, read from your own computer when you allow it.'],
  ['Daily drops', 'Fresh launches from Product Hunt, Show HN and Y Combinator every morning, with a notification.'],
  ['Over any app', 'A shortcut opens search anywhere. Grab names from the screen, or drop a CSV to enrich it.'],
  ['Offline copy', 'Every result on your computer: instant filters, drag leads into Excel or your CRM.'],
] as const;

export default function DownloadPage() {
  const downloads = getDownloads();

  return (
    <>
      <div className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 h-[34rem] w-[60rem] max-w-[160vw] -translate-x-1/2"
        >
          <div className="aura absolute inset-0 rounded-full motion-safe:animate-breathe" />
        </div>
        <PageHeader
          icon={<LogoMark className="size-20 sm:size-24" />}
          title="nvoke Desktop"
          intro={
            downloads.available
              ? 'The power tools, in a native app for Windows, macOS and Linux. Same account, plan and searches as the web app.'
              : 'The first public build is not out yet. Links show up here the moment it ships.'
          }
        />
      </div>
      <Container className="pb-16 sm:pb-24">
        <DownloadPicker downloads={downloads} />
        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-pretty text-muted-foreground">
          Just want to search? nvoke runs in your browser, nothing to install.{' '}
          <Link href="/sign-up" className="text-foreground underline underline-offset-4">
            Start free in the browser
          </Link>
          .
        </p>
      </Container>

      <section aria-labelledby="powers" className="pb-8">
        <Container>
          <h2 id="powers" className="sr-only">
            What nvoke Desktop adds
          </h2>
          <dl className="grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {POWERS.map(([title, body]) => (
              <div key={title} className="flex flex-col gap-2.5">
                <dt className="font-display text-lg font-semibold tracking-[-0.015em]">{title}</dt>
                <dd className="text-pretty text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section aria-labelledby="after-install" className="overflow-x-clip py-24 sm:py-36">
        <Container className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="flex flex-col gap-8">
            <h2 id="after-install" className="text-title font-semibold text-balance sm:text-[3.5rem] sm:leading-[1.02]">
              After you install
            </h2>
            <ol className="flex flex-col">
              {STEPS.map((step, i) => (
                <li key={step} className="grid grid-cols-[4.5rem_1fr] items-baseline py-4">
                  <span className="text-sm font-medium text-muted-foreground tabular-nums">Step {i + 1}</span>
                  <p className="text-lg text-pretty">{step}</p>
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted-foreground">
              Plans and limits:{' '}
              <Link href="/pricing" className="text-foreground underline underline-offset-4">
                pricing page
              </Link>
              .
            </p>
          </div>
          <Stage width={720} height={470} label="The nvoke app on macOS after install, asking you to sign in with your browser.">
            <MacSignedOutWindow />
          </Stage>
        </Container>
      </section>
    </>
  );
}
