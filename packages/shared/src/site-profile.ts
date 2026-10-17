import { z } from 'zod';
import { CreateSearchRequest } from './leads.ts';

/**
 * Start from your website (docs/SPEC.md, "Site profile"). The user pastes
 * their own site; the server reads a few of its pages, asks Claude who the
 * site sells to and suggests searches in the real search kinds. The profile
 * is kept on the account and is editable, so later features (openers) can
 * write in the user's own words.
 */

const line = (max: number) => z.string().trim().min(1).max(max);

/** What the site says about the business. Every field is editable. */
export const SiteProfileFields = z.object({
  /** The company or product name. */
  name: line(120),
  /** One sentence: what they do. */
  summary: line(300),
  /** What they sell. */
  offer: line(500),
  /** Who buys it. */
  audience: line(500),
  /** Claims the site backs up: customers, numbers, awards. */
  proofPoints: z.array(line(200)).max(8),
  /** Words and phrases the site uses about itself. */
  voice: z.array(line(80)).max(12),
  /** ISO 639-1 language of the site, for example "da". */
  language: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((v) => v.toLowerCase()),
  /** ISO 3166-1 alpha-2 country the business sells in most, when the site says. */
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((v) => v.toLowerCase())
    .nullable(),
});
export type SiteProfileFields = z.infer<typeof SiteProfileFields>;

/** A search ready to start with `POST /v1/searches`, and one line on why. */
export const SuggestedSearch = z.object({
  why: line(200),
  search: CreateSearchRequest,
});
export type SuggestedSearch = z.infer<typeof SuggestedSearch>;

export const SITE_PROFILE_SUGGESTIONS_MIN = 3;
export const SITE_PROFILE_SUGGESTIONS_MAX = 6;
/** Site profiles an account may build a day. Reading the profile and editing it are free. */
export const SITE_PROFILE_RUNS_PER_DAY = 10;

export const SiteProfile = z.object({
  /** The URL the profile was built from, as read (after redirects). */
  website: z.string(),
  domain: z.string(),
  profile: SiteProfileFields,
  suggestions: z.array(SuggestedSearch),
  /** The pages that were read. */
  pages: z.array(z.string()),
  /** The site's icon (apple-touch-icon, declared icon or favicon), on the site itself. Null when none loads. */
  icon: z.string().nullable(),
  /** The site's share image (og:image), or a screenshot of the homepage nvoke took when it has none. */
  image: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type SiteProfile = z.infer<typeof SiteProfile>;

/** `POST /v1/site-profile`: a domain or URL. Builds the profile again and replaces the stored one. */
export const BuildSiteProfileRequest = z.object({
  website: line(500),
});
export type BuildSiteProfileRequest = z.infer<typeof BuildSiteProfileRequest>;

/** `PATCH /v1/site-profile`: the fields to change. Suggestions stay as they are. */
export const UpdateSiteProfileRequest = SiteProfileFields.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Nothing to change',
});
export type UpdateSiteProfileRequest = z.infer<typeof UpdateSiteProfileRequest>;
