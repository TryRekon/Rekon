import type { AuthProviders } from '../lib/api'
import { captureEvent } from '../lib/analytics'

const providerButtonClass =
  'inline-flex h-10 items-center justify-center gap-2.5 rounded-md border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'

const GoogleIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </svg>
)

const GitHubIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
)

interface SignInButtonsProps {
  providers: AuthProviders | null
  // Where this instance sits, for click analytics only.
  placement: string
}

// OAuth entry points. A provider is rendered only when the deployment has it
// configured; the links are full-page navigations to /_auth/<provider>, so the
// SPA remounts on return — which is what lets the App claim gate run
// synchronously after sign-in.
export const SignInButtons = ({ providers, placement }: SignInButtonsProps) => {
  const none = providers !== null && !providers.google && !providers.github
  const track = (provider: 'google' | 'github') =>
    captureEvent('landing_signin_click', { provider, placement })

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      {providers === null && (
        <>
          <div className="h-10 w-full animate-pulse rounded-md border bg-muted/60 sm:w-52" />
          <div className="h-10 w-full animate-pulse rounded-md border bg-muted/60 sm:w-52" />
        </>
      )}
      {providers?.google && (
        <a href="/_auth/google" className={providerButtonClass} onClick={() => track('google')}>
          <GoogleIcon />
          Continue with Google
        </a>
      )}
      {providers?.github && (
        <a href="/_auth/github" className={providerButtonClass} onClick={() => track('github')}>
          <GitHubIcon />
          Continue with GitHub
        </a>
      )}
      {none && (
        <p className="text-xs text-muted-foreground">
          No sign-in providers are configured. Set GOOGLE_CLIENT_ID or GITHUB_CLIENT_ID (plus the
          matching secret) on this deployment.
        </p>
      )}
    </div>
  )
}
