"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import type { AppUser } from "@/lib/server/dal/session"

type ShellContextValue = {
  user: AppUser
  addResource: { open: boolean; initialText?: string }
  openAddResource: (initialText?: string) => void
  closeAddResource: () => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function ShellProvider({
  user,
  children,
}: {
  user: AppUser
  children: React.ReactNode
}) {
  const [addResource, setAddResource] = useState<{
    open: boolean
    initialText?: string
  }>({
    open: false,
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const openAddResource = useCallback(
    (initialText?: string) => setAddResource({ open: true, initialText }),
    []
  )
  const closeAddResource = useCallback(
    () => setAddResource({ open: false }),
    []
  )

  const value = useMemo(
    () => ({
      user,
      addResource,
      openAddResource,
      closeAddResource,
      mobileNavOpen,
      setMobileNavOpen,
    }),
    [user, addResource, openAddResource, closeAddResource, mobileNavOpen]
  )
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

export function useShell() {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>")
  return ctx
}
