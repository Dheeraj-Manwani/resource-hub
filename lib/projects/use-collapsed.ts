"use client"

import { useCallback, useState } from "react"

const KEY = "resource-hub:collapsed-projects"

function read(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

/** Persisted (localStorage) set of collapsed sidebar project ids. */
export function useCollapsedProjects() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => read())

  const persist = useCallback((next: Set<string>) => {
    setCollapsed(next)
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...next]))
    } catch {
      // ignore (private browsing / quota)
    }
  }, [])

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(collapsed)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persist(next)
    },
    [collapsed, persist]
  )

  const isCollapsed = useCallback((id: string) => collapsed.has(id), [collapsed])

  return { isCollapsed, toggle }
}
