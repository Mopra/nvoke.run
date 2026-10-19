'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Inbox, Loader2, Pause, Play, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DROP_BACKFILL_DAYS, DROP_DAILY_LIMIT_MAX, FEED_SOURCES, type Drop, type FeedSourceStatus, type Search } from '@nvoke/shared';
import { DeleteDropDialog, useDropActions } from '@/components/app/drops/parts';
import { DropDisplay } from '@/components/app/drops/drop-display';
import { DropRuns } from '@/components/app/drops/drop-runs';
import { LogoLoader } from '@/components/app/motion';
import { Line, Pill, SENTENCE, SentenceInput } from '@/components/app/sentence';
import { APP_FRAME, APP_INSET, BackLink, KeyGroup, PageHeader } from '@/components/app/shell';
import { EmptyState } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Knob } from '@/components/ui/knob';
import { FEED_SOURCE_LABEL, formatNumber, nextRunLabel } from '@/lib/app/desktop';
import {
  autoName,
  buildCreateDrop,
  buildUpdateDrop,
  clampLimit,
  dropLimitPresets,
  dropForm,
  dropFormProblem,
  dropPath,
  dropRuns,
  dropState,
  DROPS_PATH,
  dropSummary,
  sourceAvailable,
  toggleSource,
  type DropForm,
} from '@/lib/app/drops';
import { useCreateDrop, useDrops, useMe, useSearches, useUpdateDrop } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/**
 * A drop's page (`id`), or a new drop (`id` null, optionally with a keyword).
 * Waits for the drop list, which holds the drop.
 */
export function DropScreen({ id, keyword }: { id: string | null; keyword?: string }) {
  const { data, isPending } = useDrops();
  const drop = id ? data?.drops.find((d) => d.id === id) : undefined;

  if (id && isPending) {
    return (
      <main className={cn(APP_FRAME, 'app-view')}>
        <LogoLoader page label="Loading the drop" />
      </main>
    );
  }
  if (id && !drop) {
    return (
      <main className={cn(APP_FRAME, 'app-view pb-24')}>
        <PageHeader leading={<BackLink href={DROPS_PATH} label="Drops" />} />
        <EmptyState
          icon={Inbox}
          title="This drop is gone"
          action={
            <Button asChild variant="secondary">
              <Link href={DROPS_PATH}>All drops</Link>
            </Button>
          }
        >
          Probably deleted in another tab or on the desktop app.
        </EmptyState>
      </main>
    );
  }
  // Keyed by the drop, so a form opened before the list came in starts over with it.
  return <DropEditor key={drop?.id ?? 'new'} drop={drop} sources={data?.sources ?? []} initialKeyword={keyword ?? ''} />;
}

