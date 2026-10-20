import type { Metadata } from 'next';
import { SendingGate } from '@/components/app/sending/gate';
import { RepliesScreen } from '@/components/app/sending/replies-screen';

export const metadata: Metadata = { title: 'Replies' };

export default function RepliesPage() {
  return (
    <SendingGate>
      <RepliesScreen />
    </SendingGate>
  );
}
