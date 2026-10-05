"use client"

import { LoaderCircleIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 py-3 text-sm text-text-muted",
        className
      )}
    >
      <LoaderCircleIcon
        aria-hidden
        className="size-4 animate-spin motion-reduce:animate-none"
      />
      <span>{label}</span>
    </div>
  )
}

export type QueryState = {
  data: unknown
  isPending: boolean
  isFetching: boolean
  isError: boolean
  fetchStatus?: "fetching" | "paused" | "idle"
  refetch: () => Promise<unknown>
}
export function QueryFeedback({
  query,
  label,
  loading = true,
}: {
  query: QueryState
  label: string
  loading?: boolean
}) {
  if (query.isError)
    return (
      <div
        role="alert"
        className="my-3 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
      >
        <TriangleAlertIcon
          aria-hidden
          className="size-4 shrink-0 text-destructive"
        />
        <span className="flex-1">
          Couldn&apos;t {query.data === undefined ? "load" : "refresh"} {label}.
          {query.data !== undefined ? " Showing previously loaded data." : ""}
        </span>
        <Button
          size="xs"
          variant="outline"
          disabled={query.isFetching || query.fetchStatus === "paused"}
          onClick={() => void query.refetch().catch(() => {})}
        >
          {query.fetchStatus === "paused"
            ? "Waiting for connection…"
            : query.isFetching
              ? "Retrying…"
              : "Retry"}
        </Button>
      </div>
    )
  if (query.fetchStatus === "paused")
    return (
      <LoadingState
        label={`Waiting for connection to ${query.data === undefined ? "load" : "update"} ${label}…`}
      />
    )
  if (query.isPending && query.data === undefined && loading)
    return <LoadingState label={`Loading ${label}…`} />
  if (query.isFetching && query.data !== undefined)
    return <LoadingState label={`Updating ${label}…`} />
  return null
}
