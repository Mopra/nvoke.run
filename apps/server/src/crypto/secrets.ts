// Secrets at rest (docs/sending/plan.md, "Step 0"): mailbox passwords and
// OAuth tokens are sealed with AES-256-GCM under SECRETS_KEY before they
// reach the database. The format is `v1.<iv>.<tag>.<ciphertext>` in
// base64url, so a key rotation can add a v2 later.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const VERSION = 'v1';

export class SecretsError extends Error {}

export interface Secrets {
  seal(plain: string): string;
  open(sealed: string): string;
  /** A key for one purpose (unsubscribe links, say), derived from the master key. */
  derive(purpose: string): Buffer;
}

export function createSecrets(base64Key: string): Secrets {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new SecretsError('SECRETS_KEY must be 32 bytes, base64');
  return {
    seal(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.');
    },
    open(sealed) {
      const parts = sealed.split('.');
      if (parts.length !== 4 || parts[0] !== VERSION) throw new SecretsError('not a sealed secret');
      const [, iv, tag, body] = parts as [string, string, string, string];
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
      } catch {
        throw new SecretsError('secret does not open with this key');
      }
    },
    derive(purpose) {
      return createHmac('sha256', key).update(`nvoke:${purpose}`).digest();
    },
  };
}
