import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from './lib/router'
import { ApiError } from './lib/api'
import { initAnalytics } from './lib/analytics'
import { App } from './App'
import './index.css'

initAnalytics()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx (auth, not-found) are terminal — surface them immediately; only
      // retry transient network/5xx failures.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 2
      },
    },
  },
})

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider>
          <App />
        </RouterProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}
