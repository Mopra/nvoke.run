'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { APP_FRAME } from '@/components/app/shell';
import { EmptyState, LoadingState } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/app/api';
import { useFinishMicrosoftSignIn, useMicrosoftAdminConsent } from '@/lib/app/queries';
import { sendingError } from '@/lib/app/sending';
import { cn } from '@/lib/utils';

/**
 * Microsoft's codes for "an admin must consent first" (the server's
 * `needsAdminConsent` in apps/server/src/sending/oauth.ts knows the same).
 */
const ADMIN_CONSENT_CODES = /AADSTS(65001|90094|90095|90008)\b/;

/**
 * Where Microsoft sends the browser after Sign in with Microsoft. Hands the
 * code to the API once, then goes back to Mailboxes, where the new row shows
 * its check. A cancel or a refusal stays here with the reason. An admin who
 * approved the app for their organization lands here too.
 */
export function MicrosoftCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const finish = useFinishMicrosoftSignIn();
  const consent = useMicrosoftAdminConsent();
  const sent = useRef(false);
  const code = params.get('code');
  const state = params.get('state');
  const denied = params.get('error');
  const description = params.get('error_description');
  const approved = params.get('admin_consent')?.toLowerCase() === 'true';

  useEffect(() => {
    if (sent.current || !code || !state) return;
    sent.current = true;
    finish.mutate(
      { code, state },
      {
        onSuccess: (mailbox) => {
          toast.success('Mailbox connected', { description: `${mailbox.address}: checking the sign-in and a test email now.` });
          router.replace('/app/mailboxes');
        },
      },
    );
  }, [code, state, finish, router]);

  if (!denied && code && state && !finish.isError) return <LoadingState label="Connecting the mailbox" />;

  const back = (
    <Button asChild variant="outline">
      <Link href="/app/mailboxes">Back to mailboxes</Link>
    </Button>
  );

  if (approved && !denied) {
    return (
      <main className={cn(APP_FRAME, 'app-view')}>
        <EmptyState icon={ShieldCheck} title="nvoke is approved" action={back}>
          Everyone in your organization can now connect their mailbox with Sign in with Microsoft.
        </EmptyState>
      </main>
    );
  }

  const needsAdmin =
    denied === 'consent_required' ||
    ADMIN_CONSENT_CODES.test(description ?? '') ||
    (finish.error instanceof ApiError && finish.error.code === 'oauth_admin_consent');
  const copyLink = () =>
    consent.mutate(undefined, {
      onSuccess: () => toast.success('Approval link copied', { description: 'Send it to your Microsoft 365 admin.' }),
      onError: (err) => toast.error(sendingError(err)),
    });

  if (needsAdmin) {
    return (
      <main className={cn(APP_FRAME, 'app-view')}>
        <EmptyState
          icon={ShieldCheck}
          title="An admin must approve nvoke"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={copyLink} disabled={consent.isPending}>
                Copy approval link
              </Button>
              {back}
            </div>
          }
        >
          Your organization lets only an admin approve apps. Send them the link: they open it once, approve, and then you sign in with
          Microsoft again.
        </EmptyState>
      </main>
    );
  }

  const reason = denied
    ? denied === 'access_denied'
      ? 'The sign-in was canceled.'
      : description?.split('\n')[0] || 'Microsoft did not finish the sign-in.'
    : finish.isError
      ? sendingError(finish.error)
      : 'The link is missing the sign-in. Start it again from Mailboxes.';
  return (
    <main className={cn(APP_FRAME, 'app-view')}>
      <EmptyState icon={KeyRound} title="Not connected" action={back}>
        {reason}
      </EmptyState>
    </main>
  );
}
