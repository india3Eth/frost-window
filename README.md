# Frost Window

Know when it's safe to plant. Then go outside.

Tell Frost Window where your garden is and what you want from it, in plain words ("I want to make salsa and my kid loves snap peas"). It reads about thirty years of daily temperatures for your exact location, works out your frost dates, and turns your wish list into a dated planting plan for the next twelve months, plus one concrete reason to get outdoors this weekend.

The language model is an open-weight one (Qwen3 4B by default) running locally through [Ollama](https://ollama.com). Nothing about your garden leaves your machine except the weather lookups.

## How it works

```
place ──► Open-Meteo geocoding
            │
            ├─► 30 years of daily minimum temperatures ──► frost statistics (plain code)
            ├─► 16-day forecast
            │
wish list ──┴─► local model picks crops (schema-constrained to the crop list)
                        │
                        ▼
            scheduler dates every task (plain code)
                        │
                        ▼
            local model writes the weekend brief and tips
            (schema-constrained to the task ids it was given)
```

**The model never decides a date.** Frost dates come from the temperature record; planting dates come from frost dates plus per-crop offsets. The model does the two things a lookup table can't: understanding a free-text wish list, and explaining the plan like a person would.

Guardrails that make a 4B model dependable:

- **Structured output.** Every call passes a JSON schema to Ollama, so generation is constrained to valid JSON. Crop ids and task ids are enums, so the model can't invent a crop or tip a task that doesn't exist. Responses are validated again with zod.
- **Facts, not arithmetic.** The coldest forecast night, nights at or below 2°C, and the next frost-risk date are computed up front and handed to the model as facts. Dates are written out ("Mon 9 Nov 2026") because small models copy ISO dates verbatim into prose.
- **Fallbacks.** If Ollama isn't running, crops are matched by name and the brief is rule-based. The app still works; the badge says so.

## Frost dates

Each growing season is the 365 days centred on midsummer (15 July north of the equator, 15 January south of it). Within a season, the **last spring frost** is the latest day at or below 0°C before midsummer, and the **first fall frost** is the earliest one after. Seasons with less than 90% data coverage are skipped.

Across ~30 seasons:

| Shown as | Meaning |
|---|---|
| Last spring frost, "in a typical year" | median |
| "1 year in 10 still frosts until" | 90th percentile: the date tender crops are planned against |
| First fall frost, "in a typical year" | median |
| "1 year in 10 frosts by" | 10th percentile: harvest tender crops before this |

Hardy and half-hardy crops are planned against the medians. If a planting date has passed but there's still time for the crop to mature before fall frost, the plan offers a "plant now" catch-up instead of dropping it. Places with no frost in most years (Ahmedabad, say) get told so honestly rather than handed a fake calendar.

Planting offsets in [`src/lib/crops.ts`](src/lib/crops.ts) follow common extension-service guidance. They're a starting point; seed packets and local advice win.

## Run it

Needs Node 20+ and [Ollama](https://ollama.com/download).

```bash
ollama pull qwen3:4b
npm install
npm run dev
```

Open http://localhost:3000.

| Variable | Default | |
|---|---|---|
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | any Ollama server |
| `OLLAMA_MODEL` | `qwen3:4b` | any model that supports structured outputs, e.g. `gemma3:4b`, `llama3.2:3b` |

A plan takes 8–20 seconds on an 8 GB M2 Mac, most of it model time. Weather history is cached per location for a day.

## Checks

```bash
npm test           # vitest: frost statistics, scheduler, model layer (Ollama mocked)
npm run lint
npm run typecheck
npm run build
```

## Data and licence

Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Code is MIT.
