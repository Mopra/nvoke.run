'use client';

import { useCallback, useEffect, useRef, useState, type ComponentProps, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CornerDownLeft, Globe, Loader2, Pencil, Play, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateSearchInput, SiteProfile, SuggestedSearch } from '@nvoke/shared';
import { CountryPicker } from '@/components/app/country-picker';
import { DeleteSiteProfileDialog } from '@/components/app/delete-site-profile-dialog';
import { useStartSearch } from '@/components/app/new-search-screen';
import { PLATE } from '@/components/app/search-fields';
import { Line, Pill, SentenceInput } from '@/components/app/sentence';
import { APP_FRAME, APP_INSET, BackLink } from '@/components/app/shell';
import { ErrorState } from '@/components/app/states';
import { LogoMark } from '@/components/site/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBuildSiteProfile,
  useForgetProfileBuilds,
  useLatestProfileBuild,
  useSiteProfile,
  useUpdateSiteProfile,
  type LatestProfileBuild,
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
  PROFILE_PATH,
  profileForm,
  profilePatch,
  readWebsite,
  suggestionCaption,
  suggestionTitle,
  type ProfileForm,
  WEBSITE_PATH,
} from '@/lib/app/site-profile';
import { cn } from '@/lib/utils';

/**
 * The website step. `fresh` is New search: always a blank field, following
 * only the read it starts, then on to the result. Without it, the read on file
 * (or running) and its planned searches, as listed on Searches.
 */
export function WebsiteScreen({ fresh = false }: { fresh?: boolean }) {
  const router = useRouter();
  const profile = useSiteProfile();
  const build = useBuildSiteProfile();
  const cached = useLatestProfileBuild();
  // New search ignores reads started before it opened: those are on Searches.
  const latest: LatestProfileBuild | undefined = !fresh
    ? cached
    : build.status === 'idle' || !build.variables
      ? undefined
      : { id: build.submittedAt, status: build.status, build: build.variables, error: build.error, startedAt: build.submittedAt };
  const forgetBuilds = useForgetProfileBuilds();
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // With a profile on file: typing another site, or editing the profile.
  const [entering, setEntering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Set while Remove takes the user to Searches, so the empty page does not send them to New search first.
  const [leaving, setLeaving] = useState(false);
  // The build watched while it ran: its screen outlives the request until the phases have played out.
  const [following, setFollowing] = useState<number | null>(null);
  // New search hands a finished read to its page, so Back and Searches lead to it.
  const finishBuilding = useCallback(() => (fresh ? router.replace(PROFILE_PATH) : setFollowing(null)), [fresh, router]);

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
  const failed = latest?.status === 'error';
  useEffect(() => {
    if (failed) forgetBuilds();
  }, [failed, outcome, forgetBuilds]);

  // Nothing on file and nothing running: this page has nothing to show, so New search.
  const empty = !fresh && profile.data === null && !latest && !entering && !leaving;
  useEffect(() => {
    if (empty) router.replace(WEBSITE_PATH);
  }, [empty, router]);

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
  if (!fresh && (profile.isPending || empty)) {
    body = <ProfileSkeleton />;
  } else if (!fresh && profile.error) {
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
  } else if (fresh || !profile.data || entering) {
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
          !fresh && profile.data
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
        onAnother={() => router.push(WEBSITE_PATH)}
        onRemove={() => setRemoving(true)}
      />
    );
  }

  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <div className={cn(APP_INSET, 'relative flex flex-col pt-6')}>
        <BackLink />
        <div className="mx-auto w-full max-w-[760px] pt-8 sm:pt-[6vh]">{body}</div>
      </div>
      {profile.data && (
        <DeleteSiteProfileDialog
          profile={profile.data}
          open={removing}
          onOpenChange={setRemoving}
          onRemoving={() => {
            setLeaving(true);
            router.replace('/app');
          }}
        />
      )}
    </main>
  );
}

/** The way out to the tabs, on every state of the step. */
function ManualLink({ children = 'Set up a search by hand' }: { children?: ReactNode }) {
  return (
    <Button asChild variant="secondary" size="sm">
      <Link href={MANUAL_PATH}>
        {children}
        <ArrowRight className="size-3" />
      </Link>
    </Button>
  );
}

