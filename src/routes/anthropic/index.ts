import { Hono } from "hono";
import type { Context } from "hono";
import { forwardToAnthropic } from "./proxy";
import { recordUsage } from "./usage";
import { systemLookup, type SystemEnv } from "../system-scope";
import { captureException, posthogConfig } from "../../posthog";

// The rest of the path once the `/s/<system-uuid>` prefix (validated by
// `systemLookup`) is stripped — matched against the raw (still-encoded)
// pathname so what Anthropic sees is exactly what the client sent.
const UPSTREAM_PATH = /^\/s\/[^/]+(\/.*)?$/;

const rejection = (c: Context, message: string): Response =>
  c.json({ type: "error", error: { type: "not_found_error", message } }, 404);

// Transparent proxy for one Anthropic request. The system is the validated row
// `systemLookup` attached to context; the upstream path (the `/s/<uuid>` prefix
// stripped) is re-derived here from the same parsed URL used for forwarding.
const proxy = async (c: Context<SystemEnv>): Promise<Response> => {
  const system = c.get("system");
  const req = c.req.raw;
  const url = new URL(req.url);
  const upstreamPath = url.pathname.match(UPSTREAM_PATH)?.[1] ?? "/";

  // Tap the request body for session resolution before forwarding consumes
  // it — clone() lets both branches read independently. Only /v1/messages
  // carries the conversation history; everything else skips the buffer.
  const isMessages = req.method === "POST" && upstreamPath === "/v1/messages";
  const requestBody: Promise<string | null> = isMessages
    ? req
        .clone()
        .text()
        .catch(() => null)
    : Promise.resolve(null);

  const upstream = await forwardToAnthropic(req, `${upstreamPath}${url.search}`);

  if (!upstream.ok || !upstream.body) {
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
      // Anthropic saw — the system association lives on the session.
      path: upstreamPath,
      method: req.method,
      status: upstream.status,
      streaming: contentType.includes("text/event-stream"),
      requestId:
        upstream.headers.get("request-id") ??
        upstream.headers.get("anthropic-request-id"),
      system,
    }).catch((err) => {
      console.error("recordUsage failed", err);
      if (posthog)
        return captureException(posthog, err, {
          distinctId: system.userId,
          properties: {
            $process_person_profile: false,
            source: "recordUsage",
            provider: "anthropic",
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
        "Unknown system id. Create a system in the token-profiler dashboard and use its /s/<uuid> base URL.",
      ),
    ),
  )
  .all("*", proxy);

export const anthropic = new Hono<{ Bindings: Env }>()
  .route("/s/:system", scoped)
  .all("*", (c) =>
    rejection(
      c,
      "This proxy requires a system-scoped base URL. Sign in to the token-profiler dashboard, create a system, and point your client at /s/<uuid>.",
    ),
  );
