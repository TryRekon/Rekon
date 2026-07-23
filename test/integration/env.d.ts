import type { D1Migration } from '@cloudflare/vitest-pool-workers'

// `cloudflare:test`'s `env` is typed as the Worker's global `Env` (DB,
// SESSION_SECRET, ALLOWED_EMAILS, …). Add the migrations array injected as a
// test-only binding in vitest.config.ts so setup code reads it type-safely.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export {}
