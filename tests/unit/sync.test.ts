import {
  MutationObserver,
  onlineManager,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiClientError } from "@/lib/api-client"
import { SyncController } from "@/lib/sync/controller"
import { describeMutation, syncMutation } from "@/lib/sync/mutations"
import { getSyncSummary } from "@/lib/sync/store"

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const cleanups: (() => void)[] = []
function setup() {
  const sync = new SyncController()
  const client = new QueryClient({
    mutationCache: sync.createMutationCache(),
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.mount()
  const disconnect = sync.connect(client)
  cleanups.push(() => {
    disconnect()
    client.unmount()
    client.clear()
  })
  return { sync, client }
}
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  onlineManager.setOnline(true)
  vi.restoreAllMocks()
})
const work = {
  label: "Saving task",
  source: "manual" as const,
  entityKeys: ["task:a"],
}

describe("sync lifecycle", () => {
  it("keeps concurrent writes visible until each settles, without counting reads", async () => {
    const { sync, client } = setup()
    await client.fetchQuery({ queryKey: ["read"], queryFn: async () => "data" })
    expect(getSyncSummary(sync.store.getState()).isSyncing).toBe(false)
    const a = deferred(),
      b = deferred()
    const first = client
      .getMutationCache()
      .build(client, {
        ...syncMutation("task.create"),
        mutationFn: () => a.promise,
      })
      .execute({ title: "A" })
    const second = client
      .getMutationCache()
      .build(client, {
        ...syncMutation("resource.create"),
        mutationFn: () => b.promise,
      })
      .execute({ title: "B" })
    await vi.waitFor(() =>
      expect(getSyncSummary(sync.store.getState()).active).toHaveLength(2)
    )
    a.resolve()
    await first
    expect(getSyncSummary(sync.store.getState()).active).toHaveLength(1)
    b.resolve()
    await second
    expect(getSyncSummary(sync.store.getState()).text).toBe("Saved")
  })

  it("hands a queued autosave over without claiming it has already saved", () => {
    const { sync } = setup()
    sync.queue("Saving note", "editor")
    expect(getSyncSummary(sync.store.getState()).text).toBe("Changes pending…")
    const id = sync.begin(work)
    sync.finish("editor")
    expect(sync.store.getState().lastSavedAt).toBeNull()
    expect(getSyncSummary(sync.store.getState()).isSyncing).toBe(true)
    sync.finish(id)
    expect(getSyncSummary(sync.store.getState()).text).toBe("Saved")
    expect(getSyncSummary(sync.store.getState(), Date.now() + 3_000).text).toBe(
      ""
    )
  })

  it("shows a slow operation and simultaneous failure without clearing the active write", () => {
    const { sync } = setup()
    const a = sync.begin(work),
      b = sync.begin({ ...work, entityKeys: ["task:b"] })
    sync.fail(b, new ApiClientError(400, "Invalid"))
    const summary = getSyncSummary(sync.store.getState(), Date.now() + 11_000)
    expect(summary.text).toBe("Still syncing… (1 need attention)")
    sync.dismiss(a)
    expect(summary.active).toHaveLength(1)
    expect(sync.store.getState().operations[a]).toBeDefined()
  })

  it("shows offline mutations as pending, then resumes", async () => {
    const { sync, client } = setup()
    onlineManager.setOnline(false)
    sync.store.getState().setOnline(false)
    const fn = vi.fn(async () => undefined)
    const saving = client
      .getMutationCache()
      .build(client, { ...syncMutation("task.create"), mutationFn: fn })
      .execute({})
    await vi.waitFor(() =>
      expect(getSyncSummary(sync.store.getState()).active[0]?.phase).toBe(
        "paused"
      )
    )
    expect(getSyncSummary(sync.store.getState()).text).toBe(
      "Offline — changes pending"
    )
    expect(fn).not.toHaveBeenCalled()
    sync.store.getState().setOnline(true)
    onlineManager.setOnline(true)
    await saving
    expect(getSyncSummary(sync.store.getState()).isSyncing).toBe(false)
  })

  it("tracks nested upload work once through finalization and retains actionable failure metadata", async () => {
    const { sync } = setup()
    const put = deferred(),
      complete = deferred()
    const saving = sync.track({ ...work, source: "upload" }, async (saved) => {
      await put.promise
      await complete.promise
      saved()
    })
    expect(getSyncSummary(sync.store.getState()).active).toHaveLength(1)
    put.resolve()
    await Promise.resolve()
    expect(getSyncSummary(sync.store.getState()).isSyncing).toBe(true)
    complete.resolve()
    await saving
    await expect(
      sync.track(work, async () => {
        throw new ApiClientError(422, "Invalid")
      })
    ).rejects.toThrow()
    expect(getSyncSummary(sync.store.getState()).failures[0].phase).toBe(
      "failed"
    )
  })

  it("treats network/5xx/timeout failures as uncertain and never offers create replay", async () => {
    const { sync, client } = setup()
    for (const error of [
      new TypeError("Network error"),
      new ApiClientError(503, "Unavailable"),
      new ApiClientError(408, "Timed out"),
    ]) {
      await expect(
        client
          .getMutationCache()
          .build(client, {
            ...syncMutation("task.create"),
            mutationFn: async () => {
              throw error
            },
          })
          .execute({ title: "Private draft" })
      ).rejects.toThrow()
    }
    expect(
      getSyncSummary(sync.store.getState()).failures.every(
        (op) => op.phase === "unknown-outcome" && !op.canRetry
      )
    ).toBe(true)
    expect(JSON.stringify(sync.store.getState())).not.toContain("Private draft")
  })

  it("retries safe assignments once and disables stale replay after a later edit", async () => {
    const { sync, client } = setup()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ApiClientError(400, "Rejected"))
      .mockResolvedValue(undefined)
    const mutation = client
      .getMutationCache()
      .build(client, { ...syncMutation("task.update"), mutationFn: fn })
    await expect(
      mutation.execute({ id: "a", patch: { title: "A" } })
    ).rejects.toThrow()
    const id = `mutation:${mutation.mutationId}`
    expect(sync.store.getState().operations[id].canRetry).toBe(true)
    const retry = sync.retry(id)
    expect(sync.store.getState().operations[id]?.message).toBeUndefined()
    await retry
    expect(fn).toHaveBeenCalledTimes(2)
    expect(sync.store.getState().operations[id]).toBeUndefined()

    const old = sync.begin(work, undefined, async () => fn())
    sync.fail(old, new ApiClientError(400, "Rejected"))
    sync.begin({ ...work, entityKeys: ["task:all"] })
    expect(sync.store.getState().operations[old].canRetry).toBe(false)
    await sync.retry(old)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("guards retries through repeated observer notifications", async () => {
    const { sync, client } = setup()
    const observer = new MutationObserver<
      unknown,
      Error,
      { id: string; patch: Record<string, unknown> }
    >(client, {
      ...syncMutation("resource.update"),
      mutationFn: async (): Promise<void> => {
        throw new ApiClientError(400, "Rejected")
      },
    })
    await expect(observer.mutate({ id: "a", patch: {} })).rejects.toThrow()
    const old = Object.values(sync.store.getState().operations)[0]
    sync.begin({ ...work, entityKeys: ["resource:a"] })
    const unsubscribe = observer.subscribe(() => {})
    expect(sync.store.getState().operations[old.id].canRetry).toBe(false)
    unsubscribe()
  })

  it("awaits fire-and-forget refreshes and retries a failed refresh without repeating the write", async () => {
    const { sync, client } = setup()
    const read = deferred<string>()
    let initial = true
    const query = new QueryObserver(client, {
      queryKey: ["tasks", "list"],
      queryFn: () => (initial ? Promise.resolve("old") : read.promise),
      retry: false,
    })
    const unsubscribe = query.subscribe(() => {})
    cleanups.push(unsubscribe)
    await vi.waitFor(() => expect(query.getCurrentResult().data).toBe("old"))
    initial = false
    const fn = vi.fn(async () => "saved")
    const rollback = vi.fn()
    const mutation = client.getMutationCache().build(client, {
      ...syncMutation("task.update"),
      mutationFn: fn,
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: ["tasks"] })
      },
      onError: rollback,
    })
    const saving = mutation.execute({ id: "a", patch: { title: "new" } })
    await vi.waitFor(() =>
      expect(getSyncSummary(sync.store.getState()).active[0]?.phase).toBe(
        "reconciling"
      )
    )
    read.reject(new Error("Refresh unavailable"))
    await saving
    const id = `mutation:${mutation.mutationId}`
    await vi.waitFor(() =>
      expect(sync.store.getState().operations[id]?.phase).toBe("failed")
    )
    expect(sync.store.getState().operations[id].message).toContain("Saved, but")
    expect(rollback).not.toHaveBeenCalled()
    initial = true
    await sync.retry(id)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sync.store.getState().operations[id]).toBeUndefined()
  })

  it("releases payload-bearing retry closures on mutation GC while preserving the error", async () => {
    const { sync, client } = setup()
    const mutation = client.getMutationCache().build(client, {
      ...syncMutation("resource.update"),
      mutationFn: async (): Promise<void> => {
        throw new ApiClientError(400, "Rejected")
      },
    })
    await expect(mutation.execute({ id: "a", patch: {} })).rejects.toThrow()
    client.getMutationCache().remove(mutation)
    expect(getSyncSummary(sync.store.getState()).failures[0].canRetry).toBe(
      false
    )
  })

  it("includes refreshes started in local onSettled without counting unrelated background reads", async () => {
    const { sync, client } = setup()
    const background = deferred<string>()
    const read = client.fetchQuery({
      queryKey: ["tasks", "background"],
      queryFn: () => background.promise,
    })
    await client
      .getMutationCache()
      .build(client, {
        ...syncMutation("task.create"),
        mutationFn: async () => undefined,
      })
      .execute({})
    expect(getSyncSummary(sync.store.getState()).isSyncing).toBe(false)
    background.resolve("done")
    await read

    const refreshed = deferred<string>()
    let initial = true
    const observer = new QueryObserver(client, {
      queryKey: ["tasks", "list"],
      queryFn: () => (initial ? Promise.resolve("old") : refreshed.promise),
    })
    cleanups.push(observer.subscribe(() => {}))
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("old"))
    initial = false
    await client
      .getMutationCache()
      .build(client, {
        ...syncMutation("task.create"),
        mutationFn: async () => undefined,
        onSettled: () => {
          void client.invalidateQueries({ queryKey: ["tasks", "list"] })
        },
      })
      .execute({})
    expect(getSyncSummary(sync.store.getState()).isSyncing).toBe(true)
    refreshed.resolve("new")
    await vi.waitFor(() =>
      expect(getSyncSummary(sync.store.getState()).isSyncing).toBe(false)
    )
  })

  it("resets on session change and ignores old completions", async () => {
    const { sync } = setup()
    sync.setSession("one")
    const pending = deferred()
    const saving = sync.track(work, async (saved) => {
      await pending.promise
      saved()
    })
    await vi.waitFor(() =>
      expect(
        sync.store.getState().operations[
          Object.keys(sync.store.getState().operations)[0]
        ]?.phase
      ).toBe("writing")
    )
    await Promise.resolve()
    expect(sync.setSession("two")).toBe(true)
    pending.resolve()
    await saving
    expect(sync.store.getState().operations).toEqual({})
    expect(sync.store.getState().lastSavedAt).toBeNull()
  })

  it("reconnects cleanly under Strict Mode and clears metadata on real unmount", async () => {
    const sync = new SyncController(),
      client = new QueryClient()
    const detach = sync.connect(client)
    sync.begin(work)
    detach()
    const detachAgain = sync.connect(client)
    await Promise.resolve()
    expect(getSyncSummary(sync.store.getState()).isSyncing).toBe(true)
    detachAgain()
    await Promise.resolve()
    expect(sync.store.getState().operations).toEqual({})
    client.clear()
  })

  it("bounds failed metadata without evicting active work", () => {
    const { sync } = setup()
    const active = sync.begin(work)
    for (let i = 0; i < 30; i++)
      sync.fail(sync.begin(work), new ApiClientError(400, "Rejected"))
    expect(getSyncSummary(sync.store.getState()).failures).toHaveLength(20)
    expect(sync.store.getState().operations[active]).toBeDefined()
  })

  it("excludes recurrence replays and gives bulk writes entity keys", () => {
    expect(
      describeMutation(syncMutation("task.update").meta.sync, {
        id: "a",
        patch: { rrule: null },
      }).safeRetry
    ).toBe(false)
    expect(
      describeMutation(syncMutation("task.bulk").meta.sync, {
        taskIds: ["a", "b"],
      }).entityKeys
    ).toContain("task:b")
  })
})
