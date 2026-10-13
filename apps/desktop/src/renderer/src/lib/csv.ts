import { CSV_COLUMNS } from '@nvoke/shared';
import type { Company } from './types';

/**
 * Leads as rows in the export's column order (CSV_COLUMNS): one row per
 * email, and one row with blank email fields for a company without any.
 * Used by drag out of the results (CSV), copy (TSV) and the mock transport's
 * stand-in for `GET /v1/searches/:id/export.csv`.
 */

type Row = (string | null)[];

/** A phone number may start with + and still be safe. Anything else that a spreadsheet would evaluate is not. */
const PHONE_LIKE = /^[+-][\d\s()./-]+$/;

/** Same rule as the server's csvCell: a value a spreadsheet would run as a formula gets a leading apostrophe. */
function defuse(value: string | null | undefined): string {
  const v = value ?? '';
  return /^[=+\-@\t\r]/.test(v) && !PHONE_LIKE.test(v) ? `'${v}` : v;
}

function rowsOf(companies: Company[], { includeEmpty }: { includeEmpty: boolean }): Row[] {
  const rows: Row[] = [];
  for (const c of companies) {
    if (c.emails.length === 0) {
      if (includeEmpty) rows.push([c.name, c.domain, c.website, null, null, null, null, c.location, c.phone]);
      continue;
    }
    for (const e of c.emails) {
      rows.push([c.name, c.domain, c.website, e.address, e.kind, e.verification, e.sourceUrl, c.location, c.phone]);
    }
  }
  return rows;
}

function csvCell(value: string | null): string {
  const v = defuse(value);
  return /[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Tabs and line breaks would split the cell, so they become spaces. */
function tsvCell(value: string | null): string {
  return defuse(value).replace(/[\t\r\n]+/g, ' ');
}

/** UTF-8 byte order mark, so Excel reads non-ASCII company names correctly. */
const BOM = String.fromCharCode(0xfeff);

/** The export's own format: header, one row per email, CRLF line endings. */
export function companiesToCsv(companies: Company[], { includeEmpty = false, bom = false } = {}): string {
  const lines = [CSV_COLUMNS.join(','), ...rowsOf(companies, { includeEmpty }).map((r) => r.map(csvCell).join(','))];
  return `${bom ? BOM : ''}${lines.join('\r\n')}\r\n`;
}

/** Tab separated with a header, so a paste into a spreadsheet keeps the columns. */
export function companiesToTsv(companies: Company[]): string {
  const lines = [CSV_COLUMNS.join('\t'), ...rowsOf(companies, { includeEmpty: true }).map((r) => r.map(tsvCell).join('\t'))];
  return `${lines.join('\n')}\n`;
}
