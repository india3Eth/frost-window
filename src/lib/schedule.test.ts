import { describe, expect, it } from "vitest";
import { getCrop } from "./crops";
import type { FrostWindow } from "./frost";
import { buildSchedule, currentSeasonYear, frostTimeline, upcomingFrostDates } from "./schedule";

// Season centre 15 July: spring p50 = 13 April, p90 = 22 April; fall p10 = 18 October, p50 = 28 October.
const NYC_LIKE: FrostWindow = {
  hemisphere: "north",
  seasons: 30,
  frostFreeSeasons: 0,
  spring: { p10: -105, p50: -93, p90: -84 },
  fall: { p10: 95, p50: 105, p90: 118 },
  springTrendDays: null,
};

// Southern season centre 15 January; frost in a minority of winters.
const MELBOURNE_LIKE: FrostWindow = {
  hemisphere: "south",
  seasons: 31,
  frostFreeSeasons: 24,
  spring: { p10: null, p50: null, p90: -180 },
  fall: { p10: 176, p50: null, p90: null },
  springTrendDays: null,
};

const crops = (...ids: string[]) => ids.map((id) => getCrop(id)!);

describe("currentSeasonYear", () => {
  it("rolls over at midsummer", () => {
    expect(currentSeasonYear("2026-07-14", "north")).toBe(2025);
    expect(currentSeasonYear("2026-07-15", "north")).toBe(2026);
    expect(currentSeasonYear("2026-01-14", "south")).toBe(2025);
    expect(currentSeasonYear("2026-10-07", "south")).toBe(2026);
  });
});

describe("buildSchedule", () => {
  it("plans tender crops after the 1-in-10 date and hardy crops off the median", () => {
    const { tasks } = buildSchedule(crops("tomato", "pea"), NYC_LIKE, "2026-10-07");
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));

    expect(byId["tomato:start-indoors:2027"].date).toBe("2027-03-04"); // 22 Apr - 7 weeks
    expect(byId["tomato:transplant:2027"].date).toBe("2027-05-06"); // 22 Apr + 2 weeks
    expect(byId["tomato:transplant:2027"].harvestFrom).toBe("2027-07-20");
    expect(byId["pea:direct-sow:2027"].date).toBe("2027-03-16"); // 13 Apr - 4 weeks
    // this fall's tender harvest deadline is still ahead on 7 October
    expect(byId["tomato:harvest-before-frost:2026"].date).toBe("2026-10-18");
  });

  it("keeps only the next 12 months, sorted by date", () => {
    const { tasks } = buildSchedule(crops("garlic", "tomato", "spinach"), NYC_LIKE, "2026-10-07");
    const dates = tasks.map((t) => t.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((d) => d >= "2026-10-04" && d <= "2027-10-07")).toBe(true);
    // garlic goes in 4 weeks before the median first frost: 28 Oct - 28 days
    expect(tasks.find((t) => t.id === "garlic:fall-plant:2026")).toBeUndefined(); // 30 Sep is past
    expect(tasks.find((t) => t.id === "garlic:fall-plant:2027")?.date).toBe("2027-09-30");
  });

  it("warns when a tender crop cannot mature before fall frost", () => {
    const short: FrostWindow = { ...NYC_LIKE, spring: { p10: -40, p50: -30, p90: -20 }, fall: { p10: 30, p50: 40, p90: 50 } };
    const { tasks } = buildSchedule(crops("pumpkin"), short, "2026-10-07");
    expect(tasks.find((t) => t.kind === "direct-sow")?.warning).toMatch(/100 days/);
  });

  it("offers a catch-up planting when the usual date passed but a harvest still fits", () => {
    // Southern October: basil's planting date (2 Aug) has passed, frost risk returns 10 Jul 2027.
    const { tasks } = buildSchedule(crops("basil"), MELBOURNE_LIKE, "2026-10-07");
    const now = tasks.find((t) => t.kind === "transplant" && t.date === "2026-10-07");
    expect(now?.basis).toMatch(/usual date \(2026-08-02\) has passed/);
    expect(now?.harvestFrom).toBe("2026-12-06");
    // and the following winter's planting is still listed
    expect(tasks.find((t) => t.id === "basil:start-indoors:2028")?.date).toBe("2027-06-07"); // 19 Jul - 6 weeks
  });

  it("does not offer a catch-up when the crop could not mature before frost", () => {
    // 7 October in the north: too late for tomatoes this year.
    const { tasks } = buildSchedule(crops("tomato", "radish"), NYC_LIKE, "2026-10-07");
    expect(tasks.some((t) => t.cropId === "tomato" && t.date === "2026-10-07")).toBe(false);
    // radishes need 28 days and must beat the median first frost (28 Oct): the last sowing date was 30 Sep
    expect(tasks.some((t) => t.cropId === "radish" && t.date === "2026-10-07")).toBe(false);
  });

  it("lists crops that frost does not constrain", () => {
    const tropical: FrostWindow = {
      ...NYC_LIKE,
      frostFreeSeasons: 30,
      spring: { p10: null, p50: null, p90: null },
      fall: { p10: null, p50: null, p90: null },
    };
    const result = buildSchedule(crops("tomato", "garlic"), tropical, "2026-10-07");
    expect(result.tasks).toEqual([]);
    expect(result.unconstrained.map((c) => c.cropId)).toEqual(["tomato", "garlic"]);
  });
});

describe("frostTimeline", () => {
  it("covers this winter and next fall, clipped to 12 months", () => {
    expect(frostTimeline(NYC_LIKE, "2026-10-07")).toEqual([
      { from: "2026-10-18", to: "2026-10-28", kind: "frost-risk" },
      { from: "2026-10-28", to: "2027-04-13", kind: "frost-likely" },
      { from: "2027-04-13", to: "2027-04-22", kind: "frost-risk" },
    ]);
  });

  it("starts mid-winter when today is already inside the frost season", () => {
    expect(frostTimeline(NYC_LIKE, "2027-01-10")[0]).toEqual({ from: "2027-01-10", to: "2027-04-13", kind: "frost-likely" });
  });

  it("is empty for frost-free places", () => {
    const tropical: FrostWindow = { ...NYC_LIKE, spring: { p10: null, p50: null, p90: null }, fall: { p10: null, p50: null, p90: null } };
    expect(frostTimeline(tropical, "2026-10-07")).toEqual([]);
  });
});

describe("upcomingFrostDates", () => {
  it("shows next spring and this fall while it is still ahead", () => {
    const d = upcomingFrostDates(NYC_LIKE, "2026-10-07");
    expect(d.spring).toMatchObject({ season: 2027, p50: "2027-04-13", p90: "2027-04-22" });
    expect(d.fall).toMatchObject({ season: 2026, p10: "2026-10-18", p50: "2026-10-28" });
  });

  it("moves to next fall once this one has passed", () => {
    expect(upcomingFrostDates(NYC_LIKE, "2026-12-01").fall.season).toBe(2027);
  });

  it("skips a spring that has already passed", () => {
    // 1 June: the 2026 season's spring frosts (April) are behind us, so show 2027's.
    expect(upcomingFrostDates(NYC_LIKE, "2026-06-01").spring).toMatchObject({ season: 2027, p50: "2027-04-13" });
    // Southern October: last winter's frosts are past; the next ones are in 2027's winter.
    expect(upcomingFrostDates(MELBOURNE_LIKE, "2026-10-07").spring).toMatchObject({ season: 2028, p90: "2027-07-19" });
  });
});
