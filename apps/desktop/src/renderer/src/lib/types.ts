/**
 * Wire types for the nvoke API. The zod schemas in @nvoke/shared are the
 * single source of truth (packages/shared/src/leads.ts and api.ts); this file
 * only re-exports them under the names the renderer uses. The bridge types
 * come from the IPC contract the preload implements.
 */
import type { LeadFilters } from '@nvoke/shared';

export type {
  CompaniesPage,
  Company,
  CrawlStatus,
  CreateDropRequest as DropInput,
  CreateSearchInput as SearchInput,
  Drop,
  DropListResponse,
  DropRunParams,
  Email,
  EmailKind,
  FeedSource,
  FeedSourceStatus,
  LaunchesSearchParams as LaunchesParams,
  LocalSearchParams as LocalParams,
  MeResponse as Me,
  Plan,
  Search,
  SearchKind,
  SearchStatus,
  UpdateDropRequest as DropUpdate,
  Usage,
  User,
  Verification,
  WebSearchParams as WebParams,
} from '@nvoke/shared';

export type { AuthState, BridgeResponse, ExportResult, HttpMethod } from '../../../ipc/contract';

/** Filters for `GET /v1/searches/:id/companies`, plus the page cursor. */
export type CompaniesQuery = LeadFilters & { cursor?: string };