/** Small print under a key. */
const NOTE = 'text-sm text-muted-foreground';

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
    <form onSubmit={submit} noValidate className="flex flex-col">
      <h1 className="sr-only">Start from your website</h1>
      {onCancel && (
        <Pill onClick={onCancel} className="mb-6 self-start">
          <ArrowLeft className="size-3" />
          Keep the current profile
        </Pill>
      )}
      <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-3 sm:gap-x-6">
        <Line lead="Start from" htmlFor="website">
          <SentenceInput
            id="website"
            ref={field}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            placeholder="yourcompany.com"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'website-problem' : 'website-hint'}
            className="font-mono tracking-tight"
          />
        </Line>
      </div>
      <p id="website-hint" className={cn('mt-5 max-w-xl text-pretty', NOTE)}>
        nvoke reads your homepage and its about, pricing and services pages, works out who buys from you and plans the
        searches that find them. About 20 seconds. robots.txt is honored. Free, 10 sites a day.
      </p>

      <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
        <Button type="submit" size="lg" variant="dark" className="min-w-44">
          Plan my searches
          <CornerDownLeft className="size-3.5 opacity-70" />
        </Button>
        {problem && (
          <span id="website-problem" role="alert" className="max-w-md text-sm text-pretty text-destructive">
            {problem}
          </span>
        )}
      </div>
      <div className="mt-8">
        <ManualLink />
      </div>
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
    <section role="status" aria-live="polite" aria-label={`Reading ${domain}`} className="flex flex-col">
      <LogoMark motion="loading" className="mb-8 size-10" />
      <h1 className="cap truncate text-primary" title={domain}>
        {domain}
      </h1>
      <div
        className="relative mt-5 h-[3px] w-full max-w-72 overflow-hidden rounded-[1px] bg-foreground/[0.12]"
        role="progressbar"
        aria-label="Reading your site"
      >
        <div className="absolute inset-y-0 left-0 w-1/4 rounded-[1px] bg-primary shadow-[0_0_6px_var(--primary)] motion-safe:animate-indeterminate" />
      </div>
      <ol className="mt-10 flex flex-col">
        {BUILD_PHASES.map((phase, i) => (
          <li
            key={i}
            className={cn(
              'flex items-center gap-4 border-t border-border py-3 font-display text-lg font-light transition-colors duration-500 last:border-b sm:text-xl',
              i < current && 'text-muted-foreground',
              i === current && 'text-foreground',
              i > current && 'text-foreground/30',
            )}
          >
            <span
              aria-hidden
              className={cn('led', i < current && 'bg-chart-1', i === current && 'led-on motion-safe:animate-blink')}
            />
            {phase.label(domain)}
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className={NOTE}>
          {elapsed >= BUILD_SLOW_MS && runout === null
            ? 'Big sites take a little longer. Still on it.'
            : 'About 20 seconds. You can leave this page while it reads.'}
        </p>
        {!done && (
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
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
            <Skeleton className="h-8 w-20" />
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
  onRemove,
}: {
  profile: SiteProfile;
  editing: boolean;
  onEdit: (editing: boolean) => void;
  onReadAgain: () => void;
  onAnother: () => void;
  onRemove: () => void;
}) {
  const { profile: fields } = profile;
  const start = useStartSearch();

  return (
    <>
      <div className="cap flex items-center gap-2 text-muted-foreground">
        <Globe className="size-3.5" />
        <span className="text-primary">{displayDomain(profile.website)}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!editing && (
          <Pill onClick={() => onEdit(true)}>
            <Pencil className="size-3" />
            Edit
          </Pill>
        )}
        <Pill onClick={onReadAgain}>
          <RotateCw className="size-3" />
          Read again
        </Pill>
        <Pill onClick={onAnother}>Read another site</Pill>
        <Pill onClick={onRemove}>
          <Trash2 className="size-3" />
          Remove
        </Pill>
      </div>

      {editing ? (
        <ProfileEditor profile={profile} onDone={() => onEdit(false)} />
      ) : (
        <section aria-label="Your profile" className="mt-6">
          <div className="flex items-center gap-4 sm:gap-6">
            {profile.icon && <SiteIcon key={profile.icon} src={profile.icon} />}
            <h1 className="min-w-0 font-display text-3xl font-light tracking-[-0.02em] text-balance sm:text-4xl">{fields.name}</h1>
          </div>
          <p className="mt-3 max-w-2xl text-base text-pretty text-muted-foreground">
            {fields.summary}
          </p>
          <dl className="mt-6">
            <dt className="cap text-muted-foreground">Sells to</dt>
            <dd className="mt-1.5 max-w-2xl text-sm text-pretty">{fields.audience}</dd>
          </dl>
          <SitePicture key={profile.image ?? profile.updatedAt} profile={profile} />
        </section>
      )}

      <section aria-labelledby="suggestions" className="mt-14">
        <h2 id="suggestions" className="cap text-muted-foreground">
          Searches that find your buyers
        </h2>
        {profile.suggestions.length === 0 ? (
          <p className={cn('mt-4', NOTE)}>No searches came out of this site. Read it again, or set one up by hand.</p>
        ) : (
          <div className="stagger mt-3 flex flex-col">
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

      <div className="mt-8">
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
        'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-border sm:size-14',
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
        <div className="overflow-hidden rounded-[6px] border border-border">
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
        <figcaption className={cn('flex flex-wrap items-baseline gap-x-4 gap-y-1 text-muted-foreground', picture && 'mt-4')}>
          <span className="cap">
            Read {pages.length} {pages.length === 1 ? 'page' : 'pages'} on {profile.domain}
          </span>
          {pages.map((page) => (
            <a
              key={page.url}
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-[3px] font-mono text-xs text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
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
      style={{ '--i': index } as CSSProperties}
      className="flex items-start gap-4 border-t border-border py-4 transition-colors duration-200 last:border-b hover:bg-foreground/[0.035] sm:items-center sm:gap-6"
    >
      <span aria-hidden className="cap hidden w-6 shrink-0 text-muted-foreground sm:block">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-lg text-balance">{curlyQuotes(title)}</div>
        <div className="cap mt-0.5 text-muted-foreground">{suggestionCaption(search)}</div>
        <p className={cn('mt-2 max-w-[60ch] text-pretty', NOTE)}>{suggestion.why}</p>
      </div>
      <Button variant="secondary" onClick={onStart} disabled={disabled} aria-label={`Start ${title}`} className="shrink-0">
        {pending ? <Loader2 className="motion-safe:animate-spin" /> : <Play className="size-3.5" />}
        Start
      </Button>
    </div>
  );
}

/** A profile field on a recessed plate: small mono, the ring on focus. */
const textareaClass = cn(
  PLATE,
  'block w-full min-w-0 resize-y px-2.5 py-1.5 text-xs outline-none transition-[box-shadow] duration-150 placeholder:text-muted-foreground/90 focus-visible:ring-[3px] focus-visible:ring-ring/25',
);

function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cn(textareaClass, props.className)} />;
}

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="contents">
      <label htmlFor={htmlFor} className="cap pt-2 text-muted-foreground">
        {label}
        {hint && <span className="mt-0.5 block font-sans text-xs tracking-normal normal-case text-muted-foreground/80">{hint}</span>}
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
      <h1 className="mb-6 font-display text-2xl font-light">Edit your profile</h1>
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
            triggerClassName={cn(PLATE, 'h-8 max-w-64 px-2.5 py-0 text-xs focus-visible:ring-[3px] focus-visible:ring-ring/25 [&>svg]:size-4')}
          />
        </Row>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3 sm:pl-[calc(10rem+1.5rem)]">
        <Button type="submit" variant="dark" disabled={update.isPending}>
          {update.isPending && <Loader2 className="motion-safe:animate-spin" />}
          Save
        </Button>
        <Button type="button" variant="secondary" onClick={onDone} disabled={update.isPending}>
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
