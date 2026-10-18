import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ClipboardList, CornerDownLeft, Globe, Loader2, MapPin, Rocket } from 'lucide-react';
import { BackButton, PageHeader } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Pill } from '@/components/Sentence';
import { isFormKind, SearchFields, SearchFootnote, useSearchForm, type FormKind } from '@/components/SearchForm';
import { useStartSearch } from '@/lib/start-search';
import { navigate } from '@/lib/router';
import { DescribeCustomer } from '@/screens/DescribeCustomer';
import { StartFromWebsite } from '@/screens/StartFromWebsite';

const SOURCES: Record<FormKind, string> = {
  local: 'Businesses on OpenStreetMap with a website, inside the area you name.',
  web: 'Company sites from web search. No social networks, marketplaces or news.',
  launches: 'Fresh launches from Product Hunt and Show HN.',
  domains: 'Companies you already know. Domains are read as given, names are looked up on the web.',
};

/**
 * New search. Plain `#/new` asks who you sell to (DescribeCustomer,
 * docs/desktop/people.md). `#/new?kind=website` opens the website step
 * (docs/desktop/site-profile.md), and a search kind (`#/new?kind=domains`,
 * from the command bar and "Other ways to search") the manual form on that tab.
 */
export function NewSearchScreen({ initialKind }: { initialKind: string | null }) {
  if (isFormKind(initialKind)) return <ManualSearch initialKind={initialKind} />;
  if (initialKind === 'website') return <StartFromWebsite fresh />;
  return <DescribeCustomer />;
}

function ManualSearch({ initialKind }: { initialKind: FormKind }) {
  const [kind, setKind] = useState<FormKind>(initialKind);
  const form = useSearchForm(kind);
  const firstField = useRef<HTMLInputElement>(null);
  const listField = useRef<HTMLTextAreaElement>(null);
  const create = useStartSearch();

  useEffect(() => {
    (kind === 'domains' ? listField.current : firstField.current)?.focus();
  }, [kind]);

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    form.setTouched(true);
    if (!form.input) return;
    create.start(form.input);
  }

  return (
    <>
      <PageHeader leading={<BackButton />} newSearch={false} />
      <main className="fade-edges flex-1 overflow-auto px-8 pb-24">
        <form onSubmit={submit} className="mx-auto flex max-w-[760px] flex-col pt-[9vh] motion-safe:animate-view-in" noValidate>
          <h1 className="sr-only">New search</h1>
          <Pill onClick={() => navigate({ name: 'new', kind: null })} className="-ml-3 mb-6 inline-flex items-center gap-1.5 self-start">
            <ArrowLeft className="size-3" />
            Describe your customer instead
          </Pill>
          <div className="flex flex-col items-start gap-3">
            <Segmented
              label="Where to look"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'local', label: 'Local businesses', icon: MapPin },
                { value: 'web', label: 'Web search', icon: Globe },
                { value: 'launches', label: 'New launches', icon: Rocket },
                { value: 'domains', label: 'Paste a list', icon: ClipboardList },
              ]}
            />
            <p key={kind} className="pl-1 text-sm text-muted-foreground motion-safe:animate-fade-in">
              {SOURCES[kind]}
            </p>
          </div>

          {/* A tab switch brings its fields in; the form's values live in useSearchForm, so nothing is lost. */}
          <div key={kind} className="mt-14 motion-safe:animate-view-in">
            <SearchFields form={form} firstField={firstField} listField={listField} />
          </div>

          <div className="mt-16 flex items-center gap-6">
            <Button type="submit" size="lg" disabled={create.isPending} className="min-w-40">
              {create.isPending ? <Loader2 className="motion-safe:animate-spin" /> : null}
              Start search
              {!create.isPending && <CornerDownLeft className="size-3.5 opacity-70" />}
            </Button>
            <SearchFootnote form={form} />
          </div>
        </form>
      </main>
    </>
  );
}
