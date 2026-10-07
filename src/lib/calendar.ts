export interface Interval {
  start: Date;
  end: Date;
}

/**
 * Calendar port. The Google Calendar implementation arrives in Milestone 5.
 * Tests and local dev use InMemoryCalendar.
 */
export interface CalendarAdapter {
  /** Busy intervals for one calendar between `from` and `to`. */
  busy(calendarId: string, from: Date, to: Date): Promise<Interval[]>;
}

export class InMemoryCalendar implements CalendarAdapter {
  private readonly busyByCalendar = new Map<string, Interval[]>();
  failWith: Error | null = null;

  addBusy(calendarId: string, interval: Interval): void {
    const list = this.busyByCalendar.get(calendarId) ?? [];
    list.push(interval);
    this.busyByCalendar.set(calendarId, list);
  }

  async busy(calendarId: string, from: Date, to: Date): Promise<Interval[]> {
    if (this.failWith) throw this.failWith;
    return (this.busyByCalendar.get(calendarId) ?? []).filter((i) => i.start < to && i.end > from);
  }
}
