# Token Profiler

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)

A transparent proxy for the **Anthropic** and **OpenAI** APIs that records token
usage and shows it in a dashboard. Point your client at it, keep working as
normal, and see per-request tokens, reconstructed sessions, tool-level
attribution, and estimated cost.

Built on Cloudflare Workers, D1, Hono, and React.

A hosted instance runs at **[tryrekon.com](https://tryrekon.com)**.

## Features

- **Zero added latency** — responses stream straight through; recording happens
  off the critical path.
- **Keys never stored** — auth headers are forwarded, never held, so usage is
  always spent on the caller's own key or subscription.
- **Session trees** — the chat APIs are stateless, so the proxy rebuilds each
  conversation from client signals, forks and all.
- **Tool-level attribution** — see which tools actually burn the tokens.

## How it works

Create a **system** in the dashboard and it gets its own proxy URL. Point your
client at it with one environment variable:

```sh
export ANTHROPIC_BASE_URL=https://<host>/s/<system-id>
# OpenAI clients add /openai/v1:
export OPENAI_BASE_URL=https://<host>/s/<system-id>/openai/v1
```

Requests are forwarded untouched (auth headers included) and usage is recorded on
the way back. The system id doubles as the ingest key — unknown ids are rejected,
so a deployment is never an open relay. Treat the URL as a secret.

## Quick start

```sh
git clone https://github.com/TryRekon/Rekon.git
cd Rekon
npm install

cp .dev.vars.example .dev.vars             # set SESSION_SECRET + one OAuth provider (Google or GitHub)
npm run typegen
npm run db:migrate:local
npm run dev                                # http://localhost:5173
```

Sign in, copy your system's URL from the onboarding screen, and point a client at
it. Recording starts with the first request.

To deploy your own: create a D1 database (`wrangler d1 create token-profiler-db`)
and paste its id into `wrangler.jsonc` as `database_id`, then change the
`routes` custom-domain pattern to a zone you control (or remove it for a free
`workers.dev` URL). Set your secrets with `wrangler secret put` (`SESSION_SECRET`,
an OAuth provider pair, and `POSTHOG_KEY` if you want analytics), run
`npm run db:migrate:remote`, then `npm run deploy`. Note that `deploy` does not
run migrations.

> Costs are estimates from list prices in `shared/pricing.ts`; unknown models show
> no cost.

## Docs

The architecture — session reconstruction, token attribution, the endpoint list,
and a file-by-file layout — is in [AGENTS.md](AGENTS.md).

## License

[Apache 2.0](LICENSE). This repository is, and will remain, fully open source; the
commercial model is a hosted deployment, not a paywall over this code.

Contributions are accepted under the [DCO](DCO) — sign off your commits with
`git commit -s`.
