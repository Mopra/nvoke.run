/**
 * Reads `apps/desktop/CHANGELOG.md`: one `## x.y.z` heading per release,
 * newest first, then a bullet per change. The app shows the sections between
 * the last version the user saw and the running one, and
 * `scripts/release.mjs` and the release workflow use a section as the GitHub
 * release notes. Plain TypeScript without imports, so Node runs it directly.
 */

export interface ReleaseNote {
  version: string;
  /** One entry per bullet, or per paragraph outside a list. */
  items: string[];
}

const HEADING = /^##\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\s*$/;

/** Compares x.y.z versions. A prerelease sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const [coreA = '', preA] = a.replace(/^v/, '').split('-', 2);
  const [coreB = '', preB] = b.replace(/^v/, '').split('-', 2);
  const partsA = coreA.split('.').map(Number);
  const partsB = coreB.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  if (preA === preB) return 0;
  if (preA === undefined) return 1;
  if (preB === undefined) return -1;
  return preA < preB ? -1 : 1;
}

export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(value);
}

/** The raw markdown under each version heading, in file order. */
export function changelogSections(markdown: string): { version: string; body: string }[] {
  const sections: { version: string; lines: string[] }[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading?.[1]) sections.push({ version: heading[1], lines: [] });
    else if (/^#{1,2}\s/.test(line)) sections.push({ version: '', lines: [] });
    else sections.at(-1)?.lines.push(line);
  }
  return sections.filter((s) => s.version).map((s) => ({ version: s.version, body: s.lines.join('\n').trim() }));
}

/** The markdown for one version, or null when the changelog has no section for it. */
export function changelogSection(markdown: string, version: string): string | null {
  return changelogSections(markdown).find((s) => s.version === version.replace(/^v/, ''))?.body ?? null;
}

function items(body: string): string[] {
  const out: string[] = [];
  let current: string | null = null;
  const flush = (): void => {
    if (current) out.push(current.replace(/\s+/g, ' ').trim());
    current = null;
  };
  for (const line of body.split('\n')) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      current = bullet[1] ?? '';
    } else if (line.trim() === '') {
      flush();
    } else {
      current = current === null ? line : `${current} ${line}`;
    }
  }
  flush();
  return out;
}

export function parseChangelog(markdown: string): ReleaseNote[] {
  return changelogSections(markdown)
    .map((s) => ({ version: s.version, items: items(s.body) }))
    .filter((note) => note.items.length > 0);
}

/** The notes newer than `seen` up to and including `current`, newest first. */
export function notesSince(notes: ReleaseNote[], seen: string, current: string): ReleaseNote[] {
  return notes
    .filter((note) => compareVersions(note.version, seen) > 0 && compareVersions(note.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}
