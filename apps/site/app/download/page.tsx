import type { Metadata } from 'next';
import Link from 'next/link';
import { DownloadPicker } from '@/components/site/download-picker';
import { LogoMark } from '@/components/site/logo';
import { Container, Eyebrow, PageHeader } from '@/components/site/section';
import { getDownloads } from '@/lib/download';

export const metadata: Metadata = {
  title: 'nvoke Desktop',
  description: 'nvoke Desktop for Windows, macOS and Linux: the power tools, on the same account and plan as the web app.',
  alternates: { canonical: '/download' },
};

const POWERS = [
  ['Local render', 'Sites that refuse servers or need JavaScript, read from your own computer when you allow it.'],
  ['Daily drops', 'Fresh launches from Product Hunt, Show HN and Y Combinator every morning, with a notification.'],
  ['Quick search', 'A shortcut opens search over any app. Grab names off the screen, or drop a CSV to enrich it.'],
  ['Local copy', 'Every result on your computer: instant filters, offline, drag leads into Excel or your CRM.'],
] as const;

const STEPS = [
  ['Install', 'Download it and run the installer.'],
  ['Sign in', 'Open it and sign in with your browser. No account yet? You get one, on the Free plan.'],
  ['Search', 'Your searches from the browser are already there. Start the next one.'],
] as const;

const ch = (i: number) => String(i + 1).padStart(2, '0');

function Rows({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <ol className="border-b">
      {items.map(([name, body], i) => (
        <li key={name} className="grid gap-x-6 gap-y-1 border-t py-5 sm:grid-cols-[3rem_10rem_1fr]">
          <span className="cap text-muted-foreground tabular-nums">{ch(i)}</span>
          <span className="cap text-foreground">{name}</span>
          <p className="text-[15px] text-pretty text-muted-foreground sm:text-base">{body}</p>
        </li>
      ))}
    </ol>
  );
}

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
            ? 'The power tools, in a native app. Same account, plan and searches as the web app.'
            : 'The first public build is not out yet. Links show up here the moment it ships.'
        }
      />
      <Container className="pb-6">
        <DownloadPicker downloads={downloads} />
        <p className="mt-6 text-center text-[15px] text-pretty text-muted-foreground">
          Just want to search? nvoke runs in your browser.{' '}
          <Link href="/sign-up" className="text-foreground underline underline-offset-4">
            Start free
          </Link>
          .
        </p>
      </Container>

      <section aria-labelledby="powers" className="py-14 sm:py-20">
        <Container className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div className="flex flex-col gap-5">
            <Eyebrow>What it adds</Eyebrow>
            <h2 id="powers" className="text-headline font-light">
              The power tools.
            </h2>
          </div>
          <Rows items={POWERS} />
        </Container>
      </section>

      <section aria-labelledby="after-install" className="pb-14 sm:pb-20">
        <Container className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div className="flex flex-col gap-5">
            <Eyebrow>After you install</Eyebrow>
            <h2 id="after-install" className="text-headline font-light">
              Three steps.
            </h2>
          </div>
          <div>
            <Rows items={STEPS} />
            <p className="mt-4 text-[15px] text-muted-foreground">
              Plans and limits are on the{' '}
              <Link href="/pricing" className="text-foreground underline underline-offset-4">
                pricing page
              </Link>
              .
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
