/**
 * Cal.com adapter. Header versions are the ones the Cal.com v2 docs ask for (checked 2026-10-10):
 * slots 2024-09-04, bookings list 2026-05-01, create booking 2026-02-25.
 */
export interface BookingInfo {
  uid: string;
  start: string;
  end: string | null;
}

export interface CalcomClient {
  /** The caller's upcoming booking for the consultation event type, if one exists. */
  findUpcomingBooking(email: string): Promise<BookingInfo | null>;
  /** Free 45 minute starts between two instants (ISO strings). */
  listSlots(fromIso: string, toIso: string): Promise<string[]>;
  createBooking(input: { startIso: string; name: string; email: string; phone?: string | null }): Promise<BookingInfo>;
}

export class CalcomError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "CalcomError";
  }
}

export class CalcomRestClient implements CalcomClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: { apiKey: string; eventTypeId: number; timeZone?: string; fetchImpl?: typeof fetch }) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async call(method: string, path: string, version: string, body?: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`https://api.cal.com/v2${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, "cal-api-version": version, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) throw new CalcomError(`Cal.com ${method} ${path} failed with HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
    return text ? JSON.parse(text) : {};
  }

  async findUpcomingBooking(email: string): Promise<BookingInfo | null> {
    const q = new URLSearchParams({ status: "upcoming", attendeeEmail: email, eventTypeId: String(this.opts.eventTypeId) });
    const r = (await this.call("GET", `/bookings?${q}`, "2026-05-01")) as { data?: { uid: string; start: string; end?: string }[] };
    const b = r.data?.[0];
    return b ? { uid: b.uid, start: b.start, end: b.end ?? null } : null;
  }

  async listSlots(fromIso: string, toIso: string): Promise<string[]> {
    const q = new URLSearchParams({ eventTypeId: String(this.opts.eventTypeId), start: fromIso, end: toIso, timeZone: this.opts.timeZone ?? "Asia/Kolkata" });
    const r = (await this.call("GET", `/slots?${q}`, "2024-09-04")) as { data?: Record<string, { start: string }[]> };
    return Object.values(r.data ?? {}).flat().map((s) => s.start);
  }

  async createBooking(input: { startIso: string; name: string; email: string; phone?: string | null }): Promise<BookingInfo> {
    const r = (await this.call("POST", "/bookings", "2026-02-25", {
      start: new Date(input.startIso).toISOString(),
      eventTypeId: this.opts.eventTypeId,
      attendee: { name: input.name, email: input.email, timeZone: this.opts.timeZone ?? "Asia/Kolkata", ...(input.phone ? { phoneNumber: input.phone } : {}) },
    })) as { data?: { uid: string; start: string; end?: string } };
    if (!r.data?.uid) throw new CalcomError("Cal.com create booking returned no uid");
    return { uid: r.data.uid, start: r.data.start, end: r.data.end ?? null };
  }
}

export class MockCalcomClient implements CalcomClient {
  readonly bookings: (BookingInfo & { email: string })[] = [];
  slots: string[] = ["2026-10-14T05:30:00.000Z", "2026-10-14T06:15:00.000Z"];
  failWith: Error | null = null;
  async findUpcomingBooking(email: string) {
    if (this.failWith) throw this.failWith;
    return this.bookings.find((b) => b.email === email) ?? null;
  }
  async listSlots() {
    if (this.failWith) throw this.failWith;
    return this.slots;
  }
  async createBooking(input: { startIso: string; name: string; email: string }) {
    if (this.failWith) throw this.failWith;
    const b = { uid: `mock-${this.bookings.length + 1}`, start: input.startIso, end: null, email: input.email };
    this.bookings.push(b);
    return b;
  }
}
