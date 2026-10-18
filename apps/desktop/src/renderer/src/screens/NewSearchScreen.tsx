import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, ClipboardList, CornerDownLeft, Globe, Loader2, MapPin, Rocket, type LucideIcon } from 'lucide-react';
import { BackButton, PageHeader, Panel } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/Sentence';
import { isFormKind, LimitKnob, SearchFields, SearchFootnote, useSearchForm, type FormKind } from '@/components/SearchForm';
import { useStartSearch } from '@/lib/start-search';
import { navigate } from '@/lib/router';
import { cn } from '@/lib/utils';
import { DescribeCustomer } from '@/screens/DescribeCustomer';
import { StartFromWebsite } from '@/screens/StartFromWebsite';

/** The kinds in order, with the short name the keycaps carry. */
const KINDS: { value: FormKind; label: string; short: string; icon: LucideIcon }[] = [
  { value: 'local', label: 'Local businesses', short: 'Local', icon: MapPin },
  { value: 'web', label: 'Web search', short: 'Web', icon: Globe },
  { value: 'launches', label: 'New launches', short: 'Launches', icon: Rocket },
  { value: 'domains', label: 'Paste a list', short: 'List', icon: ClipboardList },
];

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

/**
 * The manual form as a panel: the kind keys on the left, the sentence in the
 * middle with the Start key under it, and the limit knob on the right. A list
 * has no limit, so its column stays empty.
 */
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
      <PageHeader leading={<BackButton />} />
      <Panel className="px-9 pb-24">
        <form onSubmit={submit} className="flex flex-col pt-7 motion-safe:animate-view-in" noValidate>
          <h1 className="sr-only">New search</h1>
          <Pill onClick={() => navigate({ name: 'new', kind: null })} className="mb-7 self-start">
            <ArrowLeft className="size-3" />
            Describe your customer instead
          </Pill>
          <div className="grid grid-cols-[196px_minmax(0,1fr)_210px] gap-10">
            <div className="flex flex-col gap-4">
              <KindKeys label="Where to look" value={kind} onChange={setKind} />
              <p key={kind} className="text-sm text-muted-foreground motion-safe:animate-fade-in">
                {SOURCES[kind]}
              </p>
            </div>

            <div className="flex flex-col pt-1">
              {/* A key switch brings its fields in; the form's values live in useSearchForm, so nothing is lost. */}
              <div key={kind} className="motion-safe:animate-view-in">
                <SearchFields form={form} firstField={firstField} listField={listField} presets={false} />
              </div>
              <div className="mt-9 flex items-center gap-5">
                <Button type="submit" size="lg" disabled={create.isPending} className="min-w-40">
                  {create.isPending ? <Loader2 className="motion-safe:animate-spin" /> : null}
                  Start search
                  {!create.isPending && <CornerDownLeft className="size-3.5 opacity-70" />}
                </Button>
                <SearchFootnote form={form} />
              </div>
            </div>

            <div className="pt-1">{kind !== 'domains' && <LimitKnob form={form} />}</div>
          </div>
        </form>
      </Panel>
    </>
  );
}

/**
 * The kind picker: four square keycaps in a block, the icon over a cap label,
 * an LED above each, the chosen one orange and lit. Radio semantics, arrow
 * keys move the choice.
 */
function KindKeys({ label, value, onChange }: { label: string; value: FormKind; onChange: (kind: FormKind) => void }) {
  const refs = useRef(new Map<FormKind, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = KINDS.findIndex((k) => k.value === value);
    const next = KINDS[(index + step + KINDS.length) % KINDS.length];
    if (!next) return;
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="grid grid-cols-2 gap-x-2.5 gap-y-4 pt-1">
      {KINDS.map(({ value: kind, short, icon: Icon }) => {
        const active = kind === value;
        return (
          <div key={kind} className="flex flex-col items-center gap-2">
            <span aria-hidden className={cn('led', active && 'led-on')} />
            <button
              ref={(el) => {
                if (el) refs.current.set(kind, el);
                else refs.current.delete(kind);
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(kind)}
              className={cn(
                'key flex h-[84px] w-full flex-col items-center justify-center gap-1.5 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                active ? 'key-primary bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:brightness-[0.97]',
              )}
            >
              <Icon className="size-[22px]" strokeWidth={1.4} />
              <span className="cap">{short}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
