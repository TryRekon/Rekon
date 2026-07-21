# AGENTS.md

This file provides guidance to agents (Claude Code, claude.ai/code, and others) when working with code in this repository.

A transparent proxy for AI provider APIs (Anthropic, OpenAI) that records per-request token
usage to D1 and visualizes it in a React dashboard. One Cloudflare Worker (Hono) is *both* the
proxy and the SPA host. See `README.md` for the endpoint table, deploy steps, and a
file-by-file layout.

> **Open-source repository (Apache-2.0).** This repo is public — everything committed is
> world-readable. Every change must be safe to open-source: never commit secrets, credentials,
> API keys, internal business or strategy material, customer data, or private infrastructure
> identifiers. Local-only values belong in `.dev.vars` / `.env.local` (both gitignored) or a
> `wrangler secret`, never in tracked files. If a change can't be made public, it doesn't belong here.

## Commands

```sh
npm run dev              # Vite dev server on :5173 — Worker runs inside workerd, same origin
npm run typecheck        # tsc --noEmit && tsc --noEmit -p web  (TWO roots — see below)
npm run typegen          # regenerate worker-configuration.d.ts after editing wrangler.jsonc
npm run build            # vite build
npm run deploy           # build, then wrangler deploy

npm run db:generate      # drizzle-kit: emit a migration after editing src/db/schema.ts
npm run db:migrate:local # apply migrations to local D1 (.wrangler/state SQLite)
npm run db:migrate:remote

npm run verify-ui        # THE gate before any UI change lands: typecheck + both design lints
npm run lint:design      # ESLint (better-tailwindcss): unknown classes, arbitrary/raw colors in TSX
npm run lint:style       # Stylelint: raw color values in CSS outside web/index.css
```

There is **no test runner**; static checks are `npm run typecheck` plus the design-scoped lint
gates above (`verify-ui` runs all of them and exits non-zero on any violation — run it after
any change under `web/`). Lint is deliberately scoped to design rules only; there is no
general-purpose linter.

A PreToolUse hook (`.claude/hooks/escape-hatch-guard.sh`, wired in `.claude/settings.json`)
blocks suppression escape hatches in agent edits: `eslint-disable`, `stylelint-disable`,
`@ts-ignore`, `@ts-expect-error`, and `as any` casts in code files, plus test-file deletion
and edits to the hook/settings themselves. If it blocks you, fix the underlying violation;
suppression is human-only — ask instead of routing around it. `npm run typegen` is a prerequisite for typecheck on a fresh checkout — it generates the
gitignored `worker-configuration.d.ts`, which supplies both the `Env` bindings type and the
Workers runtime types. `npm run dev` runs without migrations (the proxy passthrough still works),
but `npm run db:migrate:local` must be applied for usage recording to land in the local D1.

Typecheck has **two tsconfigs**: root `tsconfig.json` is Worker-scoped (`es2022`, no DOM, types
from `worker-configuration.d.ts`) and covers `src`/`shared`; `web/tsconfig.json` adds DOM/JSX
for the SPA. Neither includes the other's globals — importing `document` in `src/` or `D1Database`
in `web/` is a type error by design.

## Architecture

**One Worker, two jobs.** `src/index.ts` mounts internal routes under `/_` (`/_health` open,
`/_auth` OAuth flows, `/_api` auth-gated) and the provider proxies at `/` — the OpenAI router
first (its `/s/<uuid>/openai/*` and `/openai/*` routes would otherwise be swallowed by the
Anthropic catch-alls), then Anthropic. Proxying requires a `/s/<system-uuid>` prefix — the UUID
is looked up in D1 *before* forwarding, and unknown ids or the bare `/v1/*` / `/openai/v1/*`
paths get a 404 instead of an upstream call, so a deployment is never an open relay.
`assets.run_worker_first` in `wrangler.jsonc` (`/v1/*`, `/_*`, `/s/*`, `/openai/*`) pins proxy +
API traffic to the Worker; every other path falls through to the SPA's `index.html`.

