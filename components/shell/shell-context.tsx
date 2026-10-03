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
  addTask: { open: boolean; initialText?: string }
  openAddTask: (initialText?: string) => void
  closeAddTask: () => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
  onboardingOpen: boolean
  openOnboarding: () => void
  closeOnboarding: () => void
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
  const [addTask, setAddTask] = useState<{ open: boolean; initialText?: string }>({
    open: false,
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const openAddResource = useCallback(
    (initialText?: string) => setAddResource({ open: true, initialText }),
    []
  )
  const closeAddResource = useCallback(
    () => setAddResource({ open: false }),
    []
  )
  const openAddTask = useCallback(
    (initialText?: string) => setAddTask({ open: true, initialText }),
    []
  )
  const closeAddTask = useCallback(() => setAddTask({ open: false }), [])
  const openOnboarding = useCallback(() => setOnboardingOpen(true), [])
  const closeOnboarding = useCallback(() => setOnboardingOpen(false), [])

  const value = useMemo(
    () => ({
      user,
      addResource,
      openAddResource,
      closeAddResource,
      addTask,
      openAddTask,
      closeAddTask,
      mobileNavOpen,
      setMobileNavOpen,
      commandPaletteOpen,
      setCommandPaletteOpen,
      onboardingOpen,
      openOnboarding,
      closeOnboarding,
    }),
    [
      user,
      addResource,
      openAddResource,
      closeAddResource,
      addTask,
      openAddTask,
      closeAddTask,
      mobileNavOpen,
      commandPaletteOpen,
      onboardingOpen,
      openOnboarding,
      closeOnboarding,
    ]
  )
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

export function useShell() {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>")
  return ctx
}
