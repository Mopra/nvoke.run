import type { Metadata } from 'next';
import { MailboxesScreen } from '@/components/app/sending/mailboxes-screen';

export const metadata: Metadata = { title: 'Mailboxes' };

export default function MailboxesPage() {
  return <MailboxesScreen />;
}
