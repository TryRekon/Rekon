import type { Context, MiddlewareHandler } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { systems } from "../db/schema";
import type { SystemRef } from "../db/usage";

export type SystemEnv = { Bindings: Env; Variables: { system: SystemRef } };

// Shared by every provider mounted under `/s/:system(/...)`: resolves the
// path param against the systems table once and sets it on context, so
// downstream handlers never repeat the lookup or re-derive the id from the
// path. The mount guarantees `:system` is present; `onMissing` lets each
// provider return its own wire-shaped error body.
export const systemLookup = (
  onMissing: (c: Context) => Response,
): MiddlewareHandler<SystemEnv> => {
  return async (c, next) => {
    const system = await drizzle(c.env.DB)
      .select({ id: systems.id, userId: systems.userId, firstEventAt: systems.firstEventAt })
      .from(systems)
      .where(eq(systems.id, c.req.param("system")!))
      .get();
    if (!system) return onMissing(c);
    c.set("system", system);
    await next();
  };
};
