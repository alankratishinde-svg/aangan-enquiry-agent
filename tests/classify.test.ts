import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, type Config } from "../src/lib/config";
import { classifyLead, ClassifyError, extractGracefulClose, InMemoryClassifyStore, toToolResponse } from "../src/lib/classify/classify";
import { containsPrice, redactMoney } from "../src/lib/classify/guard";
import { applyRules } from "../src/lib/classify/rules";
import type { Answers } from "../src/lib/classify/answers";
import { AnswersSchema } from "../src/lib/classify/answers";
import { CRITERIA, type Criterion, type GeminiOutput, type Status } from "../src/lib/classify/types";
import { MockGemini } from "../src/lib/gemini";

const kdir = join(import.meta.dirname, "..", "knowledge");
const knowledge = {
  services: readFileSync(join(kdir, "services.md"), "utf8"),
  pricing: readFileSync(join(kdir, "pricing.md"), "utf8"),
  qualified: readFileSync(join(kdir, "qualified.md"), "utf8"),
};
const cfg = (env: Record<string, string> = {}): Config => loadConfig(env);

type Spec = Partial<Record<Criterion, Status>>;
function gem(spec: Spec = {}, extra: Partial<GeminiOutput> = {}): GeminiOutput {
  const criteria = Object.fromEntries(
    CRITERIA.map((c) => [c, { status: spec[c] ?? (c === "budget_band" ? "not_mentioned" : "pass"), evidence: `${c} evidence` }]),
  ) as GeminiOutput["criteria"];
  return { criteria, questions: [], question_to_ask: null, decline_reason: null, handoff_notes: [], ...extra };
}
const ans = (a: Partial<Answers> = {}): Answers => AnswersSchema.parse({ project_description: "x", ...a });
const run = (g: GeminiOutput, a: Partial<Answers> = {}, o: { round?: number; asked?: Criterion[]; config?: Config } = {}) =>
  applyRules({ gemini: g, answers: ans(a), config: o.config ?? cfg(), round: o.round ?? 1, alreadyAsked: o.asked ?? [], closeScript: null });

