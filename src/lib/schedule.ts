/**
 * Turns frost statistics + chosen crops into dated garden tasks.
 *
 * Dates are decided here, in plain code, never by the model. Tender crops are
 * planned against the date after which only 1 year in 10 still saw frost;
 * hardier crops against the median. Tender harvests are due before the date
 * on which 1 year in 10 already had its first fall frost.
 */

import type { Crop } from "./crops";
import {
  type FrostWindow,
  type Offset,
  formatDay,
  offsetToDate,
  parseDay,
  seasonCentre,
} from "./frost";

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const HORIZON_DAYS = 365;
/** Tasks a few days overdue are still worth showing. */
const GRACE_DAYS = 3;
/** Without a fall frost to plan against, a missed planting stays open this long. */
const OPEN_SEASON_DAYS = 120;

export type TaskKind = "start-indoors" | "transplant" | "direct-sow" | "fall-plant" | "harvest-before-frost";

export type Task = {
  id: string;
  cropId: string;
  cropName: string;
  kind: TaskKind;
  date: string;
  /** Which frost statistic the date was derived from, in words. */
  basis: string;
  harvestFrom?: string;
  /** Latest planting date that still leaves time to harvest before frost. */
  plantBy?: string;
  warning?: string;
};

export type Schedule = {
  tasks: Task[];
  /** Crops whose timing frost does not decide here (no frost in most years). */
  unconstrained: { cropId: string; cropName: string }[];
};

/** The season whose midsummer is the most recent one on or before `today`. */
export function currentSeasonYear(today: string, hemisphere: FrostWindow["hemisphere"]): number {
  const ms = parseDay(today);
  const year = new Date(ms).getUTCFullYear();
  return seasonCentre(year, hemisphere) <= ms ? year : year - 1;
}

/** Tender crops wait for the 1-in-10 date; hardier ones work off the median. */
function springReference(crop: Crop, frost: FrostWindow): { offset: Offset; anchor: string } {
  return crop.frost === "tender"
    ? { offset: frost.spring.p90, anchor: "the date after which only 1 spring in 10 still had frost" }
    : { offset: frost.spring.p50, anchor: "the median last spring frost" };
}

function addDays(date: string, days: number): string {
  return formatDay(parseDay(date) + days * DAY_MS);
}

function weeksLabel(weeks: number, anchor: string): string {
  if (weeks === 0) return `at ${anchor}`;
  const n = Math.abs(weeks);
  return `${n} week${n === 1 ? "" : "s"} ${weeks < 0 ? "before" : "after"} ${anchor}`;
}

function cropTasks(crop: Crop, frost: FrostWindow, seasonYear: number): Task[] {
  const tasks: Task[] = [];
  const { hemisphere } = frost;
  const make = (kind: TaskKind, date: string, basis: string, extra: Partial<Task> = {}): Task => ({
    id: `${crop.id}:${kind}:${seasonYear}`,
    cropId: crop.id,
    cropName: crop.name,
    kind,
    date,
    basis,
    ...extra,
  });

  const fallRisk = frost.fall.p10 == null ? null : offsetToDate(seasonYear, hemisphere, frost.fall.p10);
  // Tender crops must be harvested before the early (1-in-10) fall frost; hardier ones can run to the median.
  const fallLimitOffset = crop.frost === "tender" ? frost.fall.p10 : frost.fall.p50;
  const fallLimit = fallLimitOffset == null ? null : offsetToDate(seasonYear, hemisphere, fallLimitOffset);

  const spring = springReference(crop, frost);
  if (spring.offset != null) {
    const anchor = offsetToDate(seasonYear, hemisphere, spring.offset);

    if (crop.startIndoorsWeeks != null) {
      tasks.push(make("start-indoors", addDays(anchor, crop.startIndoorsWeeks * WEEK_DAYS), weeksLabel(crop.startIndoorsWeeks, spring.anchor)));
    }

    const plantWeeks = crop.transplantWeeks ?? crop.directSowWeeks;
    if (plantWeeks != null) {
      const kind: TaskKind = crop.transplantWeeks != null ? "transplant" : "direct-sow";
      const date = addDays(anchor, plantWeeks * WEEK_DAYS);
      const harvestFrom = addDays(date, crop.daysToMaturity);
      const plantBy = fallLimit == null ? addDays(date, OPEN_SEASON_DAYS) : addDays(fallLimit, -crop.daysToMaturity);
      const tooLate = crop.frost === "tender" && fallRisk != null && harvestFrom > fallRisk;
      tasks.push(
        make(kind, date, weeksLabel(plantWeeks, spring.anchor), {
          harvestFrom,
          plantBy,
          ...(tooLate ? { warning: `Needs ${crop.daysToMaturity} days; fall frost risk starts ${fallRisk}. Pick a fast variety or start earlier under cover.` } : {}),
        }),
      );
    }
  }

  if (crop.fallPlantWeeks != null && frost.fall.p50 != null) {
    const firstFrost = offsetToDate(seasonYear, hemisphere, frost.fall.p50);
    tasks.push(make("fall-plant", addDays(firstFrost, -crop.fallPlantWeeks * WEEK_DAYS), weeksLabel(-crop.fallPlantWeeks, "the median first fall frost")));
  }

  if (crop.frost === "tender" && fallRisk != null) {
    tasks.push(make("harvest-before-frost", fallRisk, "1 fall in 10 has frost by this date"));
  }

  return tasks;
}

