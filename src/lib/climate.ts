/**
 * Open-Meteo: geocoding, ~30 years of daily minimum temperatures, and a
 * 16-day forecast. Free, no API key. Weather data by Open-Meteo.com (CC BY 4.0).
 */

import { cacheLife } from "next/cache";
import type { DailyMin } from "./frost";

const HISTORY_YEARS = 31;
/** The archive lags real time by a few days. */
const ARCHIVE_LAG_DAYS = 7;

export type Place = {
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type ForecastDay = { date: string; tmin: number | null; tmax: number | null; rainChance: number | null };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} for ${new URL(url).pathname}`);
  return (await res.json()) as T;
}

export async function geocode(query: string): Promise<Place | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(query)}`;
  const data = await getJson<{
    results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string }[];
  }>(url);
  const hit = data.results?.[0];
  if (!hit) return null;
  return {
    name: hit.name,
    region: [hit.admin1, hit.country].filter(Boolean).join(", "),
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone ?? "UTC",
  };
}

/** Today's date (YYYY-MM-DD) in the place's own time zone. */
export function localToday(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

function shiftYears(date: string, years: number): string {
  return `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;
}

function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function historyRange(today: string): { start: string; end: string } {
  return { start: `${shiftYears(today, -HISTORY_YEARS).slice(0, 4)}-01-01`, end: shiftDays(today, -ARCHIVE_LAG_DAYS) };
}

/** Daily minimum temperatures. Cached: the past does not change. */
export async function getHistory(latitude: number, longitude: number, start: string, end: string): Promise<DailyMin[]> {
  "use cache";
  cacheLife("days");

  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${start}&end_date=${end}&daily=temperature_2m_min&timezone=auto`;
  const data = await getJson<{ daily?: { time: string[]; temperature_2m_min: (number | null)[] } }>(url);
  const time = data.daily?.time ?? [];
  const tmin = data.daily?.temperature_2m_min ?? [];
  return time.map((date, i) => ({ date, tmin: tmin[i] ?? null }));
}

export async function getForecast(latitude: number, longitude: number): Promise<ForecastDay[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max&forecast_days=16&timezone=auto`;
  const data = await getJson<{
    daily?: {
      time: string[];
      temperature_2m_min: (number | null)[];
      temperature_2m_max: (number | null)[];
      precipitation_probability_max: (number | null)[];
    };
  }>(url);
  const d = data.daily;
  if (!d) return [];
  return d.time.map((date, i) => ({
    date,
    tmin: d.temperature_2m_min[i] ?? null,
    tmax: d.temperature_2m_max[i] ?? null,
    rainChance: d.precipitation_probability_max[i] ?? null,
  }));
}
