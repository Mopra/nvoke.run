/**
 * Opening a search's page after it starts. The client navigation can stall
 * (a cold route, a slow chunk); after `OPEN_FALLBACK_MS` on the old page the
 * browser loads the search's page outright.
 */

export const OPEN_FALLBACK_MS = 4000;

export function searchPath(id: string): string {
  return `/app/searches/${encodeURIComponent(id)}`;
}

/** Whether the soft navigation to `target` has not landed yet, so a full page load should take over. */
export function stillOpening(pathname: string, target: string): boolean {
  return pathname.replace(/\/+$/, '') !== target;
}
