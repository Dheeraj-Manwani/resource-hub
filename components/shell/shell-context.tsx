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
  addProject: { open: boolean; parentId?: string | null }
  openAddProject: (parentId?: string | null) => void
  closeAddProject: () => void
  addQuickNote: boolean
  openAddQuickNote: () => void
  closeAddQuickNote: () => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
  tourOpen: boolean
  openTour: () => void
  closeTour: () => void
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
  const [addProject, setAddProject] = useState<{
    open: boolean
    parentId?: string | null
  }>({ open: false })
  const [addQuickNote, setAddQuickNote] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
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
  const openAddProject = useCallback(
    (parentId?: string | null) => setAddProject({ open: true, parentId }),
    []
  )
  const closeAddProject = useCallback(
    () => setAddProject({ open: false }),
    []
  )
  const openAddQuickNote = useCallback(() => setAddQuickNote(true), [])
  const closeAddQuickNote = useCallback(() => setAddQuickNote(false), [])
  const openTour = useCallback(() => setTourOpen(true), [])
  const closeTour = useCallback(() => setTourOpen(false), [])

  const value = useMemo(
    () => ({
      user,
      addResource,
      openAddResource,
      closeAddResource,
      addTask,
      openAddTask,
      closeAddTask,
      addProject,
      openAddProject,
      closeAddProject,
      addQuickNote,
      openAddQuickNote,
      closeAddQuickNote,
      mobileNavOpen,
      setMobileNavOpen,
      commandPaletteOpen,
      setCommandPaletteOpen,
      tourOpen,
      openTour,
      closeTour,
    }),
    [
      user,
      addResource,
      openAddResource,
      closeAddResource,
      addTask,
      openAddTask,
      closeAddTask,
      addProject,
      openAddProject,
      closeAddProject,
      addQuickNote,
      openAddQuickNote,
      closeAddQuickNote,
      mobileNavOpen,
      commandPaletteOpen,
      tourOpen,
      openTour,
      closeTour,
    ]
  )
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

export function useShell() {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>")
  return ctx
}
