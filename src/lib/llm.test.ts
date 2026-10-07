import { afterEach, describe, expect, it, vi } from "vitest";
import { type BriefInput, briefFacts, keywordCrops, pickCrops, wholeSentences, writeBrief } from "./llm";

const INPUT: BriefInput = {
  place: "Brooklyn, New York, United States",
  today: "2026-10-07",
  crops: ["Tomato", "Garlic"],
  frostSummary: "Based on 31 seasons of weather.",
  nextFrostRisk: "2026-11-09",
  forecast: [
    { date: "2026-10-10", tmin: 6, tmax: 17, rainChance: 10 },
    { date: "2026-10-11", tmin: 1.5, tmax: 12, rainChance: 0 },
  ],
  tasks: [{ id: "garlic:fall-plant:2026", crop: "Garlic", action: "Plant for fall", date: "2026-10-22" }],
};

/** Stub Ollama's /api/chat to reply with `content`. */
function ollamaReplies(content: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ message: { content: JSON.stringify(content) } })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("briefFacts", () => {
  it("states the coldest night, cold nights and next frost risk", () => {
    expect(briefFacts(INPUT)).toEqual([
      "Coldest night in the forecast: Sun 11 Oct 2026 at 1.5°C.",
      "Nights at or below 2°C: Sun 11 Oct 2026 (1.5°C).",
      "Based on past years, frost first becomes possible on Mon 9 Nov 2026 (in 33 days).",
    ]);
  });

  it("says plainly when there is no frost to worry about", () => {
    const facts = briefFacts({ ...INPUT, forecast: [INPUT.forecast[0]], nextFrostRisk: null });
    expect(facts).toContain("No night in the forecast is at or below 2°C.");
    expect(facts).toContain("Frost is not expected in the next 12 months.");
  });
});

describe("wholeSentences", () => {
  it("drops a trailing fragment", () => {
    expect(wholeSentences("Plant garlic on Saturday. Mulch it well. If you have any un")).toBe(
      "Plant garlic on Saturday. Mulch it well.",
    );
  });

  it("removes a word count the model appended", () => {
    expect(wholeSentences("Avoid overwatering. (48 words).")).toBe("Avoid overwatering.");
  });

  it("keeps complete text", () => {
    expect(wholeSentences(" Done! ")).toBe("Done!");
  });
});

describe("keywordCrops", () => {
  it("matches crop names, singular or plural", () => {
    expect(keywordCrops("Tomatoes, peas and some garlic").crops.map((c) => c.id)).toEqual(["tomato", "pea", "garlic"]);
  });
});

describe("pickCrops", () => {
  it("uses the model's choice", async () => {
    ollamaReplies({ crops: ["tomato", "pepper", "tomato"], understood: "You want salsa." });
    const pick = await pickCrops("salsa please");
    expect(pick.source).toBe("model");
    expect(pick.crops.map((c) => c.id)).toEqual(["tomato", "pepper"]);
  });

  it("falls back to keywords when the model is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    const pick = await pickCrops("just basil");
    expect(pick).toMatchObject({ source: "keywords", crops: [{ id: "basil" }] });
  });

  it("falls back when the model returns a crop outside the catalogue", async () => {
    ollamaReplies({ crops: ["okra"], understood: "Okra." });
    expect((await pickCrops("okra and basil")).source).toBe("keywords");
  });
});

describe("writeBrief", () => {
  it("returns the model's brief with tips keyed by task", async () => {
    ollamaReplies({
      headline: "Garlic goes in this month.",
      weekend: "Saturday is mild, so plant garlic. Cover tender pots on Sunday night",
      tips: [{ taskId: "garlic:fall-plant:2026", tip: "Plant cloves pointy end up." }],
    });
    const brief = await writeBrief(INPUT);
    expect(brief).toEqual({
      headline: "Garlic goes in this month.",
      weekend: "Saturday is mild, so plant garlic.",
      tips: { "garlic:fall-plant:2026": "Plant cloves pointy end up." },
      source: "model",
    });
  });

  it("rejects tips for tasks it was not given", async () => {
    ollamaReplies({ headline: "x", weekend: "y", tips: [{ taskId: "okra:transplant:2026", tip: "z" }] });
    const brief = await writeBrief(INPUT);
    expect(brief.source).toBe("fallback");
    expect(brief.weekend).toBe("Frost is possible on Sun 11 Oct 2026 (low 1.5°C). Cover tender plants or bring pots in before then.");
  });

  it("asks without a thinking flag when the model has no thinking mode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"model does not support thinking"}', { status: 400 }))
      .mockResolvedValueOnce(Response.json({ message: { content: JSON.stringify({ headline: "h.", weekend: "w.", tips: [] }) } }));
    vi.stubGlobal("fetch", fetchMock);
    await writeBrief(INPUT);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).think).toBe(false);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("think");
  });
});
