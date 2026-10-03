"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

// True when the open drawer was pushed onto history by this tab, so closing
// it can simply go back (keeping Back-button semantics intuitive).
let pushedByApp = false

export type DrawerTarget = { kind: "resource" | "task"; id: string } | null

export function useDetailDrawer() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const r = searchParams.get("r")
  const t = searchParams.get("t")
  const target: DrawerTarget = r
    ? { kind: "resource", id: r }
    : t
      ? { kind: "task", id: t }
      : null

  const open = useCallback(
    (kind: "resource" | "task", id: string) => {
      const params = new URLSearchParams(searchParams.toString())
      const wasOpen = params.has("r") || params.has("t")
      params.delete("r")
      params.delete("t")
      params.set(kind === "resource" ? "r" : "t", id)
      const href = `${pathname}?${params.toString()}`
      if (wasOpen) {
        router.replace(href, { scroll: false })
      } else {
        pushedByApp = true
        router.push(href, { scroll: false })
      }
    },
    [pathname, router, searchParams]
  )

  const close = useCallback(() => {
    if (pushedByApp) {
      pushedByApp = false
      router.back()
      return
    }
    const params = new URLSearchParams(searchParams.toString())
    params.delete("r")
    params.delete("t")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  return {
    target,
    openResource: useCallback((id: string) => open("resource", id), [open]),
    openTask: useCallback((id: string) => open("task", id), [open]),
    close,
  }
}