describe("rule engine: brief cases", () => {
  it("Talegaon: service area fail => unqualified", () => {
    const r = run(gem({ service_area: "fail" }, { decline_reason: "We serve Pune and PCMC only." }));
    expect(r.verdict).toBe("unqualified");
    expect(r.decline_reason).toBe("We serve Pune and PCMC only.");
    expect(r.close_script).toMatch(/not be the right fit/);
  });
  it("advice only: real project fail => unqualified", () => {
    expect(run(gem({ real_project: "fail" })).verdict).toBe("unqualified");
  });
  it("3 weeks => unqualified even if Gemini said pass", () => {
    const r = run(gem(), { weeks_until_needed: 3 });
    expect(r.verdict).toBe("unqualified");
    expect(r.criteria.timeline.source).toBe("rule");
    expect(r.criteria.timeline.gemini_status).toBe("pass");
  });
  it("5 weeks fails, 6 weeks asks, 9 weeks asks, 10 and 12 weeks qualify", () => {
    expect(run(gem(), { weeks_until_needed: 5 }).verdict).toBe("unqualified");
    expect(run(gem(), { weeks_until_needed: 6 }).verdict).toBe("ask_question");
    expect(run(gem(), { weeks_until_needed: 8 }).verdict).toBe("ask_question");
    expect(run(gem(), { weeks_until_needed: 9 }).verdict).toBe("ask_question");
    expect(run(gem(), { weeks_until_needed: 10 }).verdict).toBe("qualified");
    expect(run(gem(), { weeks_until_needed: 12 }).verdict).toBe("qualified");
  });
  it("8 weeks asks the fixed band question", () => {
    const r = run(gem(), { weeks_until_needed: 8 });
    expect(r.questions).toEqual([{ criterion: "timeline", question: expect.stringMatching(/fixed|later/) }]);
  });
  it("8 weeks, caller says the date can move => qualified; says it is fixed => unqualified", () => {
    expect(run(gem(), { weeks_until_needed: 8, timeline_firm: false }, { round: 2, asked: ["timeline"] }).verdict).toBe("qualified");
    expect(run(gem(), { weeks_until_needed: 8, timeline_firm: true }, { round: 2, asked: ["timeline"] }).verdict).toBe("unqualified");
  });
  it("full flat with volunteered tiny budget: budget fail => unqualified", () => {
    const r = run(gem({ budget_band: "fail" }, { decline_reason: "The scope usually needs a larger investment." }));
    expect(r.verdict).toBe("unqualified");
  });
  it("budget not mentioned => qualified", () => {
    expect(run(gem({ budget_band: "not_mentioned" })).verdict).toBe("qualified");
  });
  it("spouse not available but caller authorised => qualified", () => {
    expect(run(gem({ decision_maker: "pass" }), { decision_maker: "authorised_on_behalf" }).verdict).toBe("qualified");
  });
  it("researching for in-laws => qualified with an uncertainty note", () => {
    const r = run(gem({ decision_maker: "unclear" }, { handoff_notes: ["Caller is doing initial research for family."] }));
    expect(r.verdict).toBe("qualified");
    expect(r.handoff_notes.join(" ")).toMatch(/research/i);
    expect(r.handoff_notes.join(" ")).toMatch(/Decision-maker unclear/);
  });
  it("a Gemini decision_maker fail alone does not disqualify", () => {
    const r = run(gem({ decision_maker: "fail" }));
    expect(r.verdict).toBe("qualified");
    expect(r.criteria.decision_maker.status).toBe("unclear");
  });
  it("out of scope project (Gemini fails real_project) => unqualified", () => {
    expect(run(gem({ real_project: "fail" }), { project_type: "other" }).verdict).toBe("unqualified");
  });
  it("office of 3,500 sq ft => unqualified by rule; 3,100 => one question; 3,000 and 2,000 => qualified", () => {
    const base = { project_type: "office" as const };
    expect(run(gem(), { ...base, area_sq_ft: 3500 }).verdict).toBe("unqualified");
    const mid = run(gem(), { ...base, area_sq_ft: 3100 });
    expect(mid.verdict).toBe("ask_question");
    expect(mid.questions[0]?.criterion).toBe("real_project");
    expect(run(gem(), { ...base, area_sq_ft: 3000 }).verdict).toBe("qualified");
    expect(run(gem(), { ...base, area_sq_ft: 2000 }).verdict).toBe("qualified");
  });
  it("area limit does not apply to homes", () => {
    expect(run(gem(), { project_type: "full_home", area_sq_ft: 5000 }).verdict).toBe("qualified");
  });
  it("single room, rented apartment, after hours, price question => qualified", () => {
    const r = run(gem(), { project_type: "single_room", is_rented: true, structural_changes: false, called_after_hours: true, asked_about_price: true });
    expect(r.verdict).toBe("qualified");
  });
  it("unclear criterion 4 or 5 never blocks", () => {
    expect(run(gem({ budget_band: "unclear", decision_maker: "unclear" })).verdict).toBe("qualified");
  });
});

describe("rule engine: policies", () => {
  it("two_or_more policy: one fail passes, two fail declines", () => {
    const c = cfg({ QUALIFY_FAIL_POLICY: "two_or_more" });
    expect(run(gem({ service_area: "fail" }), {}, { config: c }).verdict).toBe("qualified");
    expect(run(gem({ service_area: "fail", real_project: "fail" }), {}, { config: c }).verdict).toBe("unqualified");
  });
  it("a fail beats an unclear: no question is asked, caller is declined", () => {
    expect(run(gem({ service_area: "fail", timeline: "unclear" })).verdict).toBe("unqualified");
  });
  it("thresholds come from config", () => {
    const c = cfg({ TIMELINE_FAIL_UNDER_WEEKS: "4", TIMELINE_PASS_FROM_WEEKS: "8" });
    expect(run(gem(), { weeks_until_needed: 5 }, { config: c }).verdict).toBe("ask_question");
    expect(run(gem(), { weeks_until_needed: 3 }, { config: c }).verdict).toBe("unqualified");
  });
});

