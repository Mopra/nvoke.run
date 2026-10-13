import { useEffect, useRef } from 'react';
import type { InboxFailure, InboxFile } from '../../../ipc/contract';
import { ApiError, api } from './api';
import { inboxApi } from './desktop';
import type { EnrichJob } from './enrich';
import { useCreateSearch } from './queries';
import { columnItems, guessColumn, parseTable } from './table';

type Create = ReturnType<typeof useCreateSearch>['mutateAsync'];

function reasonFor(err: unknown): InboxFailure {
  if (err instanceof ApiError) {
    if (err.code === 'quota_exceeded') return 'quota';
    if (err.status === 401) return 'signed-out';
  }
  return 'error';
}

/**
 * Starts the search for a file from the watched inbox: guesses the column,
 * cuts the list to the search limit and what is left of this month's
 * allowance, and hands the job to `track`. Anything that stops it goes back
 * to main as a failure, which shows it as a notification.
 */
export async function startInboxFile(file: InboxFile, create: Create, track: (job: EnrichJob) => void): Promise<void> {
  const inbox = inboxApi();
  if (!inbox) return;
  const fail = (reason: InboxFailure): Promise<void> => inbox.failed({ id: file.id, reason });
  const table = parseTable(file.text);
  if (!table) return fail('empty');
  try {
    const me = await api.getMe();
    const left = me.usage.emailsLimit - me.usage.emailsVerified;
    if (left <= 0) return fail('quota');
    const found = columnItems(table, guessColumn(table), Math.min(me.maxSearchLimit, left));
    if (found.items.length === 0) return fail('empty');
    const search = await create({ kind: 'domains', params: { items: found.items } });
    track({ searchId: search.id, fileName: file.fileName, sourcePath: '', table, rowItems: found.rowItems, inboxId: file.id });
  } catch (err) {
    return fail(reasonFor(err));
  }
}

/** Takes the files main finds in the watched inbox folder and enriches them in the background. */
export function useInbox(track: (job: EnrichJob) => void): void {
  const { mutateAsync } = useCreateSearch();
  const latest = useRef({ create: mutateAsync, track });
  useEffect(() => {
    latest.current = { create: mutateAsync, track };
  });
  useEffect(() => {
    const inbox = inboxApi();
    if (!inbox) return;
    const off = inbox.onFile((file) => void startInboxFile(file, (input) => latest.current.create(input), (job) => latest.current.track(job)));
    inbox.ready();
    return off;
  }, []);
}
