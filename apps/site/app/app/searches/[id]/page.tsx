import type { Metadata } from 'next';
import { ResultsScreen } from '@/components/app/results-screen';

export const metadata: Metadata = { title: 'Results' };

export default async function SearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultsScreen key={id} id={id} />;
}
