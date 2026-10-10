import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "db", "migrations");

// A role that is not the table owner, standing in for any future reporting or app role.
const extraRole = `create role reporting nologin;`;

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
  await db.exec(extraRole);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  }
  await db.exec(readFileSync(join(root, "db", "seed.sql"), "utf8"));
  await db.exec(`grant select on all tables in schema public to reporting`);
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

  it("hides every table from a non-owner role (RLS on, no policies)", async () => {
    await db.exec(`set role reporting`);
    for (const t of TABLES) {
      const r = await db.query<{ n: number }>(`select count(*)::int as n from ${t}`);
      expect(r.rows[0].n, t).toBe(0);
    }
    await db.exec(`reset role`);
    const owner = await db.query<{ n: number }>(`select count(*)::int as n from designers`);
    expect(owner.rows[0].n).toBe(4);
  });
});
