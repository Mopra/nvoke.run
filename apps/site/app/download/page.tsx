import type { Metadata } from 'next';
import Link from 'next/link';
import { DownloadPicker } from '@/components/site/download-picker';
import { Container, PageHeader, Section } from '@/components/site/section';
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
      <PageHeader
        title="Download nvoke"
        intro={
          downloads.available
            ? 'One app for Windows, macOS and Linux. Install it, sign in and start a search.'
            : 'The first public build is not out yet. The download links appear here as soon as it is.'
        }
      />
      <Container className="pb-6">
        <DownloadPicker downloads={downloads} />
      </Container>
      <Section title="After you install">
        <ol className="grid gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex flex-col gap-2 border-t pt-5">
              <span className="text-sm font-medium text-muted-foreground tabular-nums">Step {i + 1}</span>
              <p className="text-pretty">{step}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-sm text-muted-foreground">
          Plans and limits are on the{' '}
          <Link href="/pricing" className="text-foreground underline underline-offset-4">
            pricing page
          </Link>
          .
        </p>
      </Section>
    </>
  );
}
