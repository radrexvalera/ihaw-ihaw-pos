// Runs the real Supabase migrations against an in-process Postgres (PGlite),
// with a minimal stand-in for the parts of Supabase the schema depends on:
// the auth schema, auth.uid(), the anon/authenticated roles and the
// supabase_realtime publication.
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..', 'supabase')

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz not null default clock_timestamp()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create publication supabase_realtime;
`

export type Db = PGlite

export async function createDb(opts: { beforeMigrations?: (db: Db) => Promise<void> } = {}): Promise<Db> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUB)
  await opts.beforeMigrations?.(db)
  const migrations = readdirSync(join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of migrations) {
    try {
      await db.exec(readFileSync(join(ROOT, 'migrations', file), 'utf8'))
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err })
    }
  }
  await db.exec(readFileSync(join(ROOT, 'seed.sql'), 'utf8'))
  return db
}

/** Creates an auth user (which triggers profile creation). */
export async function createUser(db: Db, id: string, email: string): Promise<void> {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
}

export async function setProfile(
  db: Db,
  id: string,
  role: 'admin' | 'cashier' | 'griller',
  isActive = true,
): Promise<void> {
  await db.query('update public.profiles set role = $2, is_active = $3 where id = $1', [
    id,
    role,
    isActive,
  ])
}

/**
 * Runs fn as a signed-in Supabase user (role `authenticated`, auth.uid() = userId),
 * or as `anon` when userId is null. Everything is rolled back if fn throws.
 */
export async function as<T>(
  db: Db,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`)
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ''])
    return fn(tx)
  })
}

export async function rpc<T = Record<string, unknown>>(
  tx: Transaction,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const res = await tx.query<{ r: T }>(`select ${sql} as r`, params)
  return res.rows[0]!.r
}

export async function scalar<T>(db: Db | Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<Record<string, T>>(sql, params)
  const row = res.rows[0]
  if (!row) throw new Error(`No rows for: ${sql}`)
  return Object.values(row)[0] as T
}
