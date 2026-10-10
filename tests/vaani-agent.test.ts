import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { containsPrice } from "../src/lib/classify/guard";
import { loadConfig } from "../src/lib/config";
import { getSection } from "../src/lib/markdown";
import { AGENT_GREETING, buildNativeAgentPrompt, buildPersona } from "../src/lib/vaani/agent-prompt";
import { MockVaaniClient, VaaniError, VaaniRestClient } from "../src/lib/vaani/client";

const kdir = join(import.meta.dirname, "..", "knowledge");
const knowledge = {
  services: readFileSync(join(kdir, "services.md"), "utf8"),
  pricing: readFileSync(join(kdir, "pricing.md"), "utf8"),
  qualified: readFileSync(join(kdir, "qualified.md"), "utf8"),
};
const config = loadConfig({});

describe("native agent prompt", () => {
  const prompt = buildNativeAgentPrompt(knowledge, config);

  it("contains services.md and qualified.md verbatim", () => {
    expect(prompt).toContain(knowledge.services.trim());
    expect(prompt).toContain(knowledge.qualified.trim());
  });

  it("contains the exact deflection line and the booking-after-qualified rule", () => {
    expect(prompt).toContain("Pricing depends on the site, the materials you choose, and the scope");
    expect(prompt).toMatch(/Offer or make a booking only after you have decided the lead is qualified/);
  });

  it("withholds every rupee figure from the pricing tables", () => {
    const tables = (getSection(knowledge.pricing, "Residential") ?? "") + (getSection(knowledge.pricing, "Commercial (office / clinic / studio)") ?? "");
    const figures = tables.match(/₹[\d,]+/g) ?? [];
    expect(figures.length).toBeGreaterThan(5);
    for (const f of figures) expect(prompt, f).not.toContain(f);
    expect(prompt).not.toContain("Standard specification");
  });

  it("takes thresholds from config, not constants", () => {
    const p = buildNativeAgentPrompt(knowledge, loadConfig({ TIMELINE_FAIL_UNDER_WEEKS: "4", TIMELINE_PASS_FROM_WEEKS: "8", COMMERCIAL_MAX_SQFT: "2000" }));
    expect(p).toMatch(/under 4 weeks/);
    expect(p).toMatch(/4 to 8 weeks/);
    expect(p).toMatch(/up to about 2000 square feet/);
  });

  it("names the Cal.com tools, locks them until the lead is a fit, and ends with a price self-check", () => {
    for (const t of ["Check_availability_booking", "book_appointment", "cancel_appointment", "reschedule_appointment"]) expect(prompt).toContain(t);
    expect(prompt).toMatch(/Only now are you allowed to use the booking tools/);
    expect(prompt).toMatch(/Booking tools are locked until the caller is a fit/);
    expect(prompt.indexOf("Final check before every reply")).toBeGreaterThan(prompt.indexOf("Booking tools are locked"));
    expect(prompt).toMatch(/in digits or in words/);
  });

  it("keeps the approved pricing sentence in English for Hindi and Marathi callers", () => {
    expect(prompt).toMatch(/in English, word for word/);
    expect(prompt).toMatch(/even when the caller speaks Hindi or Marathi/);
    expect(prompt).toMatch(/Never translate it/);
  });

  it("makes the agent collect name, need, size, place, timing and decision-maker before contact details", () => {
    expect(prompt).toMatch(/Before you ask for an email address or phone number you must know all of these/);
    expect(prompt).toMatch(/Do not skip the size/);
  });

  it("uses the graceful close from qualified.md", () => {
    expect(prompt).toContain("This sounds like it may not be the right fit for us right now");
  });

  it("has no curly braces (Vaani would read them as variables)", () => {
    expect(prompt).not.toMatch(/[{}]/);
  });

  it("refuses to build if the knowledge files contain braces", () => {
    expect(() => buildNativeAgentPrompt({ ...knowledge, services: knowledge.services + "\n{{x}}" }, config)).toThrow(/curly braces/);
  });

  it("the greeting contains no price", () => {
    expect(containsPrice(AGENT_GREETING)).toBe(false);
  });

  it("persona carries prompt, greeting and language", () => {
    const p = buildPersona(knowledge, config) as any;
    expect(p.identity.system_prompt).toBe(prompt);
    expect(p.identity.greeting_message.agent_message).toBe(AGENT_GREETING);
    expect(p.senses_capabilities.language).toBe("en");
  });
});

