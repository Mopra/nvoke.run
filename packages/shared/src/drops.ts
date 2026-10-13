import { z } from 'zod';

/**
 * Drops: saved filters over the feed of new launches the worker collects
 * around the clock. Once a day each enabled drop turns the launches it has
 * not delivered yet into a search of kind `drop`, which crawls, verifies and
 * bills like any other search.
 */

/** Where the feed collects new companies from. */
export const FeedSource = z.enum(['show_hn', 'launch_hn', 'product_hunt', 'yc']);
export type FeedSource = z.infer<typeof FeedSource>;

export const FEED_SOURCES = FeedSource.options;

export const DROP_DAILY_LIMIT_DEFAULT = 25;
export const DROP_DAILY_LIMIT_MAX = 200;
/** How far back the first run of a new drop reaches. */
export const DROP_BACKFILL_DAYS = 7;

const name = z.string().trim().min(1).max(80);
const keyword = z.string().trim().min(1).max(100);
const sources = z.array(FeedSource).min(1);
const dailyLimit = z.number().int().min(1).max(DROP_DAILY_LIMIT_MAX);

export const CreateDropRequest = z.object({
  name,
  /** Every word must appear in the name, tagline, description or tags. */
  keyword: keyword.optional(),
  /** All sources when left out. */
  sources: sources.optional(),
  /** Most companies one run delivers. Newest first, the rest are skipped. */
  dailyLimit: dailyLimit.optional(),
});
export type CreateDropRequest = z.infer<typeof CreateDropRequest>;

/** `keyword: null` removes the keyword. */
export const UpdateDropRequest = z
  .object({
    name: name.optional(),
    keyword: keyword.nullable().optional(),
    sources: sources.optional(),
    dailyLimit: dailyLimit.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });
export type UpdateDropRequest = z.infer<typeof UpdateDropRequest>;

export const Drop = z.object({
  id: z.uuid(),
  name: z.string(),
  keyword: z.string().nullable(),
  sources: z.array(FeedSource),
  dailyLimit: z.number().int().positive(),
  enabled: z.boolean(),
  /** When the next run looks for new launches. */
  nextRunAt: z.iso.datetime({ offset: true }),
  /** The last run that delivered something. Runs that find nothing new create no search. */
  lastDeliveredAt: z.iso.datetime({ offset: true }).nullable(),
  /** Companies delivered across all runs still kept. */
  companiesDelivered: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Drop = z.infer<typeof Drop>;

export const FeedSourceStatus = z.object({
  source: FeedSource,
  /** False when the server cannot collect from it, for example without an API key. */
  available: z.boolean(),
  /** Launches collected in the last 7 days. */
  lastWeek: z.number().int().nonnegative(),
  lastCollectedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type FeedSourceStatus = z.infer<typeof FeedSourceStatus>;

export const DropListResponse = z.object({
  drops: z.array(Drop),
  sources: z.array(FeedSourceStatus),
});
export type DropListResponse = z.infer<typeof DropListResponse>;

export const DropIdParams = z.object({
  id: z.uuid(),
});
export type DropIdParams = z.infer<typeof DropIdParams>;

/** The params of a search a drop created. Read only: clients never create these. */
export const DropRunParams = z.object({
  dropId: z.uuid(),
  /** The drop's name when the run was made. */
  dropName: z.string(),
  keyword: z.string().optional(),
  sources: z.array(FeedSource),
});
export type DropRunParams = z.infer<typeof DropRunParams>;
