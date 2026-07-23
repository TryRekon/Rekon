import { useLayoutEffect, useRef, useState } from 'react'

// Tracks the content-box width of an element via ResizeObserver — the shared
// version of the width-measuring block previously copy-pasted across the chart
// components. Returns a ref to attach and the current width (0 until measured,
// so callers should gate SVG rendering on `width > 0`).
export function useElementWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
