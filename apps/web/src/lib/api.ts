import { useAuth } from "@clerk/clerk-react";

const BASE = import.meta.env.VITE_API_URL as string;

export const SUPPORTED_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
export type HttpMethod = (typeof SUPPORTED_METHODS)[number];

export type AccessMode = "public" | "api_key";

export interface Fn {
  id: string;
  name: string;
  code: string;
  slug: string | null;
  access_mode: AccessMode;
  enabled: boolean;
  methods: HttpMethod[];
  created_at: string;
  updated_at: string;
}

export interface NormalizedHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface InvokeResponse {
  invocation_id: string;
  status: "success" | "error" | "timeout";
  response: NormalizedHttpResponse | null;
  logs: string[] | null;
  error: string | null;
  duration_ms: number;
}

export interface RunSummary {
  id: string;
  function_id: string;
  function_name?: string | null;
  source: "ui" | "api";
  status: "success" | "error" | "timeout";
  duration_ms: number;
  started_at: string;
  completed_at: string | null;
  trigger_kind: "editor" | "http";
  request_method: string | null;
  request_path: string | null;
  response_status: number | null;
}

export function publicEndpointUrl(slug: string | null): string {
  if (!slug) return "";
  return `${BASE}/f/${slug}`;
}

export function useApi() {
  const { getToken } = useAuth();
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  return { request };
}
