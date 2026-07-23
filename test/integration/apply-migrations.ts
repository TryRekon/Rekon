import { env, applyD1Migrations } from 'cloudflare:test'
import { beforeAll } from 'vitest'

// Each worker-project test file gets its own isolated D1 storage; apply the
// real migrations once per file before any test runs so the schema (and its
// seed rows — providers, the UNCLAIMED sentinel) exists.
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
