"use client"

import { CalendarIcon, FolderIcon, HashIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { useProjectOptions } from "@/components/projects/project-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCreateTask } from "@/hooks/queries/tasks"
import { formatDate } from "@/lib/format"
import { parseQuickAdd } from "@/lib/tasks/quick-add"

import { PriorityDot } from "./task-priority"

/** Resolves `#query` against the project tree: `#parent/child` matches a
 * full path (case-insensitive); a bare `#name` fuzzy-matches any project
 * name. Returns `null` when nothing matches (the task still gets created,
 * just unfiled). */
function resolveProjectQuery(
  query: string,
  options: ReturnType<typeof useProjectOptions>["options"]
): { id: string; name: string } | null {
  const q = query.toLowerCase()
  if (q.includes("/")) {
    const parts = q.split("/")
    const leaf = parts.at(-1)!
    function pathOf(id: string): string[] {
      const node = options.find((o) => o.id === id)
      if (!node) return []
      return node.parentId ? [...pathOf(node.parentId), node.name] : [node.name]
    }
    const match = options.find((o) => {
      if (o.name.toLowerCase() !== leaf) return false
      const path = pathOf(o.id).map((p) => p.toLowerCase())
      return parts.every((part) => path.includes(part))
    })
    return match ? { id: match.id, name: match.name } : null
  }
  const exact = options.find((o) => o.name.toLowerCase() === q)
  const fuzzy = exact ?? options.find((o) => o.name.toLowerCase().includes(q))
  return fuzzy ? { id: fuzzy.id, name: fuzzy.name } : null
}

export function QuickAddBar({
  initialText = "",
  onDone,
  autoFocus = true,
  defaultProject,
  resourceIds,
}: {
  resourceIds?: string[]
  initialText?: string
  onDone?: () => void
  autoFocus?: boolean
  /** Pre-selected project (e.g. the project page) — an explicit `#other`
   * token in the text still wins, since multi-word project names can't
   * round-trip through the `#` syntax. */
  defaultProject?: { id: string; name: string }
}) {
  const [text, setText] = useState(initialText)
  const create = useCreateTask()
  const { options } = useProjectOptions()
  const ref = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => parseQuickAdd(text), [text])
  const typedProject = parsed.projectQuery
    ? resolveProjectQuery(parsed.projectQuery, options)
    : null
  const selectedDefault = defaultProject
    ? {
        ...defaultProject,
        name:
          defaultProject.name ||
          options.find((option) => option.id === defaultProject.id)?.name ||
          "Project",
      }
    : null
  const project = typedProject ?? (parsed.projectQuery ? null : selectedDefault)

  function submit() {
    if (!parsed.title.trim() || create.isPending) return
    const submitted = text
    create.mutate(
      {
        title: parsed.title,
        resourceIds,
        priority: parsed.priority ?? undefined,
        tags: parsed.tags.length ? parsed.tags : undefined,
        projectId: project?.id,
        startAt: parsed.startAt?.toISOString() ?? null,
        dueAt: parsed.dueAt?.toISOString() ?? null,
        dueDate: parsed.dueDate,
        allDay: parsed.allDay,
      },
      {
        onSuccess: () => {
          setText((current) => (current === submitted ? "" : current))
          onDone?.()
        },
      }
    )
  }

  const hasChips = !!(
    parsed.priority ||
    parsed.tags.length ||
    project ||
    parsed.dueAt ||
    parsed.dueDate
  )

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          ref={ref}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault()
              submit()
            } else if (e.key === "Escape" && !create.isPending) {
              setText("")
              onDone?.()
            }
          }}
          placeholder={`finish landing page friday 5pm #project !high`}
          className="h-10 flex-1 text-sm"
        />
        <Button
          onClick={submit}
          loading={create.isPending}
          disabled={!parsed.title.trim() || create.isPending}
        >
          Add
        </Button>
      </div>
      {hasChips ? (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs">
          {parsed.priority ? (
            <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5">
              <PriorityDot priority={parsed.priority} />
              {parsed.priority}
            </span>
          ) : null}
          {(parsed.dueAt ?? parsed.dueDate) ? (
            <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5">
              <CalendarIcon className="size-3" />
              {formatDate(parsed.dueAt ?? parsed.dueDate)}
            </span>
          ) : null}
          {project ? (
            <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-brand">
              <FolderIcon className="size-3" />
              {project.name}
            </span>
          ) : parsed.projectQuery ? (
            <span className="text-subtle">
              No project matches &quot;{parsed.projectQuery}&quot;
            </span>
          ) : null}
          {parsed.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5"
            >
              <HashIcon className="size-3" />
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
