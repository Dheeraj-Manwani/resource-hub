import type { QueryClient, QueryKey } from "@tanstack/react-query"
import { journalFor } from "./journal"

/** Small-list journals retain one row and its positions, not whole lists. */
export function rowCache<T>(
  family: string,
  root: QueryKey,
  identity: (row: T) => string,
  matches: (row: T, key: QueryKey, client: QueryClient) => boolean = () => true
) {
  const journal = (client: QueryClient) => journalFor<T>(client, family)
  const read = (client: QueryClient, id: string): T | null => {
    for (const [, data] of client.getQueriesData<{ items: T[] }>({
      queryKey: root,
    })) {
      const row = data?.items?.find((row) => identity(row) === id)
      if (row) return row
    }
    return null
  }
  const write = (client: QueryClient, id: string) => {
    const positions = new Map<string, number>()
    for (const query of client.getQueryCache().findAll({ queryKey: root })) {
      const index = (
        query.state.data as { items?: T[] } | undefined
      )?.items?.findIndex((row) => identity(row) === id)
      if (index !== undefined && index >= 0)
        positions.set(query.queryHash, index)
    }
    return (row: T | null) => {
      for (const query of client.getQueryCache().findAll({ queryKey: root })) {
        client.setQueryData<{ items: T[] }>(query.queryKey, (data) => {
          if (!data?.items) return data
          const index = data.items.findIndex((item) => identity(item) === id)
          const position = index >= 0 ? index : positions.get(query.queryHash)
          if (position === undefined) return data
          const items = data.items.filter((item) => identity(item) !== id)
          if (
            row &&
            position !== undefined &&
            matches(row, query.queryKey, client)
          )
            items.splice(Math.min(position, items.length), 0, row)
          return { ...data, items }
        })
      }
    }
  }
  return {
    read,
    begin: (
      client: QueryClient,
      id: string,
      apply: (row: T | null) => T | null
    ) => journal(client).begin(id, read(client, id), apply, write(client, id)),
    settle: (
      client: QueryClient,
      id: string,
      token?: string,
      server?: T | null
    ) => journal(client).settle(id, token, server),
    commit: (client: QueryClient, id: string, token?: string) =>
      journal(client).commit(id, token),
    received: (client: QueryClient, items: T[]) => {
      items.forEach((row) => journal(client).rebase(identity(row), row))
      return items
    },
    project: (client: QueryClient, items: T[], key: QueryKey) =>
      items.flatMap((row) => {
        const value = journal(client).project(identity(row), row)
        return value && matches(value, key, client) ? [value] : []
      }),
    pending: (client: QueryClient) => journal(client).has(),
  }
}
