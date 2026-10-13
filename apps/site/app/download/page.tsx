import type { Metadata } from 'next';
import Link from 'next/link';
import { MacSignedOutWindow } from '@/components/mockups/screens';
import { Stage } from '@/components/mockups/stage';
import { DownloadPicker } from '@/components/site/download-picker';
import { LogoMark } from '@/components/site/logo';
import { Container, PageHeader } from '@/components/site/section';
import { getDownloads } from '@/lib/download';

export const metadata: Metadata = {
  title: 'Download',
  description: 'Download nvoke for Windows, macOS or Linux.',
  alternates: { canonical: '/download' },
};

const STEPS = [
  'Download and install it.',
  'Open it and sign in. No account yet? You get one, on the Free plan.',
  'Hit New search, pick a kind, fill in two fields.',
];

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
          title="Download nvoke"
          intro={
            downloads.available
              ? 'Windows, macOS and Linux. Install, sign in, search.'
              : 'The first public build is not out yet. Links show up here the moment it ships.'
          }
        />
      </div>
      <Container className="pb-24 sm:pb-36">
        <DownloadPicker downloads={downloads} />
      </Container>

      <section aria-labelledby="after-install" className="py-24 sm:py-36">
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