/** The keys on a drop's page: check now, pause or resume, delete. */
function DropKeys({ drop }: { drop: Drop }) {
  const [confirm, setConfirm] = useState(false);
  const { togglePaused, runNow, toggling, running } = useDropActions(drop);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={runNow} disabled={running || !drop.enabled}>
        <RotateCw className={cn(running && 'motion-safe:animate-spin')} />
        Check now
      </Button>
      <Button variant="secondary" size="sm" onClick={togglePaused} disabled={toggling}>
        {drop.enabled ? <Pause /> : <Play />}
        {drop.enabled ? 'Pause' : 'Resume'}
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${drop.name}`} onClick={() => setConfirm(true)}>
        <Trash2 />
      </Button>
      <DeleteDropDialog drop={drop} open={confirm} onOpenChange={setConfirm} leave />
    </>
  );
}

function sameUpdate(form: DropForm, drop: Drop, max: number): boolean {
  const next = buildUpdateDrop(form, max);
  return (
    !!next &&
    next.name === drop.name &&
    next.keyword === drop.keyword &&
    next.dailyLimit === drop.dailyLimit &&
    next.sources?.join() === drop.sources.join()
  );
}

/**
 * The drop as a sentence ("Watch ai agents from Show HN up to 25 a day
 * called AI agents"), read back on the display above it as it is typed. A
 * drop's page adds its keys at the top and its runs below the form.
 */
function DropEditor({ drop, sources, initialKeyword }: { drop?: Drop; sources: FeedSourceStatus[]; initialKeyword: string }) {
  const [form, setForm] = useState<DropForm>(() => dropForm(drop, sources, initialKeyword));
  const [touched, setTouched] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const create = useCreateDrop();
  const update = useUpdateDrop();
  const searches = useSearches();
  const maxLimit = useMe().data?.maxDropDailyLimit ?? DROP_DAILY_LIMIT_MAX;
  const pending = create.isPending || update.isPending;
  const runs: Search[] = drop ? dropRuns(searches.data, drop.id) : [];

  useEffect(() => {
    if (!drop) firstField.current?.focus();
  }, [drop]);

  // A new drop opened before the source list came in starts with every source the server collects.
  const sourcesIn = sources.length > 0;
  useEffect(() => {
    if (drop || !sourcesIn) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((f) => (f.sources.length === FEED_SOURCES.length ? { ...f, sources: f.sources.filter((s) => sourceAvailable(sources, s)) } : f));
  }, [drop, sourcesIn, sources]);

  const set = <K extends keyof DropForm>(key: K) => (value: DropForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const problem = touched ? dropFormProblem(form) : null;
  const unchanged = drop ? sameUpdate(form, drop, maxLimit) : false;
  const name = form.name.trim() || autoName(form.keyword);
  const lim = clampLimit(form.limit, maxLimit);

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    setTouched(true);
    if (pending) return;
    if (drop) {
      const patch = buildUpdateDrop(form, maxLimit);
      if (!patch || unchanged) return;
      update.mutate(
        { id: drop.id, update: patch },
        {
          onSuccess: (saved) => toast.success('Drop saved', { description: `${saved.name}: changes apply from the next run.` }),
          onError: (err) => toast.error('Couldn’t save the drop', { description: err.message }),
        },
      );
      return;
    }
    const input = buildCreateDrop(form, maxLimit);
    if (!input) return;
    create.mutate(input, {
      onSuccess: (created) => {
        toast.success('Drop created', { description: `${created.name}: the first leads land within a minute.` });
        router.replace(dropPath(created.id));
      },
      onError: (err) => toast.error('Couldn’t create the drop', { description: err.message }),
    });
  }

  const state = drop ? dropState(drop, runs) : 'paused';
  const presets = dropLimitPresets(maxLimit);
  const preset = presets.find((p) => p === form.limit) ?? null;
  const knobAt = presets.reduce((best, p) => (Math.abs(p - lim) < Math.abs(best - lim) ? p : best));

  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <PageHeader leading={<BackLink href={DROPS_PATH} label="Drops" />} actions={drop ? <DropKeys drop={drop} /> : undefined} />
      <h1 className="sr-only">{drop ? drop.name : 'New drop'}</h1>

      <DropDisplay
        className="mt-6"
        drop={drop}
        state={state}
        title={name}
        summary={dropSummary({ keyword: form.keyword.trim() || null, sources: form.sources, dailyLimit: lim })}
        next={drop ? nextRunLabel(drop) : `Reaches back ${DROP_BACKFILL_DAYS} days`}
        runs={runs}
        sources={sources}
        picked={form.sources}
        pending={pending}
      />

      <form onSubmit={submit} className={cn(APP_INSET, 'mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_210px]')} noValidate>
        <div className="flex min-w-0 flex-col">
          <p className="cap text-muted-foreground">{drop ? 'Edit the drop' : 'New drop'}</p>
          <div className="mt-6 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-3 sm:gap-x-6">
            <Line lead="Watch" htmlFor="drop-keyword">
              <SentenceInput
                id="drop-keyword"
                ref={firstField}
                value={form.keyword}
                onChange={(e) => set('keyword')(e.target.value)}
                placeholder="every launch"
                maxLength={100}
              />
            </Line>

            <span className="self-center font-display text-[26px]/[34px] font-light text-muted-foreground sm:text-4xl">from</span>
            <div className="flex flex-wrap gap-2.5 self-center py-2" role="group" aria-label="Sources">
              {FEED_SOURCES.map((s) => {
                const on = form.sources.includes(s);
                const available = sourceAvailable(sources, s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('sources')(toggleSource(form.sources, s))}
                    title={available ? undefined : 'Not collected on this server yet'}
                    className={cn(
                      'key inline-flex h-8 items-center gap-2 bg-secondary px-3 font-mono text-xs tracking-[0.06em] uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                      on ? 'key-down text-secondary-foreground' : 'text-muted-foreground hover:text-secondary-foreground',
                      !available && 'opacity-50',
                    )}
                  >
                    {/* A keycap per source; its LED lights when picked. */}
                    <span className={cn('led', on && 'led-on')} aria-hidden />
                    {FEED_SOURCE_LABEL[s]}
                  </button>
                );
              })}
            </div>

            <Line lead="up to" htmlFor="drop-limit">
              <div className="flex items-baseline gap-3">
                <input
                  id="drop-limit"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maxLimit}
                  value={Number.isNaN(form.limit) ? '' : form.limit}
                  onChange={(e) => set('limit')(e.target.valueAsNumber)}
                  style={{ width: `${Math.max(2, String(Number.isNaN(form.limit) ? '' : form.limit).length) + 0.6}ch` }}
                  className={cn(SENTENCE, 'tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none')}
                />
                <span className="font-display text-[26px]/[34px] font-light text-muted-foreground sm:text-4xl">a day</span>
              </div>
            </Line>
            <div className="col-start-2 -mt-1 flex flex-wrap gap-1 lg:hidden" role="group" aria-label="Preset limits">
              {presets.map((p) => (
                <Pill key={p} pressed={preset === p} onClick={() => set('limit')(p)}>
                  {p}
                </Pill>
              ))}
            </div>

            <Line lead="called" htmlFor="drop-name">
              <SentenceInput
                id="drop-name"
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder={autoName(form.keyword)}
                maxLength={80}
              />
            </Line>
          </div>

          <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
            <Button type="submit" size="lg" variant="dark" disabled={pending || unchanged} className="min-w-40">
              {pending ? <Loader2 className="motion-safe:animate-spin" /> : null}
              {drop ? 'Save drop' : 'Create drop'}
              {!pending && <CornerDownLeft className="size-3.5 opacity-70" />}
            </Button>
            {problem ? (
              <span className="text-sm text-destructive">{problem}</span>
            ) : (
              <p className="max-w-sm text-sm text-muted-foreground">
                {drop ? 'Changes apply from the next run.' : `Runs within a minute and reaches back ${DROP_BACKFILL_DAYS} days, then once a day.`}
                {` Only verified emails count, at most ${formatNumber(lim)} companies a run.`}
              </p>
            )}
          </div>
        </div>

        <div className="hidden flex-col items-center gap-3.5 pt-10 lg:flex">
          <KeyGroup label="A day">
            <Knob value={knobAt} options={presets} onChange={set('limit')} label="Companies a day" format={formatNumber} size={170} />
          </KeyGroup>
          <div className="flex items-center gap-2">
            <span aria-hidden className="led" />
            <span className="cap text-muted-foreground">Turn or click</span>
          </div>
        </div>
      </form>

      {drop && <DropRuns drop={drop} runs={runs} pending={searches.isPending} className="mt-20" />}
    </main>
  );
}
