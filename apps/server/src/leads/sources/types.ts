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
}

export interface SourceContext {
  /** How many companies the search still wants. Adapters may yield more; the caller stops early. */
  limit: number;
  signal: AbortSignal;
  log: Logger;
  /** Called for each request to a paid source, and for each page a cache served instead. */
  onUsage?: (event: 'request' | 'cache_hit') => void;
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
