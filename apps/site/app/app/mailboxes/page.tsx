import type { Metadata } from 'next';
import { SendingGate } from '@/components/app/sending/gate';
import { MailboxesScreen } from '@/components/app/sending/mailboxes-screen';

export const metadata: Metadata = { title: 'Mailboxes' };

export default function MailboxesPage() {
  return (
    <SendingGate>
      <MailboxesScreen />
    </SendingGate>
  );
}
