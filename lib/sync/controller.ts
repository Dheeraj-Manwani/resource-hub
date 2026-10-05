import {
  isCancelledError,
  MutationCache,
  QueryClient,
} from "@tanstack/react-query"
import type { Mutation } from "@tanstack/react-query"

import { ApiClientError } from "@/lib/api-client"
import {
  WriteCoordinator,
  type WriteReservation,
} from "@/lib/optimistic/coordinator"
import { resetJournals } from "@/lib/optimistic/journal"
import { NoteDrafts } from "@/lib/optimistic/drafts"
import { describeMutation, getSyncMeta } from "./mutations"
import { createSyncStore, isActiveOperation, type SyncOperation } from "./store"

type Recovery = {
  run: () => Promise<unknown>
  isCurrent: () => boolean
  entityKeys: string[]
}
type WorkOptions = Pick<SyncOperation, "label" | "source"> &
  Partial<Pick<SyncOperation, "entityKeys" | "href">>
type WriteMutation = Mutation<unknown, Error, unknown, unknown>

const overlaps = (left: string[], right: string[]) =>
  left.some((a) =>
    right.some(
      (b) =>
        a === b ||
        (a.split(":")[0] === b.split(":")[0] &&
          (a.endsWith(":all") || b.endsWith(":all")))
    )
  )

const relatedRoots: Record<string, string[]> = {
  task: [
    "tasks",
    "calendar",
    "reminders",
    "projects",
    "overview",
    "resources",
    "tags",
    "search",
    "command-search",
  ],
  resource: [
    "resources",
    "projects",
    "tags",
    "overview",
    "search",
    "command-search",
  ],
  project: [
    "projects",
    "resources",
    "tasks",
    "quick-notes",
    "overview",
    "calendar",
    "search",
    "command-search",
  ],
  "quick-note": ["quick-notes", "projects"],
  tag: ["tags", "resources", "tasks", "overview", "search", "command-search"],
  trash: ["trash", "resources", "tasks", "projects", "overview"],
  reminder: ["reminders"],
  settings: ["settings"],
  token: ["tokens"],
}

export class SyncController {
  readonly store = createSyncStore()
  readonly drafts = new NoteDrafts()
  private recoveries = new Map<string, Recovery>()
  private acknowledged = new Set<string>()
  private reconciliations = new Map<string, Set<Promise<unknown>>>()
  private refreshErrors = new Map<string, unknown>()
  private finalizing = new Set<string>()
  private client: QueryClient | undefined
  private tracked = new Set<string>()
  private sequence = 0
  private session: string | undefined
  private writes = new WriteCoordinator()
  private reservations = new Map<string, WriteReservation>()

  begin(
    options: WorkOptions,
    id = `work:${++this.sequence}`,
    recovery?: () => Promise<unknown>
  ) {
    const entityKeys = options.entityKeys ?? []
    // A later edit prevents replay of an older payload, even if it subsequently fails.
    for (const [otherId, entry] of this.recoveries) {
      if (overlaps(entityKeys, entry.entityKeys)) {
        this.recoveries.delete(otherId)
        this.store.getState().update(otherId, { canRetry: false })
      }
    }
    const entry: Recovery | undefined = recovery
      ? {
          run: recovery,
          entityKeys,
          isCurrent: () => this.recoveries.get(id) === entry,
        }
      : undefined
    if (entry) this.recoveries.set(id, entry)
    this.tracked.add(id)
    this.acknowledged.delete(id)
    this.refreshErrors.delete(id)
    this.reconciliations.delete(id)
    this.store.getState().upsert({
      ...options,
      id,
      entityKeys,
      phase: "writing",
      startedAt: Date.now(),
    })
    return id
  }

  queue(label: string, id: string, entityKeys: string[] = []) {
    for (const [otherId, recovery] of this.recoveries) {
      if (overlaps(entityKeys, recovery.entityKeys)) {
        this.recoveries.delete(otherId)
        this.store.getState().update(otherId, { canRetry: false })
      }
    }
    if (this.store.getState().operations[id]) return
    this.tracked.add(id)
    this.store.getState().upsert({
      id,
      label,
      entityKeys,
      source: "autosave",
      phase: "queued",
      startedAt: Date.now(),
    })
  }

  acknowledge(id: string) {
    if (!this.tracked.has(id)) return
    this.acknowledged.add(id)
    this.store.getState().update(id, { phase: "reconciling" })
  }

  finish(id: string) {
    if (!this.tracked.has(id)) return
    this.store.getState().finish(id)
    this.release(id)
  }

  fail(id: string, error: unknown, refresh?: () => Promise<unknown>) {
    if (!this.tracked.has(id)) return
    const committed = this.acknowledged.has(id)
    const unknown =
      !committed &&
      !(
        error instanceof ApiClientError &&
        error.status < 500 &&
        error.status !== 408
      )
    if (committed && refresh)
      this.recoveries.set(id, {
        run: refresh,
        isCurrent: () => true,
        entityKeys: [],
      })
    const recovery = this.recoveries.get(id)
    this.store.getState().update(id, {
      phase: unknown ? "unknown-outcome" : "failed",
      message: committed
        ? "Saved, but couldn't refresh this view. Retry refresh or reopen the view."
        : unknown
          ? "The server may have saved this change. Check the current value before submitting it again."
          : "This change wasn't saved. Review it and try again.",
      canRetry: !!recovery?.isCurrent(),
    })
    // Pruning the store also releases external recoveries/acknowledgments.
    for (const trackedId of this.tracked) {
      if (!this.store.getState().operations[trackedId]) this.release(trackedId)
    }
  }

