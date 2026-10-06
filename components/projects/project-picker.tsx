"use client"

import {
  CheckIcon,
  FolderIcon,
  InboxIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useCreateProject, useProjectTree } from "@/hooks/queries/projects"
import { buildProjectTree, flattenTree } from "@/lib/projects/tree"
import { cn } from "@/lib/utils"

const neverCollapsed = () => false

/** Flattened, always-expanded project options for pickers (a personal
 * library's tree is small enough to show in full). */
export function useProjectOptions() {
  const { data: flat = [], isPending } = useProjectTree()
  const options = useMemo(
    () => flattenTree(buildProjectTree(flat), neverCollapsed),
    [flat]
  )
  return { options, isPending }
}

function ProjectRow({
  depth,
  color,
  name,
  right,
  onClick,
  className,
}: {
  depth: number
  color?: string | null
  name: React.ReactNode
  right?: React.ReactNode
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-sm hover:bg-white/[0.06]",
        className
      )}
    >
      <FolderIcon
        className="size-3.5 shrink-0"
        style={{ color: color ?? undefined }}
      />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {right}
    </button>
  )
}

function QuickCreate({
  query,
  onCreated,
}: {
  query: string
  onCreated: (id: string) => void
}) {
  const create = useCreateProject()
  if (!query.trim()) return null
  return (
    <Button
      variant="ghost"
      loading={create.isPending}
      disabled={create.isPending}
      onClick={() =>
        create.mutate(
          { name: query.trim() },
          { onSuccess: (p) => onCreated(p.id) }
        )
      }
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-brand hover:bg-brand-soft disabled:opacity-50"
    >
      <PlusIcon className="size-3.5 shrink-0" />
      <span className="truncate">Create &quot;{query.trim()}&quot;</span>
    </Button>
  )
}

function SearchableList({
  query,
  setQuery,
  children,
}: {
  query: string
  setQuery: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find or create a project…"
          className="h-8 pl-7 text-sm"
        />
      </div>
      <div className="max-h-64 space-y-0.5 overflow-y-auto">{children}</div>
    </div>
  )
}

/** Single-select popover (move/file into exactly one project, or Inbox).
 * `render` follows the same base-ui convention as Tooltip/DropdownMenu
 * triggers elsewhere: pass the styled element with no children, and put the
 * visible label/icon as `children`. */
export function ProjectSinglePicker({
  value,
  onChange,
  excludeIds,
  render,
  children,
  align = "start",
}: {
  value: string | null
  onChange: (id: string | null) => void
  excludeIds?: Set<string>
  render: React.ReactElement
  children: React.ReactNode
  align?: "start" | "center" | "end"
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const { options } = useProjectOptions()
  const filtered = options.filter(
    (o) =>
      !excludeIds?.has(o.id) &&
      o.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  function pick(id: string | null) {
    onChange(id)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={render}>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-64">
        <SearchableList query={query} setQuery={setQuery}>
          {!query.trim() ? (
            <ProjectRow
              depth={0}
              name="No project (Inbox)"
              onClick={() => pick(null)}
              right={value === null ? <CheckIcon className="size-3.5" /> : null}
              className={value === null ? "bg-brand-soft" : undefined}
            />
          ) : null}
          {filtered.map((o) => (
            <ProjectRow
              key={o.id}
              depth={o.depth}
              color={o.color}
              name={o.name}
              onClick={() => pick(o.id)}
              right={value === o.id ? <CheckIcon className="size-3.5" /> : null}
              className={value === o.id ? "bg-brand-soft" : undefined}
            />
          ))}
          <QuickCreate query={query} onCreated={pick} />
          {!filtered.length && !query.trim() ? (
            <p className="px-2 py-3 text-center text-xs text-subtle">
              No projects yet
            </p>
          ) : null}
        </SearchableList>
      </PopoverContent>
    </Popover>
  )
}

/** Multi-select popover (file a new resource into several projects at once). */
export function ProjectMultiPicker({
  value,
  onChange,
  render,
  children,
  align = "start",
}: {
  value: string[]
  onChange: (ids: string[]) => void
  render: React.ReactElement
  children: React.ReactNode
  align?: "start" | "center" | "end"
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const { options } = useProjectOptions()
  const selected = new Set(value)
  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  function toggle(id: string) {
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={render}>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-64">
        <SearchableList query={query} setQuery={setQuery}>
          {filtered.map((o) => (
            <label
              key={o.id}
              style={{ paddingLeft: `${o.depth * 16 + 8}px` }}
              className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md pr-2 text-sm hover:bg-white/[0.06]"
            >
              <Checkbox
                checked={selected.has(o.id)}
                onCheckedChange={() => toggle(o.id)}
              />
              <FolderIcon
                className="size-3.5 shrink-0"
                style={{ color: o.color ?? undefined }}
              />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
            </label>
          ))}
          <QuickCreate
            query={query}
            onCreated={(id) => {
              toggle(id)
              setQuery("")
            }}
          />
          {!filtered.length && !query.trim() ? (
            <p className="flex items-center justify-center gap-1.5 px-2 py-3 text-center text-xs text-subtle">
              <InboxIcon className="size-3.5" /> No projects yet — it&apos;ll
              land in your Inbox
            </p>
          ) : null}
        </SearchableList>
      </PopoverContent>
    </Popover>
  )
}
