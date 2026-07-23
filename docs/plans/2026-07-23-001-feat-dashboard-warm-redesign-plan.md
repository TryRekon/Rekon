---
title: "feat: Convert dashboard page to warm-Iris hybrid design"
date: 2026-07-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Convert dashboard page to warm-Iris hybrid design

## Summary

Convert `web/pages/dashboard.tsx` to the approved **warm-evolved Iris hybrid** design
(glance layer over density layer, editorial burn-meter hero, F-pattern instrument body).
Two supporting moves make it real and honest: (1) re-tokenize the Iris neutral ramp from
cool to **warm** in `web/index.css` — a global, values-only change behind the `verify-ui`
gate; (2) port closecoach's lint-enforced **gap-flag convention** (`<Unbacked>` + `hazard`
utility + `TODO(stitch-gap)` marker) so any dashboard element that is visually present but
not yet backed by the API renders under a dashed "under construction" overlay instead of
faking data.

The design source of truth is the approved artifact set (dashboard + session + system mocks),
built and verified earlier this session. This plan converts the **dashboard** screen only;
session/system pages are follow-up work.

**Product Contract preservation:** N/A — no upstream brainstorm; product scope carried from
session-settled design decisions (warm neutral, burn-meter hero, IA re-architect, flag
non-functional elements). See Key Technical Decisions.

---

## Problem Frame

The current dashboard (`web/pages/dashboard.tsx`) is a vertical stack: a range switcher, an
8-cell stat strip, a single spend-trend card, the tokens chart, then models/providers/tools/
systems/sessions/requests cards. It answers "what's my usage" but buries the lead — total
spend has no more weight than any other tile, there is no trajectory or anomaly signal, and
nothing is screenshot-worthy for a lead reviewing team spend.

