import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { company, search, uuid } from './fixtures';
import { LocalStore } from './store';

const dirs: string[] = [];
const opened: LocalStore[] = [];
function fileStore(): LocalStore {
  const store = new LocalStore(tempFile());
  opened.push(store);
  return store;
}
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nvoke-local-'));
  dirs.push(dir);
  return join(dir, 'leads.sqlite');
}

afterEach(() => {
  for (const store of opened.splice(0)) store.wipe();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function seeded(): LocalStore {
  const store = new LocalStore(':memory:');
  store.replaceSearches([search(1)]);
  store.replaceCompanies(
    uuid(1),
    [
      company(1, 'Smile Aarhus', [
        ['info@smile.dk', 'generic', 'valid'],
        ['mette@smile.dk', 'personal', 'risky'],
      ]),
      company(2, 'Tandlæge Østergaard', [['kontakt@oestergaard.dk', 'generic', 'catch_all']]),
      company(3, 'No Mail Dental', []),
    ],
    'fp',
    1,
  );
  return store;
}

describe('LocalStore', () => {
  it('returns nothing for a search whose companies were never fetched', () => {
    const store = new LocalStore(':memory:');
    store.replaceSearches([search(1)]);
    expect(store.queryCompanies(uuid(1), {})).toBeNull();
    expect(store.queryCompanies(uuid(9), {})).toBeNull();
  });

  it('pages companies in the order the API returned them', () => {
    const store = seeded();
    const first = store.queryCompanies(uuid(1), { limit: 2 })!;
    expect(first.companies.map((c) => c.name)).toEqual(['Smile Aarhus', 'Tandlæge Østergaard']);
    expect(first).toMatchObject({ total: 3, nextOffset: 2 });
    const second = store.queryCompanies(uuid(1), { limit: 2, offset: 2 })!;
    expect(second.companies.map((c) => c.name)).toEqual(['No Mail Dental']);
    expect(second.nextOffset).toBeNull();
  });

  it('matches text in name, domain and address, ignoring case', () => {
    const store = seeded();
    expect(store.queryCompanies(uuid(1), { q: 'ØSTER' })!.companies.map((c) => c.name)).toEqual(['Tandlæge Østergaard']);
    expect(store.queryCompanies(uuid(1), { q: 'mette@' })!.total).toBe(1);
    expect(store.queryCompanies(uuid(1), { q: 'nomaildental.dk' })!.total).toBe(1);
    expect(store.queryCompanies(uuid(1), { q: 'aarhus' })!.companies.map((c) => c.name)).toEqual(['Smile Aarhus']);
    expect(store.queryCompanies(uuid(1), { q: '%' })!.total).toBe(0);
  });

  it('keeps only companies with a matching email, and only those emails', () => {
    const store = seeded();
    const valid = store.queryCompanies(uuid(1), { verification: 'valid' })!;
    expect(valid.total).toBe(1);
    expect(valid.companies[0]!.emails.map((e) => e.address)).toEqual(['info@smile.dk']);
    expect(store.queryCompanies(uuid(1), { kind: 'personal' })!.companies[0]!.emails.map((e) => e.address)).toEqual([
      'mette@smile.dk',
    ]);
    expect(store.queryCompanies(uuid(1), { verification: 'catch_all', kind: 'generic' })!.total).toBe(1);
    expect(store.queryCompanies(uuid(1), { verification: 'catch_all', kind: 'personal' })!.total).toBe(0);
  });

  it('hides a running search, which the API serves live', () => {
    const store = seeded();
    store.replaceSearches([search(1, { status: 'running' })]);
    expect(store.queryCompanies(uuid(1), {})).toBeNull();
  });

  it('deletes searches the API stops returning, with their companies', () => {
    const store = seeded();
    store.replaceSearches([search(2)]);
    expect(store.listSearches().map((s) => s.id)).toEqual([uuid(2)]);
    expect(store.counts()).toEqual({ searches: 1, companies: 0, emails: 0 });
  });

  it('replaces companies, so an address the server dropped is gone', () => {
    const store = seeded();
    store.replaceCompanies(uuid(1), [company(1, 'Smile Aarhus', [['info@smile.dk', 'generic', 'valid']])], 'fp2', 2);
    expect(store.queryCompanies(uuid(1), { q: 'mette' })!.total).toBe(0);
    expect(store.counts()).toEqual({ searches: 1, companies: 1, emails: 1 });
  });

  it('reports whether the search list changed', () => {
    const store = new LocalStore(':memory:');
    expect(store.replaceSearches([search(1)]).changed).toBe(true);
    expect(store.replaceSearches([search(1)]).changed).toBe(false);
    expect(store.replaceSearches([search(1, { emailsValid: 3 })]).changed).toBe(true);
    expect(store.replaceSearches([])).toEqual({ changed: true, removed: [uuid(1)] });
  });

  it('wipe deletes the file', () => {
    const file = tempFile();
    const store = new LocalStore(file);
    opened.push(store);
    store.replaceSearches([search(1)]);
    expect(existsSync(file)).toBe(true);
    store.wipe();
    expect(existsSync(file)).toBe(false);
    expect(existsSync(`${file}-wal`)).toBe(false);
    expect(store.listSearches()).toEqual([]);
  });

  it('filters 50k companies in milliseconds', () => {
    const store = fileStore();
    store.replaceSearches([search(1)]);
    const many = Array.from({ length: 50_000 }, (_, i) =>
      company(i, `Company ${i}`, [
        [`info@company${i}.dk`, 'generic', i % 3 === 0 ? 'valid' : 'unknown'],
        [`person${i}@company${i}.dk`, 'personal', i % 5 === 0 ? 'valid' : 'risky'],
      ]),
    );
    store.replaceCompanies(uuid(1), many, 'fp', 1);

    const started = performance.now();
    const text = store.queryCompanies(uuid(1), { q: 'company4999' })!;
    const filtered = store.queryCompanies(uuid(1), { verification: 'valid', kind: 'personal', q: 'company' })!;
    const plain = store.queryCompanies(uuid(1), { offset: 40_000 })!;
    const elapsed = performance.now() - started;

    expect(text.total).toBe(11);
    expect(filtered.total).toBe(10_000);
    expect(plain.companies[0]!.name).toBe('Company 40000');
    // About 5 to 30 ms a query on a laptop. The bound only catches a query
    // that stops scaling, since test machines share their CPU.
    expect(elapsed).toBeLessThan(3000);
  });
});
