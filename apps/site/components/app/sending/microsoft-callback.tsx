'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { APP_FRAME } from '@/components/app/shell';
import { EmptyState, LoadingState } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { useFinishMicrosoftSignIn } from '@/lib/app/queries';
import { sendingError } from '@/lib/app/sending';
import { cn } from '@/lib/utils';

/**
 * Where Microsoft sends the browser after Sign in with Microsoft. Hands the
 * code to the API once, then goes back to Mailboxes, where the new row shows
 * its check. A cancel or a refusal stays here with the reason.
 */
export function MicrosoftCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const finish = useFinishMicrosoftSignIn();
  const sent = useRef(false);
  const code = params.get('code');
  const state = params.get('state');
  const denied = params.get('error');

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

  const reason = denied
    ? denied === 'access_denied'
      ? 'The sign-in was canceled, or an admin must approve nvoke for your organization first.'
      : params.get('error_description')?.split('\n')[0] || 'Microsoft did not finish the sign-in.'
    : finish.isError
      ? sendingError(finish.error)
      : 'The link is missing the sign-in. Start it again from Mailboxes.';
  return (
    <main className={cn(APP_FRAME, 'app-view')}>
      <EmptyState
        icon={KeyRound}
        title="Not connected"
        action={
          <Button asChild variant="outline">
            <Link href="/app/mailboxes">Back to mailboxes</Link>
          </Button>
        }
      >
        {reason}
      </EmptyState>
    </main>
  );
}
