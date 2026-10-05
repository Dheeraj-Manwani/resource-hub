"use client"

import { createContext, useContext, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useStore } from "zustand"

import { SyncController } from "@/lib/sync/controller"
import type { SyncState } from "@/lib/sync/store"

const SyncContext = createContext<SyncController | null>(null)

export function SyncProvider({
  controller,
  children,
}: {
  controller: SyncController
  children: React.ReactNode
}) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const disconnect = controller.connect(queryClient)
    const online = () => controller.store.getState().setOnline(navigator.onLine)
    online()
    window.addEventListener("online", online)
    window.addEventListener("offline", online)
    return () => {
      disconnect()
      window.removeEventListener("online", online)
      window.removeEventListener("offline", online)
    }
  }, [controller, queryClient])
  return (
    <SyncContext.Provider value={controller}>{children}</SyncContext.Provider>
  )
}

export function useSyncController() {
  const controller = useContext(SyncContext)
  if (!controller) throw new Error("SyncProvider is missing")
  return controller
}

export function useSyncStore<T>(selector: (state: SyncState) => T) {
  return useStore(useSyncController().store, selector)
}
