import type { Logger } from 'pino';
import type { SearchKind } from '@nvoke/shared';
import type { FetchLike } from '../http.js';

export interface FoundCompany {
  name: string;
  website: string;
  /** Where it came from, for example "osm", "brave", "show_hn". */
  source: string;
  /** Stable id within that source, for example "node/123" or an HN item id. */
  sourceRef?: string;
  location?: string;
  phone?: string;
  category?: string;
  /** 0 to 100: how well it fits what the user asked for, when the adapter scored it. */
  fit?: number;
  fitReason?: string;
  /** The search result's title and description, when a web search found it: read by fit scoring, not stored. */
  title?: string;
  snippet?: string;
}

export interface SourceContext {
  /** How many companies the search still wants. Adapters may yield more; the caller stops early. */
  limit: number;
  signal: AbortSignal;
  log: Logger;
  /** Called for each request to a paid source, and for each page a cache served instead. */
  onUsage?: (event: 'request' | 'cache_hit') => void;
  /** The account the search belongs to, for metered calls such as Claude. */
  userId?: string;
  /** The search, for adapters that keep state on it. */
  searchId?: string;
  /** Reports what the adapter is doing now, shown to the user as the live progress line. */
  onStage?: (stage: string, note: string) => Promise<void>;
}

export interface SourceAdapter<P> {
  kind: SearchKind;
  find(params: P, ctx: SourceContext): AsyncIterable<FoundCompany>;
}

export interface SourceDeps {
  fetch?: FetchLike;
  log?: Logger;
}

/**
 * A failure that retrying cannot fix, such as a missing API key or a
 * location that does not exist. The queue fails the job on the first attempt
 * and the search gets the message as its error.
 */
export class PermanentError extends Error {
  constructor(
    message: string,
    /** Stored as the search error. Defaults to the message. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PermanentError';
  }
}

/**
 * A paid source refused us for a reason on our side: spend limit reached,
 * billing problem, revoked key. The search fails with `source_unavailable`,
 * the source is paused and the operator is alerted.
 */
export class SourceUnavailableError extends PermanentError {
  constructor(
    readonly source: string,
    /** For the operator: what the source said. */
    readonly reason: string,
  ) {
    super(`${source} is unavailable: ${reason}`, 'source_unavailable');
    this.name = 'SourceUnavailableError';
  }
}
