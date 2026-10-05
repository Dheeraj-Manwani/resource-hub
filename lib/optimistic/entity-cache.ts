import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query"
import { journalFor } from "./journal"
import { capturePositions, reconcileList, writeLists } from "./lists"

export function entityCache<T extends { id: string }, F>(config: {
  family: string
  lists: QueryKey
  detail: (id: string) => QueryKey
  matches: (client: QueryClient, value: T, filters: F) => boolean | undefined
  compare: (filters: F) => (a: T, b: T) => number
  decorate?: (client: QueryClient, value: T) => T
}) {
  const read = (client: QueryClient, id: string) => {
    const detail = client.getQueryData<T>(config.detail(id))
    if (detail) return detail
    for (const [, data] of client.getQueriesData<
      InfiniteData<{ items: T[]; nextCursor: string | null }>
    >({ queryKey: config.lists })) {
      const item = data?.pages
        .flatMap((page) => page.items)
        .find((item) => item.id === id)
      if (item) return item
    }
    return null
  }
  const write =
    (
      client: QueryClient,
      id: string,
      positions = capturePositions<T>(client, config.lists, id)
    ) =>
    (value: T | null) => {
      if (value && config.decorate) value = config.decorate(client, value)
      if (value) client.setQueryData(config.detail(id), value)
      // Keep an open detail readable while a deletion is only speculative.
      writeLists(
        client,
        config.lists,
        id,
        value,
        (item, filters: F) => config.matches(client, item, filters),
        config.compare,
        positions
      )
    }
  return {
    read,
    begin: (
      client: QueryClient,
      id: string,
      apply: (value: T | null) => T | null
    ) =>
      journalFor<T>(client, config.family).begin(
        id,
        read(client, id),
        apply,
        write(client, id)
      ),
    settle: (
      client: QueryClient,
      id: string,
      token?: string,
      server?: T | null
    ) => journalFor<T>(client, config.family).settle(id, token, server),
    commit: (client: QueryClient, id: string, token?: string) =>
      journalFor<T>(client, config.family).commit(id, token),
    accept: (client: QueryClient, value: T) =>
      journalFor<T>(client, config.family).accept(
        value.id,
        value,
        write(client, value.id)
      ),
    project: (client: QueryClient, value: T) => {
      const projected =
        journalFor<T>(client, config.family).project(value.id, value) ?? value
      return config.decorate ? config.decorate(client, projected) : projected
    },
    received: (client: QueryClient, value: T) => {
      const journal = journalFor<T>(client, config.family)
      journal.rebase(value.id, value)
      const projected = journal.project(value.id, value) ?? value
      return config.decorate ? config.decorate(client, projected) : projected
    },
    projectList: (
      client: QueryClient,
      data: InfiniteData<{ items: T[]; nextCursor: string | null }>,
      filters: F
    ) => {
      if (config.decorate)
        data = {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => config.decorate!(client, item)),
          })),
        }
      for (const { id, value } of journalFor<T>(
        client,
        config.family
      ).values()) {
        data = reconcileList(
          data,
          id,
          value && config.decorate ? config.decorate(client, value) : value,
          (item) => config.matches(client, item, filters),
          config.compare(filters)
        )
      }
      return data
    },
    pending: (client: QueryClient) =>
      journalFor<T>(client, config.family).has(),
  }
}
