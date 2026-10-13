import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api } from './api';
import { filesApi } from './desktop';
import { isActive } from './format';
import { useSearches } from './queries';
import { enrichCsv, enrichSummary, type Table } from './table';
import type { Company } from './types';

/**
 * A dropped list on its way to an enriched copy: the search it started, the
 * file it came from and the rows to write back. Jobs live in the renderer, so
 * closing the window to the tray keeps them and quitting the app drops them
 * (the search itself still shows in Searches and exports as usual).
 */
export interface EnrichJob {
  searchId: string;
  fileName: string;
  /** Where the original lives. Empty in a plain browser, where the copy downloads. */
  sourcePath: string;
  table: Table;
  rowItems: (string | null)[];
}

/** Every company of a search, page by page. */
async function allCompanies(searchId: string): Promise<Company[]> {
  const out: Company[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.listCompanies(searchId, { limit: 200, cursor });
    out.push(...page.companies);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return out;
}

function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** `leads.csv` as `leads.nvoke.csv`, the way main names the copy. */
export function enrichedName(fileName: string): string {
  const stem = fileName.replace(/\.(csv|tsv|txt)$/i, '').replace(/\.nvoke$/i, '');
  return `${stem || 'list'}.nvoke.csv`;
}

async function finish(job: EnrichJob): Promise<void> {
  let companies: Company[];
  try {
    companies = await allCompanies(job.searchId);
  } catch {
    toast.error(`Couldn’t read the results for ${job.fileName}`, { description: 'Open the search and export it instead.' });
    return;
  }
  const csv = enrichCsv(job.table, job.rowItems, companies);
  const { withEmail, valid } = enrichSummary(companies);
  const description = `${valid} of ${companies.length} companies with a valid address, ${withEmail} with any.`;
  const files = filesApi();
  if (!files) {
    downloadCsv(enrichedName(job.fileName), csv);
    toast.success(`${enrichedName(job.fileName)} is ready`, { description });
    return;
  }
  const saved = await files.saveEnriched(job.sourcePath, csv);
  if (!saved.saved) {
    toast.error(`Couldn’t save ${enrichedName(job.fileName)}`, { description: saved.error });
    return;
  }
  toast.success(`Saved ${enrichedName(job.fileName)}`, {
    description,
    duration: 12_000,
    action: { label: 'Show in folder', onClick: () => void files.reveal(saved.filePath) },
  });
}

function failure(error: string | null): string {
  if (error === 'quota_exceeded') return 'You’re out of verified emails this month.';
  return error ? 'The search failed. Open it for details.' : 'The search failed.';
}

/**
 * Watches the searches list and writes each job's enriched copy once its
 * search is done. `track` takes a job whose search was just started.
 */
export function useEnrichJobs(): { track: (job: EnrichJob) => void } {
  const jobs = useRef(new Map<string, EnrichJob>());
  const { data: searches } = useSearches();

  const track = useCallback((job: EnrichJob) => {
    jobs.current.set(job.searchId, job);
  }, []);

  useEffect(() => {
    if (!searches) return;
    for (const [id, job] of jobs.current) {
      const search = searches.find((s) => s.id === id);
      // Deleted by the user: nothing to write.
      if (!search) {
        jobs.current.delete(id);
        continue;
      }
      if (isActive(search.status)) continue;
      jobs.current.delete(id);
      if (search.status === 'done') void finish(job);
      else if (search.status === 'failed') toast.error(`${job.fileName} wasn’t enriched`, { description: failure(search.error) });
    }
  }, [searches]);

  return { track };
}