**Auth and tenancy.** Users sign in via Google or GitHub (`src/routes/internal/auth.ts`,
`@hono/oauth-providers`); a provider is enabled only when both its client id and secret are
configured (locally `.dev.vars`, deployed via `wrangler secret put`). Sessions are stateless
HS256-JWT cookies (`src/auth/session.ts`, `SESSION_SECRET`). Every `/_api` query is fenced to
the signed-in user's systems; systems are user-owned rows keyed by a pregenerated UUID that
doubles as the ingest key, created *pending* and activated by their first recorded event
(`firstEventAt`).

**The proxy adds zero latency.** Each provider's `index.ts` forwards the raw request untouched
(all auth headers pass through — it never holds or injects credentials), `tee()`s the upstream
response, returns one branch to the client immediately, and drains the other via
`ctx.waitUntil(recordUsage(...))` off the critical path. The request body is `clone()`d before
forwarding so session signals can be read without consuming the stream. Only the conversation
endpoint is buffered (`POST /v1/messages` for Anthropic, `POST /v1/chat/completions` for
OpenAI); other routes (e.g. `count_tokens`, `models`) skip it.

**Session reconstruction is the hard part.** Both chat APIs are stateless — no conversation ID
comes back. Sessions are rebuilt proxy-side from two signals, tried in order
(`src/db/sessions.ts`):
1. `clientKey` — an exact per-conversation key the client sent. Claude Code embeds its session
   UUID in `metadata.user_id`; OpenAI clients may send `metadata.session_id`/`conversation_id`
   (the `user` and `prompt_cache_key` fields are deliberately ignored — per-user keys would
   merge every conversation by that user). Trusted first because it survives history rewrites
   (compaction).
2. `chainKey` — SHA-256 of the request's replayed last-assistant turn, matched against the
   `response_key` recorded when that response passed through. Links a request to its parent, and
   thereby to a session. Each provider's `contentKey()` (in `session.ts`, also called on the
   response in `usage.ts`) must produce the *same* hash from a parsed response and from the
   client's replay of it — so only text bodies and tool-call ids (`toolu_...`/`call_...`)
   participate; thinking/refusal blocks are excluded because clients may drop/rewrite them.

Sessions are **trees, not lists** (`parentRequestId`) — a client can fork history. Both signals
are client-supplied, so every match (clientKey upsert, chain lookup, tool-result attachment) is
scoped to the request's system — replayed keys or content must never resolve into another
tenant's session.

**Token attribution is estimate-based.** Providers report usage per *request*, never per content
block. Two mechanisms bridge that gap:
- `requests.newInputTokens` = the *exact* tokens a request added to the conversation:
  `promptSize(this) − (promptSize(parent) + output(parent))`. Can go negative on history
  rewrites; null for roots.
- Tool result tokens are char-estimated (`estimateTokens` ≈ 4 chars/token; flat
  `IMAGE_TOKEN_ESTIMATE` for images, since base64 length wildly overstates vision tokens), then
  **scaled proportionally to `newInputTokens`** when that delta is available (`attachToolResults`
  in `src/db/tool-calls.ts`), replacing guesswork with real counts split across the turn's results.

**Tool calls are recorded in two phases** (`src/db/tool-calls.ts`): `recordToolUses` inserts a
row (func + input, output pending) when the response emitting the `tool_use` passes through;
`attachToolResults` fills in the output when a *later* request replays the matching `tool_result`.
The `output IS NULL` guard makes replayed history idempotent and drops results for tool uses the
proxy never saw rather than inserting orphans.

