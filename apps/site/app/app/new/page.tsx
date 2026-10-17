import type { Metadata } from 'next';
import { NewSearchScreen } from '@/components/app/new-search-screen';
import { WebsiteScreen } from '@/components/app/site-profile';
import { isFormKind } from '@/lib/app/search-form';

export const metadata: Metadata = { title: 'New search' };

type Params = { kind?: string | string[]; manual?: string | string[] };

/**
 * `/app/new` opens on the website step. `?manual=1` opens the form by hand,
 * and so does `?kind=local` (and the other kinds), which picks its tab.
 */
export default async function NewSearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { kind, manual } = await searchParams;
  if (manual === undefined && kind === undefined) return <WebsiteScreen />;
  return <NewSearchScreen initialKind={isFormKind(kind) ? kind : 'local'} />;
}
