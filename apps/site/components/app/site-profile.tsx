'use client';

import { useEffect, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, CornerDownLeft, Loader2, Pencil, Play, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateSearchInput, SiteProfile, SuggestedSearch } from '@nvoke/shared';
import { CountryPicker } from '@/components/app/country-picker';
import { useStartSearch } from '@/components/app/new-search-screen';
import { Pill, SENTENCE } from '@/components/app/sentence';
import { BackLink } from '@/components/app/shell';
import { ErrorState } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useBuildSiteProfile, useSiteProfile, useUpdateSiteProfile } from '@/lib/app/queries';
import {
  BUILD_PHASES,
  BUILD_SLOW_MS,
  buildPhase,
  buildProblem,
  displayDomain,
  MANUAL_PATH,
  profileForm,
  profilePatch,
  readWebsite,
  suggestionCaption,
  suggestionTitle,
  type ProfileForm,
} from '@/lib/app/site-profile';
import { cn } from '@/lib/utils';

/**
 * New search, step one: the user's own website. nvoke reads it, works out who
 * buys from them and suggests searches to start in one click. With a profile
 * on the account the screen opens straight on the suggestions.
 */
export function WebsiteScreen() {
  const profile = useSiteProfile();
  const build = useBuildSiteProfile();
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [domain, setDomain] = useState('');
  // With a profile on file: typing another site, or editing the profile.
  const [entering, setEntering] = useState(false);
  const [editing, setEditing] = useState(false);

  function run(raw: string): void {
    const read = readWebsite(raw);
    if (!read.ok) {
      setProblem(read.problem);
      return;
    }
    setProblem(null);
    setDomain(read.domain);
    build.mutate(read.website, {
      onSuccess: () => {
        setEntering(false);
        setEditing(false);
      },
      onError: () => {
        // Back to the field with what was read, so the error sits under it.
        setValue(raw);
        setEntering(true);
      },
    });
  }

  let body: ReactNode;
  if (profile.isPending) {
    body = <ProfileSkeleton />;
  } else if (profile.error) {
    body = <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  } else if (build.isPending) {
    body = <Building domain={domain} />;
  } else if (!profile.data || entering) {
    body = (
      <WebsiteForm
        value={value}
        onChange={(v) => {
          setValue(v);
          setProblem(null);
        }}
        onSubmit={() => run(value)}
        problem={problem ?? (build.error ? buildProblem(build.error, domain) : null)}
        onCancel={
          profile.data
            ? () => {
                setEntering(false);
                build.reset();
              }
            : undefined
        }
      />
    );
  } else {
    const current = profile.data;
    body = (
      <ProfileView
        profile={current}
        editing={editing}
        onEdit={setEditing}
        onReadAgain={() => run(current.website)}
        onAnother={() => {
          setValue('');
          build.reset();
          setEntering(true);
        }}
      />
    );
  }

  return (
    <main className="w-full px-4 pb-24 sm:px-8">
      <div className="relative mx-auto flex max-w-[760px] flex-col pt-8 motion-safe:animate-rise sm:pt-[6vh]">
        <BackLink />
        <div className="mt-6">{body}</div>
      </div>
    </main>
  );
}

/** The way out to the tabs, on every state of the step. */
function ManualLink({ children = 'Set up a search by hand' }: { children?: ReactNode }) {
  return (
    <Link
      href={MANUAL_PATH}
      className="rounded-full text-sm text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      {children}
    </Link>
  );
}

function WebsiteForm({
  value,
  onChange,
  onSubmit,
  problem,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  problem: string | null;
  onCancel?: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);

  function submit(event: FormEvent): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">Start from your website</h1>
      <p className="mt-3 max-w-lg text-base text-pretty text-muted-foreground">
        nvoke reads your site, works out who buys from you and plans the searches that find them. About 20 seconds.
      </p>

      <div className="group/line relative mt-12 pb-2">
        <label htmlFor="website" className="sr-only">
          Your website
        </label>
        <input
          id="website"
          ref={field}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="yourcompany.com"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? 'website-problem' : undefined}
          className={cn(SENTENCE, 'w-full font-mono font-normal tracking-tight')}
        />
        <span className="absolute inset-x-0 bottom-0 h-px bg-border transition-colors duration-300 group-focus-within/line:bg-primary/70" />
      </div>

      {problem && (
        <p id="website-problem" role="alert" className="mt-4 text-sm text-pretty">
          <span className="text-destructive">{problem}</span> <ManualLink>Set one up by hand instead.</ManualLink>
        </p>
      )}

      <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
        <Button type="submit" size="lg" className="min-w-44">
          Plan my searches
          <CornerDownLeft className="size-3.5 opacity-70" />
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Keep the current profile
          </Button>
        ) : (
          !problem && <ManualLink />
        )}
      </div>
      <p className="mt-6 max-w-sm text-xs text-muted-foreground">
        We read your homepage and its about, pricing and services pages, and honor robots.txt. Free, 10 sites a day.
      </p>
    </form>
  );
}

