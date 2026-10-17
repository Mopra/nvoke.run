'use client';

import { useCallback, useEffect, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, CornerDownLeft, Loader2, Pencil, Play, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateSearchInput, SiteProfile, SuggestedSearch } from '@nvoke/shared';
import { CountryPicker } from '@/components/app/country-picker';
import { useStartSearch } from '@/components/app/new-search-screen';
import { Pill, SENTENCE } from '@/components/app/sentence';
import { APP_COLUMN, APP_FRAME, APP_INSET, BackLink } from '@/components/app/shell';
import { ErrorState } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBuildSiteProfile,
  useForgetProfileBuilds,
  useLatestProfileBuild,
  useSiteProfile,
  useUpdateSiteProfile,
  type ProfileBuild,
} from '@/lib/app/queries';
import {
  BUILD_PHASES,
  BUILD_RUNOUT_MS,
  BUILD_SLOW_MS,
  buildPhase,
  buildProblem,
  displayDomain,
  isCancelled,
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
  const latest = useLatestProfileBuild();
  const forgetBuilds = useForgetProfileBuilds();
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // With a profile on file: typing another site, or editing the profile.
  const [entering, setEntering] = useState(false);
  const [editing, setEditing] = useState(false);
  // The build watched while it ran: its screen outlives the request until the phases have played out.
  const [following, setFollowing] = useState<number | null>(null);
  const finishBuilding = useCallback(() => setFollowing(null), []);

  // React to the build's outcome while rendering, once per status it reaches. That
  // includes a build that ended while the user was away: back to the field and why.
  const [seen, setSeen] = useState<string | null>(null);
  const outcome = latest ? `${latest.id}:${latest.status}` : null;
  if (latest && outcome !== seen) {
    setSeen(outcome);
    if (latest.status === 'pending') {
      setFollowing(latest.id);
    } else if (latest.status === 'success') {
      setEntering(false);
      setEditing(false);
    } else if (latest.status === 'error') {
      setFollowing(null);
      setValue(latest.build.typed);
      if (isCancelled(latest.error)) {
        // Back where the build started: the field, or the profile it would have replaced.
        setEntering(latest.build.from === 'form');
      } else {
        setProblem(buildProblem(latest.error, latest.build.domain));
        setEntering(true);
      }
    }
  }
  // Taken: coming back later should not show it again.
  useEffect(() => {
    if (latest?.status === 'error') forgetBuilds();
  }, [latest, forgetBuilds]);

  function run(raw: string, from: ProfileBuild['from']): void {
    const read = readWebsite(raw);
    if (!read.ok) {
      setProblem(read.problem);
      return;
    }
    setProblem(null);
    build.mutate({ website: read.website, domain: read.domain, typed: raw, from, controller: new AbortController() });
  }

  let body: ReactNode;
  if (profile.isPending) {
    body = <ProfileSkeleton />;
  } else if (profile.error) {
    body = <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  } else if (latest && (latest.status === 'pending' || (latest.status === 'success' && following === latest.id))) {
    body = (
      <Building
        domain={latest.build.domain}
        startedAt={latest.startedAt}
        done={latest.status === 'success'}
        onFinished={finishBuilding}
        onCancel={() => latest.build.controller.abort()}
      />
    );
  } else if (!profile.data || entering) {
    body = (
      <WebsiteForm
        value={value}
        onChange={(v) => {
          setValue(v);
          setProblem(null);
        }}
        onSubmit={() => run(value, 'form')}
        problem={problem}
        onCancel={
          profile.data
            ? () => {
                setEntering(false);
                setProblem(null);
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
        onReadAgain={() => run(current.website, 'profile')}
        onAnother={() => {
          setValue('');
          setProblem(null);
          setEntering(true);
        }}
      />
    );
  }

  return (
    <main className={cn(APP_FRAME, 'pb-24')}>
      <div className={cn(APP_INSET, APP_COLUMN, 'relative flex flex-col pt-8 motion-safe:animate-rise sm:pt-[6vh]')}>
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

/**
 * While the server reads the site: the phases one after another, no fake
 * percentage, and the aura. Timed from `startedAt`, so coming back to a build
 * picks up where it was. Cancel (or Escape) stops it. Once `done`, the phases
 * left tick by quickly and then `onFinished` shows the result.
 */
function Building({
  domain,
  startedAt: started,
  done,
  onFinished,
  onCancel,
}: {
  domain: string;
  startedAt: number;
  done: boolean;
  onFinished: () => void;
  onCancel: () => void;
}) {
  const [elapsed, setElapsed] = useState(() => Date.now() - started);
  const [runout, setRunout] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => clearInterval(timer);
  }, [started]);
  useEffect(() => {
    if (!done) return;
    let step = buildPhase(Date.now() - started);
    // One past the last phase checks them all, one more tick lets that land.
    const timer = setInterval(() => {
      step += 1;
      if (step > BUILD_PHASES.length) {
        clearInterval(timer);
        onFinished();
      } else {
        setRunout(step);
      }
    }, BUILD_RUNOUT_MS);
    return () => clearInterval(timer);
  }, [done, started, onFinished]);
  useEffect(() => {
    if (done) return;
    const onKey = (event: KeyboardEvent) => {
      // Not when Escape already closed something, like a tooltip or a menu.
      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, onCancel]);
  const current = runout ?? buildPhase(elapsed);

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
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="text-sm text-muted-foreground">
          {elapsed >= BUILD_SLOW_MS && runout === null
            ? 'Big sites take a little longer. Still on it.'
            : 'About 20 seconds. You can leave this page while it reads.'}
        </p>
        {!done && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="-ml-3 sm:ml-0">
            Cancel
          </Button>
        )}
      </div>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-14 w-72 max-w-full" />
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
        <section aria-label="Your profile" className="mt-6">
          <div className="flex items-center gap-4 sm:gap-6">
            {profile.icon && <SiteIcon key={profile.icon} src={profile.icon} />}
            <h1 className="min-w-0 font-display text-5xl/[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-7xl/[1]">{fields.name}</h1>
          </div>
          <p className="mt-6 max-w-[34ch] font-display text-2xl/[1.3] tracking-[-0.015em] text-pretty text-foreground/75 sm:text-[28px]/[1.3]">
            {fields.summary}
          </p>
          <dl className="mt-10">
            <dt className="text-sm text-muted-foreground">Sells to</dt>
            <dd className="mt-2 max-w-[56ch] text-lg/relaxed text-pretty text-foreground/90">{fields.audience}</dd>
          </dl>
          <SitePicture key={profile.image ?? profile.updatedAt} profile={profile} />
        </section>
      )}

      <section aria-labelledby="suggestions" className="mt-20">
        <h2 id="suggestions" className="font-display text-3xl font-semibold tracking-[-0.03em] text-balance">
          Searches that find your buyers
        </h2>
        {profile.suggestions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No searches came out of this site. Read it again, or <ManualLink>set one up by hand</ManualLink>.
          </p>
        ) : (
          <div className="-mx-4 mt-6 flex flex-col gap-1 sm:-mx-6">
            {profile.suggestions.map((suggestion, i) => (
              <SuggestionRow
                key={i}
                index={i}
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

/** The site's icon as an app tile. A small favicon sits centered rather than blown up. */
function SiteIcon({ src }: { src: string }) {
  const [state, setState] = useState<'loading' | 'large' | 'small' | 'failed'>('loading');
  if (state === 'failed') return null;
  return (
    <span
      className={cn(
        'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-card shadow-sm ring-1 ring-border/70 sm:size-[72px] sm:rounded-[20px]',
        state === 'loading' && 'opacity-0',
      )}
    >
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onLoad={(e) => setState(e.currentTarget.naturalWidth >= 96 || src.includes('.svg') ? 'large' : 'small')}
        onError={() => setState('failed')}
        className={state === 'small' ? 'size-8' : 'size-full object-cover'}
      />
    </span>
  );
}

/**
 * The site's share image, or the screenshot nvoke took, with the pages that
 * were read under it: proof the site was really read, and links to check.
 */
function SitePicture({ profile }: { profile: SiteProfile }) {
  const [failed, setFailed] = useState(false);
  const pages = profile.pages.map((url) => {
    try {
      const path = new URL(url).pathname.replace(/\/$/, '');
      return { url, label: path || '/' };
    } catch {
      return { url, label: url };
    }
  });
  const picture = profile.image && !failed;
  if (!picture && pages.length === 0) return null;
  return (
    <figure className="mt-12">
      {picture && (
        <div className="overflow-hidden rounded-[24px] bg-card shadow-sm ring-1 ring-border/70">
          <img
            src={profile.image!}
            alt={`${profile.domain}, as nvoke read it`}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="block max-h-[440px] w-full object-cover object-top"
          />
        </div>
      )}
      {pages.length > 0 && (
        <figcaption className={cn('flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted-foreground', picture && 'mt-4')}>
          <span>
            Read {pages.length} {pages.length === 1 ? 'page' : 'pages'} on {profile.domain}
          </span>
          {pages.map((page) => (
            <a
              key={page.url}
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full font-mono text-xs text-muted-foreground/80 underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              {page.label}
            </a>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

/** Typographic quotes for the keyword in a title: "x" reads as “x”. */
function curlyQuotes(text: string): string {
  return text.replace(/"([^"]*)"/g, '“$1”');
}

function SuggestionRow({
  index,
  suggestion,
  onStart,
  disabled,
  pending,
}: {
  index: number;
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
      className="flex items-start gap-4 rounded-[24px] px-4 py-6 transition-colors duration-200 hover:bg-foreground/[0.035] sm:gap-6 sm:px-6"
    >
      <span aria-hidden className="hidden w-8 shrink-0 pt-1 font-display text-xl font-extralight tabular-nums text-muted-foreground/60 sm:block">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-xl/snug font-medium tracking-[-0.02em] text-balance sm:text-2xl/snug">{curlyQuotes(title)}</div>
        <p className="mt-2 max-w-[60ch] text-base/relaxed text-pretty text-muted-foreground">{suggestion.why}</p>
        <div className="mt-2 text-sm text-muted-foreground/70">{suggestionCaption(search)}</div>
      </div>
      <Button variant="outline" onClick={onStart} disabled={disabled} aria-label={`Start ${title}`} className="mt-0.5 shrink-0">
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
