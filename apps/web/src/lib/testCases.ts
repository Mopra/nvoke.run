export interface SavedTestCase {
  id: string;
  name: string;
  input: string;
  createdAt: string;
}

function key(functionId: string) {
  return `nvoke:test-cases:${functionId}`;
}

export function listSavedTestCases(functionId: string): SavedTestCase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(functionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedTestCase[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.input === "string" &&
        typeof item.createdAt === "string",
    );
  } catch {
    return [];
  }
}

export function saveTestCase(functionId: string, item: SavedTestCase) {
  const next = [item, ...listSavedTestCases(functionId)].slice(0, 20);
  window.localStorage.setItem(key(functionId), JSON.stringify(next));
  return next;
}

export function deleteTestCase(functionId: string, id: string) {
  const next = listSavedTestCases(functionId).filter((item) => item.id !== id);
  window.localStorage.setItem(key(functionId), JSON.stringify(next));
  return next;
}