/** While the server reads the site: the phases one after another, no fake percentage, and the aura. */
function Building({ domain }: { domain: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(timer);
  }, []);
  const current = buildPhase(elapsed);

  return (
    <section role="status" aria-live="polite" aria-label={`Reading ${domain}`} className="relative">
      <div
        aria-hidden
        className="aura pointer-events-none absolute -top-48 left-1/2 -z-10 h-[460px] w-[760px] max-w-[150vw] -translate-x-1/2 rounded-full motion-safe:animate-breathe"
      />
      <h1 className="truncate font-mono text-[26px]/[34px] tracking-tight sm:text-4xl">{domain}</h1>
      <div className="mt-6 h-[3px] w-full max-w-md overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className="h-full w-1/4 rounded-full bg-primary motion-safe:animate-indeterminate" />
      </div>
      <ol className="mt-10 flex flex-col gap-3">
        {BUILD_PHASES.map((phase, i) => (
          <li
            key={i}
            className={cn(
              'flex items-center gap-3 font-display text-lg transition-colors duration-500 sm:text-xl',
              i < current && 'text-muted-foreground',
              i === current && 'font-medium text-foreground',
              i > current && 'text-foreground/20',
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {i < current ? (
                <Check className="size-4" strokeWidth={2} />
              ) : i === current ? (
                <span className="relative flex size-2">
                  <span className="absolute inset-0 rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
                  <span className="relative size-2 rounded-full bg-primary" />
                </span>
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            {phase.label(domain)}
          </li>
        ))}
      </ol>
      <p className="mt-10 text-sm text-muted-foreground">
        {elapsed >= BUILD_SLOW_MS ? 'Big sites take a little longer. Still on it.' : 'Keep this tab open. It takes about 20 seconds.'}
      </p>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-10 w-72 max-w-full" />
      <Skeleton className="h-4 w-full max-w-lg" />
      <div className="mt-12 flex flex-col gap-8">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-8">
            <div className="flex flex-1 flex-col gap-2.5">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-3 w-80 max-w-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileView({
  profile,
  editing,
  onEdit,
  onReadAgain,
  onAnother,
}: {
  profile: SiteProfile;
  editing: boolean;
  onEdit: (editing: boolean) => void;
  onReadAgain: () => void;
  onAnother: () => void;
}) {
  const { profile: fields } = profile;
  const start = useStartSearch();

  return (
    <>
      <div className="-ml-3 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <span className="px-3 font-mono">{displayDomain(profile.website)}</span>
        <Pill onClick={onReadAgain} className="inline-flex items-center gap-1.5">
          <RotateCw className="size-3" />
          Read again
        </Pill>
        <Pill onClick={onAnother}>Another site</Pill>
        {!editing && (
          <Pill onClick={() => onEdit(true)} className="inline-flex items-center gap-1.5">
            <Pencil className="size-3" />
            Edit
          </Pill>
        )}
      </div>

      {editing ? (
        <ProfileEditor profile={profile} onDone={() => onEdit(false)} />
      ) : (
        <section aria-label="Your profile" className="mt-4">
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">{fields.name}</h1>
          <p className="mt-3 max-w-2xl text-lg text-pretty text-muted-foreground">{fields.summary}</p>
          <dl className="mt-6 grid max-w-2xl gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
            <dt className="text-muted-foreground">Sells to</dt>
            <dd className="text-pretty">{fields.audience}</dd>
          </dl>
        </section>
      )}

      <section aria-labelledby="suggestions" className="mt-16">
        <h2 id="suggestions" className="text-sm font-medium text-muted-foreground">
          Searches that find your buyers
        </h2>
        {profile.suggestions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No searches came out of this site. Read it again, or <ManualLink>set one up by hand</ManualLink>.
          </p>
        ) : (
          <div className="-mx-4 mt-3 flex flex-col gap-1 sm:-mx-6">
            {profile.suggestions.map((suggestion, i) => (
              <SuggestionRow
                key={i}
                suggestion={suggestion}
                onStart={() => start.start(suggestion.search)}
                disabled={start.isPending}
                pending={start.pendingInput === suggestion.search}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-12">
        <ManualLink />
      </div>
    </>
  );
}

function SuggestionRow({
  suggestion,
  onStart,
  disabled,
  pending,
}: {
  suggestion: SuggestedSearch;
  onStart: () => void;
  disabled: boolean;
  pending: boolean;
}) {
  const search: CreateSearchInput = suggestion.search;
  const title = suggestionTitle(search);
  return (
    <div
      data-suggestion-kind={search.kind}
      className="flex items-center gap-4 rounded-[24px] px-4 py-5 transition-colors duration-200 hover:bg-foreground/[0.035] sm:gap-8 sm:px-6"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-lg font-medium">{title}</div>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{suggestion.why}</p>
        <div className="mt-1.5 text-xs text-muted-foreground/80">{suggestionCaption(search)}</div>
      </div>
      <Button variant="outline" size="sm" onClick={onStart} disabled={disabled} aria-label={`Start ${title}`}>
        {pending ? <Loader2 className="motion-safe:animate-spin" /> : <Play className="size-3.5" />}
        Start
      </Button>
    </div>
  );
}

const textareaClass =
  'flex w-full min-w-0 resize-y rounded-md border border-input bg-card px-2.5 py-1.5 text-sm shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 dark:bg-foreground/5';

function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cn(textareaClass, props.className)} />;
}

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="contents">
      <label htmlFor={htmlFor} className="pt-1.5 text-sm text-muted-foreground">
        {label}
        {hint && <span className="block text-xs text-muted-foreground/70">{hint}</span>}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Every field of the profile, saved with PATCH. Suggestions stay as they were built. */
function ProfileEditor({ profile, onDone }: { profile: SiteProfile; onDone: () => void }) {
  const [form, setForm] = useState<ProfileForm>(() => profileForm(profile.profile));
  const [problem, setProblem] = useState<string | null>(null);
  const update = useUpdateSiteProfile();
  const set =
    <K extends keyof ProfileForm>(key: K) =>
    (value: ProfileForm[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
      setProblem(null);
    };

  function save(event: FormEvent): void {
    event.preventDefault();
    const result = profilePatch(form, profile.profile);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    if (!result.patch) {
      onDone();
      return;
    }
    update.mutate(result.patch, {
      onSuccess: () => {
        toast.success('Profile saved');
        onDone();
      },
      onError: (err) => setProblem(err.message),
    });
  }

  return (
    <form onSubmit={save} noValidate aria-label="Edit your profile" className="mt-6">
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Row label="Name" htmlFor="p-name">
          <Input id="p-name" value={form.name} onChange={(e) => set('name')(e.target.value)} maxLength={120} />
        </Row>
        <Row label="What you do" hint="One sentence" htmlFor="p-summary">
          <Textarea id="p-summary" rows={2} value={form.summary} onChange={(e) => set('summary')(e.target.value)} maxLength={300} />
        </Row>
        <Row label="What you sell" htmlFor="p-offer">
          <Textarea id="p-offer" rows={2} value={form.offer} onChange={(e) => set('offer')(e.target.value)} maxLength={500} />
        </Row>
        <Row label="Who buys it" htmlFor="p-audience">
          <Textarea id="p-audience" rows={2} value={form.audience} onChange={(e) => set('audience')(e.target.value)} maxLength={500} />
        </Row>
        <Row label="Proof" hint="One per line, up to 8" htmlFor="p-proof">
          <Textarea
            id="p-proof"
            rows={Math.min(8, Math.max(3, form.proofPoints.split('\n').length))}
            value={form.proofPoints}
            onChange={(e) => set('proofPoints')(e.target.value)}
            placeholder={'400 clinics use it\nSince 2015'}
          />
        </Row>
        <Row label="Your words" hint="Comma separated" htmlFor="p-voice">
          <Input id="p-voice" value={form.voice} onChange={(e) => set('voice')(e.target.value)} placeholder="simple, no setup" />
        </Row>
        <Row label="Language" hint="Two letters" htmlFor="p-language">
          <Input
            id="p-language"
            value={form.language}
            onChange={(e) => set('language')(e.target.value)}
            maxLength={2}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="en"
            className="w-16 font-mono"
          />
        </Row>
        <Row label="Sells in" htmlFor="p-country">
          <CountryPicker
            id="p-country"
            value={form.country}
            onChange={set('country')}
            triggerClassName="h-8 max-w-64 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 dark:bg-foreground/5 [&>svg]:size-4"
          />
        </Row>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3 sm:pl-[calc(10rem+1.5rem)]">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending && <Loader2 className="motion-safe:animate-spin" />}
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        {problem && (
          <span role="alert" className="text-sm text-destructive">
            {problem}
          </span>
        )}
      </div>
    </form>
  );
}
