import { one } from "../db.js";

export interface User {
  id: string;
  clerk_id: string;
  email: string;
  created_at: string;
}

export async function upsertUser(clerkId: string, email: string): Promise<User> {
  const row = await one<User>(
    `INSERT INTO users (clerk_id, email)
     VALUES ($1, $2)
     ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [clerkId, email],
  );
  return row!;
}
