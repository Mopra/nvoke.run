export interface FunctionDraft {
  code: string;
  body: string;
  headers: string;
  method: string;
  updatedAt: string;
}

const key = (id: string) => `nvoke:draft:${id}`;

export function loadDraft(id: string): FunctionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FunctionDraft;
    if (
      !parsed ||
      typeof parsed.code !== "string" ||
      typeof parsed.body !== "string" ||
      typeof parsed.headers !== "string" ||
      typeof parsed.method !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(id: string, draft: FunctionDraft) {
  try {
    window.localStorage.setItem(key(id), JSON.stringify(draft));
  } catch {
    // quota exceeded or serialization issue — autosave is best-effort
  }
}

export function clearDraft(id: string) {
  try {
    window.localStorage.removeItem(key(id));
  } catch {
    // ignore
  }
}
