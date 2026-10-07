/**
 * The open-weight model's two jobs, both via Ollama structured outputs:
 *
 *   1. read a gardener's free-text wish list and pick crops from our dataset
 *   2. write short, grounded tips for tasks the scheduler already dated
 *
 * The model never chooses dates. Its JSON is constrained by a schema at
 * generation time and validated again here, and every call has a
 * deterministic fallback so the app still works with no model running.
 */

import { z } from "zod";
import { CROPS, CROP_IDS, type Crop } from "./crops";

export const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:4b";

const TIMEOUT_MS = 120_000;
const MAX_CROPS = 8;

type Message = { role: "system" | "user"; content: string };

async function chatJson<T>(schema: z.ZodType<T>, messages: Message[], temperature: number): Promise<T> {
  const format = z.toJSONSchema(schema);

  let res = await post(format, messages, temperature, true);
  // Models without a thinking mode reject `think`; retry without it.
  if (res.status === 400 && /think/i.test(await res.clone().text())) {
    res = await post(format, messages, temperature, false);
  }
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = (await res.json()) as { message?: { content?: string } };
  return schema.parse(JSON.parse(data.message?.content ?? ""));
}

function post(format: object, messages: Message[], temperature: number, disableThinking: boolean): Promise<Response> {
  return fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      ...(disableThinking ? { think: false } : {}),
      options: { temperature },
      format,
      messages,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

// ---------------------------------------------------------------------------
// 1. Wish list -> crops
// ---------------------------------------------------------------------------

const cropsSchema = z.object({
  crops: z.array(z.enum(CROP_IDS)).max(MAX_CROPS),
  understood: z.string().max(300),
});

export type CropPick = { crops: Crop[]; understood: string; source: "model" | "keywords" };

const CROP_CATALOGUE = CROPS.map((c) => `- ${c.id}: ${c.name} (${c.uses})`).join("\n");

export async function pickCrops(wishList: string): Promise<CropPick> {
  try {
    const out = await chatJson(cropsSchema, [
      {
        role: "system",
        content:
          "You help home gardeners decide what to plant. Read what the gardener wants to eat, cook or enjoy " +
          "and choose the crops from the catalogue that deliver it. Map dishes to their garden ingredients " +
          "(for example salsa -> tomato, pepper, onion, cilantro). Choose at most " + MAX_CROPS + " crops, " +
          "only ids from the catalogue. In `understood`, restate their goal in one short sentence addressed to them.\n\n" +
          "Catalogue:\n" + CROP_CATALOGUE,
      },
      { role: "user", content: wishList },
    ], 0);
    const ids = [...new Set(out.crops)];
    return { crops: CROPS.filter((c) => ids.includes(c.id)), understood: out.understood, source: "model" };
  } catch {
    return keywordCrops(wishList);
  }
}

/** Fallback: match crop names and ids literally (singular or plural). */
export function keywordCrops(text: string): CropPick {
  const hay = text.toLowerCase();
  const crops = CROPS.filter((c) => {
    const words = [c.id, c.name.toLowerCase().split(/[ &]+/)[0]];
    return words.some((w) => new RegExp(`\\b${w}(e?s)?\\b`).test(hay));
  }).slice(0, MAX_CROPS);
  return {
    crops,
    understood: crops.length ? `Matched by name: ${crops.map((c) => c.name).join(", ")}.` : "",
    source: "keywords",
  };
}

// ---------------------------------------------------------------------------
// 2. Dated tasks + forecast -> weekend brief
// ---------------------------------------------------------------------------

export type BriefInput = {
  place: string;
  today: string;
  crops: string[];
  frostSummary: string;
  /** First day frost becomes possible in the next 12 months; null if it doesn't. */
  nextFrostRisk: string | null;
  forecast: { date: string; tmin: number | null; tmax: number | null; rainChance: number | null }[];
  tasks: { id: string; crop: string; action: string; date: string }[];
};

export type Brief = {
  headline: string;
  weekend: string;
  tips: Record<string, string>;
  source: "model" | "fallback";
};

// Small models copy field descriptions verbatim, so the format is taught by example instead.
const BRIEF_SYSTEM = `You are a practical garden coach. Your goal is to get the gardener outside this weekend.
Use only the facts you are given. Only mention crops from "Their crops". Only mention dates and temperatures that appear in the facts or forecast. Only warn about frost if the facts say a night is at or below 2°C or that frost becomes possible within three weeks.

Reply with JSON:
- headline: one sentence, in your own words, on what matters most in their garden right now.
- weekend: two or three sentences (under 60 words) naming one concrete outdoor garden job for Saturday or Sunday, based on the forecast.
- tips: one tip per task id, under 25 words, that a beginner can act on.

Example for a different garden (do not reuse its facts):
{"headline":"Your tomatoes have about three weeks left before frost becomes likely.","weekend":"Saturday is dry and mild at 15°C, so it's a good day to plant garlic cloves 5 cm deep and mulch them with straw. Pick any tomatoes that have started to colour; they will finish ripening indoors.","tips":[{"taskId":"garlic:fall-plant:2025","tip":"Plant the biggest cloves pointy end up, 15 cm apart, then cover with 10 cm of straw."}]}`;

const READABLE = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "Mon 9 Nov 2026": small models copy ISO dates verbatim into prose. */
export function readable(date: string): string {
  return READABLE.format(new Date(`${date}T00:00:00Z`)).replace(",", "");
}

const COLD_NIGHT_C = 2;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Facts the model would otherwise get wrong, computed up front. */
export function briefFacts(input: BriefInput): string[] {
  const nights = input.forecast.filter((d) => d.tmin != null);
  const facts: string[] = [];
  if (nights.length) {
    const coldest = nights.reduce((a, b) => (b.tmin! < a.tmin! ? b : a));
    facts.push(`Coldest night in the forecast: ${readable(coldest.date)} at ${coldest.tmin}°C.`);
    const cold = nights.filter((d) => d.tmin! <= COLD_NIGHT_C);
    facts.push(
      cold.length
        ? `Nights at or below ${COLD_NIGHT_C}°C: ${cold.map((d) => `${readable(d.date)} (${d.tmin}°C)`).join(", ")}.`
        : `No night in the forecast is at or below ${COLD_NIGHT_C}°C.`,
    );
  }
  facts.push(
    input.nextFrostRisk == null
      ? "Frost is not expected in the next 12 months."
      : input.nextFrostRisk <= input.today
        ? "Frost is possible now, based on past years."
        : `Based on past years, frost first becomes possible on ${readable(input.nextFrostRisk)} (in ${daysBetween(input.today, input.nextFrostRisk)} days).`,
  );
  return facts;
}

function briefPrompt(input: BriefInput): string {
  const forecast = input.forecast
    .map((d) => `- ${readable(d.date)}: low ${d.tmin ?? "?"}°C, high ${d.tmax ?? "?"}°C, rain ${d.rainChance ?? "?"}%`)
    .join("\n");
  const tasks = input.tasks.length
    ? input.tasks.map((t) => `- ${t.id}: ${t.action} ${t.crop} on ${readable(t.date)}`).join("\n")
    : "- none in the next few weeks";
  return [
    `Place: ${input.place}`,
    `Today: ${readable(input.today)}`,
    `Their crops: ${input.crops.length ? input.crops.join(", ") : "not chosen yet"}`,
    `Facts:\n${briefFacts(input).map((f) => `- ${f}`).join("\n")}`,
    `Frost history: ${input.frostSummary}`,
    `Forecast:\n${forecast}`,
    `Tasks (use these ids for tips):\n${tasks}`,
    "Write the JSON now.",
  ].join("\n\n");
}

/** Length limits can cut the model off mid-sentence; end on the last full one. */
export function wholeSentences(text: string): string {
  // Small models sometimes append their own word count, e.g. "(48 words)."
  const t = text.replace(/\s*\(\d+\s*words?\)\.?\s*$/i, "").trim();
  if (/[.!?]["')]?$/.test(t)) return t;
  const end = Math.max(t.lastIndexOf(". "), t.lastIndexOf("! "), t.lastIndexOf("? "));
  return end > 0 ? t.slice(0, end + 1) : t;
}

export async function writeBrief(input: BriefInput): Promise<Brief> {
  const taskIds = input.tasks.map((t) => t.id);
  const base = z.object({ headline: z.string().max(200), weekend: z.string().max(600) });
  const messages: Message[] = [
    { role: "system", content: BRIEF_SYSTEM },
    { role: "user", content: briefPrompt(input) },
  ];

  try {
    if (taskIds.length === 0) {
      const out = await chatJson(base, messages, 0.3);
      return { headline: wholeSentences(out.headline), weekend: wholeSentences(out.weekend), tips: {}, source: "model" };
    }
    const withTips = base.extend({
      tips: z.array(z.object({ taskId: z.enum(taskIds as [string, ...string[]]), tip: z.string().max(240) })).max(taskIds.length),
    });
    const out = await chatJson(withTips, messages, 0.3);
    const tips: Record<string, string> = {};
    for (const t of out.tips) tips[t.taskId] = wholeSentences(t.tip);
    return { headline: wholeSentences(out.headline), weekend: wholeSentences(out.weekend), tips, source: "model" };
  } catch {
    return fallbackBrief(input);
  }
}

export function fallbackBrief(input: BriefInput): Brief {
  const next = input.tasks[0];
  const cold = input.forecast.find((d) => d.tmin != null && d.tmin <= COLD_NIGHT_C);
  return {
    headline: next
      ? `Next up: ${next.action.toLowerCase()} ${next.crop.toLowerCase()} on ${readable(next.date)}.`
      : "Nothing is due in the next few weeks.",
    weekend: cold
      ? `Frost is possible on ${readable(cold.date)} (low ${cold.tmin}°C). Cover tender plants or bring pots in before then.`
      : "No frost in the forecast. A good weekend to clear beds, add compost and plan your plot.",
    tips: {},
    source: "fallback",
  };
}