describe("questions: at most one per criterion, one re-run", () => {
  it("round 1 asks one question per unclear criterion among 1 to 3, never about budget or decision-maker", () => {
    const r = run(
      gem(
        { service_area: "unclear", timeline: "unclear", budget_band: "unclear", decision_maker: "unclear" },
        { questions: [{ criterion: "service_area", question: "Which locality?" }, { criterion: "timeline", question: "By when?" }] },
      ),
    );
    expect(r.verdict).toBe("ask_question");
    expect(r.questions.map((q) => q.criterion)).toEqual(["service_area", "timeline"]);
  });
  it("round 2 never asks, even if criteria are still unclear: default policy declines gracefully", () => {
    const r = run(gem({ service_area: "unclear" }), {}, { round: 2, asked: ["service_area"] });
    expect(r.verdict).toBe("unqualified");
    expect(r.questions).toEqual([]);
    expect(r.final).toBe(true);
    expect(r.decline_reason).toBeTruthy();
    expect(r.close_script).toBeTruthy();
  });
  it("UNCLEAR_AFTER_RETRY=qualified forwards with a note", () => {
    const r = run(gem({ service_area: "unclear" }), {}, { round: 2, asked: ["service_area"], config: cfg({ UNCLEAR_AFTER_RETRY: "qualified" }) });
    expect(r.verdict).toBe("qualified");
    expect(r.handoff_notes.join(" ")).toMatch(/Could not confirm service area/);
  });
  it("a criterion already questioned is not questioned again", () => {
    const r = run(gem({ timeline: "unclear" }), {}, { round: 1, asked: ["timeline"] });
    expect(r.questions).toEqual([]);
    expect(r.verdict).not.toBe("ask_question");
  });
});

describe("classifyLead sessions", () => {
  const mk = (...outs: GeminiOutput[]) => {
    const gemini = new MockGemini(outs.map((o) => JSON.stringify(o)));
    const store = new InMemoryClassifyStore();
    return { gemini, store, deps: { gemini, store, config: cfg(), knowledge } };
  };
  const unclearTl = gem({ timeline: "unclear" }, { questions: [{ criterion: "timeline", question: "When do you need it done?" }] });

  it("ask, then re-run once, then never calls Gemini again", async () => {
    const { gemini, deps } = mk(unclearTl, gem());
    const r1 = await classifyLead("c1", { project_description: "2BHK in Baner" }, deps);
    expect(r1.verdict).toBe("ask_question");
    expect(r1.round).toBe(1);
    const r2 = await classifyLead("c1", { project_description: "2BHK in Baner", needed_by_text: "in 4 months" }, deps);
    expect(r2.verdict).toBe("qualified");
    expect(r2.round).toBe(2);
    const r3 = await classifyLead("c1", { project_description: "changed" }, deps);
    expect(r3).toEqual(r2);
    expect(gemini.calls).toHaveLength(2);
  });

  it("still unclear on the re-run: no second question, one Gemini call per round", async () => {
    const { gemini, deps } = mk(unclearTl, unclearTl);
    await classifyLead("c2", {}, deps);
    const r2 = await classifyLead("c2", {}, deps);
    expect(r2.questions).toEqual([]);
    expect(r2.verdict).toBe("unqualified");
    await classifyLead("c2", {}, deps);
    expect(gemini.calls).toHaveLength(2);
  });

  it("a final verdict on round 1 is returned as-is on later calls", async () => {
    const { gemini, deps } = mk(gem({ service_area: "fail" }));
    const a = await classifyLead("c3", {}, deps);
    const b = await classifyLead("c3", {}, deps);
    expect(a.verdict).toBe("unqualified");
    expect(b).toEqual(a);
    expect(gemini.calls).toHaveLength(1);
  });

  it("calls are isolated from each other", async () => {
    const { deps } = mk(unclearTl, gem());
    expect((await classifyLead("a", {}, deps)).round).toBe(1);
    expect((await classifyLead("b", {}, deps)).round).toBe(1);
  });

  it("duplicate questions for one criterion collapse to one", async () => {
    const dup = gem({ timeline: "unclear" }, { questions: [{ criterion: "timeline", question: "Q one?" }, { criterion: "timeline", question: "Q two?" }] });
    const { deps } = mk(dup);
    const r = await classifyLead("c4", {}, deps);
    expect(r.questions).toHaveLength(1);
  });

  it("retries once on invalid JSON, then fails with ClassifyError", async () => {
    const bad = new MockGemini(["not json", "still not json"]);
    const deps = { gemini: bad, store: new InMemoryClassifyStore(), config: cfg(), knowledge };
    await expect(classifyLead("c5", {}, deps)).rejects.toBeInstanceOf(ClassifyError);
    expect(bad.calls).toHaveLength(2);
    const good = new MockGemini(["```json\n" + JSON.stringify(gem()) + "\n```"]);
    const r = await classifyLead("c6", {}, { ...deps, gemini: good });
    expect(r.verdict).toBe("qualified");
  });

  it("passes the live rubric and services text into the prompt, plus already-asked criteria", async () => {
    const { gemini, deps } = mk(unclearTl, gem());
    await classifyLead("c7", { project_description: "hello" }, deps);
    await classifyLead("c7", { project_description: "hello" }, deps);
    expect(gemini.calls[0]!.user).toContain(knowledge.qualified.trim());
    expect(gemini.calls[0]!.user).toContain(knowledge.services.trim());
    expect(gemini.calls[1]!.user).toMatch(/already questioned[\s\S]*timeline/);
    expect(gemini.calls[0]!.system).toMatch(/never write any price/i);
  });

  it("does not send pricing.md to Gemini", async () => {
    const { gemini, deps } = mk(gem());
    await classifyLead("c8", {}, deps);
    const sent = gemini.calls[0]!.system + gemini.calls[0]!.user;
    expect(sent).not.toContain("1,800");
    expect(sent).not.toContain("Standard specification");
  });

  it("tool response carries no evidence or internals", async () => {
    const { deps } = mk(gem({ real_project: "fail" }, { decline_reason: "Not a fit." }));
    const t = toToolResponse(await classifyLead("c9", {}, deps));
    expect(Object.keys(t).sort()).toEqual(["close_script", "decline_reason", "next_step", "questions", "verdict"]);
    expect(t.next_step).toMatch(/Do not ask for an email/);
  });
});

