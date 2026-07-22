import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

// Two projects, two runtimes (vitest `projects`):
//
//   unit    — pure functions (pricing, session-signal extraction, hashing,
//             token estimation). Plain node; no bindings, no D1. Fast.
//   worker  — the whole Worker booted inside workerd (miniflare) with a real,
//             per-file-isolated D1. Exercises routing, tenant fencing, and the
//             record→session→requests pipeline end-to-end via `SELF.fetch`.
//
// `npm test` runs both. The worker project reads the real `migrations/` dir and
// hands the parsed migrations to a setup file that applies them to the ephemeral
// D1 before each test file (see test/integration/apply-migrations.ts).

const dir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [
          cloudflareTest(async () => {
            const migrations = await readD1Migrations(path.join(dir, 'migrations'))
            return {
              main: path.join(dir, 'src/index.ts'),
              miniflare: {
                compatibilityDate: '2026-07-01',
                d1Databases: ['DB'],
                bindings: {
                  // Deterministic secret so the auth suite can mint valid JWTs.
                  SESSION_SECRET: 'test-session-secret-do-not-use-in-prod',
                  ALLOWED_EMAILS: '',
                  // Consumed only by the migration setup file below.
                  TEST_MIGRATIONS: migrations,
                },
              },
            }
          }),
        ],
        test: {
          name: 'worker',
          include: ['test/integration/**/*.test.ts'],
          setupFiles: ['./test/integration/apply-migrations.ts'],
        },
      },
    ],
  },
})
