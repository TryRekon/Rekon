import posthog from 'posthog-js'
import type { AuthUser } from '../../shared/api-types'

// Dashboard product analytics. Enabled only when VITE_POSTHOG_KEY is present at
// build time; without it every helper is a no-op, so the SPA runs unchanged.
// The key is a public, write-only ingest key (the Worker uses the same value).

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

let enabled = false

export const initAnalytics = (): void => {
  if (enabled || !KEY) return
  posthog.init(KEY, {
    api_host: HOST,
    // The SPA uses a custom pushState router, so pageviews are captured
    // manually on navigation (see capturePageview) rather than autocaptured.
    capture_pageview: false,
    capture_pageleave: true,
    // Every visitor becomes a PostHog person, so signed-out traffic (the landing
    // page especially) is tracked. When an anonymous visitor later signs in,
    // identify() merges their pre-auth activity into the identified profile.
    person_profiles: 'always',
  })
  enabled = true
}

export const identifyUser = (user: AuthUser): void => {
  if (enabled) posthog.identify(user.id, { email: user.email, name: user.name ?? undefined })
}

export const resetAnalytics = (): void => {
  if (enabled) posthog.reset()
}

export const capturePageview = (): void => {
  if (enabled) posthog.capture('$pageview')
}

export const captureEvent = (event: string, properties?: Record<string, unknown>): void => {
  if (enabled) posthog.capture(event, properties)
}
