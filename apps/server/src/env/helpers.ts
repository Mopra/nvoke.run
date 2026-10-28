import { z } from 'zod';

/** Comma separated, trimmed, empties dropped. Unset is []. */
export const list = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

/** A string, with unset and empty both read as undefined. */
export const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

/** `true` or `false`, read as a boolean. */
export const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');
