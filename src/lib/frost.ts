/**
 * Frost statistics from daily minimum temperatures.
 *
 * Each growing "season" is the 365 days centred on mid-summer (15 July in the
 * northern hemisphere, 15 January in the southern). Within a season the last
 * spring frost is the latest frost before the centre and the first fall frost
 * is the earliest one after it. Dates are kept as day offsets from the centre
 * so seasons from different years can be compared directly.
 */

export const FROST_C = 0;

const DAY_MS = 86_400_000;
const HALF_SEASON = 182;
/** A season needs this share of days with data to count. */
const MIN_COVERAGE = 0.9;

export type Hemisphere = "north" | "south";

export type DailyMin = { date: string; tmin: number | null };

/** Day offset from the season centre; null = no frost at this percentile (frost-free). */
export type Offset = number | null;

export type Percentiles = { p10: Offset; p50: Offset; p90: Offset };

export type FrostWindow = {
  hemisphere: Hemisphere;
  seasons: number;
  frostFreeSeasons: number;
  spring: Percentiles;
  fall: Percentiles;
  /** Median last spring frost, recent decade minus first decade, in days. Negative = earlier now. */
  springTrendDays: number | null;
};

export function hemisphereOf(latitude: number): Hemisphere {
  return latitude < 0 ? "south" : "north";
}

export function parseDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Midsummer of a season, as UTC ms. */
export function seasonCentre(year: number, hemisphere: Hemisphere): number {
  return hemisphere === "north" ? Date.UTC(year, 6, 15) : Date.UTC(year, 0, 15);
}

export function offsetToDate(year: number, hemisphere: Hemisphere, offset: number): string {
  return formatDay(seasonCentre(year, hemisphere) + offset * DAY_MS);
}

/** Nearest-rank percentile; -Infinity / Infinity stand for "no frost" and map to null. */
function percentile(sorted: number[], p: number): Offset {
  const value = sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return Number.isFinite(value) ? value : null;
}

function median(values: number[]): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}

export function computeFrostWindow(days: DailyMin[], latitude: number): FrostWindow | null {
  const hemisphere = hemisphereOf(latitude);
  const byDay = new Map<number, number>();
  for (const d of days) if (d.tmin != null) byDay.set(parseDay(d.date), d.tmin);
  if (byDay.size === 0) return null;

  const keys = [...byDay.keys()];
  const first = Math.min(...keys);
  const last = Math.max(...keys);
  const firstYear = new Date(first).getUTCFullYear();
  const lastYear = new Date(last).getUTCFullYear();

  // Offsets per season, oldest first. -Infinity / Infinity = no frost that side.
  const springs: number[] = [];
  const falls: number[] = [];
  let frostFree = 0;

  for (let year = firstYear; year <= lastYear + 1; year++) {
    const centre = seasonCentre(year, hemisphere);
    const start = centre - HALF_SEASON * DAY_MS;
    const end = centre + HALF_SEASON * DAY_MS;
    if (start < first || end > last) continue;

    let covered = 0;
    let lastSpring = -Infinity;
    let firstFall = Infinity;
    for (let offset = -HALF_SEASON; offset <= HALF_SEASON; offset++) {
      const tmin = byDay.get(centre + offset * DAY_MS);
      if (tmin == null) continue;
      covered++;
      if (tmin > FROST_C) continue;
      if (offset < 0) lastSpring = offset;
      else if (firstFall === Infinity) firstFall = offset;
    }
    if (covered < MIN_COVERAGE * (2 * HALF_SEASON + 1)) continue;

    springs.push(lastSpring);
    falls.push(firstFall);
    if (lastSpring === -Infinity && firstFall === Infinity) frostFree++;
  }

  if (springs.length === 0) return null;

  const springSorted = [...springs].sort((a, b) => a - b);
  const fallSorted = [...falls].sort((a, b) => a - b);

  let springTrendDays: number | null = null;
  if (springs.length >= 20) {
    const early = median(springs.slice(0, 10));
    const recent = median(springs.slice(-10));
    if (early != null && recent != null) springTrendDays = Math.round(recent - early);
  }

  return {
    hemisphere,
    seasons: springs.length,
    frostFreeSeasons: frostFree,
    spring: { p10: percentile(springSorted, 0.1), p50: percentile(springSorted, 0.5), p90: percentile(springSorted, 0.9) },
    fall: { p10: percentile(fallSorted, 0.1), p50: percentile(fallSorted, 0.5), p90: percentile(fallSorted, 0.9) },
    springTrendDays,
  };
}
