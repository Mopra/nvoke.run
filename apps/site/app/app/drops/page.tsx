import type { Metadata } from 'next';
import { DropsScreen } from '@/components/app/drops/drops-screen';

export const metadata: Metadata = { title: 'Drops' };

export default function DropsPage() {
  return <DropsScreen />;
}