  dismiss(id: string) {
    if (
      this.store.getState().operations[id] &&
      !isActiveOperation(this.store.getState().operations[id])
    ) {
      this.store.getState().dismiss(id)
      this.release(id)
    }
  }

  async retry(id: string) {
    const operation = this.store.getState().operations[id]
    const recovery = this.recoveries.get(id)
    if (!operation || isActiveOperation(operation) || !recovery?.isCurrent())
      return
    this.store.getState().update(id, {
      phase: "writing",
      canRetry: false,
      message: undefined,
      startedAt: Date.now(),
    })
    try {
      await recovery.run()
      this.finish(id)
    } catch (error) {
      this.fail(id, error)
    }
  }

  resolveDraft(key: string) {
    for (const operation of Object.values(this.store.getState().operations)) {
      if (operation.draftKey === key && !isActiveOperation(operation))
        this.dismiss(operation.id)
    }
  }

  async track<T>(
    options: WorkOptions,
    work: (saved: () => void, isCurrent: () => boolean) => Promise<T>
  ) {
    const id = this.begin(options)
    const reservation = this.writes.reserve(options.entityKeys ?? [])
    this.reservations.set(id, reservation)
    if (reservation.waiting)
      this.store.getState().update(id, { phase: "paused" })
    try {
      await reservation.ready
      if (reservation.cancelled)
        throw new ApiClientError(
          499,
          "Save cancelled because the session changed"
        )
      this.store.getState().update(id, { phase: "writing" })
      const result = await work(
        () => this.acknowledge(id),
        () => !reservation.cancelled
      )
      this.finish(id)
      return result
    } catch (error) {
      this.fail(
        id,
        error,
        this.client
          ? () => this.refreshEntities(options.entityKeys ?? [])
          : undefined
      )
      throw error
    } finally {
      reservation.release()
      this.reservations.delete(id)
    }
  }

  reset() {
    this.drafts.reset()
    this.writes.reset()
    this.reservations.clear()
    if (this.client) resetJournals(this.client)
    this.tracked.clear()
    this.recoveries.clear()
    this.acknowledged.clear()
    this.reconciliations.clear()
    this.refreshErrors.clear()
    this.finalizing.clear()
    this.store.getState().reset()
  }

  setSession(id: string) {
    const changed = this.session !== undefined && this.session !== id
    if (changed) this.reset()
    this.session = id
    return changed
  }

  private release(id: string) {
    this.tracked.delete(id)
    this.recoveries.delete(id)
    this.acknowledged.delete(id)
    this.reconciliations.delete(id)
    this.refreshErrors.delete(id)
    this.finalizing.delete(id)
  }

  createMutationCache() {
    const originals = new WeakMap<
      object,
      NonNullable<
        Mutation<unknown, unknown, unknown, unknown>["options"]["mutationFn"]
      >
    >()
    const cache = new MutationCache({
      onMutate: (_variables, mutation) => {
        const meta = getSyncMeta(mutation.options.meta)
        if (!meta) {
          if (process.env.NODE_ENV !== "production")
            console.warn(
              "Persistence mutation missing sync metadata",
              mutation.options.mutationKey
            )
          return
        }
        const description = describeMutation(meta, mutation.state.variables)
        const id = `mutation:${mutation.mutationId}`
        const keys = [...description.entityKeys]
        if (
          mutation.options.mutationKey?.at(-1) === "move" ||
          (meta.entity === "tag" &&
            ["rename", "merge"].includes(
              String(mutation.options.mutationKey?.at(-1))
            ))
        )
          keys.push(`${meta.entity}:all`)
        const reservation = this.writes.reserve(keys)
        this.reservations.set(id, reservation)
        const original = originals.get(mutation) ?? mutation.options.mutationFn
        if (original) {
          originals.set(mutation, original)
          mutation.options.mutationFn = async (variables, context) => {
            await reservation.ready
            if (reservation.cancelled)
              throw new ApiClientError(
                499,
                "Save cancelled because the session changed"
              )
            this.store.getState().update(id, { phase: "writing" })
            return original(variables, context)
          }
        }
        this.begin(
          { label: meta.label, source: "mutation", ...description },
          `mutation:${mutation.mutationId}`,
          description.safeRetry
            ? () => mutation.execute(mutation.state.variables)
            : undefined
        )
        if (reservation.waiting)
          this.store.getState().update(id, { phase: "paused" })
      },
      onSuccess: (_data, _variables, _context, mutation) => {
        if (
          getSyncMeta(mutation.options.meta) &&
          !this.tracked.has(`mutation:${mutation.mutationId}`)
        ) {
          mutation.options.onSuccess = undefined
          mutation.options.onSettled = undefined
          return
        }
        this.acknowledge(`mutation:${mutation.mutationId}`)
      },
      onError: (_error, _variables, _context, mutation) => {
        if (
          getSyncMeta(mutation.options.meta) &&
          !this.tracked.has(`mutation:${mutation.mutationId}`)
        ) {
          mutation.options.onError = undefined
          mutation.options.onSettled = undefined
        }
      },
      onSettled: async (_data, error, _variables, _context, mutation) => {
        const id = `mutation:${mutation.mutationId}`
        if (error || !this.tracked.has(id)) return
        // Await refetches started by existing callbacks, without issuing extra reads.
        // Refresh failures are kept separate so they never trigger optimistic rollback.
        await Promise.all(this.reconciliations.get(id) ?? [])
      },
    })
    cache.subscribe((event) => {
      if (
        event.type !== "updated" ||
        !event.mutation ||
        !["success", "error"].includes(event.mutation.state.status)
      )
        return
      const id = `mutation:${event.mutation.mutationId}`
      this.reservations.get(id)?.release()
      this.reservations.delete(id)
    })
    return cache
  }

