"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import type { AppUser } from "@/lib/server/dal/session"

export type TaskCreationOptions = {
  defaultProject?: { id: string; name: string }
  resourceIds?: string[]
}

type ShellContextValue = {
  user: AppUser
  addResource: {
    open: boolean
    initialText?: string
    initialProjectIds?: string[]
  }
  openAddResource: (initialText?: string, initialProjectIds?: string[]) => void
  closeAddResource: () => void
  addTask: { open: boolean; initialText?: string } & TaskCreationOptions
  openAddTask: (initialText?: string, options?: TaskCreationOptions) => void
  closeAddTask: () => void
  addProject: { open: boolean; parentId?: string | null }
  openAddProject: (parentId?: string | null) => void
  closeAddProject: () => void
  addQuickNote: boolean
  quickNoteProjectId?: string
  openAddQuickNote: (projectId?: string) => void
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
    initialProjectIds?: string[]
  }>({
    open: false,
  })
  const [addTask, setAddTask] = useState<
    { open: boolean; initialText?: string } & TaskCreationOptions
  >({
    open: false,
  })
  const [addProject, setAddProject] = useState<{
    open: boolean
    parentId?: string | null
  }>({ open: false })
  const [addQuickNote, setAddQuickNote] = useState(false)
  const [quickNoteProjectId, setQuickNoteProjectId] = useState<string>()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const openAddResource = useCallback(
    (initialText?: string, initialProjectIds?: string[]) =>
      setAddResource({ open: true, initialText, initialProjectIds }),
    []
  )
  const closeAddResource = useCallback(
    () => setAddResource({ open: false }),
    []
  )
  const openAddTask = useCallback(
    (initialText?: string, options?: TaskCreationOptions) =>
      setAddTask({ open: true, initialText, ...options }),
    []
  )
  const closeAddTask = useCallback(() => setAddTask({ open: false }), [])
  const openAddProject = useCallback(
    (parentId?: string | null) => setAddProject({ open: true, parentId }),
    []
  )
  const closeAddProject = useCallback(() => setAddProject({ open: false }), [])
  const openAddQuickNote = useCallback((projectId?: string) => {
    setQuickNoteProjectId(projectId)
    setAddQuickNote(true)
  }, [])
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
      quickNoteProjectId,
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
      quickNoteProjectId,
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
