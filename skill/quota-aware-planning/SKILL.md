---
name: quota-aware-planning
description: Use at session start and on a recurring review to spend the OpenRouter free daily quota (1000 rpd, reset 00:00 UTC — check.sh shows the reset in your local timezone) efficiently — scale parallel workers so the remaining quota is consumed by the end of the client's work window. More resources per task = better quality; unused quota = waste. Respects the free-tier ~20 RPM account limit.
---

# Quota-Aware Planning — burn to zero

Goal: spend the free daily OpenRouter limit by the **end of the client's work window**.
Unused quota = wasted resource. More resources per task = better quality. If the limit runs out early, that's fine — the point is to squeeze it all.

## Tunables (config.json, next to this skill)

```json
{ "cronMinutes": 30, "maxWorkers": 5, "perWorkerRpm": 4, "rpmCap": 20, "defaultEffort": "high", "workWindowHours": null }
```

- `maxWorkers` — hard cap on parallel workers.
- `rpmCap` — account requests/min ceiling (free tier ≈ **20 RPM — VERIFY**). `maxConcurrent = min(maxWorkers, floor(rpmCap / perWorkerRpm))`.
- `perWorkerRpm` — assumed requests/min per worker (tune from real 429s).
- `workWindowHours` (**H**) — set at session start.
- `cronMinutes` — intended review cadence. If you change it, recreate the automation.

## Data

Key is in `key.txt` (local, NEVER commit). Check:

```bash
bash scripts/check.sh
```

Prints `used / limit / remaining` (rpd for the current UTC day), `is_free_tier`, `credits_remaining`, `manual_mode`, `effective_mode`. rpd resets at **00:00 UTC** (check.sh prints the reset in your **local** timezone).

## Session start (ask once)

1. Ask: **how many hours** the client plans to work (**H**) + **what we're doing** (one line).
2. Read `check.sh`: `remaining` (**R**), `limit`, `used`.
3. If **R <= 0** → warn "limit exhausted, resets 00:00 UTC", work sequentially (1 worker), spawn no agents.
4. Else compute **target burn**: `target_burn = R / H` (requests/hour to reach R → 0 by end of window). If H exceeds hours-to-reset, use hours-to-reset.
5. **Workers**: `W = clamp(round(target_burn / perWorkerRate), 1, maxConcurrent)`, `perWorkerRate ≈ perWorkerRpm * 60 / 60` (≈ perWorkerRpm per min → ~`perWorkerRpm*60`/h; tune). Never exceed `maxConcurrent` (RPM cap).
6. Say one line: mode, W, target_burn, R.
7. **Spawn W parallel workers** (`orca orchestration worker-start ... --agent opencode2 --effort <defaultEffort>`), split the task into W parts. Aim for R → 0 by end of H.

## Recurring review (cron / every cronMinutes)

- `check.sh` → fresh R.
- Elapsed `t` hours. Ideal spent = `target_burn * t`. Actual = `limit - R`.
- Behind plan (R dropping slower) → **add workers** (up to maxConcurrent).
- Ahead / `R < 150` / < 1h to reset → **don't add**, ease if near 0.
- `R ≈ 0` → goal met, spawn no more, say "quota squeezed".
- Respect **RPM**: never exceed `rpmCap`; on `429` back off (reduce workers / add delay). One line to the owner per spawn/scale change.

## Rules

- Don't burn workers on an already-finished task (don't artificially drain the rest).
- No batch spawning in Eco (`R < 150`).
- `429 "Free usage limit reached"` → limit exhausted, reset 00:00 UTC.
- Never store the key in the repo/memory — only `key.txt` in the skill dir.
- The `quota-panel` plugin is a monitor only; this skill holds the distribution policy.