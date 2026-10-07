import { describe, expect, it } from "vitest";
import { type DailyMin, computeFrostWindow, formatDay, offsetToDate, seasonCentre } from "./frost";

const DAY_MS = 86_400_000;

/** Daily data from `from` to `to`, warm except on the given frost days (ms). */
function series(from: string, to: string, frostDays: Set<number>): DailyMin[] {
  const out: DailyMin[] = [];
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= Date.parse(`${to}T00:00:00Z`); ms += DAY_MS) {
    out.push({ date: formatDay(ms), tmin: frostDays.has(ms) ? -2 : 8 });
  }
  return out;
}

describe("computeFrostWindow", () => {
  it("finds last spring and first fall frost per northern season", () => {
    const frost = new Set<number>();
    for (let year = 1995; year <= 2025; year++) {
      const centre = seasonCentre(year, "north");
      // last spring frost drifts between 90 and 94 days before midsummer
      frost.add(centre - (90 + (year % 5)) * DAY_MS);
      frost.add(centre - 120 * DAY_MS);
      // first fall frost between 100 and 102 days after
      frost.add(centre + (100 + (year % 3)) * DAY_MS);
      frost.add(centre + 150 * DAY_MS);
    }
    const w = computeFrostWindow(series("1994-12-01", "2026-06-30", frost), 40.7)!;

    expect(w.hemisphere).toBe("north");
    expect(w.seasons).toBe(31);
    expect(w.frostFreeSeasons).toBe(0);
    expect(w.spring.p50).toBe(-92);
    expect(w.spring.p90).toBe(-90);
    expect(w.spring.p10).toBe(-94);
    expect(w.fall.p10).toBe(100);
    expect(w.fall.p90).toBe(102);
    // 15 July minus 90 days
    expect(offsetToDate(2027, "north", -90)).toBe("2027-04-16");
  });

  it("anchors southern seasons on mid-January", () => {
    const frost = new Set<number>();
    for (let year = 1996; year <= 2025; year++) frost.add(seasonCentre(year, "south") - 100 * DAY_MS);
    const w = computeFrostWindow(series("1995-01-01", "2025-12-31", frost), -35)!;

    expect(w.hemisphere).toBe("south");
    expect(w.spring.p50).toBe(-100);
    expect(offsetToDate(2027, "south", -100)).toBe("2026-10-07");
    expect(w.fall.p50).toBeNull();
  });

  it("reports frost-free climates as null percentiles", () => {
    const w = computeFrostWindow(series("1995-01-01", "2025-12-31", new Set()), 23)!;
    expect(w.frostFreeSeasons).toBe(w.seasons);
    expect(w.spring).toEqual({ p10: null, p50: null, p90: null });
    expect(w.fall).toEqual({ p10: null, p50: null, p90: null });
  });

  it("skips seasons with too many missing days", () => {
    const days = series("1995-01-01", "2000-12-31", new Set()).map((d) =>
      d.date.startsWith("1998") ? { ...d, tmin: null } : d,
    );
    const w = computeFrostWindow(days, 40)!;
    // Seasons run mid-Jan to mid-Jan: 1995-1997 and 1999 count; 1998 is all missing; 2000 runs past the data
    expect(w.seasons).toBe(4);
  });

  it("measures a trend in the median last frost", () => {
    const frost = new Set<number>();
    for (let year = 1995; year <= 2024; year++) {
      const early = year < 2005;
      const recent = year >= 2015;
      frost.add(seasonCentre(year, "north") - (early ? 80 : recent ? 95 : 88) * DAY_MS);
    }
    const w = computeFrostWindow(series("1994-12-01", "2025-06-30", frost), 45)!;
    expect(w.springTrendDays).toBe(-15);
  });

  it("returns null without data", () => {
    expect(computeFrostWindow([], 10)).toBeNull();
  });
});
