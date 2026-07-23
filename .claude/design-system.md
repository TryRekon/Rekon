# TokenProfiler Design System

**Visual identity:** "Iris" (restyled 2026-07-17 via `/design-system-author`) — graphite neutrals with a violet undertone, one electric iris accent (`--ring`/`--run-b`), Switzer for UI text and JetBrains Mono for numerals. The accent lives on chrome only (active nav, links, focus rings, sparklines); money numerals stay ink. Applied as token-value changes in `web/index.css` — no token renames. Visual reference: `.claude/design-system/reference.html` (+ `mocks/`).

**Neutral ramp temperature (2026-07-23):** The Iris neutral ramp (`--background`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--accent` surface, `--gridline`, `--axis`, `--secondary-ink`) was shifted from cool violet-grey to **warm paper** in both light and dark modes. Token names and the `@theme inline` bridge are unchanged — values only. See `web/index.css` `:root` and `prefers-color-scheme: dark` blocks for current values.

**Entity-link pattern:** in tables and lists, links whose text *is* an entity's name (session, system, tool) render in the accent — `text-ring underline-offset-2 hover:underline`. Inside a clickable row, only the link that shares the row's own destination uses `group-hover:underline` (it underlines on row hover); a link to a *different* entity keeps plain `hover:underline` so row hover doesn't imply the wrong target. Action links with verb labels (e.g. the dashboard's "Rename") and sidebar nav are out of scope. Surrounding data cells stay ink/muted; never apply `text-ring` to numeric or money cells.

**Status:** Extracted from existing code (not authored). This document is a *pointer layer* over the real source of truth — it names and locates tokens and primitives, it does not redefine them. When this doc and the code disagree, the code wins; re-extract.

**Source of truth:** [`web/index.css`](../web/index.css) — a Tailwind v4 CSS-first `@theme` bridge. Raw color values are defined exactly once, in `:root` (and its `prefers-color-scheme: dark` override). Every Tailwind-facing token is re-exported from those `:root` variables inside a single `@theme inline { ... }` block.

Per R2, **no hex values are duplicated into this document.** Every token below is documented by name and by pointer (file + line range) into `web/index.css`, never by value. If you need the current value of a token, read the file.

**Screen targets (per-screen pixel source of truth):** this doc + `web/index.css` codify the design *language*; the per-screen *layout* was matched 1:1 against the warm-Iris Claude artifacts below. Note the committed `.claude/design-system/reference.html` + `mocks/` were generated 2026-07-17, **before** the single-surface rebuild — they still show the older card-stack layout. For the current dense single-hairline-surface screens, the artifacts here are canonical. When reworking one of these screens, screenshot-diff the authed page against its artifact (headless-Chrome loop + the `screenshot-verifier` subagent); match layout + tokens, not values (real seed data differs from the mock's aspirational numbers, as expected).

| Screen | Route(s) | Artifact (warm frame) | Shipped in |
|---|---|---|---|
| Dashboard | `/` | https://claude.ai/code/artifact/31d56337-a765-4bf6-8709-89ae6a0a29f7 (`#warm`) | #6 (`09a275f`) |
| System detail | `/systems/:id` | https://claude.ai/code/artifact/546f2215-e96a-4d5c-9510-cc17755e9118 | #7 (`d793e18`) |
| Session detail | `/sessions/:id` | https://claude.ai/code/artifact/546f2215-e96a-4d5c-9510-cc17755e9118 | #7 (`d793e18`) |

The single-surface idiom shared by all three: one `overflow-hidden rounded-lg border bg-card` surface whose regions are split by hairline rules (no per-section cards/shadows), dense grids drawing dividers via a 1px grid gap over a `bg-hairline` ground. Each artifact is a static frame — when reading its markup, strip the base64 font `data:` blobs first.

---

## 1. Token Namespaces

All namespaces are defined in `web/index.css`. Raw values live in `:root` (`web/index.css:3-48`) and are overridden per-token inside `@media (prefers-color-scheme: dark) { :root { ... } }` (`web/index.css:50-83`). Tailwind-class-reachable names are bridged from those `:root` variables inside `@theme inline { ... }` (`web/index.css:85-137`) — a token only becomes usable as a utility class (e.g. `bg-chart-input`) once it appears in that block. (Line pointers are maintained by hand; if a pointer misses, search the file for the token name and re-sync the table.)

| Namespace | Tailwind-usable as | `:root` definition | `@theme inline` bridge | Dark-mode override |
|---|---|---|---|---|
| `background` / `foreground` | `bg-background`, `text-foreground` | `web/index.css:4-5` | `web/index.css:89-90` | yes |
| `card` / `card-foreground` | `bg-card`, `text-card-foreground` | `web/index.css:6-7` | `web/index.css:91-92` | yes |
| `secondary-ink` | `text-secondary-ink` | `web/index.css:8` | `web/index.css:93` | yes |
| `muted` / `muted-foreground` | `bg-muted`, `text-muted-foreground` | `web/index.css:9-10` | `web/index.css:94-95` | yes |
| `border` | `border-border` (also the default `border-*` color via `@layer base`) | `web/index.css:11` | `web/index.css:96` | yes |
| `accent` / `accent-foreground` | `bg-accent`, `text-accent-foreground` | `web/index.css:12-13` | `web/index.css:97-98` | yes |
| `ring` | `outline-ring` (focus rings) | `web/index.css:14` | `web/index.css:99` | yes |
| `radius` | `rounded-lg` / `rounded-md` / `rounded-sm` (via `radius-lg/md/sm`, derived with `calc()`) | `web/index.css:15` | `web/index.css:122-124` | no |
| `gridline` | `stroke-gridline` / `var(--gridline)` in chart JS | `web/index.css:16` | `web/index.css:100` | yes |
| `axis` | `stroke-axis` / `var(--axis)` in chart JS | `web/index.css:17` | `web/index.css:101` | yes |
| `chart-input` / `chart-output` / `chart-cache-read` / `chart-cache-write` | `bg-chart-*`, `var(--chart-*)` in chart JS | `web/index.css:18-21` | `web/index.css:102-105` | yes |
| `status-good` / `status-serious` / `status-critical` | `bg-status-*`, `text-status-*`, `border-status-*` | `web/index.css:22-24` | `web/index.css:106-108` | yes (`web/index.css:69-71` — brightened for dark surfaces) |
| `status-critical-foreground` | `text-status-critical-foreground` (foreground on `bg-status-critical` surfaces) | `web/index.css:25` | `web/index.css:109` | yes (`web/index.css:72-73` — dark ink `#17151f` on the brightened rose fill; the shared `#fafafa` fell to 3.4:1 after the dark `status-critical` brightening) |
| `hold` (build-state chrome — KTD4) | `text-hold`, `border-hold`, `bg-hold` (incl. `bg-hold/15`); also read via `var(--hold)` by the `hazard` `@utility` and the `Unbacked` frame | `:root` block, declared right after `--status-critical-foreground` (search `--hold`) | `@theme inline` (`--color-hold: var(--hold)`, right after the `status-critical-foreground` bridge) | yes (a touch brighter on dark surfaces, mirroring `--status-serious`) |
| `flame-neutral` / `flame-defs` / `flame-results` / `flame-user` / `flame-assistant` | **not** Tailwind-class-reachable today (see deviation note below) — consume via `var(--flame-*)` in JS/inline styles only | `web/index.css:29-33` | not bridged | yes |
| `run-a` / `run-b` | `bg-run-a`/`bg-run-b`, `var(--run-*)` in chart JS | `web/index.css:36-37` | `web/index.css:110-111` | yes |
| `sidebar` / `sidebar-foreground` / `sidebar-bright` / `sidebar-muted` | `bg-sidebar`, `text-sidebar-foreground`, etc. | `web/index.css:38-41` | `web/index.css:112-115` | partial — only `sidebar` itself has a dark override (`web/index.css:81`); the rest are already dark-appropriate values used in both modes |
| `sidebar-hover` / `sidebar-active` / `sidebar-border` | `bg-sidebar-hover`, etc. (rgba-based overlay tokens) | `web/index.css:42-44` | `web/index.css:116-118` | no (same rgba overlay value works on the fixed-dark sidebar in both modes) |
| `logo-mark` / `logo-stroke` | consumed via `var(--logo-*)` in the sidebar logo SVG attributes (`web/components/sidebar.tsx`); bridged per plan U4 though no utility-class consumer exists yet | `web/index.css:45-46` | `web/index.css:119-120` | no (logo renders identically in both modes) |
| `scrim` | `bg-scrim` (modal/drawer overlay backdrop) | `web/index.css:47` | `web/index.css:121` | no |
| `font-sans` / `font-mono` | `font-sans`, `font-mono` | n/a (declared directly in `@theme inline`) | `web/index.css:87-88` | no |
| `animate-fade-rise` | `animate-fade-rise` | n/a | `web/index.css:125` (keyframes at `web/index.css:127-136`) | no |

**Deviation from plan note:** the plan's extraction guidance names `flame-*` and `run-*` as namespaces to confirm and document. Both exist in `:root`, but only `run-*` is currently bridged into `@theme inline` — `flame-*` is `:root`-only. This means `bg-flame-neutral` etc. are **not valid Tailwind classes today**; the flame tokens are consumed exclusively via `var(--flame-*)` string references in JS (see `web/components/memory-growth.tsx:28-32`, the context-memory flame chart). This is intentional, current state — not a documentation error — and is called out here so agents don't assume flame tokens are utility-class-usable. Flame tokens are sanctioned as JS-literal-only (`var(--flame-*)`, §6 convention); bridge them into `@theme inline` only if a utility-class use case actually appears.

The `flame-*` and `run-a`/`run-b` tokens carry authored ordering/pairing comments directly above their `:root` declarations (`web/index.css:26-28` and `web/index.css:34-35`) about color-vision-deficiency (CVD) separation — read those comments in the source before reordering or substituting values; the order and pairing are intentional, not incidental.

---

## 2. Dark Mode Strategy

Verified mechanism (`web/index.css:50-83`): a single `@media (prefers-color-scheme: dark) { :root { ... } } ` block overrides a subset of the same `:root` custom-property names declared in the light-mode `:root` block above it. There is **no** class-based or `data-theme`-attribute toggle, no theme context/provider, and no `dark:` Tailwind variant classes anywhere in `web/` — dark mode is 100% OS-preference-driven and resolved at the CSS custom-property layer, before Tailwind utilities ever see a value. A component that uses a token class (e.g. `bg-card`) or a token `var(--card)` reference is automatically dark-mode-correct; it never needs a `dark:` variant.

Not every token is overridden in the dark block — `radius`, `font-*`, `animate-fade-rise`, and the `sidebar-hover`/`sidebar-active`/`sidebar-border` overlay tokens are mode-invariant by design (see table above).

---

## 3. Primitive Inventory

Every file in `web/components/ui/` (8 total). These are the sanctioned building blocks — see §4 for the import-path convention.

| File | Exports | Variant convention |
|---|---|---|
| `web/components/ui/button.tsx` | `Button` | `variant`: `outline` (default) \| `ghost`, via a `buttonVariants` lookup object (not a `class-variance-authority`/`cva` setup — plain `Record` keyed by variant name). `size`: `sm` (default) \| `icon`, same pattern via `buttonSizes`. |
| `web/components/ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` | No variants — composition-only. Sub-components are meant to be assembled together (`Card > CardHeader > CardTitle`/`CardDescription`, then `CardContent`). |
| `web/components/ui/badge.tsx` | `Badge` | `variant`: `secondary` (default) \| `outline`, via a `badgeVariants` lookup object, same pattern as `button.tsx`. |
| `web/components/ui/table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | No variants. `Table` wraps itself in an `overflow-x-auto` div for horizontal scroll on narrow viewports — always the outermost element for tabular data, don't reimplement the wrapper. |
| `web/components/ui/input.tsx` | `Input` | No variants. Wires `aria-[invalid=true]:border-status-critical` directly — pass `aria-invalid` (typically via `FormControl`, see below) rather than styling error state manually. |
| `web/components/ui/form.tsx` | `Form`, `FormField`, `useFormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` | Not variant-based — a context-wiring layer over `react-hook-form` (`Controller`/`FormProvider`), hand-rolled in the same file-per-primitive style as the rest of `ui/` (explicitly no Radix, no `Slot`; `FormControl` uses `cloneElement` to inject `id`/`aria-invalid`/`aria-describedby` onto its single child instead). Compose as `Form > FormField > FormItem > (FormLabel + FormControl + FormMessage)`. |
| `web/components/ui/checkbox.tsx` | `Checkbox` | No variants; boolean `checked`/`onCheckedChange` (controlled, button-based `role="checkbox"`, not a native `<input type="checkbox">`). Checked-state styling (`border-foreground bg-foreground text-background`) is inline in the `cn()` call rather than a lookup object, since there are only two states. |
| `web/components/ui/unbacked.tsx` | `Unbacked`, `ShowScaffoldingContext` | The gap-flag primitive (see §9). `variant`: `block` (default, floating "under construction" badge) \| `inline` (corner cone glyph, no badge); a childless call renders a self-sized dashed placeholder. Not a lookup-object shape — the branch per variant/childless is inline, since each renders a structurally different overlay. `ShowScaffoldingContext` (default `true`) flips the whole effect off (children render plain). |

Every primitive above follows the same shape: a thin wrapper around a native HTML element (or, for `form.tsx`, react-hook-form context) that (a) applies token-only Tailwind classes, (b) accepts `className` and merges it last via `cn()` so callers can extend but the base token classes still win conflicts (see §5), and (c) spreads remaining native props through untyped beyond the variant/size props it owns. New primitives should follow this shape rather than introducing a new component-authoring pattern.

---

## 4. Sanctioned Import-Path Convention (R5)

Design-system components are imported from `web/components/ui/*` — that directory is the sanctioned, canonical home for token-pure primitives. Feature code (`web/components/*.tsx`, `web/pages/*.tsx`) should import `Button`, `Card`, `Badge`, `Table*`, `Input`, `Form*`, `Checkbox` from there rather than hand-rolling equivalent markup or duplicating a primitive elsewhere in the tree.

This convention is **documented, not linted**, per R5 / the plan's Key Decisions: there is currently no legacy or off-limits import path in the codebase to restrict against, so an import-path ESLint rule (e.g. `no-restricted-imports`) has nothing to enforce yet. Activate lint enforcement for this convention once a second/legacy path exists that agents could plausibly import from instead.

---

## 5. `cn()` Helper Convention

`web/lib/utils.ts` exports a single helper:

```ts
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
```

`clsx` handles conditional/falsy class composition; `tailwind-merge` (`twMerge`) then resolves conflicting Tailwind utilities (e.g. a caller-supplied `bg-accent` overriding a primitive's default `bg-card`) by keeping the last-applied class in the same utility group rather than emitting both. Every primitive in `web/components/ui/` calls `cn(<base classes>, <variant/size classes>, className)` with the caller's `className` last, so caller overrides always win. New components that accept `className` should follow the same ordering — base/variant classes first, `className` last — for `twMerge` to resolve overrides correctly.

---

## 6. Chart JS-Literal Token Convention (KTD5)

Chart and inline-SVG code frequently needs a color value as a JavaScript string (chart series config, `stroke`/`fill` props, inline `style` objects) rather than as a Tailwind class. The sanctioned pattern is a `var(--token-name)` string literal referencing the same `:root` custom properties documented in §1 — e.g.:

```ts
// web/components/tokens-chart.tsx:10-13
{ key: 'inputTokens', label: 'Input', color: 'var(--chart-input)' },
{ key: 'outputTokens', label: 'Output', color: 'var(--chart-output)' },
{ key: 'cacheReadTokens', label: 'Cache read', color: 'var(--chart-cache-read)' },
{ key: 'cacheCreationTokens', label: 'Cache write', color: 'var(--chart-cache-write)' },
```

This is sanctioned token usage — it resolves to the same CSS custom property as the Tailwind class form and stays correct across light/dark automatically. It appears throughout the chart components: `web/components/context-chart.tsx`, `web/components/cache-insights-card.tsx`, `web/components/memory-growth.tsx`, `web/components/requests-card.tsx`, `web/components/tokens-chart.tsx`, `web/components/session-timeline.tsx`, `web/components/compare/compare-chart.tsx`.

**Known lint blind spot:** class-based Tailwind lint (`eslint-plugin-better-tailwindcss`, scoped per the enforcement plan) inspects `className`/class-string usage, not arbitrary JS string literals. A hardcoded hex slipped into one of these `color:`/`stroke=`/`style={{ ... }}` positions (e.g. a raw hex string literal instead of `color: 'var(--chart-input)'`) will **not** be caught by that lint layer. Treat this pattern as a manual-review point until/unless dedicated tooling closes the gap (deferred per the plan's Scope Boundaries — not part of this enforcement pass).

---

## 7. Brand-Color Exception: Google Logo (KTD6)

`web/pages/landing.tsx` (`GoogleIcon` component, `web/pages/landing.tsx:9-28`) renders the four-color Google "G" mark using four hardcoded hex values in `fill` attributes — one per path, corresponding to Google's standard brand blue, green, yellow, and red.

This is an intentional, sanctioned exception: the values are externally brand-mandated (Google's own logo color specification), not part of TokenProfiler's design system, and must render as exact brand colors regardless of TokenProfiler's light/dark token state. They are not candidates for tokenization. Per KTD6, class-based lint does not inspect `fill` attribute values anyway, so this exception requires no suppression — it simply isn't reachable by the class-based enforcement layer, and CSS-side (Stylelint) enforcement doesn't apply either since these are JSX attributes, not CSS declarations.

This document deliberately does **not** list the four hex values (per R2 — no hex values duplicated into this doc, brand exception included); the exception is documented by pointer to `web/pages/landing.tsx:9-28` and by the colors' purpose (Google's brand blue/green/yellow/red) so it's auditable without becoming a second source of truth for a value that already exists in exactly one sanctioned place in the codebase. If a future auditor needs the literal values, read the source.

Do not treat this exception as a precedent for other brand marks or one-off hex usage — it applies narrowly to this externally-mandated logo. Any new hardcoded hex usage elsewhere should be tokenized or brought to the design-system owner before being added as a second exception.

---

## 8. Golden Examples (R7, R8)

Two compilable, token-pure reference implementations agents should match by reading the file — do not inline their source into prompts (R8):

- For tables, match [`web/design-system/examples/data-table.tsx`](../web/design-system/examples/data-table.tsx). Its `getModelHref` prop demonstrates the entity-link pattern (see the header of this doc); for the clickable-row + `group-hover:underline` variant, see `web/components/sessions-card.tsx`.
- For dashboard metric cards, match [`web/design-system/examples/dashboard-card.tsx`](../web/design-system/examples/dashboard-card.tsx).

Both are included in `npm run typecheck` (and therefore `npm run verify-ui`), so an incompatible change to a `web/components/ui/*` primitive's API breaks them loudly.

---

## 9. Gap-flag convention (KTD3, KTD4)

Ported from closecoach, adapted to Iris tokens. When a designed element is
visually present but **not yet backed** by the API, it renders through
`<Unbacked>` (`web/components/ui/unbacked.tsx`) — an on-theme *under-construction*
slot — instead of faking data. The point is honesty: no fabricated number is
ever presented as real, and every gap stays greppable until the backend lands.

**The primitive.** `Unbacked` takes `{ label, note?='Not wired', variant?='block'|'inline', className?, children? }`
and spreads remaining props. It renders the designed child at its natural size,
dimmed (`opacity-60 pointer-events-none`), with a layout-neutral overlay painted
on top:
- a dashed `--hold` frame drawn *inside* the box via `outline-offset:-1px`, so it
  never grows the element or shifts neighbors (no layout shift);
- the `hazard` `@utility` — warm `--hold` diagonal stripes (see below);
- **block** variant: a floating uppercase `font-mono` "under construction" badge
  (`text-hold` on `bg-hold/15`) with a small cone glyph;
- **inline** variant: just a corner cone glyph, no text badge (for icons / chips
  / inline cells);
- a **childless** call: a self-sized dashed placeholder box showing the `label`.

All classes are token-only and `className` merges last via `cn()` (§5), so
`Unbacked` passes the design lints itself. Color is consumed both as utility
classes (`text-hold`, `bg-hold/15`) and as the sanctioned JS-literal
`var(--hold)` form (§6) in the `FRAME` outline style.

**The token.** `--hold` is a dedicated amber **build-state chrome** token — see
§1. It is deliberately NOT a reuse of `--status-serious`: gap-flags signal build
state, not a data "serious" status, and the Iris rule is that data-status colors
mean data state (KTD4). Referenced by name only here; read `web/index.css` for
the value.

**The utility.** `hazard` is an `@utility` in `web/index.css` (after the
`@layer base` block): a 45° `repeating-linear-gradient` of
`color-mix(in srgb, var(--hold) 9%, transparent)` for 0–6px then transparent to
14px — obviously scaffolding without shouting.

**The runtime switch.** `ShowScaffoldingContext` (default `true`) toggles the
whole treatment: when `false`, every `<Unbacked>` renders its children plain
("preview as if live"). A global sidebar switch that flips it app-wide is
deferred follow-up work; default-on is sufficient today.

**The mandatory marker (enforced).** Every `<Unbacked>` call site MUST carry an
adjacent `// TODO(stitch-gap): <what's missing>` comment naming the exact gap, so
unbacked visuals stay greppable (`grep -r "TODO(stitch-gap)" web/`). This is
enforced by `scripts/check-gap-flags.mjs` (run as `npm run lint:gaps` and folded
into `npm run verify-ui` as step 4): it fails the gate, with `file:line`, on any
`<Unbacked>` JSX site lacking a `TODO(stitch-gap)` within the preceding ~4 lines
(the match ignores prose/JSDoc mentions). This mirrors closecoach's
`design-lint.mjs` gap-flag rule.

---

## Sources

Extracted from, in this order: `web/index.css` (`:root`, dark-mode override, `@theme inline` blocks, and the `hazard` `@utility`), every file in `web/components/ui/` (including `unbacked.tsx`), `web/lib/utils.ts`, `web/pages/landing.tsx` (brand exception), the chart component set under `web/components/` (JS-literal token convention), and `scripts/check-gap-flags.mjs` (gap-flag enforcement, §9). This document has no other inputs — it does not introduce tokens, primitives, or conventions beyond what the above files already contain.
