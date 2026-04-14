import type { SavedTestCase } from "./testCases";

export function exportTestCases(cases: SavedTestCase[], functionName: string) {
  const blob = new Blob([JSON.stringify(cases, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${functionName.replace(/\s+/g, "-").toLowerCase()}-test-cases.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseTestCasesFile(text: string): SavedTestCase[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("Expected an array");
  return parsed
    .filter(
      (item): item is SavedTestCase =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.input === "string" &&
        typeof item.createdAt === "string",
    )
    .map((item) => ({ ...item, id: crypto.randomUUID() }));
}
