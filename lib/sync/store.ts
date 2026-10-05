import { createStore } from "zustand/vanilla"

export type SyncPhase =
  "queued" | "writing" | "reconciling" | "paused" | "failed" | "unknown-outcome"
export type SyncOperation = {
  id: string
  label: string
  source: "mutation" | "autosave" | "upload" | "manual"
  entityKeys: string[]
  phase: SyncPhase
  startedAt: number
  message?: string
  href?: string
  canRetry?: boolean
  draftKey?: string
}

export const isActiveOperation = (operation: SyncOperation) =>
  ["queued", "writing", "reconciling", "paused"].includes(operation.phase)

export type SyncState = {
  operations: Record<string, SyncOperation>
  online: boolean
  lastSavedAt: number | null
  upsert: (operation: SyncOperation) => void
  update: (id: string, patch: Partial<SyncOperation>) => void
  finish: (id: string) => void
  dismiss: (id: string) => void
  setOnline: (online: boolean) => void
  reset: () => void
}

export function createSyncStore() {
  return createStore<SyncState>()((set) => ({
    operations: {},
    online: true,
    lastSavedAt: null,
    upsert: (operation) =>
      set((state) => ({
        operations: { ...state.operations, [operation.id]: operation },
      })),
    update: (id, patch) =>
      set((state) => {
        if (!state.operations[id]) return state
        const operations = {
          ...state.operations,
          [id]: { ...state.operations[id], ...patch },
        }
        // Failures are metadata only and bounded; active work is never evicted.
        const failures = Object.values(operations)
          .filter((op) => !isActiveOperation(op))
          .sort((a, b) => b.startedAt - a.startedAt)
        failures.slice(20).forEach((op) => {
          delete operations[op.id]
        })
        return { operations }
      }),
    finish: (id) =>
      set((state) => {
        const operation = state.operations[id]
        if (!operation) return state
        const operations = { ...state.operations }
        delete operations[id]
        return {
          operations,
          lastSavedAt:
            operation.phase === "queued" ? state.lastSavedAt : Date.now(),
        }
      }),
    dismiss: (id) =>
      set((state) => {
        if (!state.operations[id] || isActiveOperation(state.operations[id]))
          return state
        const operations = { ...state.operations }
        delete operations[id]
        return { operations }
      }),
    setOnline: (online) => set({ online }),
    reset: () => set({ operations: {}, lastSavedAt: null }),
  }))
}

export type SyncStore = ReturnType<typeof createSyncStore>

export function getSyncSummary(
  state: Pick<SyncState, "operations" | "online" | "lastSavedAt">,
  now = Date.now()
) {
  const operations = Object.values(state.operations)
  const active = operations.filter(isActiveOperation)
  const failures = operations.filter((op) => !isActiveOperation(op))
  const queued = active.filter((op) => op.phase === "queued")
  const paused = active.filter((op) => op.phase === "paused")
  const slow = active.some((op) => now - op.startedAt >= 10_000)
  let text = ""
  if (active.length) {
    if (!state.online) text = "Offline — changes pending"
    else if (paused.length === active.length) text = "Waiting to sync…"
    else if (queued.length === active.length) text = "Changes pending…"
    else text = slow ? "Still syncing…" : "Syncing…"
    if (failures.length) text += ` (${failures.length} need attention)`
  } else if (failures.length) {
    text = failures.some((op) => op.phase === "unknown-outcome")
      ? "Couldn't confirm save"
      : "Couldn't sync changes"
  } else if (state.lastSavedAt !== null && now - state.lastSavedAt < 2000) {
    text = "Saved"
  }
  return { text, isSyncing: active.length > 0, active, failures, slow }
}
