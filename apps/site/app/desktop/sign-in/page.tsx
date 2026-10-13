import type { Metadata } from 'next';
import { CodeChallenge, DesktopState } from '@nvoke/shared';
import { LogoMark } from '@/components/site/logo';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DesktopSignIn } from './desktop-sign-in';

export const metadata: Metadata = {
  title: 'Sign in to the desktop app',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Opened by the desktop app in the system browser with `state` and
 * `code_challenge`. Signs the user in with Clerk, mints a one-time code on the
 * server and hands it back to the app through `nvoke://auth/callback`.
 */
export default async function DesktopSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const state = DesktopState.safeParse(params['state']);
  const codeChallenge = CodeChallenge.safeParse(params['code_challenge']);

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="halo pointer-events-none absolute top-24 left-1/2 h-[30rem] w-[44rem] max-w-[140vw] -translate-x-1/2 opacity-35 dark:opacity-40"
      />
      <div className="relative mx-auto flex min-h-[70dvh] max-w-md flex-col items-center gap-8 px-6 py-16 sm:py-24">
        <LogoMark className="size-14" />
        {state.success && codeChallenge.success ? (
          <DesktopSignIn state={state.data} codeChallenge={codeChallenge.data} />
        ) : (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>This sign-in link is broken</CardTitle>
              <CardDescription>Start over from Sign in in the nvoke app.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </section>
  );
}
