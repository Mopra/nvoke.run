import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutationState } from '@tanstack/react-query';
import { LogoMark } from '@/components/Logo';
import { ArrowLeft, ArrowRight, CornerDownLeft, Globe, Loader2, Pencil, Play, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Aura, BackButton, PageHeader } from '@/components/AppShell';
import { CountryPicker } from '@/components/CountryPicker';
import { DeleteSiteProfileDialog } from '@/components/DeleteSiteProfileDialog';
import { Line, Pill, SentenceInput } from '@/components/Sentence';
import { FIELD_GRID, FIELD_NOTE, FIELD_PLATE, FIELD_WORD } from '@/components/SearchForm';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { countryName } from '@/lib/countries';
import { relativeTime, searchTitle } from '@/lib/format';
import { BUILD_SITE_PROFILE, useBuildSiteProfile, useSiteProfile, useUpdateSiteProfile } from '@/lib/queries';
import { navigate } from '@/lib/router';
import {
  buildPhase,
  draftToUpdate,
  parseWebsite,
  profileToDraft,
  siteProfileErrorLine,
  suggestionCaption,
  type ProfileDraft,
} from '@/lib/site-profile';
import { useStartSearch } from '@/lib/start-search';
import type { SiteProfile, SuggestedSearch } from '@nvoke/shared';
import { cn } from '@/lib/utils';

/**
 * Start from your website: paste your website, nvoke reads it and plans the
 * searches that find your buyers. `fresh` is New search: always the blank
 * field, following only the read it starts, then on to `#/website`. Without
 * it, the read on file (or running) and its suggestions, as listed on
 * Searches. docs/desktop/site-profile.md.
 */
export function StartFromWebsite({ fresh = false }: { fresh?: boolean }) {
  const profile = useSiteProfile();
  const build = useBuildSiteProfile();
  // Read from the mutation cache, so a build started before the user left and came back still shows.
  const cached = useMutationState({
    filters: { mutationKey: BUILD_SITE_PROFILE, status: 'pending' },
    select: (m) => ({ website: String(m.state.variables ?? ''), at: m.state.submittedAt }),
  }).at(-1);
  // New search ignores reads started before it opened: those are on Searches.
  const running = !fresh ? cached : build.isPending ? { website: build.variables ?? '', at: build.submittedAt } : undefined;
  // Nothing on file and nothing running: nothing to show here, so New search.
  const empty = !fresh && profile.data === null && !cached && !build.isError;
  useEffect(() => {
    if (empty) navigate({ name: 'new', kind: 'website' }, { replace: true });
  }, [empty]);
  const [site, setSite] = useState('');
  // True while the user reads another site (or again) over an existing profile.
  const [reading, setReading] = useState(false);

  function read(website: string): void {
    build.mutate(website, {
      onSuccess: () => {
        setReading(false);
        setSite('');
        if (fresh) navigate({ name: 'website' }, { replace: true });
      },
      onError: () => {
        setSite(website);
        setReading(true);
      },
    });
  }

  let body: ReactNode;
  if (running) {
    body = <Building website={running.website} startedAt={running.at} />;
  } else if (!fresh && (profile.isPending || empty)) {
    body = <ProfileSkeleton />;
  } else if (!fresh && profile.error) {
    body = (
      <div className="flex flex-col items-center">
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
        <ByHand />
      </div>
    );
  } else if (!fresh && profile.data && !reading) {
    body = (
      <Suggestions
        profile={profile.data}
        onReadAgain={() => read(profile.data!.website)}
        onReadAnother={() => navigate({ name: 'new', kind: 'website' })}
      />
    );
  } else {
    body = (
      <WebsiteStep
        value={site}
        onChange={setSite}
        onRead={read}
        error={build.isError ? build.error : null}
        failedSite={build.isError ? (build.variables ?? '') : ''}
        onBack={
          !fresh && profile.data
            ? () => {
                build.reset();
                setReading(false);
              }
            : null
        }
      />
    );
  }

  return (
    <>
      <Aura on={!!running} />
      <PageHeader leading={<BackButton />} newSearch={false} />
      <main className="fade-edges flex-1 overflow-auto px-8 pb-24">{body}</main>
    </>
  );
}

/** The link to the manual tabs form, on every state of the step. */
function ByHand({ className }: { className?: string }) {
  return (
    <Pill onClick={() => navigate({ name: 'new', kind: 'local' })} className={cn('inline-flex items-center gap-1.5 field:cap field:rounded-[3px]', className)}>
      Set up a search by hand
      <ArrowRight className="size-3" />
    </Pill>
  );
}

