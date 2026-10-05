"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, toQueryString } from "@/lib/api-client"
import { resourceCache } from "@/lib/optimistic/domains"
import type { ResourceDto } from "@/lib/resources/dto"
import {
  activePendingMetadata,
  metadataPollInterval,
} from "@/lib/memory/metadata"
import { useSyncController, useSyncStore } from "@/components/sync-provider"
import { isActiveOperation, type SyncState } from "@/lib/sync/store"

import { WorkQueue } from "@/lib/memory/work-queue"

function writesBlockProgress(state: SyncState) {
  return Object.values(state.operations).some(
    (operation) =>
      isActiveOperation(operation) &&
      operation.entityKeys.some((key) =>
        ["resource", "project", "tag", "trash"].includes(key.split(":")[0]!)
      )
  )
}

/** One read-only poller per provider. It never refetches accumulated list pages. */
export function MetadataProgress() {
  const client = useQueryClient()
  const sync = useSyncController()
  const writesPending = useSyncStore(writesBlockProgress)
  useEffect(
    () =>
      sync.store.subscribe((state) => {
        // Cancel an older completion read before a new write changes the cache.
        if (writesBlockProgress(state))
          void client.cancelQueries({ queryKey: ["metadata-progress"] })
      }),
    [sync, client]
  )
  const [pending, setPending] = useState<{ ids: string[]; since: number }>({
    ids: [],
    since: 0,
  })
  useEffect(() => {
    let alive = true,
      scheduled = false
    const update = () => {
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        if (!alive) return
        const ids = activePendingMetadata(client)
        setPending((prev) =>
          ids.join(",") === prev.ids.join(",")
            ? prev
            : {
                ids,
                since:
                  !prev.ids.length || ids.some((id) => !prev.ids.includes(id))
                    ? Date.now()
                    : prev.since,
              }
        )
      })
    }
    update()
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "invalidate" &&
        event.query.queryKey[0] === "resources"
      )
        setPending((prev) =>
          prev.ids.length ? { ...prev, since: Date.now() } : prev
        )
      update()
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [client])
  useQuery({
    queryKey: ["metadata-progress", pending.ids],
    enabled: pending.ids.length > 0 && !writesPending,
    gcTime: 10_000,
    staleTime: 2_000,
    retry: 1,
    refetchInterval: () => metadataPollInterval(Date.now() - pending.since),
    refetchIntervalInBackground: false,
    queryFn: async ({ signal }) => {
      const queue = new WorkQueue(2)
      const batches = Array.from(
        { length: Math.ceil(pending.ids.length / 50) },
        (_, index) => pending.ids.slice(index * 50, (index + 1) * 50)
      )
      const responses = await Promise.all(
        batches.map((ids) =>
          queue.run(() =>
            api<{ items: { id: string; metadataStatus: string }[] }>(
              `/api/v1/resources/metadata-status${toQueryString({ ids: ids.join(",") })}`,
              { signal }
            )
          )
        )
      )
      const complete = responses
        .flatMap((response) => response.items)
        .filter((row) => row.metadataStatus !== "pending")
      await Promise.all(
        complete.map((row) =>
          queue.run(async () => {
            const resource = await api<ResourceDto>(
              `/api/v1/resources/${row.id}`,
              { signal }
            )
            if (!signal.aborted) resourceCache.accept(client, resource)
          })
        )
      )
      return responses.flatMap((response) => response.items)
    },
  })
  return null
}
