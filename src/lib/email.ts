export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

export class ResendClient implements EmailSender {
  constructor(private readonly opts: { apiKey: string; from: string; fetchImpl?: typeof fetch }) {}
  async send(msg: EmailMessage): Promise<void> {
    const res = await (this.opts.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.opts.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Resend failed with HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export class MockEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failWith: Error | null = null;
  async send(msg: EmailMessage) {
    if (this.failWith) throw this.failWith;
    this.sent.push(msg);
  }
}