function WebsiteStep({
  value,
  onChange,
  onRead,
  error,
  failedSite,
  onBack,
}: {
  value: string;
  onChange: (value: string) => void;
  onRead: (website: string) => void;
  error: Error | null;
  failedSite: string;
  onBack: (() => void) | null;
}) {
  const [touched, setTouched] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const parsed = parseWebsite(value);

  useEffect(() => field.current?.focus(), []);

  function submit(event: FormEvent): void {
    event.preventDefault();
    setTouched(true);
    if (parsed) onRead(parsed.website);
  }

  const failed = error
    ? siteProfileErrorLine(
        error instanceof ApiError ? error.status : 0,
        error instanceof ApiError ? error.code : 'network',
        error instanceof ApiError ? error.detail : null,
        parseWebsite(failedSite)?.domain ?? '',
      )
    : null;
  const invalid = touched && !parsed;

  return (
    <form onSubmit={submit} noValidate className="mx-auto flex max-w-[760px] flex-col pt-[9vh] motion-safe:animate-view-in">
      <h1 className="sr-only">Start from your website</h1>
      {onBack && (
        <Pill onClick={onBack} className="-ml-3 mb-6 inline-flex items-center gap-1.5 self-start field:cap field:rounded-[3px]">
          <ArrowLeft className="size-3" />
          Back to your suggestions
        </Pill>
      )}
      <div className={cn('grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-3', FIELD_GRID)}>
        <Line lead="Start from" htmlFor="website">
          <SentenceInput
            id="website"
            ref={field}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setTouched(false);
            }}
            placeholder="yourcompany.com"
            inputMode="url"
            aria-invalid={invalid || !!failed}
            aria-describedby="website-hint"
            className={cn('font-mono font-normal tracking-tight', FIELD_WORD)}
          />
        </Line>
      </div>
      <p id="website-hint" className={cn('mt-5 max-w-xl text-pretty text-sm text-muted-foreground', FIELD_NOTE)}>
        nvoke reads your homepage and its about, pricing and services pages, works out who buys from you and plans the searches
        that find them. About 20 seconds. robots.txt is honored.
      </p>

      <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button type="submit" size="lg" className="min-w-40">
          Read my site
          <CornerDownLeft className="size-3.5 opacity-70" />
        </Button>
        {failed || invalid ? (
          <span role="alert" className="max-w-md text-sm text-destructive field:font-mono field:text-[10.5px]">
            {failed ?? 'Type your website, like yourcompany.com.'}
          </span>
        ) : null}
      </div>
      <div className="mt-8 -ml-3">
        <ByHand />
      </div>
    </form>
  );
}

