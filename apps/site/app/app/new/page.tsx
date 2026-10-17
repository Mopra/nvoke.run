import type { Metadata } from 'next';
import { IcpSearchScreen } from '@/components/app/icp-search-screen';
import { NewSearchScreen } from '@/components/app/new-search-screen';
import { WebsiteScreen } from '@/components/app/site-profile';
import { isFormKind } from '@/lib/app/search-form';

export const metadata: Metadata = { title: 'New search' };

type Params = { kind?: string | string[]; manual?: string | string[]; site?: string | string[] };

/**
 * `/app/new` asks who you sell to, in plain words (Describe your customer).
 * The other ways to search hang off it: `?site=1` opens a blank website field
 * (a read already on file lives at `/app/website`), `?manual=1` the form by
 * hand, and `?kind=local` (and the other kinds) the form on that tab.
 */
export default async function NewSearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { kind, manual, site } = await searchParams;
  if (site !== undefined) return <WebsiteScreen fresh />;
  if (manual !== undefined || kind !== undefined) return <NewSearchScreen initialKind={isFormKind(kind) ? kind : 'local'} />;
  return <IcpSearchScreen />;
}
