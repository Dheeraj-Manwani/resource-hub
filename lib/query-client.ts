import { QueryClient } from "@tanstack/react-query"
import { ApiClientError } from "./api-client"
import type { SyncController } from "./sync/controller"

/** TTLs apply only after the last observer leaves; active views and writes survive. */
export function createAppQueryClient(sync: SyncController) {
  const client = new QueryClient({
    mutationCache: sync.createMutationCache(),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) =>
          !(error instanceof ApiClientError && error.status < 500) && count < 2,
      },
      mutations: { gcTime: 120_000 },
    },
  })
  for (const root of ["resources", "tasks", "quick-notes"])
    client.setQueryDefaults([root], { gcTime: 120_000 })
  for (const root of ["resources", "tasks"])
    client.setQueryDefaults([root, "detail"], { gcTime: 60_000 })
  client.setQueryDefaults(["resources", "readme"], { gcTime: 60_000 })
  client.setQueryDefaults(["calendar"], { gcTime: 60_000 })
  for (const root of ["search", "command-search"])
    client.setQueryDefaults([root], { gcTime: 30_000 })
  return client
}
