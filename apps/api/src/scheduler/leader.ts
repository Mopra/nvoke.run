import type { PoolClient } from "pg";
import { pool } from "../db.js";

// Arbitrary but stable 64-bit key for the scheduler advisory lock.
const SCHEDULER_LOCK_KEY = 7239482938472n;

export interface LeaderHandle {
  client: PoolClient;
  release: () => Promise<void>;
}

export async function tryBecomeLeader(): Promise<LeaderHandle | null> {
  const client = await pool.connect();
  try {
    const res = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [SCHEDULER_LOCK_KEY.toString()],
    );
    if (!res.rows[0]?.acquired) {
      client.release();
      return null;
    }
  } catch (e) {
    client.release();
    throw e;
  }

  let released = false;
  return {
    client,
    release: async () => {
      if (released) return;
      released = true;
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [
          SCHEDULER_LOCK_KEY.toString(),
        ]);
      } catch {
        /* connection may already be closed */
      }
      client.release();
    },
  };
}
