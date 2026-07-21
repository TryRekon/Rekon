import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'

interface Router {
  path: string
  navigate: (to: string) => void
}

const RouterContext = createContext<Router>({ path: '/', navigate: () => {} })

// `path` includes the query string (pages like compare keep their state in
// `?a=&b=`); route matching splits it off via pathnameOf.
const currentPath = () => window.location.pathname + window.location.search

export const pathnameOf = (path: string): string => path.split('?')[0] ?? path

export const RouterProvider = ({ children }: { children: ReactNode }) => {
  const [path, setPath] = useState(currentPath())

  useEffect(() => {
    const onPopState = () => setPath(currentPath())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: string) => {
    // Query-only changes (e.g. compare's ?a=&b=) are in-page state, not a page
    // change — keep the scroll position.
    const samePage = pathnameOf(to) === window.location.pathname
    if (to !== currentPath()) {
      window.history.pushState(null, '', to)
    }
    setPath(to)
    if (!samePage) window.scrollTo(0, 0)
  }, [])

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>
}

export const useRouter = (): Router => useContext(RouterContext)

export const Link = ({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
  const { navigate } = useRouter()
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return
    }
    e.preventDefault()
    if (href) navigate(href)
  }
  return <a href={href} onClick={handleClick} {...props} />
}
