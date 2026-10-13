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
  'Download and install nvoke for your system.',
  'Open it and sign in, or create an account. New accounts start on the Free plan.',
  'Click New search, pick a search kind and fill in the fields.',
];

export default function DownloadPage() {
  const downloads = getDownloads();

  return (
    <>
      <div className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="halo pointer-events-none absolute top-16 left-1/2 h-80 w-[44rem] max-w-[140vw] -translate-x-1/2 opacity-40 dark:opacity-60"
        />
        <PageHeader
          icon={<LogoMark className="size-20 sm:size-24" />}
          title="Download nvoke"
          intro={
            downloads.available
              ? 'One app for Windows, macOS and Linux. Install it, sign in and start a search.'
              : 'The first public build is not out yet. The download links appear here as soon as it is.'
          }
        />
      </div>
      <Container className="pb-24 sm:pb-36">
        <DownloadPicker downloads={downloads} />
      </Container>

      <section aria-labelledby="after-install" className="border-t py-24 sm:py-36">
        <Container className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="flex flex-col gap-8">
            <h2 id="after-install" className="text-headline font-semibold text-balance">
              After you install
            </h2>
            <ol className="flex flex-col">
              {STEPS.map((step, i) => (
                <li key={step} className="grid grid-cols-[4.5rem_1fr] items-baseline border-t py-5">
                  <span className="text-sm font-medium text-muted-foreground tabular-nums">Step {i + 1}</span>
                  <p className="text-lg text-pretty">{step}</p>
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted-foreground">
              Plans and limits are on the{' '}
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