describe("Vaani client", () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("create sends X-API-Key and the documented body, and returns the agent id", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const c = new VaaniRestClient({
      apiKey: "vaani_secret123",
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return ok({ success: true, agent_id: "abc-123" });
      }) as unknown as typeof fetch,
    });
    const r = await c.createAgent("X", { persona: { identity: { system_prompt: "hi" } } });
    expect(r.agentId).toBe("abc-123");
    expect(seen!.url).toBe("https://api.vaanivoice.ai/api/create-agent");
    expect((seen!.init.headers as Record<string, string>)["X-API-Key"]).toBe("vaani_secret123");
    expect(JSON.parse(seen!.init.body as string)).toEqual({ agent_display_name: "X", config: { persona: { identity: { system_prompt: "hi" } } } });
  });

  it("create also accepts an id-shaped response, and refuses to guess when none is present", async () => {
    const mk = (body: unknown) => new VaaniRestClient({ apiKey: "k", fetchImpl: (async () => ok(body)) as unknown as typeof fetch });
    expect((await mk({ id: "x-1" }).createAgent("X", {})).agentId).toBe("x-1");
    expect((await mk({ data: { agent_id: "x-2" } }).createAgent("X", {})).agentId).toBe("x-2");
    const err = await mk({ ok: true }).createAgent("X", {}).catch((e) => e);
    expect(err.message).toMatch(/no agent id/);
    expect(err.message).toMatch(/may still have been created/);
  });

  it("update uses PATCH on the persona path", async () => {
    let seen: { url: string; method?: string } | undefined;
    const c = new VaaniRestClient({
      apiKey: "k",
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, method: init.method };
        return ok({});
      }) as unknown as typeof fetch,
    });
    await c.updatePersona("id-1", { identity: {} });
    expect(seen).toEqual({ url: "https://api.vaanivoice.ai/api/agent/id-1/persona", method: "PATCH" });
  });

  it("errors carry the status but never the API key", async () => {
    const c = new VaaniRestClient({ apiKey: "vaani_secret123", fetchImpl: (async () => ok({ detail: "bad" }, 422)) as unknown as typeof fetch });
    const err = await c.createAgent("X", {}).catch((e) => e);
    expect(err).toBeInstanceOf(VaaniError);
    expect(err.status).toBe(422);
    expect(String(err.message)).not.toContain("vaani_secret123");
  });

  it("list accepts both response shapes", async () => {
    const arr = new VaaniRestClient({ apiKey: "k", fetchImpl: (async () => ok([{ id: "1", display_name: "A" }])) as unknown as typeof fetch });
    const pag = new VaaniRestClient({ apiKey: "k", fetchImpl: (async () => ok({ data: [{ id: "2", display_name: "B" }] })) as unknown as typeof fetch });
    expect((await arr.listAgents())[0]!.id).toBe("1");
    expect((await pag.listAgents())[0]!.id).toBe("2");
  });

  it("mock client creates, updates and lists without network", async () => {
    const m = new MockVaaniClient();
    const { agentId } = await m.createAgent("A", { persona: {} });
    await m.updatePersona(agentId, { identity: { system_prompt: "p" } });
    expect(await m.listAgents()).toHaveLength(1);
    await m.deleteAgent(agentId);
    expect(await m.listAgents()).toHaveLength(0);
  });
});