export function buildSchedule(crops: Crop[], frost: FrostWindow, today: string): Schedule {
  const start = parseDay(today) - GRACE_DAYS * DAY_MS;
  const end = parseDay(today) + HORIZON_DAYS * DAY_MS;
  const season = currentSeasonYear(today, frost.hemisphere);

  const tasks: Task[] = [];
  const unconstrained: Schedule["unconstrained"] = [];

  for (const crop of crops) {
    // Three seasons: in late spring (or the southern spring) the next season's planting dates may already be past.
    const all = [season, season + 1, season + 2].flatMap((year) => cropTasks(crop, frost, year));
    if (all.length === 0) unconstrained.push({ cropId: crop.id, cropName: crop.name });

    for (const t of all) {
      const ms = parseDay(t.date);
      if (ms >= start && ms <= end) {
        tasks.push(t);
      } else if (ms < start && t.plantBy && t.plantBy >= today) {
        // Missed the usual date, but there is still time to get a harvest in.
        tasks.push({
          ...t,
          date: today,
          basis: `The usual date (${t.date}) has passed, but there's still time to harvest before frost`,
          harvestFrom: addDays(today, crop.daysToMaturity),
        });
      }
    }
  }

  tasks.sort((a, b) => a.date.localeCompare(b.date) || a.cropName.localeCompare(b.cropName));
  return { tasks, unconstrained };
}

export type Segment = { from: string; to: string; kind: "frost-likely" | "frost-risk" };

/**
 * Frost periods over the next 12 months. "frost-likely" runs between the median
 * first fall frost and the median last spring frost; "frost-risk" covers the
 * 1-in-10 tails either side of it.
 */
export function frostTimeline(frost: FrostWindow, today: string): Segment[] {
  const { hemisphere, spring, fall } = frost;
  const end = formatDay(parseDay(today) + HORIZON_DAYS * DAY_MS);
  const at = (year: number, offset: Offset) => (offset == null ? null : offsetToDate(year, hemisphere, offset));
  const season = currentSeasonYear(today, hemisphere);

  const segments: Segment[] = [];
  const add = (kind: Segment["kind"], from: string | null, to: string | null) => {
    if (from == null || to == null) return;
    const clippedFrom = from < today ? today : from;
    const clippedTo = to > end ? end : to;
    if (clippedFrom < clippedTo) segments.push({ from: clippedFrom, to: clippedTo, kind });
  };

  for (const year of [season - 1, season, season + 1]) {
    if (fall.p50 != null && spring.p50 != null) {
      add("frost-risk", at(year, fall.p10), at(year, fall.p50));
      add("frost-likely", at(year, fall.p50), at(year + 1, spring.p50));
      add("frost-risk", at(year + 1, spring.p50), at(year + 1, spring.p90));
    } else {
      // Frost in fewer than half of years: only the 1-in-10 window, if any.
      add("frost-risk", at(year, fall.p10), at(year + 1, spring.p90));
    }
  }
  return segments.sort((a, b) => a.from.localeCompare(b.from));
}

export type FrostDates = {
  spring: { season: number; p10: string | null; p50: string | null; p90: string | null };
  fall: { season: number; p10: string | null; p50: string | null; p90: string | null };
};

/** Calendar dates for the next spring and the nearest fall that hasn't fully passed. */
export function upcomingFrostDates(frost: FrostWindow, today: string): FrostDates {
  const season = currentSeasonYear(today, frost.hemisphere);
  const toDate = (year: number, offset: Offset) => (offset == null ? null : offsetToDate(year, frost.hemisphere, offset));

  const thisFallEnd = toDate(season, frost.fall.p90);
  const fallSeason = thisFallEnd != null && thisFallEnd >= today ? season : season + 1;

  // Next season's spring frosts may already be behind us (late spring, or the southern spring in October).
  const springEnd = (year: number) => toDate(year, frost.spring.p90 ?? frost.spring.p50);
  const springSeason = [season + 1, season + 2].find((y) => (springEnd(y) ?? today) >= today) ?? season + 1;

  return {
    spring: {
      season: springSeason,
      p10: toDate(springSeason, frost.spring.p10),
      p50: toDate(springSeason, frost.spring.p50),
      p90: toDate(springSeason, frost.spring.p90),
    },
    fall: { season: fallSeason, p10: toDate(fallSeason, frost.fall.p10), p50: toDate(fallSeason, frost.fall.p50), p90: toDate(fallSeason, frost.fall.p90) },
  };
}
