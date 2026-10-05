import { QueryObserver } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { WorkQueue } from "@/lib/memory/work-queue"
import {
  activePendingMetadata,
  metadataPollInterval,
} from "@/lib/memory/metadata"
import { createAppQueryClient } from "@/lib/query-client"
import { SyncController } from "@/lib/sync/controller"
import { syncMutation } from "@/lib/sync/mutations"

afterEach(() => vi.useRealTimers())
it("bounds overlapping batches and releases a failed worker's slot", async () => {
  const queue = new WorkQueue(3)
  let active = 0,
    peak = 0,
    finished = 0
  const batch = Array.from({ length: 12 }, (_, i) =>
    queue.run(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      finished++
      if (i === 2) throw new Error("Failed transfer")
      return i
    })
  )
  const results = await Promise.allSettled(batch)
  expect(peak).toBe(3)
  expect(finished).toBe(12)
  expect(results.filter((row) => row.status === "rejected")).toHaveLength(1)
})
it("deduplicates metadata reads from active lists/details and skips inactive cached pages", () => {
  const client = createAppQueryClient(new SyncController())
  client.setQueryData(["resources", "list", {}], {
    pages: [
      {
        items: [
          { id: "a", metadataStatus: "pending" },
          { id: "b", metadataStatus: "ok" },
        ],
      },
    ],
  })
  client.setQueryData(["resources", "detail", "a"], {
    id: "a",
    metadataStatus: "pending",
  })
  client.setQueryData(["resources", "list", { type: "note" }], {
    pages: [{ items: [{ id: "hidden", metadataStatus: "pending" }] }],
  })
  const list = new QueryObserver(client, {
    queryKey: ["resources", "list", {}],
    staleTime: Infinity,
  })
  const detail = new QueryObserver(client, {
    queryKey: ["resources", "detail", "a"],
    staleTime: Infinity,
  })
  const offList = list.subscribe(() => {}),
    offDetail = detail.subscribe(() => {})
  expect(activePendingMetadata(client)).toEqual(["a"])
  offList()
  offDetail()
  expect(activePendingMetadata(client)).toEqual([])
  client.clear()
})
it("backs off long-running metadata jobs without falsely marking them saved", () => {
  expect(metadataPollInterval(0)).toBe(3000)
  expect(metadataPollInterval(60_000)).toBe(15_000)
  expect(metadataPollInterval(120_000)).toBe(60_000)
})
it("evicts inactive search/detail/list caches at their budgets and preserves observed data", async () => {
  vi.useFakeTimers()
  const client = createAppQueryClient(new SyncController())
  const search = ["search", { q: "large" }],
    detail = ["resources", "detail", "a"],
    list = ["resources", "list", {}],
    live = ["tasks", "detail", "live"]
  for (const key of [search, detail, list, live])
    client.setQueryData(key, { body: "document" })
  const observer = new QueryObserver(client, {
    queryKey: live,
    staleTime: Infinity,
  })
  const off = observer.subscribe(() => {})
  await vi.advanceTimersByTimeAsync(30_001)
  expect(client.getQueryData(search)).toBeUndefined()
  expect(client.getQueryData(detail)).toBeDefined()
  await vi.advanceTimersByTimeAsync(30_000)
  expect(client.getQueryData(detail)).toBeUndefined()
  expect(client.getQueryData(list)).toBeDefined()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(client.getQueryData(list)).toBeUndefined()
  expect(client.getQueryData(live)).toBeDefined()
  off()
  client.clear()
})
it("does not garbage-collect an unobserved pending save at the completed-mutation deadline", async () => {
  vi.useFakeTimers()
  const sync = new SyncController(),
    client = createAppQueryClient(sync)
  const disconnect = sync.connect(client)
  let resolve!: () => void
  const pending = new Promise<void>((yes) => {
    resolve = yes
  })
  const mutation = client
    .getMutationCache()
    .build(client, {
      ...syncMutation("task.update"),
      mutationFn: () => pending,
    })
  const saving = mutation.execute({ id: "a", patch: { title: "new" } })
  await vi.advanceTimersByTimeAsync(180_000)
  expect(client.getMutationCache().getAll()).toContain(mutation)
  expect(mutation.state.status).toBe("pending")
  resolve()
  await saving
  await vi.advanceTimersByTimeAsync(120_001)
  expect(client.getMutationCache().getAll()).not.toContain(mutation)
  disconnect()
  client.clear()
})
