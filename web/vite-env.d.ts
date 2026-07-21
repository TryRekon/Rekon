/// <reference types="vite/client" />

interface ImportMetaEnv {
  // PostHog project API key (phc_...) — set to enable dashboard product
  // analytics; absent disables it. Inlined into the bundle at build time.
  readonly VITE_POSTHOG_KEY?: string
  // Defaults to https://us.i.posthog.com when unset.
  readonly VITE_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
