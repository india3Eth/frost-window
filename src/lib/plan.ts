import { type ForecastDay, type Place, geocode, getForecast, getHistory, historyRange, localToday } from "./climate";
import { type FrostWindow, computeFrostWindow } from "./frost";
import { type Brief, OLLAMA_MODEL, pickCrops, readable, writeBrief } from "./llm";
import { ACTION_LABEL } from "./labels";
import { type FrostDates, type Schedule, type Segment, buildSchedule, frostTimeline, upcomingFrostDates } from "./schedule";

/** How far ahead the brief looks when choosing tasks to write tips for. */
const BRIEF_WINDOW_DAYS = 45;
const BRIEF_MAX_TASKS = 10;

export type PlanResponse = {
  place: Place;
  today: string;
  frost: FrostWindow;
  dates: FrostDates;
  timeline: Segment[];
  forecast: ForecastDay[];
  picked: { crops: { id: string; name: string }[]; understood: string; source: "model" | "keywords" };
  schedule: Schedule;
  brief: Brief;
  model: string;
};

export class PlanError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function frostSummary(dates: FrostDates, frost: FrostWindow): string {
  const { spring, fall } = dates;
  const parts = [`Based on ${frost.seasons} seasons of weather.`];
  parts.push(
    spring.p50 && spring.p90
      ? `Median last spring frost ${readable(spring.p50)}; frost still possible until ${readable(spring.p90)} in 1 year out of 10.`
      : spring.p90
        ? `Spring frost happens in fewer than half of years; 1 year in 10 still has frost until ${readable(spring.p90)}.`
        : "Spring frost is rare here.",
  );
  parts.push(
    fall.p50 && fall.p10
      ? `Median first fall frost ${readable(fall.p50)}; 1 year in 10 has frost by ${readable(fall.p10)}.`
      : fall.p10
        ? `Fall frost happens in fewer than half of years; 1 year in 10 has frost by ${readable(fall.p10)}.`
        : "Fall frost is rare here.",
  );
  return parts.join(" ");
}

export async function buildPlan(placeQuery: string, wishList: string): Promise<PlanResponse> {
  const place = await geocode(placeQuery);
  if (!place) throw new PlanError(`Couldn't find "${placeQuery}". Try a city name.`, 404);

  const today = localToday(place.timezone);
  const { start, end } = historyRange(today);
  const lat = Math.round(place.latitude * 100) / 100;
  const lon = Math.round(place.longitude * 100) / 100;

  const [history, forecast, picked] = await Promise.all([
    getHistory(lat, lon, start, end),
    getForecast(lat, lon),
    pickCrops(wishList),
  ]);

  const frost = computeFrostWindow(history, place.latitude);
  if (!frost) throw new PlanError("Not enough weather history for this location.", 422);

  const dates = upcomingFrostDates(frost, today);
  const schedule = buildSchedule(picked.crops, frost, today);

  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + BRIEF_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const soon = schedule.tasks.filter((t) => t.date <= horizon).slice(0, BRIEF_MAX_TASKS);

  const timeline = frostTimeline(frost, today);
  const brief = await writeBrief({
    place: `${place.name}, ${place.region}`,
    today,
    crops: picked.crops.map((c) => c.name),
    frostSummary: frostSummary(dates, frost),
    nextFrostRisk: timeline[0]?.from ?? null,
    forecast,
    tasks: soon.map((t) => ({ id: t.id, crop: t.cropName, action: ACTION_LABEL[t.kind], date: t.date })),
  });

  return {
    place,
    today,
    frost,
    dates,
    timeline,
    forecast,
    picked: { crops: picked.crops.map((c) => ({ id: c.id, name: c.name })), understood: picked.understood, source: picked.source },
    schedule,
    brief,
    model: OLLAMA_MODEL,
  };
}