describe("no output ever contains a price", () => {
  const dirty = gem(
    { budget_band: "fail", timeline: "unclear", service_area: "unclear" },
    {
      decline_reason: "Projects like this cost around ₹18 lakh, so ₹1.2 lakh will not work.",
      handoff_notes: ["Caller said budget is Rs 1,20,000 only.", "Wants 2BHK in Baner."],
      questions: [
        { criterion: "timeline", question: "Our rates start at 1,800 per sq ft, when do you need it?" },
        { criterion: "service_area", question: "Is it in Baner?" },
      ],
      question_to_ask: "Rs 5 lakh is fine?",
    },
  );
  dirty.criteria.budget_band.evidence = "Caller volunteered ₹1.2 lakh for a full flat, far below scope.";

  const flatten = (v: unknown): string[] =>
    typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(flatten) : v && typeof v === "object" ? Object.values(v).flatMap(flatten) : [];

  it("scrubs prices from every text field the classifier returns", () => {
    for (const round of [1, 2]) {
      const r = run(dirty, { budget_volunteered_inr: 120000, budget_text: "1.2 lakh" }, { round });
      for (const s of flatten({ ...r, price_guard_hits: [] })) expect(containsPrice(s), s).toBe(false);
      expect(r.price_guard_hits.length).toBeGreaterThan(0);
    }
  });

  it("scrubs the tool response too", () => {
    const t = toToolResponse(run(dirty));
    for (const s of flatten(t)) expect(containsPrice(s), s).toBe(false);
  });

  it("price detector catches the usual forms and spares plain numbers", () => {
    for (const s of ["₹5,000", "Rs. 40000", "about 3 lakh", "1.5 crore", "50k", "per sq ft", "rates start at", "INR 100", "2 rupees"]) {
      expect(containsPrice(s), s).toBe(true);
    }
    for (const s of ["3,000 sq ft limit", "in 8 weeks", "2BHK in Baner", "Pune and PCMC only", "a larger investment than discussed"]) {
      expect(containsPrice(s), s).toBe(false);
    }
  });

  it("redactMoney removes figures but keeps the sentence", () => {
    expect(redactMoney("Caller said ₹1.2 lakh for a full flat").text).toBe("Caller said [budget figure] for a full flat");
    expect(redactMoney("budget about 50k").changed).toBe(true);
  });

  it("the fixed fallback texts are price free", () => {
    const r = run(gem({ real_project: "fail", service_area: "fail", timeline: "fail", budget_band: "fail" }));
    for (const s of flatten(r)) expect(containsPrice(s), s).toBe(false);
  });
});

describe("graceful close", () => {
  it("is read from qualified.md at runtime", () => {
    expect(extractGracefulClose(knowledge.qualified)).toBe(
      "This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.",
    );
    expect(extractGracefulClose("nothing")).toBeNull();
  });
});
