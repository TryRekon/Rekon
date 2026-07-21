import { Hono } from "hono";
import type { Context } from "hono";
import { forwardToOpenAI } from "./proxy";
import { recordUsage } from "./usage";
import { systemLookup, type SystemEnv } from "../system-scope";
import { captureException, posthogConfig } from "../../posthog";

// The rest of the path once the `/s/<system-uuid>/openai` prefix (validated
// by `systemLookup`, mounted below) is stripped — matched against the raw
// (still-encoded) pathname so what OpenAI sees is exactly what the client sent.
const UPSTREAM_PATH = /^\/s\/[^/]+\/openai(\/.*)?$/;

// OpenAI-shaped error body, so misconfigured SDK clients surface the message.
const rejection = (c: Context, message: string): Response =>
  c.json({ error: { message, type: "invalid_request_error", param: null, code: null } }, 404);

// Transparent proxy for one OpenAI request. Mirrors the Anthropic module:
// clone-tap the request body of recordable calls, forward untouched, tee the
// response, and drain the tap via waitUntil off the client's critical path.
const proxy = async (c: Context<SystemEnv>): Promise<Response> => {
  const system = c.get("system");
  const req = c.req.raw;
  const url = new URL(req.url);
  const upstreamPath = url.pathname.match(UPSTREAM_PATH)?.[1] ?? "/";

  // Only /v1/chat/completions carries the conversation history; everything
  // else (models, embeddings, ...) passes through unrecorded.
  const isChat = req.method === "POST" && upstreamPath === "/v1/chat/completions";
  const requestBody: Promise<string | null> = isChat
    ? req
        .clone()
        .text()
        .catch(() => null)
    : Promise.resolve(null);

  const upstream = await forwardToOpenAI(req, `${upstreamPath}${url.search}`);

  if (!upstream.ok || !upstream.body || !isChat) {
    return new Response(upstream.body, upstream);
  }

  const [clientBranch, tapBranch] = upstream.body.tee();
  const contentType = upstream.headers.get("content-type") ?? "";
  const posthog = posthogConfig(c.env);

  // The client already has its response (tee'd above); recording runs off the
  // critical path. A throw here would otherwise be an invisible unhandled
  // rejection and a silently dropped usage row — report it to PostHog instead.
  c.executionCtx.waitUntil(
    recordUsage(c.env.DB, requestBody, tapBranch, contentType, {
      // Record the stripped path so the requests table only ever sees what
      // OpenAI saw — the system association lives on the session.
      path: upstreamPath,
      method: req.method,
      status: upstream.status,
      streaming: contentType.includes("text/event-stream"),
      requestId: upstream.headers.get("x-request-id"),
      system,
    }).catch((err) => {
      console.error("recordUsage failed", err);
      if (posthog)
        return captureException(posthog, err, {
          distinctId: system.userId,
          properties: {
            $process_person_profile: false,
            source: "recordUsage",
            provider: "openai",
            path: upstreamPath,
          },
        });
    }),
  );

  return new Response(clientBranch, upstream);
};

const scoped = new Hono<SystemEnv>()
  .use(
    "*",
    systemLookup((c) =>
      rejection(
        c,
        "Unknown system id. Create a system in the token-profiler dashboard and use its /s/<uuid>/openai/v1 base URL.",
      ),
    ),
  )
  .all("*", proxy);

// Registered before the Anthropic router (src/index.ts), whose `/s/:system/*`
// and `*` catch-alls would otherwise swallow these paths.
export const openai = new Hono<{ Bindings: Env }>()
  .route("/s/:system/openai", scoped)
  .all("/openai/*", (c) =>
    rejection(
      c,
      "This proxy requires a system-scoped base URL. Sign in to the token-profiler dashboard, create a system, and point your client at /s/<uuid>/openai/v1.",
    ),
  );
