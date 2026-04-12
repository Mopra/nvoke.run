import { q, one } from "../db.js";

export interface Fn {
  id: string;
  user_id: string;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export const listFunctions = (userId: string) =>
  q<Fn>("SELECT * FROM functions WHERE user_id=$1 ORDER BY created_at DESC", [userId]);

export const getFunction = (id: string, userId: string) =>
  one<Fn>("SELECT * FROM functions WHERE id=$1 AND user_id=$2", [id, userId]);

export const createFunction = (userId: string, name: string, code: string) =>
  one<Fn>(
    "INSERT INTO functions (user_id, name, code) VALUES ($1,$2,$3) RETURNING *",
    [userId, name, code],
  );

export const updateFunction = (
  id: string,
  userId: string,
  patch: { name?: string; code?: string },
) =>
  one<Fn>(
    `UPDATE functions
     SET name = COALESCE($3, name),
         code = COALESCE($4, code),
         updated_at = now()
     WHERE id=$1 AND user_id=$2
     RETURNING *`,
    [id, userId, patch.name ?? null, patch.code ?? null],
  );

export const deleteFunction = (id: string, userId: string) =>
  q("DELETE FROM functions WHERE id=$1 AND user_id=$2", [id, userId]);
