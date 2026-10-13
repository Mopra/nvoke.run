import { z } from 'zod';
import { Company, Search, SearchKind } from './leads.ts';

/**
 * Webhooks (docs/SPEC.md, "Webhooks"): leads pushed to the user's own URL as
 * soon as they are ready. Requests are signed the Standard Webhooks way
 * (standardwebhooks.com), so its libraries verify them.
 */

/** Prefix of a webhook signing secret. */
export const WEBHOOK_SECRET_PREFIX = 'whsec_';

/** How many webhooks an account may hold. */
export const WEBHOOKS_MAX = 10;

/** Events a webhook can subscribe to. `ping` is only sent by the test route. */
export const WebhookEvent = z.enum(['lead.ready', 'search.finished']);
export type WebhookEvent = z.infer<typeof WebhookEvent>;

export const WEBHOOK_EVENTS = WebhookEvent.options;

/** `all`: every search, drops included. `drops`: only searches a drop made. */
export const WebhookScope = z.enum(['all', 'drops']);
export type WebhookScope = z.infer<typeof WebhookScope>;

const url = z
  .url({ protocol: /^https?$/ })
  .max(2000)
  .describe('Where to POST events. HTTPS on a public address.');
const events = z.array(WebhookEvent).min(1).describe('The events to send.');
const scope = WebhookScope.describe('`all`: every search. `drops`: only searches a drop made.');
const dropId = z.uuid().describe('Only searches this drop made. Implies scope `drops`.');

export const CreateWebhookRequest = z.object({
  url,
  /** Both events when left out. */
  events: events.optional(),
  scope: scope.optional(),
  dropId: dropId.optional(),
});
export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequest>;

/** `dropId: null` removes the narrowing. */
export const UpdateWebhookRequest = z
  .object({
    url: url.optional(),
    events: events.optional(),
    scope: scope.optional(),
    dropId: dropId.nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });
export type UpdateWebhookRequest = z.infer<typeof UpdateWebhookRequest>;

export const WebhookDisabledReason = z.enum(['failing']);
export type WebhookDisabledReason = z.infer<typeof WebhookDisabledReason>;

export const Webhook = z.object({
  id: z.uuid(),
  url: z.string(),
  events: z.array(WebhookEvent),
  scope: WebhookScope,
  dropId: z.uuid().nullable(),
  enabled: z.boolean(),
  /** `failing`: we turned it off after a day of failed deliveries. Null while enabled or paused by you. */
  disabledReason: WebhookDisabledReason.nullable(),
  lastSuccessAt: z.iso.datetime({ offset: true }).nullable(),
  lastFailureAt: z.iso.datetime({ offset: true }).nullable(),
  /** What went wrong on the last failed attempt, for example `HTTP 500` or `timeout`. */
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Webhook = z.infer<typeof Webhook>;

export const WebhookListResponse = z.object({
  webhooks: z.array(Webhook),
});
export type WebhookListResponse = z.infer<typeof WebhookListResponse>;

/** The new webhook with its signing secret. The secret is never returned again. */
export const CreateWebhookResponse = Webhook.extend({
  secret: z.string().startsWith(WEBHOOK_SECRET_PREFIX),
});
export type CreateWebhookResponse = z.infer<typeof CreateWebhookResponse>;

export const WebhookIdParams = z.object({
  id: z.uuid(),
});
export type WebhookIdParams = z.infer<typeof WebhookIdParams>;

export const WebhookTestResponse = z.object({
  ok: z.boolean(),
  /** HTTP status of the answer. Null when there was none. */
  status: z.number().int().nullable(),
  error: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
});
export type WebhookTestResponse = z.infer<typeof WebhookTestResponse>;

export const WebhookDeliveryStatus = z.enum(['pending', 'delivered', 'failed', 'skipped']);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatus>;

export const WebhookDelivery = z.object({
  /** Sent as the `webhook-id` header, the same on every retry. */
  id: z.uuid(),
  event: WebhookEvent,
  searchId: z.uuid(),
  companyId: z.uuid().nullable(),
  /** `skipped`: the data was gone by the time it was due (deleted search, opt-out). */
  status: WebhookDeliveryStatus,
  attempts: z.number().int().nonnegative(),
  lastStatus: z.number().int().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  nextAttemptAt: z.iso.datetime({ offset: true }).nullable(),
  deliveredAt: z.iso.datetime({ offset: true }).nullable(),
});
export type WebhookDelivery = z.infer<typeof WebhookDelivery>;

export const WebhookDeliveryListResponse = z.object({
  deliveries: z.array(WebhookDelivery),
});
export type WebhookDeliveryListResponse = z.infer<typeof WebhookDeliveryListResponse>;

// What we send

/** The search a lead came from, small enough to route on. */
export const WebhookSearchRef = z.object({
  id: z.uuid(),
  kind: SearchKind,
  dropId: z.uuid().nullable(),
  dropName: z.string().nullable(),
});
export type WebhookSearchRef = z.infer<typeof WebhookSearchRef>;

const envelope = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.object({ type: z.literal(type), timestamp: z.iso.datetime({ offset: true }), data });

export const LeadReadyPayload = envelope('lead.ready', z.object({ search: WebhookSearchRef, company: Company }));
export type LeadReadyPayload = z.infer<typeof LeadReadyPayload>;

export const SearchFinishedPayload = envelope('search.finished', z.object({ search: Search }));
export type SearchFinishedPayload = z.infer<typeof SearchFinishedPayload>;

export const PingPayload = envelope('ping', z.object({ webhookId: z.uuid() }));
export type PingPayload = z.infer<typeof PingPayload>;

/** The JSON body of every webhook request. */
export const WebhookPayload = z.discriminatedUnion('type', [LeadReadyPayload, SearchFinishedPayload, PingPayload]);
export type WebhookPayload = z.infer<typeof WebhookPayload>;
