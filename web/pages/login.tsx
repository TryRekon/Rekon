import { useEffect, useState } from 'react'
import { fetchAuthProviders, type AuthProviders } from '../lib/api'
import { Link } from '../lib/router'
import { BrandMark } from '../components/sidebar'
import { SignInButtons } from '../components/sign-in-buttons'
import { Card, CardContent } from '../components/ui/card'

// Dedicated sign-in page reached from the landing nav and hero CTA. Full-page
// OAuth navigations to /_auth/<provider> remount the SPA on return, which lets
// App's /me probe pick up the new session.
export const LoginPage = () => {
  const [providers, setProviders] = useState<AuthProviders | null>(null)

  useEffect(() => {
    fetchAuthProviders()
      // If discovery fails, offer both: an unconfigured provider answers with a
      // polite 404 rather than breaking anything.
      .then(setProviders)
      .catch(() => setProviders({ google: true, github: true }))
  }, [])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark className="h-7 w-7 rounded-[5px]" />
          <span className="text-base font-semibold tracking-tight">Token Profiler</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <Card className="w-full max-w-sm animate-fade-rise">
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-1.5 text-center">
              <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
              <p className="text-sm text-muted-foreground">
                Continue to Token Profiler to set up your proxy and see your token usage.
              </p>
            </div>
            <SignInButtons providers={providers} placement="login" />
            <p className="text-center text-xs text-muted-foreground">
              <Link href="/" className="underline-offset-2 hover:text-foreground hover:underline">
                Back to home
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
