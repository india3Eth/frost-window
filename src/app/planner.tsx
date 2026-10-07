"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ACTION_LABEL } from "@/lib/labels";
import type { PlanResponse } from "@/lib/plan";
import type { Segment, Task, TaskKind } from "@/lib/schedule";

const EXAMPLES = [
  { place: "Brooklyn", garden: "Small raised bed. I want to make salsa this summer, my kid loves snap peas, and zucchini bread is a must." },
  { place: "Toronto", garden: "Pumpkins for Halloween with the kids, plus garlic and some salad greens." },
  { place: "Melbourne", garden: "A balcony herb garden: basil for pesto, cilantro for tacos, and lettuce for lunches." },
  { place: "Ahmedabad", garden: "Tomatoes and chillies for chutney, and marigolds for the doorway." },
];

const STEPS = [
  "Finding your place…",
  "Reading thirty years of daily temperatures…",
  "Asking the local model what to plant…",
  "Writing your weekend brief…",
];

const DAY_MS = 86_400_000;

const fmt = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(`${date}T00:00:00Z`));

const dayMonth = (date: string) => fmt(date, { day: "numeric", month: "short" });
const weekdayDayMonth = (date: string) => fmt(date, { weekday: "short", day: "numeric", month: "short" });

export default function Planner() {
  const [place, setPlace] = useState(EXAMPLES[0].place);
  const [garden, setGarden] = useState(EXAMPLES[0].garden);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place, garden }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setPlan(data as PlanResponse);
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
        <label className="block text-sm font-medium" htmlFor="place">
          Where is your garden?
        </label>
        <input
          id="place"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-leaf"
          placeholder="City or town"
          required
        />
        <label className="mt-4 block text-sm font-medium" htmlFor="garden">
          What do you want from it?
        </label>
        <textarea
          id="garden"
          value={garden}
          onChange={(e) => setGarden(e.target.value)}
          rows={3}
          className="mt-1.5 w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-leaf"
          placeholder="Dishes you want to cook, what the kids like, how much space you have…"
          required
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-leaf px-4 py-2 font-medium text-card transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Planning…" : "Plan my garden"}
          </button>
          <span className="text-xs text-muted">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.place}
              type="button"
              onClick={() => {
                setPlace(ex.place);
                setGarden(ex.garden);
              }}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-leaf hover:text-ink"
            >
              {ex.place}
            </button>
          ))}
        </div>
      </form>

      {loading && <Progress />}
      {error && <p className="rounded-xl border border-danger/40 bg-card p-4 text-danger">{error}</p>}
      {plan && !loading && <Result plan={plan} />}
    </div>
  );
}

function Progress() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-5 text-muted" role="status">
      <span className="h-3 w-3 animate-pulse rounded-full bg-leaf" />
      {STEPS[step]}
    </div>
  );
}

function Result({ plan }: { plan: PlanResponse }) {
  const { place, brief, picked, schedule, dates, frost } = plan;
  const frostFree = frost.spring.p90 == null && frost.fall.p10 == null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {place.name}
            <span className="font-normal text-muted">, {place.region}</span>
          </h2>
          <ModelBadge source={brief.source} model={plan.model} />
        </div>
        <p className="mt-3 text-xl leading-snug font-medium">{brief.headline}</p>
        <div className="mt-4 rounded-xl bg-leaf-soft p-4">
          <p className="text-xs font-semibold tracking-wide text-leaf uppercase">This weekend</p>
          <p className="mt-1 leading-relaxed">{brief.weekend}</p>
        </div>
        <Forecast days={plan.forecast} />
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Your frost window</h2>
        {frostFree ? (
          <p className="mt-2 text-muted">
            No frost in {frost.seasons} seasons of records here. Frost won&apos;t limit your planting; heat and rain will.
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FrostStat
                title="Last spring frost"
                median={dates.spring.p50}
                tail={dates.spring.p90}
                tailLabel="1 year in 10 still frosts until"
              />
              <FrostStat
                title="First fall frost"
                median={dates.fall.p50}
                tail={dates.fall.p10}
                tailLabel="1 year in 10 frosts by"
              />
            </div>
            <Timeline segments={plan.timeline} today={plan.today} />
          </>
        )}
        <p className="mt-3 text-xs text-muted">
          From {frost.seasons} seasons of daily minimums at your location.
          {frost.springTrendDays != null && frost.springTrendDays !== 0 && (
            <>
              {" "}
              The last spring frost now comes {Math.abs(frost.springTrendDays)} days{" "}
              {frost.springTrendDays < 0 ? "earlier" : "later"} than it did thirty years ago.
            </>
          )}
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Your plan for the next 12 months</h2>
        {picked.understood && <p className="mt-1 text-muted">{picked.understood}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {picked.crops.map((c) => (
            <span key={c.id} className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-sm text-leaf">
              {c.name}
            </span>
          ))}
          {picked.source === "keywords" && <span className="text-xs text-muted">(matched by name; model offline)</span>}
        </div>
        {picked.crops.length === 0 && (
          <p className="mt-3 text-muted">I couldn&apos;t match any crops. Try naming a few vegetables or dishes.</p>
        )}
        {schedule.unconstrained.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Frost doesn&apos;t set the timing for {schedule.unconstrained.map((c) => c.cropName).join(", ")} here. Plant
            them in your local growing season.
          </p>
        )}
        <TaskList tasks={schedule.tasks} tips={brief.tips} />
      </section>
    </div>
  );
}

