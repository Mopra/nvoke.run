import { itemDomain } from '@nvoke/shared';
import { defuse } from './csv';
import type { Company } from './types';

/**
 * A dropped CSV, TSV or TXT as a table, the column that holds the domains or
 * company names, and the enriched copy that goes back next to the original.
 */

export interface Table {
  /** Column names. Synthesized ("Column 1") when the file has no header row. */
  headers: string[];
  /** Data rows, each as wide as the headers. */
  rows: string[][];
  hasHeader: boolean;
}

/** The largest file the drop reads. Past it a list is not a list of companies anymore. */
export const MAX_TABLE_BYTES = 5 * 1024 * 1024;

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? '';
  let best = ',';
  let bestCount = 0;
  for (const d of [',', ';', '\t']) {
    let inQuotes = false;
    let count = 0;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180: quoted fields with "" for a quote and line breaks inside. Blank lines are dropped. */
function parseRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let touched = false;
  const endField = (): void => {
    record.push(field);
    field = '';
  };
  const endRecord = (): void => {
    endField();
    if (record.some((f) => f.trim() !== '')) records.push(record);
    record = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      inQuotes = true;
      touched = true;
    } else if (ch === delimiter) {
      endField();
      touched = true;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
    } else {
      field += ch;
      touched = true;
    }
  }
  if (touched || field !== '') endRecord();
  return records;
}

const looksLikeAddress = (cell: string): boolean => itemDomain(cell.trim()) !== null;

/** Parses delimited text. Returns null when there is nothing to read. */
export function parseTable(text: string): Table | null {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = parseRecords(clean, detectDelimiter(clean));
  const [first] = records;
  if (!first) return null;
  const width = Math.max(...records.map((r) => r.length));
  // A first row holding a domain is data, not a header.
  const hasHeader = records.length > 1 && !first.some(looksLikeAddress);
  const headerRow = hasHeader ? first : [];
  const headers = Array.from({ length: width }, (_, i) => headerRow[i]?.trim() || `Column ${i + 1}`);
  const rows = (hasHeader ? records.slice(1) : records).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  return rows.length === 0 ? null : { headers, rows, hasHeader };
}

const DOMAIN_HEADER = /\b(domains?|websites?|web ?sites?|urls?|links?|sites?|homepage|hjemmeside|web)\b/i;
const NAME_HEADER = /\b(company|companies|organi[sz]ations?|firm|business|account|virksomhed|firma|navn|name)\b/i;

/**
 * The column most likely to hold what to look up: cells that read as domains
 * weigh most, a header that says domain or website next, one that says
 * company or name last. Falls back to the first column.
 */
export function guessColumn(table: Table): number {
  let best = 0;
  let bestScore = -1;
  table.headers.forEach((header, col) => {
    const cells = table.rows.map((r) => (r[col] ?? '').trim()).filter(Boolean);
    const domains = cells.filter(looksLikeAddress).length;
    let score = cells.length === 0 ? 0 : (domains / cells.length) * 60;
    if (table.hasHeader) {
      if (DOMAIN_HEADER.test(header)) score += 30;
      else if (NAME_HEADER.test(header)) score += 20;
    }
    // Free text columns (addresses, notes) rarely hold a short name.
    if (cells.length > 0 && cells.every((c) => c.length > 60)) score -= 10;
    if (score > bestScore) {
      best = col;
      bestScore = score;
    }
  });
  return best;
}

/** The key two cells share when they name the same company: its domain, or its name without case and spacing. */
function itemKey(cell: string): string {
  return itemDomain(cell) ?? cell.toLowerCase().replace(/\s+/g, ' ');
}

export interface ColumnItems {
  /** Unique items to search, in file order, at most `max`. */
  items: string[];
  /** Per row: its item, or null when the cell is empty, too long or fell past `max`. */
  rowItems: (string | null)[];
  domains: number;
  names: number;
  /** Distinct items past `max` that the search leaves out. */
  skipped: number;
}

export function columnItems(table: Table, col: number, max: number): ColumnItems {
  const items: string[] = [];
  const kept = new Set<string>();
  const dropped = new Set<string>();
  const rowItems = table.rows.map((row): string | null => {
    const cell = (row[col] ?? '').replace(/\s+/g, ' ').trim();
    if (!cell || cell.length > 200) return null;
    const key = itemKey(cell);
    if (kept.has(key)) return cell;
    if (items.length >= max) {
      dropped.add(key);
      return null;
    }
    kept.add(key);
    items.push(cell);
    return cell;
  });
  const domains = items.filter((i) => itemDomain(i) !== null).length;
  return { items, rowItems, domains, names: items.length - domains, skipped: dropped.size };
}

/** Columns the enriched copy adds. A name the file already uses gets the `nvoke_` prefix. */
export const ADDED_COLUMNS = ['domain', 'email', 'kind', 'verification'] as const;

export function addedHeaders(table: Table): string[] {
  const taken = new Set(table.headers.map((h) => h.trim().toLowerCase()));
  return ADDED_COLUMNS.map((name) => (taken.has(name) ? `nvoke_${name}` : name));
}

/** Quotes a cell when it holds a delimiter, a quote or a line break. */
function quote(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value;
}

const BOM = String.fromCharCode(0xfeff);

/**
 * The original table with `domain`, `email`, `kind` and `verification`
 * appended: one row per email found, so a company with three addresses takes
 * three rows. A row without a match keeps its cells and blank new ones. The
 * original cells are written as read; the new ones are defused for
 * spreadsheets like the export.
 */
export function enrichCsv(table: Table, rowItems: (string | null)[], companies: Company[]): string {
  const byDomain = new Map<string, Company>();
  const byName = new Map<string, Company>();
  for (const c of companies) {
    byDomain.set(c.domain.toLowerCase(), c);
    byName.set(itemKey(c.name), c);
  }
  const lines = [[...table.headers, ...addedHeaders(table)].map(quote).join(',')];
  table.rows.forEach((row, index) => {
    const item = rowItems[index] ?? null;
    const wanted = item ? itemDomain(item) : null;
    const company = item ? (wanted ? byDomain.get(wanted) : byName.get(itemKey(item))) : undefined;
    const original = row.map(quote);
    const emails = company?.emails ?? [];
    if (!company || emails.length === 0) {
      lines.push([...original, quote(defuse(company?.domain)), '', '', ''].join(','));
      return;
    }
    for (const e of emails) {
      const added = [company.domain, e.address, e.kind, e.verification ?? ''].map((c) => quote(defuse(c)));
      lines.push([...original, ...added].join(','));
    }
  });
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** What a finished enrichment found, for the toast: companies with an address and with a valid one. */
export function enrichSummary(companies: Company[]): { withEmail: number; valid: number } {
  return {
    withEmail: companies.filter((c) => c.emails.length > 0).length,
    valid: companies.filter((c) => c.emails.some((e) => e.verification === 'valid')).length,
  };
}
