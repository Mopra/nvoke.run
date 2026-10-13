import type { z } from 'zod';
import { env } from './env';

/** GETs a JSON endpoint on apps/server and validates it with a shared schema. */
export async function apiGet<T extends z.ZodType>(path: string, schema: T, token?: string | null): Promise<z.infer<T>> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return schema.parse(await res.json());
}