  connect(client: QueryClient) {
    this.client = client
    const update = (mutation: WriteMutation) => {
      const id = `mutation:${mutation.mutationId}`
      if (!this.tracked.has(id) || !getSyncMeta(mutation.options.meta)) return
      if (mutation.state.status === "pending") {
        this.store.getState().update(id, {
          phase:
            mutation.state.isPaused || this.reservations.get(id)?.waiting
              ? "paused"
              : this.acknowledged.has(id)
                ? "reconciling"
                : "writing",
        })
      } else if (mutation.state.status === "success") {
        if (this.finalizing.has(id)) return
        this.finalizing.add(id)
        // Local onSettled callbacks run after the global callback. Include their
        // refreshes too, even if a hook didn't return the invalidation promise.
        void Promise.all(this.reconciliations.get(id) ?? []).then(() => {
          this.finalizing.delete(id)
          if (!this.tracked.has(id)) return
          if (this.refreshErrors.has(id))
            this.fail(id, this.refreshErrors.get(id), () =>
              this.refresh(client, mutation)
            )
          else this.finish(id)
        })
      } else if (mutation.state.status === "error")
        this.fail(id, mutation.state.error, () =>
          this.refresh(client, mutation)
        )
    }
    client.getMutationCache().getAll().forEach(update)
    const disconnectQueries = client.getQueryCache().subscribe((event) => {
      if (
        event.type !== "updated" ||
        event.action.type !== "fetch" ||
        !event.query.state.isInvalidated
      )
        return
      // Query publishes its fetch event before installing its new promise.
      queueMicrotask(() => {
        if (!event.query.promise) return
        for (const mutation of client.getMutationCache().getAll()) {
          const id = `mutation:${mutation.mutationId}`
          const meta = getSyncMeta(mutation.options.meta)
          if (
            this.tracked.has(id) &&
            this.acknowledged.has(id) &&
            mutation.state.status === "pending" &&
            meta &&
            relatedRoots[meta.entity]?.includes(String(event.query.queryKey[0]))
          ) {
            this.observeRefresh(id, event.query.promise)
          }
        }
      })
    })
    const disconnectMutations = client.getMutationCache().subscribe((event) => {
      if (event.type === "removed") {
        const id = `mutation:${event.mutation.mutationId}`
        // Keep actionable errors after Query GC, but release payload-bearing retries.
        this.recoveries.delete(id)
        this.store.getState().update(id, { canRetry: false })
      } else if (event.mutation) update(event.mutation)
    })
    return () => {
      disconnectQueries()
      disconnectMutations()
      if (this.client === client) this.client = undefined
      // Preserve work during React Strict Mode's immediate reconnect, but release
      // retries and metadata once the provider really unmounts.
      queueMicrotask(() => {
        if (!this.client) this.reset()
      })
    }
  }

  private observeRefresh(id: string, promise: Promise<unknown>) {
    const pending = this.reconciliations.get(id) ?? new Set<Promise<unknown>>()
    pending.add(
      promise.then(
        () => undefined,
        (error) => {
          if (this.tracked.has(id) && !isCancelledError(error))
            this.refreshErrors.set(id, error)
        }
      )
    )
    this.reconciliations.set(id, pending)
  }

  private refresh(client: QueryClient, mutation: WriteMutation) {
    const meta = getSyncMeta(mutation.options.meta)
    return client.invalidateQueries(
      {
        predicate: (query) =>
          !!meta &&
          !!relatedRoots[meta.entity]?.includes(String(query.queryKey[0])),
      },
      { throwOnError: true }
    )
  }

  private refreshEntities(entityKeys: string[]) {
    const roots = new Set(
      entityKeys.flatMap((key) => relatedRoots[key.split(":")[0]] ?? [])
    )
    return (
      this.client?.invalidateQueries(
        { predicate: (query) => roots.has(String(query.queryKey[0])) },
        { throwOnError: true }
      ) ?? Promise.resolve()
    )
  }
}
