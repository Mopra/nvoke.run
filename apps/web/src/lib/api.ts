import { useAuth } from "@clerk/clerk-react";

const BASE = import.meta.env.VITE_API_URL as string;

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
