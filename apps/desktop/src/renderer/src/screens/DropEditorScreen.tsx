import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CornerDownLeft, Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DROP_BACKFILL_DAYS, DROP_DAILY_LIMIT_DEFAULT, DROP_DAILY_LIMIT_MAX, FEED_SOURCES } from '@nvoke/shared';
import { BackButton, PageHeader } from '@/components/AppShell';
import { Line, Pill, SENTENCE, SentenceInput } from '@/components/Sentence';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { capitalize, FEED_SOURCE_LABEL, formatNumber } from '@/lib/format';
import { useCreateDrop, useDrops, useUpdateDrop } from '@/lib/queries';
import { navigate } from '@/lib/router';
import type { Drop, FeedSource, FeedSourceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const LIMIT_PRESETS = [10, 25, 50, 100] as const;

/** New drop (`id` null) or an existing one. Waits for the drop list, which holds the drop. */
export function DropEditorScreen({ id, keyword }: { id: string | null; keyword?: string | null }) {
  const { data, isPending } = useDrops();
  const drop = id ? data?.drops.find((d) => d.id === id) : undefined;

  if (id && isPending) {
    return (
      <>
        <PageHeader leading={<BackButton />} newSearch={false} />
        <div className="mx-auto w-full max-w-[760px] px-8 pt-[9vh]">
          <Skeleton className="h-10 w-96" />
          <Skeleton className="mt-6 h-10 w-80" />
        </div>
      </>
    );
  }
  if (id && !drop) {
    return (
      <>
        <PageHeader leading={<BackButton />} newSearch={false} />
        <EmptyState
          icon={Inbox}
          title="This drop is gone"
          action={
            <Button variant="outline" onClick={() => navigate({ name: 'drops' })}>
              All drops
            </Button>
          }
        >
          Probably deleted on another device.
        </EmptyState>
      </>
    );
  }
  return <DropForm drop={drop} initialKeyword={keyword ?? ''} sources={data?.sources ?? []} />;
}

function DropForm({ drop, initialKeyword, sources }: { drop?: Drop; initialKeyword: string; sources: FeedSourceStatus[] }) {
  const [keyword, setKeyword] = useState(drop?.keyword ?? initialKeyword);
  // A new drop starts with every source the server collects.
  const [picked, setPicked] = useState<FeedSource[]>(
    drop?.sources ?? FEED_SOURCES.filter((s) => sources.find((x) => x.source === s)?.available ?? true),
  );
  const [limit, setLimit] = useState(drop?.dailyLimit ?? DROP_DAILY_LIMIT_DEFAULT);
  const [name, setName] = useState(drop?.name ?? '');
  const [touched, setTouched] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const create = useCreateDrop();
  const update = useUpdateDrop();
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  const available = (s: FeedSource): boolean => sources.find((x) => x.source === s)?.available ?? true;
  const k = keyword.trim();
  const autoName = k ? capitalize(k) : 'Every launch';
  const lim = Math.min(DROP_DAILY_LIMIT_MAX, Math.max(1, Math.round(limit) || DROP_DAILY_LIMIT_DEFAULT));
  const valid = picked.length > 0;

  function toggle(source: FeedSource): void {
    setPicked((list) => (list.includes(source) ? list.filter((s) => s !== source) : FEED_SOURCES.filter((s) => s === source || list.includes(s))));
  }

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    setTouched(true);
    if (!valid || pending) return;
    const finalName = name.trim() || autoName;
    if (drop) {
      update.mutate(
        { id: drop.id, update: { name: finalName, keyword: k || null, sources: picked, dailyLimit: lim } },
        {
          onSuccess: (saved) => {
            toast.success('Drop saved', { description: saved.name });
            navigate({ name: 'drops' }, { replace: true });
          },
          onError: (err) => toast.error('Couldn’t save the drop', { description: err.message }),
        },
      );
      return;
    }
    create.mutate(
      { name: finalName, ...(k ? { keyword: k } : {}), sources: picked, dailyLimit: lim },
      {
        onSuccess: (created) => {
          toast.success('Drop created', {
            description: `${created.name}: the first leads land in Searches within a minute.`,
          });
          navigate({ name: 'drops' }, { replace: true });
        },
        onError: (err) => toast.error('Couldn’t create the drop', { description: err.message }),
      },
    );
  }

  const preset = LIMIT_PRESETS.find((p) => p === limit) ?? null;

  return (
    <>
      <PageHeader leading={<BackButton />} newSearch={false} />
      <main className="fade-edges flex-1 overflow-auto px-8 pb-24">
        <form onSubmit={submit} className="mx-auto flex max-w-[760px] flex-col pt-[9vh] motion-safe:animate-rise" noValidate>
          <h1 className="font-display text-xl font-semibold text-muted-foreground">{drop ? 'Edit drop' : 'New drop'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Once a day, the launches that are new since the last run, crawled and verified.
          </p>

          <div className="mt-14 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-3">
            <Line lead="Watch" htmlFor="drop-keyword">
              <SentenceInput
                id="drop-keyword"
                ref={firstField}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="every launch"
                maxLength={100}
              />
            </Line>

            <span className="self-center font-display text-4xl font-semibold text-muted-foreground/50">from</span>
            <div className="flex flex-wrap gap-1.5 self-center py-2" role="group" aria-label="Sources">
              {FEED_SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={picked.includes(s)}
                  onClick={() => toggle(s)}
                  title={available(s) ? undefined : 'Not collected on this server yet'}
                  className={cn(
                    'h-10 rounded-full px-4 text-sm outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    picked.includes(s)
                      ? 'glass-strong font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground',
                    !available(s) && 'opacity-50',
                  )}
                >
                  {FEED_SOURCE_LABEL[s]}
                </button>
              ))}
            </div>

            <Line lead="up to" htmlFor="drop-limit">
              <div className="flex items-baseline gap-4">
                <input
                  id="drop-limit"
                  type="number"
                  min={1}
                  max={DROP_DAILY_LIMIT_MAX}
                  value={Number.isNaN(limit) ? '' : limit}
                  onChange={(e) => setLimit(e.target.valueAsNumber)}
                  style={{ width: `${Math.max(2, String(Number.isNaN(limit) ? '' : limit).length) + 0.4}ch` }}
                  className={cn(SENTENCE, 'tabular-nums [&::-webkit-inner-spin-button]:appearance-none')}
                />
                <span className="font-display text-4xl font-semibold text-muted-foreground/50">a day</span>
              </div>
            </Line>
            <div className="col-start-2 -mt-1 -ml-3 flex gap-1" role="group" aria-label="Preset limits">
              {LIMIT_PRESETS.map((p) => (
                <Pill key={p} pressed={preset === p} onClick={() => setLimit(p)}>
                  {p}
                </Pill>
              ))}
            </div>

            <Line lead="called" htmlFor="drop-name">
              <SentenceInput
                id="drop-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={autoName}
                maxLength={80}
              />
            </Line>
          </div>

          <div className="mt-16 flex items-center gap-6">
            <Button type="submit" size="lg" disabled={pending} className="min-w-40">
              {pending ? <Loader2 className="motion-safe:animate-spin" /> : null}
              {drop ? 'Save drop' : 'Create drop'}
              {!pending && <CornerDownLeft className="size-3.5 opacity-70" />}
            </Button>
            {touched && !valid ? (
              <span className="text-sm text-destructive">Pick at least one source.</span>
            ) : (
              <p className="max-w-sm text-xs text-muted-foreground">
                {drop
                  ? 'Changes apply from the next run.'
                  : `Runs within a minute and reaches back ${DROP_BACKFILL_DAYS} days, then once a day.`}
                {` Only verified emails count, at most ${formatNumber(lim)} companies a run.`}
              </p>
            )}
          </div>
        </form>
      </main>
    </>
  );
}
