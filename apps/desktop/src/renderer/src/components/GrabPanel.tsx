import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Plus, ScanText, X } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { itemDomain } from '@nvoke/shared';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { grabApi } from '@/lib/desktop';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SearchInput } from '@/lib/types';
import type { GrabItem, GrabState } from '../../../ipc/contract';

/** The most items one domains search takes (`SEARCH_LIMIT_MAX`). */
const MAX_ITEMS = 1000;

interface Row {
  id: number;
  text: string;
  on: boolean;
}

/**
 * The quick window's side of Grab from screen: reading, then the companies
 * as a list to edit (fix a misread name, untick, remove, add), then a
 * domains search on what is ticked.
 */
export function GrabPanel({
  state,
  onStart,
  onBack,
  notice,
  pending,
}: {
  state: GrabState;
  onStart: (input: SearchInput) => void;
  onBack: () => void;
  notice: string | null;
  pending: boolean;
}) {
  if (state.status === 'reading') {
    return (
      <div className="flex items-center gap-4 px-6 py-6">
        <LogoMark motion="loading" className="size-8" />
        <div className="min-w-0">
          <div className="font-display text-xl tracking-[-0.02em]">Reading the box</div>
          <div className="mt-1 text-sm text-muted-foreground">On this computer. The image never leaves it.</div>
        </div>
      </div>
    );
  }
  if (state.status === 'error') return <GrabError state={state} onBack={onBack} />;
  return <GrabList items={state.items} people={state.people} onStart={onStart} onBack={onBack} notice={notice} pending={pending} />;
}

const ERROR_TITLE: Record<Extract<GrabState, { status: 'error' }>['reason'], string> = {
  permission: 'Screen Recording is off',
  ocr: 'No text engine',
  empty: 'Nothing to search',
  failed: 'That did not work',
};

function GrabError({ state, onBack }: { state: Extract<GrabState, { status: 'error' }>; onBack: () => void }) {
  const grab = grabApi();
  return (
    <div className="px-6 pt-5 pb-5">
      <div className="font-display text-xl tracking-[-0.02em]">{ERROR_TITLE[state.reason]}</div>
      <div className="mt-1.5 text-sm text-muted-foreground">{state.message}</div>
      <div className="mt-5 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        {state.reason === 'permission' ? (
          <Button onClick={() => grab?.openSettings()} autoFocus>
            Open System Settings
          </Button>
        ) : (
          <Button onClick={() => grab?.start()} autoFocus>
            <ScanText className="size-4" />
            Grab again
          </Button>
        )}
      </div>
    </div>
  );
}

function GrabList({
  items,
  people,
  onStart,
  onBack,
  notice,
  pending,
}: {
  items: GrabItem[];
  people: number;
  onStart: (input: SearchInput) => void;
  onBack: () => void;
  notice: string | null;
  pending: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => items.map((item, id) => ({ id, text: item.text, on: true })));
  const [draft, setDraft] = useState('');
  const nextId = useRef(items.length);
  const chosen = rows.filter((r) => r.on && r.text.trim()).map((r) => r.text.trim());
  const ready = chosen.length > 0 && chosen.length <= MAX_ITEMS && !pending;
  const mac = document.documentElement.dataset['platform'] === 'darwin';

  function submit(): void {
    if (ready) onStart({ kind: 'domains', params: { items: chosen } });
  }

  // Cmd or Ctrl Enter searches from anywhere in the list.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const update = (id: number, patch: Partial<Row>): void => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function add(): void {
    const text = draft.trim();
    if (!text) return;
    setRows((all) => [...all, { id: nextId.current++, text, on: true }]);
    setDraft('');
  }

  return (
    <div className="pt-5 pb-4">
      <div className="flex items-baseline justify-between gap-4 px-6">
        <div className="font-display text-xl tracking-[-0.02em]">
          {formatNumber(rows.length)} {rows.length === 1 ? 'company' : 'companies'} on screen
        </div>
        {people > 0 && (
          <div className="shrink-0 text-sm text-muted-foreground">
            {formatNumber(people)} {people === 1 ? 'person' : 'people'} left out
          </div>
        )}
      </div>
      <div className="mt-1 px-6 text-sm text-muted-foreground">Read on this computer. Fix, untick or add before you search.</div>
      <ul className="mt-3 max-h-72 overflow-y-auto px-3" data-grab-list>
        {rows.map((row) => {
          const domain = itemDomain(row.text) !== null;
          return (
            <li key={row.id} className="group flex h-10 items-center gap-1 rounded-[16px] pr-1.5 pl-1.5 hover:bg-foreground/[0.04]">
              <button
                type="button"
                onClick={() => update(row.id, { on: !row.on })}
                aria-label={row.on ? `Leave out ${row.text}` : `Include ${row.text}`}
                aria-pressed={row.on}
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <span
                  className={cn(
                    'flex size-[18px] items-center justify-center rounded-full border transition-colors',
                    row.on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {row.on && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
              <input
                value={row.text}
                onChange={(e) => update(row.id, { text: e.target.value })}
                aria-label="Company"
                spellCheck={false}
                className={cn(
                  'h-8 min-w-0 flex-1 rounded-[10px] bg-transparent px-1.5 text-sm outline-none focus:bg-foreground/[0.04]',
                  domain && 'font-mono',
                  !row.on && 'text-muted-foreground line-through',
                )}
              />
              <button
                type="button"
                onClick={() => setRows((all) => all.filter((r) => r.id !== row.id))}
                aria-label={`Remove ${row.text}`}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:bg-foreground/[0.06] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" />
              </button>
            </li>
          );
        })}
        <li className="flex h-10 items-center gap-1 rounded-[16px] pr-1.5 pl-1.5">
          <span className="flex size-7 shrink-0 items-center justify-center">
            <Plus className="size-4 text-muted-foreground" />
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            placeholder="Add a company or domain"
            aria-label="Add a company or domain"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 rounded-[10px] bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </li>
      </ul>
      {notice && <div className="px-6 pt-2 text-sm text-destructive">{notice}</div>}
      {chosen.length > MAX_ITEMS && (
        <div className="px-6 pt-2 text-sm text-destructive">One search takes up to {formatNumber(MAX_ITEMS)} companies.</div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 px-6">
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button variant="ghost" onClick={() => grabApi()?.start()}>
            <ScanText className="size-4" />
            Grab again
          </Button>
        </div>
        <Button onClick={submit} disabled={!ready} autoFocus>
          {pending ? <Loader2 className="size-4 motion-safe:animate-spin" /> : null}
          Find contacts at {formatNumber(chosen.length)}
          <Kbd className="ml-1 bg-primary-foreground/15 text-primary-foreground/80">{mac ? '⌘↵' : 'Ctrl ↵'}</Kbd>
        </Button>
      </div>
    </div>
  );
}
