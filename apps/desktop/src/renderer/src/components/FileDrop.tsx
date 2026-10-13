import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { itemDomain, SEARCH_LIMIT_MAX } from '@nvoke/shared';
import { Button } from '@/components/ui/button';
import { CountryPicker } from '@/components/CountryPicker';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { filesApi } from '@/lib/desktop';
import { enrichedName, useEnrichJobs } from '@/lib/enrich';
import { formatNumber } from '@/lib/format';
import { useCreateSearch, useMe } from '@/lib/queries';
import { navigate } from '@/lib/router';
import { columnItems, guessColumn, MAX_TABLE_BYTES, parseTable, type Table } from '@/lib/table';
import { cn } from '@/lib/utils';

/** What a dropped file may be called. Main checks the same list before it writes next to it. */
const TABLE_FILE = /\.(csv|tsv|txt)$/i;

interface Dropped {
  fileName: string;
  sourcePath: string;
  table: Table;
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Drop a CSV on the window: a glass target appears while a file is over it,
 * then a dialog asks which column holds the domains or company names (guessed
 * first) and starts a `domains` search. When it finishes, the enriched copy
 * is written next to the original (see lib/enrich.ts).
 */
export function FileDrop() {
  const [over, setOver] = useState(false);
  const [dropped, setDropped] = useState<Dropped | null>(null);
  const depth = useRef(0);
  const { track } = useEnrichJobs();

  async function read(file: File): Promise<void> {
    if (/\.xlsx?$/i.test(file.name)) {
      toast.error('Save it as CSV first', { description: 'In Excel: File, Save As, CSV UTF-8. Then drop it again.' });
      return;
    }
    if (!TABLE_FILE.test(file.name)) {
      toast.error('That isn’t a CSV', { description: 'Drop a .csv, .tsv or .txt file with a column of domains or company names.' });
      return;
    }
    if (file.size > MAX_TABLE_BYTES) {
      toast.error('That file is too big', { description: 'Up to 5 MB, a few tens of thousands of rows.' });
      return;
    }
    const files = filesApi();
    const sourcePath = files ? files.pathFor(file) : '';
    if (files && !sourcePath) {
      toast.error('Couldn’t find that file on disk', { description: 'Drop it from a folder instead of a zip or a web page.' });
      return;
    }
    const table = parseTable(await file.text());
    if (!table) {
      toast.error('Nothing to read in that file', { description: 'It needs a header row and at least one row below it.' });
      return;
    }
    setDropped({ fileName: file.name, sourcePath, table });
  }

  useEffect(() => {
    // Every file drop is ours: without this the window would navigate to the file.
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    };
    const overEvent = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const drop = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const file = e.dataTransfer?.files[0];
      if (file) void read(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overEvent);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overEvent);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <>
      <DropTarget on={over} />
      <Dialog open={dropped !== null} onOpenChange={(open) => !open && setDropped(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-[560px]">
          <DialogTitle className="sr-only">Enrich a list</DialogTitle>
          <DialogDescription className="sr-only">Pick the column with domains or company names and start a search.</DialogDescription>
          {/* Mounted only while a file is waiting, so every drop starts fresh. */}
          {dropped && <EnrichForm dropped={dropped} onDone={() => setDropped(null)} track={track} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The glass card in the middle of the window while a file is dragged over it. */
function DropTarget({ on }: { on: boolean }) {
  return (
    <div
      aria-hidden
      data-file-drop-target
      className={cn(
        'pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-scrim/40 backdrop-blur-[6px] transition-opacity duration-200',
        on ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div
        className={cn(
          'glass-strong flex w-[min(460px,80vw)] flex-col items-center gap-4 rounded-[28px] border border-dashed border-primary/60 px-10 py-14 text-center transition-transform duration-300 ease-spring',
          on ? 'scale-100' : 'scale-95',
        )}
      >
        <FileSpreadsheet className="size-8 text-primary" strokeWidth={1.5} />
        <div className="font-display text-3xl font-semibold tracking-tight">Drop it to find contacts</div>
        <p className="text-sm text-muted-foreground">A CSV with a column of domains or company names.</p>
      </div>
    </div>
  );
}

function EnrichForm({
  dropped,
  onDone,
  track,
}: {
  dropped: Dropped;
  onDone: () => void;
  track: ReturnType<typeof useEnrichJobs>['track'];
}) {
  const { table, fileName, sourcePath } = dropped;
  const [col, setCol] = useState(() => guessColumn(table));
  const [country, setCountry] = useState('');
  const create = useCreateSearch();
  const me = useMe();
  const maxLimit = me.data?.maxSearchLimit ?? SEARCH_LIMIT_MAX;
  const found = columnItems(table, col, maxLimit);
  const shown = found.items.slice(0, 5);
  const ready = found.items.length > 0;

  function start(): void {
    if (!ready || create.isPending) return;
    create.mutate(
      { kind: 'domains', params: { items: found.items, ...(country && found.names > 0 ? { country } : {}) } },
      {
        onSuccess: (search) => {
          track({ searchId: search.id, fileName, sourcePath, table, rowItems: found.rowItems });
          toast.success('Search started', { description: `${enrichedName(fileName)} is saved next to the original when it finishes.` });
          onDone();
          navigate({ name: 'search', id: search.id });
        },
        onError: (err) => toast.error('Couldn’t start the search', { description: err.message }),
      },
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
      className="flex flex-col gap-6 p-7"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06]">
          <FileSpreadsheet className="size-5 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-xl font-semibold tracking-tight">{fileName}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {formatNumber(table.rows.length)} {table.rows.length === 1 ? 'row' : 'rows'}, {formatNumber(table.headers.length)}{' '}
            {table.headers.length === 1 ? 'column' : 'columns'}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="enrich-column" className="text-xs font-medium text-muted-foreground">
          Which column has the domains or company names?
        </label>
        <Select value={String(col)} onValueChange={(v) => setCol(Number(v))}>
          <SelectTrigger
            id="enrich-column"
            className="glass h-11 w-full justify-between gap-3 rounded-full px-5 text-left text-[15px] focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <span className="min-w-0 flex-1 truncate">
              <SelectValue />
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground/70" />
          </SelectTrigger>
          <SelectContent align="start" className="max-h-72">
            {table.headers.map((header, i) => (
              <SelectItem key={i} value={String(i)}>
                {header}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        aria-live="polite"
        className="flex min-h-14 flex-col gap-2 rounded-[20px] bg-foreground/[0.04] px-4 py-3 text-xs text-muted-foreground"
      >
        {ready ? (
          <>
            <span className="text-foreground tabular-nums">
              {[
                found.domains > 0 && `${formatNumber(found.domains)} ${found.domains === 1 ? 'domain' : 'domains'}`,
                found.names > 0 && `${formatNumber(found.names)} ${found.names === 1 ? 'name' : 'names'} to look up`,
              ]
                .filter(Boolean)
                .join(', ')}
              {found.skipped > 0 && (
                <span className="text-destructive"> · {formatNumber(found.skipped)} left out, your plan allows {formatNumber(maxLimit)} per search</span>
              )}
            </span>
            <span className="flex flex-wrap gap-1.5">
              {shown.map((item) => (
                <span
                  key={item}
                  className={cn('max-w-44 truncate rounded-full bg-foreground/[0.06] px-2.5 py-0.5', itemDomain(item) && 'font-mono')}
                >
                  {itemDomain(item) ?? item}
                </span>
              ))}
              {found.items.length > shown.length && <span className="py-0.5">and {formatNumber(found.items.length - shown.length)} more</span>}
            </span>
          </>
        ) : (
          <span>That column is empty. Pick another one.</span>
        )}
      </div>

      {found.names > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <label htmlFor="enrich-country" className="text-muted-foreground">
            Names are companies in
          </label>
          <CountryPicker
            id="enrich-country"
            value={country}
            onChange={setCountry}
            triggerClassName="glass h-9 rounded-full px-4 text-sm"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="max-w-64 text-xs text-muted-foreground">
          Your file stays as it is. The copy with the emails goes next to it as {enrichedName(fileName)}.
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready || create.isPending}>
            {create.isPending && <Loader2 className="motion-safe:animate-spin" />}
            Find contacts
          </Button>
        </div>
      </div>
    </form>
  );
}
