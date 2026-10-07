export interface Designer {
  id: string;
  name: string;
  email: string;
  googleCalendarId: string;
}

/** Designer port. The Supabase implementation arrives with booking (Milestone 5). */
export interface DesignerSource {
  listActive(): Promise<Designer[]>;
}

export class StaticDesignerSource implements DesignerSource {
  constructor(private readonly designers: Designer[]) {}
  async listActive(): Promise<Designer[]> {
    return this.designers;
  }
}
