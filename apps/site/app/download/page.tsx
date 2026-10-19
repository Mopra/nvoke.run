import type { Metadata } from 'next';
import Link from 'next/link';
import { DownloadPicker } from '@/components/site/download-picker';
import { Powers } from '@/components/site/download/powers';
import { InstallSteps } from '@/components/site/download/steps';
import { RevealHeading } from '@/components/site/home/reveal';
import { LogoMark } from '@/components/site/logo';
import { Container, PageHeader } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { getDownloads } from '@/lib/download';

export const metadata: Metadata = {
  title: 'nvoke Desktop',
  description: 'nvoke Desktop for Windows, macOS and Linux: the power tools, on the same account and plan as the web app.',
  alternates: { canonical: '/download' },
};

export default function DownloadPage() {
  const downloads = getDownloads();

  return (
    <>
      <PageHeader
        icon={<LogoMark className="size-16 sm:size-20" />}
        eyebrow={'Windows · macOS · Linux'}
        title="nvoke Desktop"
        intro={
          downloads.available
            ? 'The power tools, native. Same account, plan and searches as the web app.'
            : 'The first public build is on its way. Links show up here the moment it ships.'
        }
      />

      {/* The hero screen finds the visitor's system, the key under it downloads. */}
      <section aria-label="Download" className="pb-20 sm:pb-28">
        <Container>
          <DownloadPicker downloads={downloads} />
        </Container>
      </section>

      <section aria-labelledby="powers" className="py-20 sm:py-28">
        <Container>
          <RevealHeading id="powers" className="max-w-2xl text-headline font-light" lines={['The power tools.']} />
          <p className="mt-5 max-w-md text-lede text-pretty text-muted-foreground">What the browser cannot do.</p>
          <Powers />
        </Container>
      </section>

      <section aria-labelledby="after-install" className="py-20 sm:py-28">
        <Container>
          <RevealHeading id="after-install" className="max-w-2xl text-headline font-light" lines={['Three steps.']} />
          <p className="mt-5 max-w-md text-lede text-pretty text-muted-foreground">
            Plans and limits are on the{' '}
            <Link href="/pricing" className="text-foreground underline underline-offset-4">
              pricing page
            </Link>
            .
          </p>
          <InstallSteps />
        </Container>
      </section>

      <section aria-labelledby="download-cta" className="pt-20 pb-24 sm:pt-28 sm:pb-36">
        <Container className="flex flex-col items-center text-center">
          <RevealHeading id="download-cta" className="max-w-4xl text-display font-light" lines={['Just want to search?']} />
          <p className="mt-6 max-w-md text-lede text-pretty text-muted-foreground">nvoke runs in your browser.</p>
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Button asChild size="xl" variant="dark">
              <Link href="/sign-up">Start free</Link>
            </Button>
            <Button asChild size="xl" variant="secondary">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
