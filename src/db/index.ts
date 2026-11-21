import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";
import { supabaseServer } from "@/lib/supabase/server";

// prepare: false is required by Supabase's transaction-mode pooler.
// In development every hot reload re-runs this module; reuse one pool so reloads don't pile up connections
// until Postgres runs out of slots.
const globalForDb = globalThis as unknown as { scholarSyncPg?: postgres.Sql };
const client = globalForDb.scholarSyncPg ?? postgres(process.env.DATABASE_URL!, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.scholarSyncPg = client;

// Connects as the database owner, which BYPASSES Row-Level Security.
// Only background jobs (the "service role" in the architecture) may use this directly.
export const adminDb = drizzle(client, { schema });

export type Tx = Parameters<Parameters<typeof adminDb.transaction>[0]>[0];

export class AuthError extends Error {
  constructor() {
    super("Not signed in");
  }
}

/**
 * Runs `fn` in a transaction as the signed-in user, so every query is checked by RLS.
 * `set_config(..., true)` scopes the role and JWT claims to this transaction only,
 * which is what makes this safe on a pooled connection.
 */
export async function withUser<T>(fn: (tx: Tx, userId: string) => Promise<T>): Promise<T> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims(); // verifies the JWT signature
  const claims = data?.claims;
  if (!claims?.sub) throw new AuthError();

  return adminDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
                                set_config('role', 'authenticated', true)`);
    return fn(tx, claims.sub);
  });
}
