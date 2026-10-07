import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase", "migrations");

// Minimal stand-in for the Supabase pieces the migrations rely on.
const supabaseStub = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`;

const TABLES = [
  "designers",
  "calls",
  "leads",
  "requirements",
  "review_queue",
  "decisions",
  "rubric_proposals",
  "weekly_summaries",
];

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(supabaseStub);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  }
  await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  await db.exec(`grant select, update on all tables in schema public to authenticated`);
});

describe("migrations", () => {
  it("apply cleanly and create all tables", async () => {
    const r = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    );
    const names = r.rows.map((x) => x.tablename);
    for (const t of TABLES) expect(names).toContain(t);
  });

  it("enable row level security on every table", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    for (const t of TABLES) {
      expect(r.rows.find((x) => x.relname === t)?.relrowsecurity, t).toBe(true);
    }
  });

  it("seed inserts 4 placeholder designers", async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from designers`);
    expect(r.rows[0].n).toBe(4);
  });

  it("rejects a failed call without a reason", async () => {
    await expect(
      db.query(`insert into calls (vaani_call_id, started_at, status) values ('x1', now(), 'failed')`),
    ).rejects.toThrow();
  });

  it("rejects an invalid call status", async () => {
    await expect(
      db.query(`insert into calls (vaani_call_id, started_at, status) values ('x2', now(), 'weird')`),
    ).rejects.toThrow();
  });

  it("allows a lead with null email but blocks assigning it", async () => {
    const call = await db.query<{ id: string }>(
      `insert into calls (vaani_call_id, started_at, status) values ('x3', now(), 'unqualified') returning id`,
    );
    const lead = await db.query<{ id: string }>(
      `insert into leads (call_id, phone) values ($1, '+910000000000') returning id`,
      [call.rows[0].id],
    );
    const d = await db.query<{ id: string }>(`select id from designers limit 1`);
    await expect(
      db.query(`update leads set assigned_designer_id = $1 where id = $2`, [d.rows[0].id, lead.rows[0].id]),
    ).rejects.toThrow();
    await db.query(`update leads set email = 'a@b.co' where id = $1`, [lead.rows[0].id]);
    await db.query(`update leads set assigned_designer_id = $1 where id = $2`, [d.rows[0].id, lead.rows[0].id]);
  });

  it("limits a designer to their own leads via RLS", async () => {
    const [d1, d2] = (await db.query<{ id: string }>(`select id from designers order by name limit 2`)).rows;
    const u1 = "11111111-1111-1111-1111-111111111111";
    const u2 = "22222222-2222-2222-2222-222222222222";
    await db.query(`update designers set auth_user_id = $1 where id = $2`, [u1, d1.id]);
    await db.query(`update designers set auth_user_id = $1 where id = $2`, [u2, d2.id]);

    const call = await db.query<{ id: string }>(
      `insert into calls (vaani_call_id, started_at, status) values ('x4', now(), 'qualified') returning id`,
    );
    await db.query(
      `insert into leads (call_id, name, email, assigned_designer_id) values ($1, 'Owned by one', 'o@b.co', $2)`,
      [call.rows[0].id, d1.id],
    );

    const countAs = async (uid: string) => {
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}'`);
      const r = await db.query<{ n: number }>(`select count(*)::int as n from leads where name = 'Owned by one'`);
      await db.exec(`reset role`);
      return r.rows[0].n;
    };
    expect(await countAs(u1)).toBe(1);
    expect(await countAs(u2)).toBe(0);
  });

  it("hides calls from authenticated users (service role only)", async () => {
    await db.exec(`set role authenticated`);
    const r = await db.query<{ n: number }>(`select count(*)::int as n from calls`);
    await db.exec(`reset role`);
    expect(r.rows[0].n).toBe(0);
  });
});
