"use client"

import { useMutationState, useQueryClient } from "@tanstack/react-query"
import { useSyncStore } from "@/components/sync-provider"
import { inProject } from "@/lib/optimistic/lists"

/** Pending rows are presentation only: no invented entity IDs or API actions. */
export function PendingCreations({
  entity,
  filters = {},
}: {
  entity: "task" | "resource" | "project" | "quick-note"
  filters?: object
}) {
  const client = useQueryClient()
  const operations = useSyncStore((state) => state.operations)
  const pending = useMutationState({
    filters: {
      status: "pending",
      predicate: (mutation) =>
        mutation.options.mutationKey?.[0] === entity &&
        ["create", "bulk-create"].includes(
          String(mutation.options.mutationKey?.[1])
        ),
    },
    select: (mutation) => ({
      id: mutation.mutationId,
      variables: (mutation.state.variables ?? {}) as Record<string, unknown>,
    }),
  })
  const scope = filters as Record<string, unknown>
  const rows = pending.filter(({ id, variables: vars }) => {
    if (operations[`mutation:${id}`]?.phase === "reconciling") return false
    if (
      scope.parentId !== undefined &&
      (vars.parentId ?? null) !== scope.parentId
    )
      return false
    if (scope.projectId) {
      const ids = Array.isArray(vars.projectIds)
        ? vars.projectIds
        : [vars.projectId]
      if (
        !ids.some(
          (id) =>
            inProject(
              client,
              typeof id === "string" ? id : null,
              String(scope.projectId),
              !!scope.includeDescendants
            ) === true
        )
      )
        return false
    }
    if (scope.status && scope.status !== (vars.status ?? "todo")) return false
    if (scope.priority && scope.priority !== (vars.priority ?? "medium"))
      return false
    if (scope.type && scope.type !== vars.type) return false
    if (
      scope.tag ||
      scope.favorite ||
      scope.hasTasks ||
      scope.reviewed === true
    )
      return false
    if (
      scope.unsorted &&
      Array.isArray(vars.projectIds) &&
      vars.projectIds.length
    )
      return false
    if (scope.smartFilter && scope.smartFilter !== "no_date") return false
    if (scope.smartFilter === "no_date" && (vars.dueAt || vars.dueDate))
      return false
    return true
  })
  if (!rows.length) return null
  return (
    <ul aria-label="New items" className="mb-3 space-y-2">
      {rows.map(({ id, variables: vars }) => (
        <li
          key={id}
          className="rounded-lg border border-border bg-surface p-3 text-sm"
        >
          <span className="min-w-0 truncate">
            {String(
              vars.title ||
                vars.name ||
                vars.url ||
                (typeof vars.text === "string"
                  ? vars.text.split("\n")[0].slice(0, 120)
                  : null) ||
                (Array.isArray(vars.urls)
                  ? `${vars.urls.length} links`
                  : "Untitled")
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
