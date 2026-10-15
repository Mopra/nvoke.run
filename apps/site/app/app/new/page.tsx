import type { Metadata } from 'next';
import { NewSearchScreen } from '@/components/app/new-search-screen';
import { isFormKind } from '@/lib/app/search-form';

export const metadata: Metadata = { title: 'New search' };

export default async function NewSearchPage({ searchParams }: { searchParams: Promise<{ kind?: string | string[] }> }) {
  const { kind } = await searchParams;
  return <NewSearchScreen initialKind={isFormKind(kind) ? kind : 'local'} />;
}
