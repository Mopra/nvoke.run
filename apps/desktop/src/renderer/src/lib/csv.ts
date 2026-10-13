import type { Company } from './types';

/** Column order of `GET /v1/searches/:id/export.csv`, one row per email. */
export const CSV_COLUMNS = [
  'company',
  'domain',
  'website',
  'email',
  'kind',
  'verification',
  'source_url',
  'location',
  'phone',
] as const;

function cell(value: string | null | undefined): string {
  const text = value ?? '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function companiesToCsv(companies: Company[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const c of companies) {
    for (const e of c.emails) {
      lines.push(
        [c.name, c.domain, c.website, e.address, e.kind, e.verification, e.sourceUrl, c.location, c.phone]
          .map(cell)
          .join(','),
      );
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}
