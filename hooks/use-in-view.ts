"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Tracks whether an element is within `rootMargin` of the viewport. Used to
 * mount embeds only when near the screen and unmount them far off-screen.
 */
export function useInView<T extends Element>({
  rootMargin = "400px",
  once = false,
  onChange,
}: {
  rootMargin?: string
  once?: boolean
  onChange?: (inView: boolean) => void
} = {}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry?.isIntersecting ?? false
        setInView(visible)
        onChangeRef.current?.(visible)
        if (visible && once) observer.disconnect()
      },
      { rootMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin, once])

  return { ref, inView }
}
