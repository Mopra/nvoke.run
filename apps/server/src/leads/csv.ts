import { CSV_COLUMNS } from '@nvoke/shared';

export type CsvRow = Record<(typeof CSV_COLUMNS)[number], string | null>;

/** UTF-8 byte order mark, so Excel reads non-ASCII company names correctly. */
const BOM = String.fromCharCode(0xfeff);

/** A phone number may start with + and still be safe. Anything else that a spreadsheet would evaluate is not. */
const PHONE_LIKE = /^[+-][\d\s()./-]+$/;

/**
 * One CSV field per RFC 4180, with spreadsheet formula injection neutralized:
 * a value starting with =, +, -, @, tab or carriage return gets a leading
 * apostrophe, unless it is a phone number.
 */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v) && !PHONE_LIKE.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Header plus rows, CRLF line endings, prefixed with a byte order mark. */
export function toCsv(rows: CsvRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
