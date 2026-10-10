import type { Sql } from "./postcall/db";

export interface WeekMetrics {
  weekStart: string;
  counts: { qualified: number; unqualified: number; failed: number; total: number };
  response: { medianSeconds: number | null; averageSeconds: number | null; underFiveMinutesPct: number | null; answered: number; answeredPct: number | null };
  failed: { total: number; calledBack: number; calledBackWithinHour: number; withinHourPct: number | null; medianMinutesToCallback: number | null; overdue: number };
  flags: { priceSpoken: number; bookingBeforeQualified: number };
  review: { pendingUnqualified: number; pendingCompliance: number; converted: number; deleted: number };
}

/** Monday 00:00 India time of the week containing `d`, as a date string. */
export function weekStartIst(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const mon = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow));
  return mon.toISOString().slice(0, 10);
}

/** Counts and callback numbers for the 7 days starting at weekStart (IST). */
export async function weekMetrics(sql: Sql, weekStart: string, now: Date = new Date()): Promise<WeekMetrics> {
  const from = `${weekStart}T00:00:00+05:30`;
  const p = [from];
  const win = `started_at >= $1::timestamptz and started_at < $1::timestamptz + interval '7 days'`;
  const one = async <T>(q: string, params: unknown[] = p) => (await sql.query<T>(q, params)).rows[0]!;

  const c = await one<{ qualified: number; unqualified: number; failed: number }>(
    `select count(*) filter (where status='qualified')::int qualified, count(*) filter (where status='unqualified')::int unqualified,
            count(*) filter (where status='failed')::int failed from calls where ${win}`,
  );
  const r = await one<{ median: number | null; avg: number | null; answered: number; under5: number | null }>(
    `select percentile_cont(0.5) within group (order by response_seconds)::float median, avg(response_seconds)::float avg, count(response_seconds)::int answered,
            (100.0 * count(*) filter (where response_seconds < 300) / nullif(count(response_seconds), 0))::float under5
       from calls where ${win} and response_seconds is not null`,
  );
  const f = await one<{ total: number; called_back: number; within_hour: number; median_min: number | null; overdue: number }>(
    `select count(*)::int total,
            count(*) filter (where called_back_at is not null)::int called_back,
            count(*) filter (where called_back_at is not null and called_back_at <= callback_due_at)::int within_hour,
            (percentile_cont(0.5) within group (order by extract(epoch from (called_back_at - ended_at)) / 60)
               filter (where called_back_at is not null and ended_at is not null))::float median_min,
            count(*) filter (where called_back_at is null and callback_due_at < $2::timestamptz)::int overdue
       from calls where status = 'failed' and ${win}`,
    [from, now.toISOString()],
  );
  const fl = await one<{ price: number; booking: number }>(
    `select count(*) filter (where price_spoken)::int price, count(*) filter (where booking_before_qualified)::int booking from calls where ${win}`,
  );
  const rq = await one<{ pu: number; pc: number; conv: number; del: number }>(
    `select count(*) filter (where state='pending' and kind='unqualified')::int pu, count(*) filter (where state='pending' and kind='compliance')::int pc,
            count(*) filter (where state='converted' and decided_at >= $1::timestamptz and decided_at < $1::timestamptz + interval '7 days')::int conv,
            count(*) filter (where state='deleted' and decided_at >= $1::timestamptz and decided_at < $1::timestamptz + interval '7 days')::int del
       from review_queue`,
  );
  return {
    weekStart,
    counts: { ...c, total: c.qualified + c.unqualified + c.failed },
    response: {
      medianSeconds: r.median, averageSeconds: r.avg === null ? null : Math.round(r.avg), underFiveMinutesPct: r.under5 === null ? null : Math.round(r.under5),
      answered: r.answered, answeredPct: c.qualified + c.unqualified + c.failed ? Math.round((100 * r.answered) / (c.qualified + c.unqualified + c.failed)) : null,
    },
    failed: {
      total: f.total, calledBack: f.called_back, calledBackWithinHour: f.within_hour,
      withinHourPct: f.total ? Math.round((100 * f.within_hour) / f.total) : null,
      medianMinutesToCallback: f.median_min === null ? null : Math.round(f.median_min), overdue: f.overdue,
    },
    flags: { priceSpoken: fl.price, bookingBeforeQualified: fl.booking },
    review: { pendingUnqualified: rq.pu, pendingCompliance: rq.pc, converted: rq.conv, deleted: rq.del },
  };
}
