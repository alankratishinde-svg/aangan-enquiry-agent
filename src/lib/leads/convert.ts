import type { CalcomClient } from "../calcom";
import type { Db } from "../postcall/db";
import { finalizeQualifiedLead, type FinalizeDeps, type FinalizeResult } from "./finalize";

export class ConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConvertError";
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface ConvertInput {
  reviewId: string;
  email: string;
  phone?: string | null;
  /** ISO start of a free slot chosen by the front desk. Optional: without it the designer arranges a time. */
  slotIso?: string | null;
  by: string;
}

/**
 * Front desk converts an unqualified lead into a real one, after calling the person back and collecting an email.
 * Same path as a qualified lead from here: booking, designer assignment, estimate, tips, HubSpot, designer email.
 * Writes a decisions row either way.
 */
export async function convertLead(
  db: Db,
  input: ConvertInput,
  deps: FinalizeDeps & { calcom: CalcomClient | null },
): Promise<FinalizeResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new ConvertError("Enter a valid email address. The caller must be called back to collect it first.");
  const found = await db.query<{ lead_id: string; name: string | null; phone: string | null }>(
    `select rq.lead_id, l.name, l.phone from review_queue rq join leads l on l.id = rq.lead_id
      where rq.id = $1 and rq.state = 'pending' and rq.kind = 'unqualified'`,
    [input.reviewId],
  );
  const row = found.rows[0];
  if (!row) throw new ConvertError("This review item is no longer pending, or it is not an unqualified lead.");
  const phone = input.phone?.trim() || row.phone;

  let booking: { uid: string; start: string } | null = null;
  if (input.slotIso) {
    if (!deps.calcom) throw new ConvertError("Cal.com is not configured, so a slot cannot be booked. Convert without a slot and let the designer arrange a time.");
    booking = await deps.calcom.createBooking({ startIso: input.slotIso, name: row.name ?? "Enquiry", email, phone });
  }

  await db.transaction(async (tx) => {
    await tx.query(`update leads set email = $2, phone = $3 ${booking ? ", booked_slot = $4, calcom_booking_uid = $5" : ""} where id = $1`,
      booking ? [row.lead_id, email, phone, new Date(booking.start).toISOString(), booking.uid] : [row.lead_id, email, phone]);
    await tx.query(`update review_queue set state = 'converted', decided_by = $2, decided_at = now() where id = $1`, [input.reviewId, input.by]);
    await tx.query(`insert into decisions (lead_id, action, original_verdict, final_outcome, decided_by) values ($1, 'convert', 'unqualified', 'converted', $2)`, [row.lead_id, input.by]);
    await tx.query(`update calls set flags = flags || '{"converted_by_front_desk": true}'::jsonb where id = (select call_id from leads where id = $1)`, [row.lead_id]);
  });
  return finalizeQualifiedLead(row.lead_id, deps);
}
