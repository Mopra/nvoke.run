import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SendingGate } from '@/components/app/sending/gate';
import { MicrosoftCallback } from '@/components/app/sending/microsoft-callback';
import { LoadingState } from '@/components/app/states';

export const metadata: Metadata = { title: 'Mailboxes' };

export default function MailboxCallbackPage() {
  return (
    <SendingGate>
      <Suspense fallback={<LoadingState />}>
        <MicrosoftCallback />
      </Suspense>
    </SendingGate>
  );
}
