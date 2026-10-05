import type { QueryClient } from "@tanstack/react-query"

type Layer<T> = { token: string; apply: (base: T | null) => T | null }
type Entry<T> = {
  base: T | null
  layers: Layer<T>[]
  write: (value: T | null) => void
}

/** One entity baseline and small patches, never entire cached list snapshots. */
export class OptimisticJournal<T> {
  private entries = new Map<string, Entry<T>>()
  private sequence = 0

  begin(
    id: string,
    base: T | null,
    apply: Layer<T>["apply"],
    write: Entry<T>["write"]
  ) {
    const entry = this.entries.get(id) ?? { base, layers: [], write }
    const token = `${id}:${++this.sequence}`
    entry.layers.push({ token, apply })
    this.entries.set(id, entry)
    this.render(entry)
    return token
  }

  settle(id: string, token: string | undefined, server?: T | null) {
    const entry = this.entries.get(id)
    if (
      !entry ||
      !token ||
      !entry.layers.some((layer) => layer.token === token)
    )
      return
    if (server !== undefined) entry.base = server
    entry.layers = entry.layers.filter((layer) => layer.token !== token)
    this.render(entry)
    if (!entry.layers.length) this.entries.delete(id)
  }

  accept(id: string, server: T, write: Entry<T>["write"]) {
    const entry = this.entries.get(id)
    if (!entry) {
      write(server)
      return
    }
    entry.base = server
    this.render(entry)
  }

  /** Commit a count-only API acknowledgment without committing newer layers. */
  commit(id: string, token: string | undefined) {
    const entry = this.entries.get(id)
    const layer = entry?.layers.find((layer) => layer.token === token)
    if (!entry || !layer) return
    entry.base = layer.apply(entry.base)
    this.settle(id, token)
  }

  project(id: string, server: T): T | null {
    const entry = this.entries.get(id)
    return entry
      ? entry.layers.reduce(
          (value, layer) => layer.apply(value),
          server as T | null
        )
      : server
  }
  rebase(id: string, server: T) {
    const entry = this.entries.get(id)
    if (entry) entry.base = server
  }

  has(id?: string) {
    return id ? this.entries.has(id) : this.entries.size > 0
  }
  values() {
    return [...this.entries].map(([id, entry]) => ({
      id,
      value: entry.layers.reduce(
        (value, layer) => layer.apply(value),
        entry.base
      ),
    }))
  }
  reset() {
    this.entries.clear()
  }
  private render(entry: Entry<T>) {
    entry.write(
      entry.layers.reduce((value, layer) => layer.apply(value), entry.base)
    )
  }
}

const journals = new WeakMap<
  QueryClient,
  Map<string, OptimisticJournal<unknown>>
>()
export function journalFor<T>(
  client: QueryClient,
  family: string
): OptimisticJournal<T> {
  let families = journals.get(client)
  if (!families) {
    families = new Map()
    journals.set(client, families)
  }
  let journal = families.get(family)
  if (!journal) {
    journal = new OptimisticJournal()
    families.set(family, journal)
  }
  return journal as OptimisticJournal<T>
}
export function resetJournals(client: QueryClient) {
  journals.get(client)?.forEach((journal) => journal.reset())
}