**Systems and the tool registry.** A system's proxy base URL is `/s/<uuid>`; the prefix is
stripped before forwarding (`forwardToAnthropic`'s `pathAndSearch`) so Anthropic still sees
`/v1/...`, and the recorded `path` never includes it — the system association lives on the
session. Each request's `tools` array is hashed and token-estimated into the
per-`(provider, system, name)` `tools` registry, which tracks definition drift via `revisions`.
Registration is gated by `sessions.toolsetHash` (`${systemId}|${hash}`) so an unchanged toolset
costs one indexed read and zero writes per turn (`src/db/tools.ts`).

**Provider-agnostic core.** Everything in `src/db/` (sessions, tool-calls, tools, usage) is
provider-agnostic and keyed by `providers.id`. Each provider module (`src/routes/anthropic/`,
`src/routes/openai/`) only implements wire-format parsing (SSE + JSON) and signal extraction,
then hands the normalized shapes to `persistUsage` (`src/db/usage.ts`), which owns session
resolution, the `newInputTokens` delta, the `requests` insert, tool-call recording, and the tool
registry. Adding a provider means another sibling route module plus a seed row in `providers`
via a custom migration (`drizzle-kit generate --custom`, see `migrations/0008`).

**Token counts are stored as DISJOINT buckets** (`NormalizedUsage`): `inputTokens` excludes
cache reads/writes, so `promptSize = input + cacheCreation + cacheRead` holds for every
provider. Anthropic reports them disjoint already; OpenAI folds cache reads into
`prompt_tokens`, so its parser subtracts `prompt_tokens_details.cached_tokens` back out
(`cacheCreationTokens` is always null — OpenAI caching has no write surcharge). Streamed OpenAI
usage only exists when the client sent `stream_options.include_usage`; without it the request
is still recorded with null counts, and both `persistUsage` and `resolveSession` guard the
delta math against usage-less rows/parents.

**Parsing targets the SDK's own types.** Each provider's `usage.ts`/`session.ts` import wire
types from `@anthropic-ai/sdk` / `openai` (type-only — nothing lands in the bundle), so a field
rename when bumping the SDK surfaces at typecheck. Streaming (`parseSse`) accumulates usage
across events (Anthropic: `message_start` + `message_delta`, last non-null wins; OpenAI:
content/tool-call deltas keyed by `index`, usage on the final chunk); non-streaming
(`parseJson`) reads the full `usage` object.

**Shared code and cost.** `shared/` (`pricing.ts`, `api-types.ts`) is imported by both the Worker
and the SPA. All dollar figures are **estimates** from list prices in `shared/pricing.ts`
(`resolvePricing` longest-prefix-matches the model id; cache reads use the model's `cachedInput`
price when published (OpenAI), else 0.1× input; writes 1.25× — the 5-min rate, so 1h cache
writes are underestimated). Unknown models show no cost.

**SPA.** React 19 + Tailwind v4, served as Worker static assets by `@cloudflare/vite-plugin`.
Uses a hand-rolled `pushState` router (`web/lib/router.tsx`), not react-router, and TanStack
Query for data (`web/lib/queries.ts`; 4xx are terminal, no refetch-on-focus). `App.tsx` gates on
`/_api/me` → login page or app; a user with no live system lands on onboarding
(`web/pages/onboarding.tsx`), which polls until the first event arrives. Pages in `web/pages/`,
cards in `web/components/`, shadcn-style primitives in `web/components/ui/`. Data comes from
`/_api/*`, typed end-to-end through `shared/api-types.ts`.

**Design system (read before building UI).** `.claude/design-system.md` is the authoritative
map of the token system (`web/index.css` `@theme`), the `web/components/ui/` primitives, and
the sanctioned conventions (dark mode, `cn()`, chart `var(--chart-*)` JS literals, brand-color
exception). Colors must come from tokens — hardcoded values fail `npm run verify-ui`. Before
building a table, match `web/design-system/examples/data-table.tsx`; before building a
dashboard metric card, match `web/design-system/examples/dashboard-card.tsx` — both golden
examples are compiled by typecheck, so they are always current.

## Conventions

- **Don't hand-write migrations.** Edit `src/db/schema.ts`, then `npm run db:generate`; only
  hand-edit the generated SQL when the data strategy differs from drizzle's copy-based default
  (e.g. 0007's deliberate destructive rebuild) — the snapshot/journal must stay in sync either way.
  Data-only migrations (provider seeds, e.g. 0008) go through `npx drizzle-kit generate --custom`.
- After changing `wrangler.jsonc` bindings, run `npm run typegen` to refresh the `Env` type.
- Values parsed from responses are *recorded, never branched on* — optional chaining is the only
  runtime guard the parsers need.
- Stored `input`/`output`/`userText`/`assistantText` are previews truncated at 8,000 chars
  (`truncateForStorage`, `MAX_STORED_CHARS`); token estimates always use the full pre-truncation size.
