import type { Metadata } from 'next';
import { SearchesScreen } from '@/components/app/searches-screen';

export const metadata: Metadata = { title: 'Searches' };

export default function SearchesPage() {
  return <SearchesScreen />;
}
