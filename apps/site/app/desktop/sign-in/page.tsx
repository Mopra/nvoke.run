import type { Metadata } from 'next';
import { CodeChallenge, DesktopState } from '@nvoke/shared';
import { LogoMark } from '@/components/site/logo';
import { Card, CardDescription, CardHeader, CardLabel, CardTitle } from '@/components/app/plate';
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
    <section className="rim relative">
      <div className="relative mx-auto flex min-h-[70dvh] max-w-md flex-col items-center gap-8 px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex flex-col items-center gap-4">
          <LogoMark motion="intro" className="size-12" />
          <span className="cap text-muted-foreground">nvoke Desktop</span>
        </div>
        {state.success && codeChallenge.success ? (
          <DesktopSignIn state={state.data} codeChallenge={codeChallenge.data} />
        ) : (
          <Card className="w-full">
            <CardHeader>
              <CardLabel className="flex items-center gap-2">
                <span className="led bg-destructive" />
                Broken link
              </CardLabel>
              <CardTitle>This sign-in link is broken</CardTitle>
              <CardDescription>Start over from Sign in in the nvoke app.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </section>
  );
}
