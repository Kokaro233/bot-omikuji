// @vitest-environment node
// Applies the real Supabase migration to an in-process Postgres (PGlite) with a
// minimal stand-in for Supabase's auth schema and roles, then checks constraints,
// grants and RLS the way the anon / authenticated API roles would hit them.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const CONTRACT = "0x" + "c".repeat(40);
const WALLET = "0x" + "a".repeat(40);
const UNBOUND_WALLET = "0x" + "f".repeat(40);
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
  create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id) on delete cascade);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant all on all tables in schema public to service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

let db: PGlite;

interface Caller { provider?: "email" | "web3"; sessionId?: string; ip?: string }
async function as(role: "anon" | "authenticated", userId: string | null, sql: string, params: unknown[] = [], caller: Caller = {}) {
  const claims = JSON.stringify({ sub: userId, role, session_id: caller.sessionId ?? null, app_metadata: { provider: caller.provider ?? "email" } });
  const headers = JSON.stringify(caller.ip ? { "x-forwarded-for": `${caller.ip}, 10.0.0.1` } : {});
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false); select set_config('request.jwt.claims', '${claims}', false); select set_config('request.headers', '${headers}', false); set role ${role};`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(ROOT, "supabase/migrations");
  for (const file of (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(join(dir, file), "utf8"));
  }
  // Supabase's default privileges (above) would grant everything; the migration must revoke them.
  await db.exec(`insert into auth.users (id) values ('${ALICE}'), ('${BOB}');`);
  await db.exec(`insert into public.wallets (id, user_id, wallet_address) values ('00000000-0000-4000-8000-000000000001', '${ALICE}', '${WALLET}');`);
  await db.exec(`insert into public.fortunes (id, user_id, wallet_id, contract_address, record_index, fortune_id, fortune_type, rarity, message, tx_hash, log_index, block_number, created_at)
    values ('00000000-0000-4000-8000-0000000000f1', '${ALICE}', '00000000-0000-4000-8000-000000000001', '${CONTRACT}', 0, 6, 'Great Caution', 'R', 'm', '${tx(1)}', 0, 1, now());`);
}, 60_000);

describe("schema", () => {
  it("creates a profile for each new auth user", async () => {
    expect((await db.query("select count(*)::int as n from public.profiles")).rows[0]).toEqual({ n: 2 });
  });

  it("rejects rows from any chain other than 677 in every chain table", async () => {
    await expect(db.query(`insert into public.verified_fortune_draws (chain_id, contract_address, wallet_address, record_index, fortune_id, tx_hash, log_index, block_number, created_at) values (56, '${CONTRACT}', '${WALLET}', 0, 1, '${tx(2)}', 0, 1, now())`)).rejects.toThrow(/check/);
    await expect(db.query(`insert into public.wallets (user_id, wallet_address, chain_id) values ('${BOB}', '0x${"b".repeat(40)}', 56)`)).rejects.toThrow(/check/);
  });

  it("deduplicates verified draws by transaction log and by on-chain record", async () => {
    const insert = (hash: string, index: number) => db.query(`insert into public.verified_fortune_draws (contract_address, wallet_address, record_index, fortune_id, tx_hash, log_index, block_number, created_at) values ('${CONTRACT}', '${UNBOUND_WALLET}', ${index}, 1, '${hash}', 0, 1, now())`);
    await insert(tx(3), 0);
    await expect(insert(tx(3), 1)).rejects.toThrow(/unique|duplicate/);
    await expect(insert(tx(4), 0)).rejects.toThrow(/unique|duplicate/);
  });

  it("refuses guest rows that look like transaction hashes", async () => {
    await expect(db.query(`insert into public.public_guest_draws (local_id, fortune_id) values ('${tx(5)}', 1)`)).rejects.toThrow(/check/);
  });
});

describe("RLS and grants", () => {
  it("lets a user flip favorite but never change the fortune or tx hash", async () => {
    await as("authenticated", ALICE, "update public.fortunes set favorite = true where id = '00000000-0000-4000-8000-0000000000f1'");
    expect((await db.query("select favorite from public.fortunes")).rows[0]).toEqual({ favorite: true });
    await expect(as("authenticated", ALICE, "update public.fortunes set fortune_id = 0")).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", ALICE, `update public.fortunes set tx_hash = '${tx(9)}'`)).rejects.toThrow(/permission denied/);
  });

  it("hides other users' fortunes and wallets", async () => {
    expect((await as("authenticated", BOB, "select * from public.fortunes")).rows).toHaveLength(0);
    expect((await as("authenticated", BOB, "select * from public.wallets")).rows).toHaveLength(0);
    expect((await as("authenticated", ALICE, "select * from public.fortunes")).rows).toHaveLength(1);
  });

  it("keeps verified draws and wallets write-protected from API roles", async () => {
    await expect(as("anon", null, `insert into public.verified_fortune_draws (contract_address, wallet_address, record_index, fortune_id, tx_hash, log_index, block_number, created_at) values ('${CONTRACT}', '${WALLET}', 7, 0, '${tx(7)}', 0, 1, now())`)).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", ALICE, `insert into public.wallets (user_id, wallet_address) values ('${ALICE}', '0x${"d".repeat(40)}')`)).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", ALICE, "select * from public.wallet_nonces")).rejects.toThrow(/permission denied/);
    expect((await as("anon", null, "select count(*)::int as n from public.verified_fortune_draws")).rows[0]).toEqual({ n: 1 });
  });

  it("allows only cosmetic profile edits on one's own profile", async () => {
    await as("authenticated", ALICE, "update public.profiles set username = '新的名字' where id = $1", [ALICE]);
    await as("authenticated", BOB, "update public.profiles set username = '篡改' where id = $1", [ALICE]);
    expect((await db.query("select username from public.profiles where id = $1", [ALICE])).rows[0]).toEqual({ username: "新的名字" });
    await expect(as("authenticated", ALICE, "update public.profiles set id = $1 where id = $2", [BOB, ALICE])).rejects.toThrow(/permission denied/);
  });

  it("lets users insert only their own guest results", async () => {
    await as("authenticated", ALICE, `insert into public.guest_fortunes (user_id, local_id, fortune_id, created_at) values ($1, 'guest-aaaaaaaa-1', 2, now())`, [ALICE]);
    await expect(as("authenticated", BOB, `insert into public.guest_fortunes (user_id, local_id, fortune_id, created_at) values ($1, 'guest-aaaaaaaa-2', 2, now())`, [ALICE])).rejects.toThrow(/row-level security/);
    expect((await as("anon", null, "select public.get_verified_fortune_count() as n")).rows[0]).toEqual({ n: 1 });
  });
});

describe("wallet-first auth (20261016000001)", () => {
  const CAROL = "33333333-3333-4333-8333-333333333333";
  const CAROL_WALLET = "0x" + "e".repeat(40);
  const SESSION = "44444444-4444-4444-8444-444444444444";
  const OTHER_SESSION = "55555555-5555-4555-8555-555555555555";
  const web3 = (sessionId: string): Caller => ({ provider: "web3", sessionId });

  beforeAll(async () => {
    await db.exec(`insert into auth.users (id) values ('${CAROL}');`);
    await db.exec(`insert into public.wallets (id, user_id, wallet_address) values ('00000000-0000-4000-8000-0000000000c1', '${CAROL}', '${CAROL_WALLET}');`);
  });

  it("copies a newly verified draw into the owning wallet account's collection", async () => {
    await db.exec(`insert into public.verified_fortune_draws (contract_address, wallet_address, record_index, fortune_id, tx_hash, log_index, block_number, created_at) values ('${CONTRACT}', '${CAROL_WALLET}', 0, 4, '${tx(40)}', 0, 1, now())`);
    const rows = (await db.query("select fortune_id, fortune_type, rarity from public.fortunes where user_id = $1", [CAROL])).rows;
    expect(rows).toEqual([{ fortune_id: 4, fortune_type: "Future Fortune", rarity: "R" }]);
  });

  it("hides a wallet user's private data until the session is activated", async () => {
    expect((await as("authenticated", CAROL, "select * from public.fortunes", [], web3(SESSION))).rows).toHaveLength(0);
    expect((await as("authenticated", CAROL, "select * from public.profiles", [], web3(SESSION))).rows).toHaveLength(0);
    await db.exec(`insert into auth.sessions (id, user_id) values ('${SESSION}', '${CAROL}'), ('${OTHER_SESSION}', '${CAROL}')`);
    await db.exec(`insert into public.wallet_sessions (session_id, user_id, wallet_address) values ('${SESSION}', '${CAROL}', '${CAROL_WALLET}')`);
    expect((await as("authenticated", CAROL, "select * from public.fortunes", [], web3(SESSION))).rows).toHaveLength(1);
    // A replayed signature produces a different, unactivated session: still nothing.
    expect((await as("authenticated", CAROL, "select * from public.fortunes", [], web3(OTHER_SESSION))).rows).toHaveLength(0);
    // Another user cannot borrow Carol's activated session id.
    expect((await as("authenticated", BOB, "select * from public.fortunes", [], web3(SESSION))).rows).toHaveLength(0);
  });

  it("cuts off private data as soon as the session is signed out", async () => {
    await db.exec(`delete from auth.sessions where id = '${SESSION}'`);
    expect((await as("authenticated", CAROL, "select * from public.fortunes", [], web3(SESSION))).rows).toHaveLength(0);
    await db.exec(`insert into auth.sessions (id, user_id) values ('${SESSION}', '${CAROL}')`);
  });

  it("keeps email accounts working as before", async () => {
    expect((await as("authenticated", ALICE, "select * from public.fortunes")).rows).toHaveLength(1);
  });

  it("does not let clients call the import function or touch session tables", async () => {
    await expect(as("authenticated", CAROL, "select public.import_wallet_draws('00000000-0000-4000-8000-0000000000c1')", [], web3(SESSION))).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", CAROL, "select * from public.wallet_sessions", [], web3(SESSION))).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, `insert into public.wallet_sessions (session_id, user_id, wallet_address) values ('${OTHER_SESSION}', '${CAROL}', '${CAROL_WALLET}')`)).rejects.toThrow(/permission denied/);
  });

  it("rate-limits the guest counter per client and blocks direct inserts", async () => {
    await expect(as("anon", null, "insert into public.public_guest_draws (local_id, fortune_id) values ('guest-direct-1', 1)")).rejects.toThrow(/permission denied/);
    const record = (id: string, ip: string) => as("anon", null, "select public.record_guest_draw($1, 2::smallint) as ok", [id], { ip }).then((r) => (r.rows[0] as { ok: boolean }).ok);
    const accepted: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      accepted.push(await record(`guest-ratelimit-${i}`, "203.0.113.7"));
      await db.exec("update public.public_guest_draws set created_at = created_at - interval '10 seconds'");
    }
    expect(accepted).toEqual([true, true, true, true, true, false]);
    expect(await record("guest-other-client-1", "198.51.100.2")).toBe(true);
    expect(await record("guest-other-client-2", "198.51.100.2")).toBe(false); // within 5 s
    expect(await record("not-a-guest-id", "192.0.2.1")).toBe(false);
    expect(await record("guest-ratelimit-0", "192.0.2.1")).toBe(false); // duplicate local id
    expect((await as("anon", null, "select public.get_guest_fortune_count() as n")).rows[0]).toEqual({ n: 7 });
  });
});
