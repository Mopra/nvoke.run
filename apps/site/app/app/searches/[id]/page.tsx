import type { Metadata } from 'next';
import { ResultsScreen } from '@/components/app/results-screen';

/** The screen names the tab after the search once it loads (ResultsScreen). */
export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultsScreen key={id} id={id} />;
}
