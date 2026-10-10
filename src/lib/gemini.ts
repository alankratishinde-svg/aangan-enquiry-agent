export interface GenerateRequest {
  system: string;
  user: string;
  /** Ask for a JSON object back. */
  json?: boolean;
}

/** Port for Gemini Flash. Tests and local runs without a key use MockGemini. */
export interface GeminiClient {
  generate(req: GenerateRequest): Promise<string>;
}

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GeminiError";
  }
}

export interface GeminiRestOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  /** Base delay for retry backoff in ms. */
  retryBaseMs?: number;
  timeoutMs?: number;
  /** Gemini 3 thinking level ("low" keeps mid-call latency down). Empty string disables. Default "low". */
  thinkingLevel?: string;
}

/**
 * Gemini REST client: POST /v1beta/models/{model}:generateContent with the
 * x-goog-api-key header, as checked against the live API on 2026-10-10.
 * Retries 429 and 5xx with exponential backoff. The key is never logged.
 */
export class GeminiRestClient implements GeminiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly timeoutMs: number;
  private thinkingLevel: string;

  constructor(private readonly opts: GeminiRestOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxAttempts = opts.maxAttempts ?? 5;
    this.retryBaseMs = opts.retryBaseMs ?? 3000;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.thinkingLevel = opts.thinkingLevel ?? "low";
  }

  async generate(req: GenerateRequest): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.opts.model)}:generateContent`;
    const makeBody = () => ({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 4096,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
        ...(this.thinkingLevel ? { thinkingConfig: { thinkingLevel: this.thinkingLevel } } : {}),
      },
    });
    let lastErr: GeminiError | null = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.opts.apiKey },
          body: JSON.stringify(makeBody()),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
          };
          const text = (data.candidates?.[0]?.content?.parts ?? [])
            .filter((p) => !p.thought && typeof p.text === "string")
            .map((p) => p.text)
            .join("");
          if (!text) throw new GeminiError("Gemini returned no text", res.status);
          return text;
        }
        if (res.status === 400 && this.thinkingLevel && /thinking/i.test(await res.text())) {
          // This model does not accept thinkingLevel. Drop it and retry straight away.
          this.thinkingLevel = "";
          attempt--;
          continue;
        }
        lastErr = new GeminiError(`Gemini HTTP ${res.status}`, res.status);
        if (res.status !== 429 && res.status < 500) throw lastErr;
      } catch (err) {
        if (err instanceof GeminiError && err.status !== undefined && err.status !== 429 && err.status < 500) throw err;
        lastErr = err instanceof GeminiError ? err : new GeminiError(`Gemini request failed: ${(err as Error).message}`);
      }
      if (attempt < this.maxAttempts) await new Promise((r) => setTimeout(r, this.retryBaseMs * 2 ** (attempt - 1)));
    }
    throw lastErr ?? new GeminiError("Gemini request failed");
  }
}

/** Scripted Gemini for tests. Responses are consumed in order, or computed by a function. */
export class MockGemini implements GeminiClient {
  readonly calls: GenerateRequest[] = [];
  constructor(private readonly responder: string[] | ((req: GenerateRequest, n: number) => string | Promise<string>)) {}

  async generate(req: GenerateRequest): Promise<string> {
    this.calls.push(req);
    const n = this.calls.length - 1;
    if (Array.isArray(this.responder)) {
      const r = this.responder[Math.min(n, this.responder.length - 1)];
      if (r === undefined) throw new GeminiError("MockGemini has no response");
      return r;
    }
    return this.responder(req, n);
  }
}

export function geminiFromEnv(env: Record<string, string | undefined> = process.env): GeminiClient {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY is not set");
  return new GeminiRestClient({
    apiKey,
    model: env.GEMINI_MODEL || "gemini-flash-latest",
    ...(env.GEMINI_THINKING_LEVEL !== undefined ? { thinkingLevel: env.GEMINI_THINKING_LEVEL } : {}),
  });
}
