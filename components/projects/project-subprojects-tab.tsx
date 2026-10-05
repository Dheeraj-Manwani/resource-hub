"use client"

import { PendingCreations } from "@/components/pending-creations"

import { FolderPlusIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useRef, useState } from "react"

import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCreateProject, useProjectTree } from "@/hooks/queries/projects"
import { buildProjectTree, findNode, flattenTree } from "@/lib/projects/tree"

import { ProjectIcon } from "./project-icon"

function InlineCreate({
  parentId,
  onDone,
}: {
  parentId: string
  onDone: () => void
}) {
  const [name, setName] = useState("")
  const create = useCreateProject()
  const submittedRef = useRef(false)

  function submit() {
    if (submittedRef.current) return
    const trimmed = name.trim()
    if (!trimmed) return onDone()
    submittedRef.current = true
    create.mutate(
      { name: trimmed, parentId },
      { onSuccess: onDone, onError: () => (submittedRef.current = false) }
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-1.5">
      <FolderPlusIcon className="size-4 shrink-0 text-subtle" />
      <Input
        autoFocus
        disabled={create.isPending}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
          if (e.key === "Escape" && !create.isPending) onDone()
        }}
        placeholder="Sub-project name"
        className="h-7 border-none bg-transparent px-0 focus-visible:ring-0"
      />
    </div>
  )
}

/** Direct children of this project, or (with "include sub-projects") every
 * descendant flattened with relative indentation. Reuses the sidebar's
 * already-cached project tree query, so this tab needs no network call of
 * its own. */
export function ProjectSubprojectsTab({
  projectId,
  includeDescendants,
}: {
  projectId: string
  includeDescendants: boolean
}) {
  const { data: flat } = useProjectTree()
  const [creating, setCreating] = useState(false)

  const { node, rows } = useMemo(() => {
    if (!flat) return { node: null, rows: [] }
    const tree = buildProjectTree(flat)
    const found = findNode(tree, projectId)
    if (!found) return { node: null, rows: [] }
    return {
      node: found,
      rows: includeDescendants
        ? flattenTree(found.children, () => false)
        : found.children,
    }
  }, [flat, projectId, includeDescendants])

  if (!flat) return null
  const baseDepth = (node?.depth ?? 0) + 1

  if (!rows.length && !creating) {
    return (
      <EmptyState
        icon={FolderPlusIcon}
        title="No sub-projects yet"
        description="Split this project into smaller pieces, each with its own resources and tasks."
      >
        <Button onClick={() => setCreating(true)}>
          <FolderPlusIcon />
          New sub-project
        </Button>
      </EmptyState>
    )
  }

  return (
    <div>
      <div className="mb-2 flex h-6 items-center justify-end">
        {!creating ? (
          <Button variant="outline" size="xs" onClick={() => setCreating(true)}>
            <FolderPlusIcon />
            New sub-project
          </Button>
        ) : null}
      </div>
      <PendingCreations entity="project" filters={{ parentId: projectId }} />
      <div className="space-y-2">
        {rows.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            style={{ marginLeft: `${(p.depth - baseDepth) * 20 + 12}px` }}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-brand/40"
          >
            <ProjectIcon icon={p.icon} color={p.color} size={18} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {p.name}
            </span>
            <span className="shrink-0 text-xs text-subtle">
              {p.directCount} {p.directCount === 1 ? "resource" : "resources"}
            </span>
          </Link>
        ))}
        {creating ? (
          <InlineCreate
            parentId={projectId}
            onDone={() => setCreating(false)}
          />
        ) : null}
      </div>
    </div>
  )
}
