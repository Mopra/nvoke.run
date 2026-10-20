import type { Metadata } from 'next';
import { RepliesScreen } from '@/components/app/sending/replies-screen';

export const metadata: Metadata = { title: 'Replies' };

export default function RepliesPage() {
  return <RepliesScreen />;
}