function ModelBadge({ source, model }: { source: "model" | "fallback"; model: string }) {
  return source === "model" ? (
    <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-xs text-muted" title="Open weights, running locally via Ollama">
      {model} · local
    </span>
  ) : (
    <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">model offline · rule-based brief</span>
  );
}

function FrostStat({ title, median, tail, tailLabel }: { title: string; median: string | null; tail: string | null; tailLabel: string }) {
  return (
    <div className="rounded-xl bg-frost-faint p-4">
      <p className="text-xs font-semibold tracking-wide text-frost uppercase">{title}</p>
      <p className="mt-1 text-2xl font-semibold">{median ? dayMonth(median) : "Rare"}</p>
      <p className="text-sm text-muted">{median ? "in a typical year" : "less than half of years"}</p>
      {tail && (
        <p className="mt-2 text-sm">
          {tailLabel} <strong>{dayMonth(tail)}</strong>
        </p>
      )}
    </div>
  );
}

function Timeline({ segments, today }: { segments: Segment[]; today: string }) {
  const start = Date.parse(`${today}T00:00:00Z`);
  const span = 365 * DAY_MS;
  const pct = (date: string) => ((Date.parse(`${date}T00:00:00Z`) - start) / span) * 100;

  // First day of each month after today, within the 12-month window.
  const months: string[] = [];
  const d = new Date(start);
  d.setUTCDate(1);
  for (let i = 0; i < 12; i++) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (pct(iso) < 100) months.push(iso);
  }

  return (
    <div className="mt-5">
      <div className="relative h-8 overflow-hidden rounded-lg bg-leaf-soft" aria-label="Frost over the next 12 months">
        {segments.map((s) => (
          <div
            key={`${s.kind}-${s.from}`}
            className={`absolute inset-y-0 ${s.kind === "frost-likely" ? "bg-frost" : "bg-frost-soft"}`}
            style={{ left: `${pct(s.from)}%`, width: `${pct(s.to) - pct(s.from)}%` }}
            title={`${s.kind === "frost-likely" ? "Frost likely" : "Frost possible"}: ${dayMonth(s.from)} – ${dayMonth(s.to)}`}
          />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-muted">
        {months.map((m) => (
          <span key={m} className="absolute -translate-x-1/2" style={{ left: `${pct(m)}%` }}>
            {fmt(m, { month: "short" })}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <Legend className="bg-leaf-soft" label="Growing season" />
        <Legend className="bg-frost-soft" label="Frost possible" />
        <Legend className="bg-frost" label="Frost likely" />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

function Forecast({ days }: { days: PlanResponse["forecast"] }) {
  if (days.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Next 16 nights</p>
      <div className="mt-2 grid grid-cols-8 gap-1 sm:grid-cols-16">
        {days.map((d) => {
          const cold = d.tmin != null && d.tmin <= 0 ? "bg-frost text-card" : d.tmin != null && d.tmin <= 2 ? "bg-frost-soft" : "bg-bg";
          return (
            <div key={d.date} className={`rounded-md px-1 py-1.5 text-center ${cold}`} title={`${weekdayDayMonth(d.date)}: low ${d.tmin}°C, high ${d.tmax}°C`}>
              <div className="text-[10px] opacity-80">{fmt(d.date, { weekday: "narrow" })}</div>
              <div className="text-sm font-medium tabular-nums">{d.tmin == null ? "–" : Math.round(d.tmin)}°</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const KIND_STYLE: Record<TaskKind, string> = {
  "start-indoors": "bg-sun-soft text-sun",
  transplant: "bg-leaf-soft text-leaf",
  "direct-sow": "bg-leaf-soft text-leaf",
  "fall-plant": "bg-leaf-soft text-leaf",
  "harvest-before-frost": "bg-frost-soft text-frost",
};

function TaskList({ tasks, tips }: { tasks: Task[]; tips: Record<string, string> }) {
  if (tasks.length === 0) return null;
  const byMonth = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), t]);
  }

  return (
    <div className="mt-5 space-y-5">
      {[...byMonth].map(([month, items]) => (
        <div key={month}>
          <h3 className="text-sm font-semibold text-muted">{fmt(`${month}-01`, { month: "long", year: "numeric" })}</h3>
          <ul className="mt-2 divide-y divide-line">
            {items.map((t) => (
              <li key={t.id} className="flex gap-3 py-2.5">
                <span className="w-24 shrink-0 text-sm tabular-nums text-muted">{weekdayDayMonth(t.date)}</span>
                <div className="min-w-0">
                  <p>
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${KIND_STYLE[t.kind]}`}>{ACTION_LABEL[t.kind]}</span>
                    <span className="font-medium">{t.cropName}</span>
                    {t.harvestFrom && <span className="text-sm text-muted"> · harvest from {dayMonth(t.harvestFrom)}</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">{tips[t.id] ?? t.basis}</p>
                  {t.warning && <p className="mt-0.5 text-sm text-sun">{t.warning}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