The approved redesign fixes this with an inverted-pyramid hierarchy (spend → what changed →
who's burning it): a lit **glance layer** carrying a big burn-meter hero with pace projection
and an anomaly-annotated sparkline, over a **density layer** of KPI tiles and the existing
attribution tables. It uses warm-evolved Iris neutrals.

Two honesty constraints:
1. The neutral re-tokenize is **global** — every page inherits warm neutrals. Only the
   dashboard gets the new IA. This follows directly from the "evolve Iris" decision.
2. Several hero elements are **not backed** by the current `DashboardData` API (delta vs prior
   period, cache-$-saved, cost-weighted token mix). Per the explicit request, these are built
   into the design but wrapped in a gap-flag so they read as "coming, not wired" rather than
   as fabricated numbers.

---

## Requirements

- **R1** — Re-tokenize the Iris neutral ramp to warm in `web/index.css` (`:root` light +
  `prefers-color-scheme: dark`), touching neutrals only. Accent, chart, status, sidebar,
  flame, and run tokens are unchanged. `verify-ui` stays green; dark-mode contrast re-checked.
- **R2** — Port the closecoach gap-flag convention into Rekon: an `Unbacked` primitive, a
  `hazard` CSS utility, a dedicated `--hold` amber token, and the `TODO(stitch-gap)` comment
  convention. Adapted to Rekon's Tailwind v4 `@theme` + `cn()` conventions.
- **R3** — Add a derived-metrics module that computes, from existing `DashboardData`, the
  values the new hero needs and that ARE backed: month pace projection, per-day cost anomaly
  (value + ×-median), cache-hit ratio, token-mix shares (by token count).
- **R4** — Build the burn-meter hero: large mono ink spend figure, pace line, anomaly-annotated
  spend sparkline, and status chips. Backed values render live; unbacked values
  (delta-vs-prior-period) render inside `Unbacked`.
- **R5** — Restructure `dashboard.tsx` into glance layer (hero + KPI strip + token-mix) and
  density layer (existing cards, reordered), in the warm design. Existing cards are reused,
  not rewritten. Every not-yet-backed affordance is wrapped in `Unbacked` with a
  `TODO(stitch-gap)` marker.
- **R6** — Ship behind `verify-ui` (typecheck + design lint) with a rendered screenshot check
  of the converted dashboard in light and dark mode.

**Success criteria:** `npm run verify-ui` exits 0; the dashboard renders the warm hybrid in
light and dark; every backed metric shows real data; every unbacked element is visibly
flagged and greppable via `TODO(stitch-gap)`; no fabricated numbers presented as real.

---

## Key Technical Decisions

- **KTD1 — Warm neutrals, values-only, global** *(session-settled: user-directed — chosen over
  cool-conform: user picked "evolve Iris warmer" after seeing both temperatures side by side).*
  Re-tokenize only the neutral ramp; keep every token NAME so no downstream file changes and
  the `@theme` bridge is untouched. Global reach is intended and accepted — all pages inherit
  warm neutrals; only the dashboard gets new IA.

- **KTD2 — Reuse the existing cards; restructure, don't rewrite.** `ModelsCard`,
  `ProvidersCard`, `ToolsCard`, `SystemsCard`, `SessionsCard`, `RequestsCard`, `TokensChartCard`
  are already token-pure, so the warm re-tokenize restyles them for free. The dashboard change
  is composition (glance/density layers + hero), not per-card surgery. Keeps the diff small and
  the risk low.

- **KTD3 — Port closecoach's `Unbacked` gap-flag verbatim in spirit, adapted to Rekon tokens.**
  Dashed amber outline (no layout shift via `outline-offset:-1px`), `opacity-60` +
  `pointer-events-none` child, a floating "under construction" badge (block variant) or corner
  cone (inline variant), and a `ShowScaffoldingContext` (default on). Mandatory adjacent
  `TODO(stitch-gap)` comment naming what's missing. This is exactly the requested pattern.

- **KTD4 — Dedicated `--hold` token, not reuse of `--status-serious`.** The gap-flag is a
  build-state signal (chrome), semantically distinct from a data "serious" status. A dedicated
  `--hold` amber (chrome-only, mirroring closecoach's `--color-hold`) keeps the two from
  colliding and honors the Iris rule that data-status colors mean data state.

- **KTD5 — Honest metric backing.** Backed-and-derivable metrics (pace, anomaly, cache-hit,
  token-share) are wired live from `DashboardData`. Not-backed metrics (delta vs prior period,
  cache-$-saved, cost-weighted token mix) are rendered inside `Unbacked`. Rationale and the
  full split are in the Backing Ledger below.

- **KTD6 — No unit-test runner; verify by types + rendered output.** Per `AGENTS.md`, Rekon has
  no test runner and static checks are `verify-ui` (typecheck + design lints). Derived-metrics
  functions are pure and strongly typed; correctness is verified by typecheck plus a rendered
  screenshot check, not a new vitest harness (adding one is out of scope). Enforcement of the
  gap-flag convention is a grep gate, not a unit test.

---

## Backing Ledger (which elements are wired vs flagged)

Derived from `DashboardData` in `shared/api-types.ts` (`totals`, `byDay[]`, `byModel`,
`byTool`, `providers`, `systems`, `sessions`, `recentRequests`, `range`, `generatedAt`).

**Wired live (backed):**
- Spend figure — `totals.cost`.
- Pace projection — `byDay` cost sum ÷ days elapsed × days in period.
- Anomaly (value + ×median) — median of `byDay[].cost`, flag the max outlier.
- KPI strip (requests, sessions, systems, input, output, cache read/write) — `totals` / `systems.length`.
- Cache-hit ratio — `cacheReadTokens / (cacheReadTokens + inputTokens)` (defined proxy).
- Token-mix by **token count** — `totals` token fields as shares.
- All attribution tables — existing card data.

**Flagged `Unbacked` (not backed by current API):**
- **Delta vs prior period** (e.g. "+23% vs June") — no prior-period aggregate exists.
  `TODO(stitch-gap)`: needs a prior-window totals field on the dashboard endpoint.
- **Cache dollars saved** (e.g. "$412 saved") — needs an uncached-counterfactual price.
  `TODO(stitch-gap)`: needs a savings estimate from the pricing table.
- **Token-mix by cost** — no per-token-type cost in the API; shipped as token-share instead,
  with the cost-weighted variant flagged. `TODO(stitch-gap)`: needs per-type cost breakdown.

---

## High-Level Technical Design

Dependency order and layer mapping:

```
U1 warm re-tokenize (index.css)  ─┐  global neutral shift, values-only
U2 gap-flag infra (Unbacked)     ─┤  --hold token, hazard utility, TODO(stitch-gap)
                                  │
U3 derived metrics (lib)  ────────┼─▶ pure fns over DashboardData (pace, anomaly, cacheHit, mix)
                                  │
U4 burn-meter hero  ──────────────┴─▶ uses U2 (Unbacked) + U3 (metrics)
                                  │
U5 dashboard restructure  ────────┴─▶ glance layer [hero · KPI strip · token-mix]
                                       density layer [tokens chart · models/providers ·
                                       tools · systems · sessions · requests]
```

New dashboard composition (top → bottom): range switcher + refresh (kept) → **glance layer**:
burn-meter hero (U4), KPI strip (restyled `StatStrip`), token-mix strip → **density layer**:
`TokensChartCard`, models+providers row, `ToolsCard`, `SystemsCard`, `SessionsCard`,
`RequestsCard` (all existing, reordered). Pending-system and onboarding paths unchanged.

---

## Implementation Units

### U1. Re-tokenize Iris neutrals to warm

**Goal:** Shift the neutral ramp from cool violet-grey to warm paper, values-only, globally.
**Requirements:** R1.
**Dependencies:** none.
**Files:** `web/index.css`, `.claude/design-system.md` (note the temperature change; do not
duplicate hex values per that doc's R2).
**Approach:** In `:root` (light) replace neutral values only — `--background`, `--card`,
`--muted`, `--muted-foreground`, `--border`, `--accent` (surface), `--gridline`, `--axis`,
`--secondary-ink` — with the approved warm set (light targets: `--background #f6f4ef`,
`--card #fffdf9`, `--muted #f0ede6`, `--border #e6e1d8`, `--gridline #ece8df`,
`--axis #cbc6bb`, `--secondary-ink #4e4a5f`, `--muted-foreground #6b6675`; `--foreground`
stays `#17151f`). Apply a coherent warm shift to the same neutrals inside the
`prefers-color-scheme: dark` block (warm the dark greys; keep foregrounds legible). Do NOT
touch `--ring`, `--chart-*`, `--status-*`, `--sidebar-*`, `--flame-*`, `--run-*`, radius,
fonts. Token names and the `@theme inline` bridge are unchanged.
**Patterns to follow:** `web/index.css` existing `:root` / dark-block structure; the
CVD/pairing comments above `--flame-*` and `--run-*` (do not reorder).
**Execution note:** This is a token-value change; prefer running the dashboard in light AND
dark after the edit to confirm the warm ground reads correctly and the accent/status/chart
colors still separate. Re-check `--status-critical-foreground` contrast on warm surfaces.
**Test scenarios:** Test expectation: none (pure token values) — verify by `verify-ui` +
rendered light/dark screenshot in U6-equivalent verification.
**Verification:** `npm run verify-ui` green; app renders warm in light and dark with no raw-
color lint violations; accent, chart series, and status colors remain distinguishable.

### U2. Port the gap-flag convention (`Unbacked`)

**Goal:** Give Rekon a first-class, greppable way to mark designed-but-unbacked UI.
**Requirements:** R2.
**Dependencies:** none (can run parallel to U1).
**Files:** `web/components/ui/unbacked.tsx` (new), `web/index.css` (add `--hold` token in
`:root` + dark + `@theme inline` bridge, and a `hazard` `@utility`), `.claude/design-system.md`
(document the convention + the `TODO(stitch-gap)` rule), `package.json` (extend the `verify-ui`
script or add `lint:gaps`), `scripts/check-gap-flags.mjs` (new, small grep gate).
**Approach:** Port closecoach `apps/web/src/ui/Unbacked.tsx` adapted to Rekon: use `cn()` from
`web/lib/utils`, token classes only. Props `{ label, note='Not wired', variant='block'|'inline',
children }`. `ShowScaffoldingContext` default `true`; when false, render children plain.
Block variant: `opacity-60 pointer-events-none` child + dashed `--hold` outline
(`outline-offset:-1px`, no layout shift) + floating uppercase "under construction" badge in
`font-mono`. Inline variant: dimmed child + corner cone glyph, no badge. Add `--hold` amber
(≈`#dc8a2e`) as a chrome token bridged in `@theme inline` as `--color-hold`. Add
`@utility hazard` (45° repeating-linear-gradient using `color-mix` over `--hold`).
`check-gap-flags.mjs`: fail if any `.tsx` line matching `<Unbacked` lacks a `TODO(stitch-gap)`
within a few preceding lines; wire into `verify-ui`.
**Patterns to follow:** closecoach `Unbacked.tsx`, its `hazard` utility + `--color-hold`
(`apps/web/src/index.css`), and `scripts/design-lint.mjs:80-88`; Rekon primitive shape in
`web/components/ui/*` (thin wrapper, `cn()` last, token-only classes).
**Test scenarios:**
- Renders children dimmed with dashed frame + badge when `ShowScaffoldingContext` is true (block).
- Renders children plain (no frame/badge) when context is false.
- Inline variant shows corner glyph, no text badge.
- `check-gap-flags.mjs` fails on an `<Unbacked>` without a nearby `TODO(stitch-gap)` and passes with one.
**Verification:** `verify-ui` (incl. the new gap check) green; an `<Unbacked>` sample renders
the amber hazard treatment in light and dark; toggling the context flips to plain render.

### U3. Derived dashboard metrics

**Goal:** Pure functions computing the backed hero metrics from `DashboardData`.
**Requirements:** R3.
**Dependencies:** none (parallel to U1/U2).
**Files:** `web/lib/dashboard-metrics.ts` (new).
**Approach:** Export pure typed fns: `paceProjection(byDay, range, generatedAt)` →
`{ projected: number; periodLabel: string }`; `spendAnomaly(byDay)` →
`{ day, cost, timesMedian } | null` (median of non-zero day costs, flag the top outlier when
≥ a threshold, e.g. 2×); `cacheHitRatio(totals)` → number in [0,1]; `tokenMixByCount(totals)`
→ `{ key, label, share }[]` in the fixed order input/output/cache-write/cache-read using the
real chart tokens. No React, no side effects. Guard empty/zero-day inputs (return null / zeros).
**Patterns to follow:** `web/lib/format.ts` (pure helper module style); token order + labels
from `web/components/tokens-chart.tsx` `SERIES`.
**Execution note:** These are the load-bearing "is it real" functions — keep them total
(defined on empty `byDay`, all-zero totals, single-day ranges) so the hero never renders NaN.
**Test scenarios:**
- `paceProjection` on a partial-month `byDay` returns a projection > the elapsed sum; on `all` range returns a sensible period label without dividing by zero.
- `spendAnomaly` flags a 3× day among normal days; returns null when all days are within threshold or `byDay` is empty.
- `cacheHitRatio` returns 0 when `cacheReadTokens` and `inputTokens` are both 0 (no NaN).
- `tokenMixByCount` shares sum to ~1 and preserve fixed series order; all-zero totals yield zero shares, not NaN.
**Verification:** `npm run typecheck` green; each function exercised by the hero (U4) renders
finite values across the empty/zero/single-day cases in the browser.

### U4. Burn-meter hero component

**Goal:** The screenshot-worthy glance-layer hero.
**Requirements:** R4.
**Dependencies:** U2 (Unbacked), U3 (metrics).
**Files:** `web/components/burn-meter.tsx` (new).
**Approach:** Props derived from `DashboardData`. Layout: left — eyebrow, large `font-mono`
ink spend figure (`totals.cost`), pace line ("on pace for $X this period" from U3), status
chips (cache-hit % from U3, provider split from `providers`); right — an anomaly-annotated
spend sparkline (reuse the SVG approach from `web/design-system/examples/dashboard-card.tsx`
and `tokens-chart.tsx`; muted bars/line with the single anomaly day in `--status-critical`,
a median reference line, and an in-situ callout). Wrap the **delta-vs-prior-period** chip in
`<Unbacked variant="inline" label="Change vs previous period" note="needs prior-window totals">`
with an adjacent `TODO(stitch-gap)` comment. Money numerals stay ink (never accent); accent
only on chrome/links; anomaly uses `--status-critical` (rose). Consume colors via the
`var(--token)` JS-literal convention (design-system.md §6).
**Patterns to follow:** `web/design-system/examples/dashboard-card.tsx` (golden inline-chart
card), `web/components/tokens-chart.tsx` (SVG scale/axis/segment-gap conventions),
`web/components/stat-tile.tsx` (tabular-nums numerals).
**Test scenarios:**
- Renders the spend figure and a finite pace line for a normal range.
- Renders the anomaly callout when `spendAnomaly` returns a day; hides it cleanly when null.
- The delta chip renders inside the hazard treatment (Unbacked), not as a bare number.
- Money figure uses ink token, not accent; anomaly mark uses `--status-critical`.
**Verification:** Hero renders in light and dark; anomaly present/absent both look correct;
the delta chip shows the "under construction" treatment; `verify-ui` green.

### U5. Restructure `dashboard.tsx` into glance + density layers

**Goal:** Assemble the converted dashboard.
**Requirements:** R5, R6.
**Dependencies:** U1, U2, U3, U4.
**Files:** `web/pages/dashboard.tsx`.
**Approach:** Keep the range switcher, refresh, error, skeleton, pending-system, and onboarding
paths. Replace the body: **glance layer** = `<BurnMeter>` (U4) + restyled `StatStrip` KPI row +
a token-mix strip (U3 `tokenMixByCount`, using the four chart tokens with a legend — not color
alone). **density layer** = existing `TokensChartCard`, the models+providers row, `ToolsCard`,
`SystemsCard`, `SessionsCard`, `RequestsCard` in that order. Remove the now-redundant single
`DashboardMetricCard` "Spend trend" card (its role is absorbed by the hero sparkline) — or keep
it in the density layer if it still earns space; prefer removal to avoid duplication. Any control
in the new design that is not wired (e.g. a cost-weighted token-mix toggle, a "saved $" figure)
is wrapped in `<Unbacked>` with `TODO(stitch-gap)`. No fabricated data anywhere.
**Patterns to follow:** current `dashboard.tsx` structure (range switcher, `isFetching` opacity
wrapper, card ordering); `StatStrip`/`StatTile` for the KPI row.
**Execution note:** Smoke-verify the whole page after wiring: the point is the rendered dashboard
in the real app, not just a green typecheck. Confirm empty-data and single-system states still
render (onboarding path untouched).
**Test scenarios:**
- Full dashboard renders with real data: hero, KPI strip, token-mix, all density cards, correct order.
- Unbacked elements (delta, any saved-$/cost-mix affordance) show the hazard treatment.
- Pending-system and zero-active-system (onboarding) paths still render unchanged.
- `isFetching` dims the body; error and skeleton states intact.
**Verification:** `npm run verify-ui` green; rendered dashboard matches the approved warm hybrid
in light and dark; `grep -r "TODO(stitch-gap)" web/` lists exactly the intended unbacked spots.

---

## Scope Boundaries

**In scope:** the dashboard page conversion; the global warm neutral re-tokenize; the gap-flag
port; the derived-metrics module; the burn-meter hero.

### Deferred to Follow-Up Work
- **Session and system screens** — designed and approved this session; convert next, reusing
  the same warm tokens, hero pattern, and gap-flag.
- **Backend for the flagged metrics** — prior-period totals, cache-$-saved estimate, and
  per-token-type cost. Each has a `TODO(stitch-gap)` naming the exact gap; wiring them removes
  the `Unbacked` wrapper with no design change.
- **Global scaffolding toggle** — a sidebar switch flipping `ShowScaffoldingContext` app-wide
  (closecoach has one). Default-on is sufficient for this change.
- **Extending the gap-flag lint into the escape-hatch hook** — the grep gate in `verify-ui`
  is enough for now.

### Not a goal
- Rewriting the existing attribution cards (they are reused as-is).
- Adding a unit-test runner (repo convention is static checks only).
- Changing the API / worker (`src/`) — this is a `web/`-only change.

---

## Risks & Dependencies

- **Global re-tokenize regressions.** Warm neutrals touch every page. Mitigation: values-only,
  names unchanged; `verify-ui` + light/dark screenshot pass over the dashboard and a spot-check
  of one other page (e.g. a session page).
- **Dark-mode contrast.** Warming the dark greys can dip contrast. Mitigation: re-check
  `--status-critical-foreground` and muted-on-card ratios; keep foregrounds near current values.
- **`Unbacked` + design lint interaction.** The new component must itself pass the design lints
  (token-only classes, no raw color). Mitigation: build it token-pure; add `--hold` before use.
- **No test runner.** Pure-function correctness rests on types + rendered verification.
  Mitigation: keep functions total and exercise every edge state in the rendered hero.

---

## Definition of Done

- `npm run verify-ui` exits 0 (typecheck + both design lints + the new gap-flag grep gate).
- Dashboard renders the warm-Iris hybrid in light and dark: burn-meter hero, KPI strip,
  token-mix, and the reordered density cards.
- Every backed metric shows real data derived from `DashboardData`; every unbacked element is
  wrapped in `<Unbacked>` and greppable via `TODO(stitch-gap)`.
- Onboarding / pending-system / error / skeleton paths still work.
- Changes committed on the worktree branch, pushed, and opened as a draft PR.