/** While the server reads the site: the domain, one calm line per phase and an indeterminate bar. */
function Building({ website, startedAt }: { website: string; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const domain = parseWebsite(website)?.domain ?? website;
  const phase = buildPhase(now - (startedAt || now), domain);

  return (
    <div className="mx-auto flex max-w-[760px] flex-col pt-[9vh] motion-safe:animate-view-in" aria-busy="true">
      <h1 className="sr-only">Reading {domain}</h1>
      <LogoMark motion="loading" className="mb-8 size-10" />
      <p className="font-mono text-lg tracking-tight text-muted-foreground field:cap field:text-primary">{domain}</p>
      <p
        key={phase}
        aria-live="polite"
        className="mt-3 min-h-[2.6em] font-display text-4xl font-semibold text-balance motion-safe:animate-rise field:font-light"
      >
        {phase}
      </p>
      <div className="relative mt-6 h-[3px] w-72 overflow-hidden rounded-full bg-foreground/[0.07]" role="progressbar" aria-label="Reading your site">
        <div className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-primary/60 motion-safe:animate-indeterminate" />
      </div>
      <p className={cn('mt-6 text-sm text-muted-foreground', FIELD_NOTE)}>Usually 10 to 30 seconds. Leave if you like, the plan waits here.</p>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-3 px-6 pt-14">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-3 w-96" />
    </div>
  );
}

function Suggestions({
  profile,
  onReadAgain,
  onReadAnother,
}: {
  profile: SiteProfile;
  onReadAgain: () => void;
  onReadAnother: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const start = useStartSearch();

  return (
    <div className="mx-auto flex max-w-[760px] flex-col pt-10 motion-safe:animate-view-in">
      {editing ? (
        <ProfileEditor profile={profile} onDone={() => setEditing(false)} />
      ) : (
        <ProfileReadout
          profile={profile}
          onEdit={() => setEditing(true)}
          onReadAgain={onReadAgain}
          onReadAnother={onReadAnother}
          onRemove={() => setRemoving(true)}
        />
      )}

      <section aria-labelledby="suggestions-title" className="mt-14">
        <h2 id="suggestions-title" className="px-6 text-sm text-muted-foreground field:cap">
          Searches that find your buyers
        </h2>
        <div className="mt-2 flex flex-col gap-1">
          {profile.suggestions.map((s, i) => (
            <SuggestionRow
              key={i}
              suggestion={s}
              starting={start.pendingInput === s.search}
              disabled={start.isPending}
              onStart={() => start.start(s.search)}
            />
          ))}
        </div>
      </section>

      <div className="mt-8 px-3">
        <ByHand />
      </div>
      {/* Leave first: with no profile on file this screen sends the user to New search. */}
      <DeleteSiteProfileDialog
        profile={profile}
        open={removing}
        onOpenChange={setRemoving}
        onRemoving={() => navigate({ name: 'searches' }, { replace: true })}
      />
    </div>
  );
}

function ProfileReadout({
  profile,
  onEdit,
  onReadAgain,
  onReadAnother,
  onRemove,
}: {
  profile: SiteProfile;
  onEdit: () => void;
  onReadAgain: () => void;
  onReadAnother: () => void;
  onRemove: () => void;
}) {
  const p = profile.profile;
  return (
    <div className="px-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground field:cap">
        <Globe className="size-3.5" />
        <span className="font-mono field:text-primary" data-selectable>
          {profile.domain}
        </span>
        <span>read {relativeTime(profile.createdAt)}</span>
      </div>
      <h1 className="mt-3 font-display text-4xl font-semibold text-balance field:font-light">{p.name}</h1>
      <p className={cn('mt-2 max-w-2xl text-pretty text-base text-muted-foreground', FIELD_NOTE)}>{p.summary}</p>
      <p className="mt-5 max-w-2xl text-pretty text-sm field:font-mono field:text-[10.5px] field:leading-[1.6]">
        <span className="text-muted-foreground field:cap">Sells to </span>
        {p.audience}
      </p>
      <div className="mt-5 -ml-3 flex flex-wrap gap-1 field:ml-0 field:gap-2">
        <Pill onClick={onEdit} className={cn('inline-flex items-center gap-1.5', FIELD_KEY)}>
          <Pencil className="size-3" />
          Edit
        </Pill>
        <Pill onClick={onReadAgain} className={cn('inline-flex items-center gap-1.5', FIELD_KEY)}>
          <RotateCw className="size-3" />
          Read again
        </Pill>
        <Pill onClick={onReadAnother} className={FIELD_KEY}>
          Read another site
        </Pill>
        <Pill onClick={onRemove} className={cn('inline-flex items-center gap-1.5', FIELD_KEY)}>
          <Trash2 className="size-3" />
          Remove
        </Pill>
      </div>
    </div>
  );
}

function SuggestionRow({
  suggestion,
  starting,
  disabled,
  onStart,
}: {
  suggestion: SuggestedSearch;
  starting: boolean;
  disabled: boolean;
  onStart: () => void;
}) {
  const title = searchTitle(suggestion.search);
  return (
    <div
      data-suggestion
      className="flex items-center gap-6 rounded-[24px] px-6 py-5 transition-colors duration-200 hover:bg-foreground/[0.035] field:rounded-[6px]"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-lg font-medium field:font-normal" title={title}>
          {title}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground field:cap">{suggestionCaption(suggestion.search)}</div>
        <p className={cn('mt-2 text-pretty text-sm text-muted-foreground', FIELD_NOTE)}>{suggestion.why}</p>
      </div>
      <Button variant="outline" onClick={onStart} disabled={disabled} aria-label={`Start ${title}`} className="shrink-0">
        {starting ? <Loader2 className="motion-safe:animate-spin" /> : <Play className="size-3.5" />}
        Start
      </Button>
    </div>
  );
}

const FIELD_AREA = cn(
  'block w-full min-w-0 resize-none rounded-md border border-input bg-card px-2.5 py-1.5 text-sm shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-destructive/70 aria-invalid:ring-destructive/15 dark:bg-foreground/5',
  FIELD_PLATE,
  'field:border-0 field:px-2.5 field:py-1.5 field:text-xs field:dark:bg-card',
);
/** The profile's actions in Field: small keycaps instead of pills. */
const FIELD_KEY = 'field:key field:rounded-[3px] field:bg-secondary field:text-secondary-foreground field:hover:bg-secondary field:hover:brightness-[0.97] field:cap';

/** Every profile field inline, saved with one PATCH of what changed. */
function ProfileEditor({ profile, onDone }: { profile: SiteProfile; onDone: () => void }) {
  const [draft, setDraft] = useState<ProfileDraft>(() => profileToDraft(profile.profile));
  const [problem, setProblem] = useState<{ field: keyof ProfileDraft; message: string } | null>(null);
  const update = useUpdateSiteProfile();
  const set = (field: keyof ProfileDraft) => (value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    if (problem?.field === field) setProblem(null);
  };

  function save(event: FormEvent): void {
    event.preventDefault();
    const result = draftToUpdate(draft, profile.profile);
    if (!result.ok) {
      setProblem({ field: result.field, message: result.message });
      return;
    }
    if (!result.update) {
      onDone();
      return;
    }
    update.mutate(result.update, {
      onSuccess: () => {
        toast.success('Profile saved');
        onDone();
      },
      onError: (err) =>
        toast.error('Couldn’t save the profile', {
          description:
            err instanceof ApiError ? siteProfileErrorLine(err.status, err.code, err.detail, profile.domain) : err.message,
        }),
    });
  }

  const bad = (field: keyof ProfileDraft): boolean => problem?.field === field;

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-5 px-6">
      <h1 className="font-display text-2xl font-semibold field:font-light">Edit your profile</h1>
      <Field id="p-name" label="Name" problem={bad('name') ? problem!.message : null}>
        <Input id="p-name" value={draft.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={bad('name')} />
      </Field>
      <Field id="p-summary" label="What you do" problem={bad('summary') ? problem!.message : null}>
        <Area id="p-summary" rows={2} value={draft.summary} onChange={set('summary')} invalid={bad('summary')} />
      </Field>
      <Field id="p-offer" label="What you sell" problem={bad('offer') ? problem!.message : null}>
        <Area id="p-offer" rows={3} value={draft.offer} onChange={set('offer')} invalid={bad('offer')} />
      </Field>
      <Field id="p-audience" label="Who buys it" problem={bad('audience') ? problem!.message : null}>
        <Area id="p-audience" rows={3} value={draft.audience} onChange={set('audience')} invalid={bad('audience')} />
      </Field>
      <Field id="p-proof" label="Proof" hint="One per line: customers, numbers, awards." problem={bad('proofPoints') ? problem!.message : null}>
        <Area id="p-proof" rows={4} value={draft.proofPoints} onChange={set('proofPoints')} invalid={bad('proofPoints')} />
      </Field>
      <Field id="p-voice" label="Your words" hint="Comma separated." problem={bad('voice') ? problem!.message : null}>
        <Input id="p-voice" value={draft.voice} onChange={(e) => set('voice')(e.target.value)} aria-invalid={bad('voice')} />
      </Field>
      <div className="grid grid-cols-[8rem_minmax(0,16rem)] gap-6">
        <Field id="p-language" label="Language" hint="Two letters." problem={bad('language') ? problem!.message : null}>
          <Input
            id="p-language"
            value={draft.language}
            maxLength={2}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => set('language')(e.target.value)}
            aria-invalid={bad('language')}
            className="font-mono lowercase"
          />
        </Field>
        <Field id="p-country" label="Sells most in" hint={draft.country ? countryName(draft.country) : 'Any country.'} problem={bad('country') ? problem!.message : null}>
          <CountryPicker
            id="p-country"
            value={draft.country}
            onChange={set('country')}
            triggerClassName={cn(
              'h-8 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs dark:bg-foreground/5 [&>svg]:size-4',
              FIELD_PLATE,
              'field:border-0 field:px-2.5 field:py-0 field:text-xs field:dark:bg-card',
            )}
          />
        </Field>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending && <Loader2 className="motion-safe:animate-spin" />}
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  problem,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  problem: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground field:cap">
        {label}
      </label>
      {children}
      {(problem || hint) && (
        <p className={cn('text-xs field:font-mono field:text-[10.5px]', problem ? 'text-destructive' : 'text-muted-foreground')}>{problem ?? hint}</p>
      )}
    </div>
  );
}

function Area({
  id,
  rows,
  value,
  onChange,
  invalid,
}: {
  id: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  return <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} className={FIELD_AREA} />;
}
