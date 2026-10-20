// Reads a fixture .eml into the IncomingMail the poller hands classify.ts.
// A small MIME reader for tests only: headers unfolded and lowercased, the
// first text/plain part outside an attached message as `text`, and the
// message/delivery-status part raw. Fixtures are 8bit, nothing is decoded.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IncomingMail } from '../types.js';

interface Part {
  headers: Record<string, string>;
  body: string;
}

function split(raw: string): Part {
  const text = raw.replace(/\r\n/g, '\n');
  const cut = text.indexOf('\n\n');
  const head = cut < 0 ? text : text.slice(0, cut);
  const body = cut < 0 ? '' : text.slice(cut + 2);
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\n[ \t]+/g, ' ').split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    if (!(name in headers)) headers[name] = line.slice(i + 1).trim();
  }
  return { headers, body };
}

function children(part: Part): Part[] {
  const boundary = /boundary="?([^";]+)"?/i.exec(part.headers['content-type'] ?? '')?.[1];
  if (!boundary) return [];
  const pieces = part.body.split(`--${boundary}`);
  // Drop the preamble and everything after the closing delimiter.
  return pieces
    .slice(1)
    .filter((p) => !p.startsWith('--'))
    .map((p) => split(p.replace(/^\n/, '')));
}

function walk(part: Part, found: { text: string | null; status: string | null }): void {
  const type = (part.headers['content-type'] ?? 'text/plain').toLowerCase();
  if (type.startsWith('multipart/')) {
    for (const child of children(part)) walk(child, found);
  } else if (type.startsWith('message/delivery-status')) {
    found.status ??= part.body.trim();
  } else if (type.startsWith('text/plain')) {
    found.text ??= part.body;
  }
}

const ids = (v: string | undefined) => (v ? (v.match(/<[^>]+>/g) ?? []) : []);

export function parseEml(raw: string, folder = 'INBOX', uid = 1): IncomingMail {
  const top = split(raw);
  const found = { text: null as string | null, status: null as string | null };
  walk(top, found);
  const h = top.headers;
  return {
    folder,
    uid,
    messageId: ids(h['message-id'])[0] ?? null,
    inReplyTo: ids(h['in-reply-to'])[0] ?? null,
    references: ids(h.references),
    from: h.from ?? '',
    to: (h.to ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    subject: h.subject ?? '',
    text: (found.text ?? '').trim(),
    headers: h,
    deliveryStatus: found.status,
    date: h.date ? new Date(h.date.replace(/\s*\([A-Z]+\)$/, '')) : new Date(0),
  };
}

/** A fixture by its path under fixtures/, e.g. `bounce/gmail-user-unknown.eml`. */
export function fixture(path: string): IncomingMail {
  return parseEml(readFileSync(fileURLToPath(new URL(`./${path}`, import.meta.url)), 'utf8'));
}
