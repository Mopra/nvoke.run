import type { Sql } from 'postgres';

export interface AuthCodeRow {
  clerkUserId: string;
  codeChallenge: string;
  expiresAt: Date;
}

export interface DeviceSessionRow {
  id: string;
  clerkUserId: string;
}

export interface NewDeviceSession {
  clerkUserId: string;
  deviceName: string | null;
  userAgent: string | null;
}

/**
 * Persistence for desktop sign-in. Postgres in production, in memory in tests.
 * Every secret arrives here already hashed.
 */
export interface DesktopAuthStore {
  insertCode(codeHash: string, row: AuthCodeRow): Promise<void>;
  /**
   * Marks the code used and returns it, atomically. Returns null when the code
   * does not exist or was already used, so a code can be redeemed only once.
   */
  consumeCode(codeHash: string): Promise<AuthCodeRow | null>;
  insertDeviceSession(tokenHash: string, row: NewDeviceSession): Promise<DeviceSessionRow>;
  /** Returns the live (not revoked) session for a token hash and bumps last_used_at. */
  touchDeviceSession(tokenHash: string): Promise<DeviceSessionRow | null>;
  revokeDeviceSession(id: string): Promise<void>;
}

export function postgresStore(getSql: () => Sql): DesktopAuthStore {
  return {
    async insertCode(codeHash, row) {
      const sql = getSql();
      await sql`
        insert into desktop_auth_codes (code_hash, clerk_user_id, code_challenge, expires_at)
        values (${codeHash}, ${row.clerkUserId}, ${row.codeChallenge}, ${row.expiresAt})
      `;
      // Opportunistic cleanup so the table never grows without bound.
      await sql`delete from desktop_auth_codes where expires_at < now() - interval '1 day'`;
    },

    async consumeCode(codeHash) {
      const sql = getSql();
      const rows = await sql<{ clerk_user_id: string; code_challenge: string; expires_at: Date }[]>`
        update desktop_auth_codes set used_at = now()
        where code_hash = ${codeHash} and used_at is null
        returning clerk_user_id, code_challenge, expires_at
      `;
      const r = rows[0];
      return r ? { clerkUserId: r.clerk_user_id, codeChallenge: r.code_challenge, expiresAt: r.expires_at } : null;
    },

    async insertDeviceSession(tokenHash, row) {
      const sql = getSql();
      const rows = await sql<{ id: string }[]>`
        insert into device_sessions (token_hash, clerk_user_id, device_name, user_agent)
        values (${tokenHash}, ${row.clerkUserId}, ${row.deviceName}, ${row.userAgent})
        returning id
      `;
      return { id: rows[0]!.id, clerkUserId: row.clerkUserId };
    },

    async touchDeviceSession(tokenHash) {
      const sql = getSql();
      const rows = await sql<{ id: string; clerk_user_id: string }[]>`
        update device_sessions set last_used_at = now()
        where token_hash = ${tokenHash} and revoked_at is null
        returning id, clerk_user_id
      `;
      const r = rows[0];
      return r ? { id: r.id, clerkUserId: r.clerk_user_id } : null;
    },

    async revokeDeviceSession(id) {
      const sql = getSql();
      await sql`update device_sessions set revoked_at = now() where id = ${id} and revoked_at is null`;
    },
  };
}

interface MemoryCode extends AuthCodeRow {
  usedAt: Date | null;
}

interface MemorySession extends DeviceSessionRow, NewDeviceSession {
  revokedAt: Date | null;
}

/** In-memory store with the same semantics as the Postgres one. For tests. */
export function memoryStore(): DesktopAuthStore & {
  codes: Map<string, MemoryCode>;
  sessions: Map<string, MemorySession>;
} {
  const codes = new Map<string, MemoryCode>();
  const sessions = new Map<string, MemorySession>();
  let nextId = 1;
  return {
    codes,
    sessions,
    async insertCode(codeHash, row) {
      codes.set(codeHash, { ...row, usedAt: null });
    },
    async consumeCode(codeHash) {
      const row = codes.get(codeHash);
      if (!row || row.usedAt) return null;
      row.usedAt = new Date();
      return { clerkUserId: row.clerkUserId, codeChallenge: row.codeChallenge, expiresAt: row.expiresAt };
    },
    async insertDeviceSession(tokenHash, row) {
      const session: MemorySession = { ...row, id: String(nextId++), revokedAt: null };
      sessions.set(tokenHash, session);
      return { id: session.id, clerkUserId: session.clerkUserId };
    },
    async touchDeviceSession(tokenHash) {
      const s = sessions.get(tokenHash);
      return s && !s.revokedAt ? { id: s.id, clerkUserId: s.clerkUserId } : null;
    },
    async revokeDeviceSession(id) {
      for (const s of sessions.values()) if (s.id === id && !s.revokedAt) s.revokedAt = new Date();
    },
  };
}
