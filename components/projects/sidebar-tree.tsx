"use client"

import { QueryFeedback } from "@/components/query-feedback"

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  SlidersHorizontalIcon,
  PlusIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useCreateProject,
  useDeleteProject,
  useProjectTree,
  useUpdateProject,
} from "@/hooks/queries/projects"
import { useSettings } from "@/hooks/queries/settings"
import type { ProjectTreeNode } from "@/lib/projects/types"
import { cn } from "@/lib/utils"

import { DeleteProjectDialog } from "./delete-project-dialog"
import { useProjectDndActive, useProjectSidebarLayout } from "./project-dnd"
import { ManageSidebarDialog } from "./manage-sidebar-dialog"
import { ProjectIcon } from "./project-icon"
import { ProjectItemMenu } from "./project-item-menu"

type CreateTarget = { parentId: string | null } | null

function InlineCreateRow({
  depth,
  parentId,
  onDone,
}: {
  depth: number
  parentId: string | null
  onDone: () => void
}) {
  const [name, setName] = useState("")
  const create = useCreateProject()
  const ref = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)
  useEffect(() => ref.current?.focus(), [])

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
    <div
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      className="flex h-8 items-center gap-2 pr-2"
    >
      <FolderIcon className="size-3.5 shrink-0 text-subtle" />
      <Input
        ref={ref}
        disabled={create.isPending}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
          if (e.key === "Escape" && !create.isPending) onDone()
        }}
        placeholder="Project name"
        className="h-6 px-1.5 text-sm"
      />
    </div>
  )
}

function InlineRename({
  project,
  onDone,
}: {
  project: ProjectTreeNode
  onDone: () => void
}) {
  const [name, setName] = useState(project.name)
  const update = useUpdateProject()
  const ref = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  function submit() {
    if (submittedRef.current) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === project.name) return onDone()
    submittedRef.current = true
    update.mutate(
      { id: project.id, patch: { name: trimmed } },
      { onSuccess: onDone, onError: () => (submittedRef.current = false) }
    )
  }

  return (
    <Input
      ref={ref}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit()
        if (e.key === "Escape") onDone()
        e.stopPropagation()
      }}
      className="h-6 flex-1 px-1.5 text-sm"
    />
  )
}

type RowProps = {
  node: ProjectTreeNode
  collapsed: boolean
  onToggleCollapse: () => void
  focused: boolean
  onFocus: () => void
  onKeyNav: (e: React.KeyboardEvent, node: ProjectTreeNode) => void
  renaming: boolean
  onStartRename: () => void
  onDoneRename: () => void
  onNewChild: () => void
  onDelete: () => void
}

type DragWiring = {
  setNodeRef: (el: HTMLElement | null) => void
  style?: React.CSSProperties
  attributes?: React.HTMLAttributes<HTMLElement>
  listeners?: Record<string, unknown>
  isDragging: boolean
  isDropTarget: boolean
}

/** Shared row markup; `drag` is omitted entirely for the mobile nav's
 * read-only copy, which never calls `useSortable` at all. */
function ProjectRowView({
  node,
  collapsed,
  onToggleCollapse,
  focused,
  onFocus,
  onKeyNav,
  renaming,
  onStartRename,
  onDoneRename,
  onNewChild,
  onDelete,
  drag,
}: RowProps & { drag?: DragWiring }) {
  const pathname = usePathname()
  const active = pathname === `/projects/${node.id}`

  return (
    <li ref={drag?.setNodeRef} style={drag?.style} {...drag?.attributes}>
      <ProjectItemMenu
        project={node}
        onRename={onStartRename}
        onNewChild={onNewChild}
        onDelete={onDelete}
        buttonClassName="size-5 text-subtle opacity-100 md:opacity-0 md:group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-popup-open:opacity-100"
        trigger={
          <div
            role="treeitem"
            aria-level={node.depth + 1}
            aria-label={node.name}
            aria-expanded={node.children.length ? !collapsed : undefined}
            aria-selected={active}
            tabIndex={focused ? 0 : -1}
            onFocus={onFocus}
            onKeyDown={(e) => onKeyNav(e, node)}
            style={{ paddingLeft: `${node.depth * 16 + 4}px` }}
            className={cn(
              "group/row relative flex h-8 items-center gap-1 rounded-lg pr-1 text-sm text-text-muted transition-colors outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-brand/40",
              active && "bg-brand-soft text-foreground",
              drag?.isDropTarget && "bg-brand-soft/70 ring-1 ring-brand/50",
              drag?.isDragging && "opacity-40",
              node.archivedAt && "opacity-50"
            )}
            {...drag?.listeners}
          />
        }
      >
        <button
          type="button"
          aria-label={collapsed ? "Expand" : "Collapse"}
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse()
          }}
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded text-subtle hover:text-foreground",
            !node.children.length && "invisible"
          )}
        >
          <ChevronRightIcon
            className={cn(
              "size-3.5 transition-transform",
              !collapsed && "rotate-90"
            )}
          />
        </button>
        <ProjectIcon icon={node.icon} color={node.color} size={14} />
        {renaming ? (
          <InlineRename project={node} onDone={onDoneRename} />
        ) : (
          <Link
            href={`/projects/${node.id}`}
            className="min-w-0 flex-1 truncate focus:outline-none"
            onDoubleClick={(e) => {
              e.preventDefault()
              onStartRename()
            }}
          >
            {node.name}
          </Link>
        )}
        {!renaming ? (
          <>
            {node.totalCount ? (
              <span className="shrink-0 text-xs text-subtle tabular-nums">
                {node.totalCount}
              </span>
            ) : null}
          </>
        ) : null}
      </ProjectItemMenu>
    </li>
  )
}

/** Desktop row: sortable (drag to reorder/reparent, droppable for resource
 * cards dragged from the grid). */
function SortableProjectRow(props: RowProps) {
  const { node } = props
  const dndActive = useProjectDndActive()
  const sortable = useSortable({
    id: node.id,
    data: { type: "project", name: node.name },
  })
  return (
    <ProjectRowView
      {...props}
      drag={{
        setNodeRef: sortable.setNodeRef,
        style: {
          transform: CSS.Translate.toString(sortable.transform),
          transition: sortable.transition,
        },
        attributes: sortable.attributes,
        listeners: sortable.listeners,
        isDragging: sortable.isDragging,
        isDropTarget:
          !!dndActive && dndActive.activeId !== node.id && sortable.isOver,
      }}
    />
  )
}

/** Mobile nav row: no dnd-kit hooks at all, so it never registers ids that
 * would collide with the desktop sidebar's sortable copy. */
function StaticProjectRow(props: RowProps) {
  return <ProjectRowView {...props} />
}

/** The sidebar's "Projects" section: tree, create, rename, archive, delete,
 * drag reorder/reparent (desktop only — `draggable` is false in the mobile
 * nav copy, since a second set of sortable ids in the same DndContext would
 * collide). */
export function ProjectsSidebarSection({ draggable }: { draggable: boolean }) {
  const projectsQuery = useProjectTree()
  const { data: flat = [], isPending } = projectsQuery
  const { rows, isCollapsed, toggle, toggleMore } = useProjectSidebarLayout()
  const settingsQuery = useSettings()
  const { data: settings } = settingsQuery
  const [managing, setManaging] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [creating, setCreating] = useState<CreateTarget>(null)
  const [deleting, setDeleting] = useState<ProjectTreeNode | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const deleteProject = useDeleteProject()

  const visible = rows.flatMap((row) =>
    row.type === "project" ? [row.node] : []
  )

  function focusAdjacent(delta: number, fromId: string) {
    const idx = visible.findIndex((n) => n.id === fromId)
    const next = visible[idx + delta]
    if (next) setFocusedId(next.id)
  }

  function onKeyNav(e: React.KeyboardEvent, node: ProjectTreeNode) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        focusAdjacent(1, node.id)
        break
      case "ArrowUp":
        e.preventDefault()
        focusAdjacent(-1, node.id)
        break
      case "ArrowRight":
        e.preventDefault()
        if (node.children.length && isCollapsed(node.id)) toggle(node.id)
        else if (node.children.length) {
          const child = visible.find((item) => item.parentId === node.id)
          if (child) setFocusedId(child.id)
          else toggleMore(node.id)
        }
        break
      case "ArrowLeft":
        e.preventDefault()
        if (node.children.length && !isCollapsed(node.id)) toggle(node.id)
        else if (node.parentId) setFocusedId(node.parentId)
        break
      case "F2":
        e.preventDefault()
        setRenamingId(node.id)
        break
    }
  }

  function rowProps(node: ProjectTreeNode): Omit<RowProps, "node"> {
    return {
      collapsed: isCollapsed(node.id),
      onToggleCollapse: () => toggle(node.id),
      focused: focusedId === node.id,
      onFocus: () => setFocusedId(node.id),
      onKeyNav,
      renaming: renamingId === node.id,
      onStartRename: () => setRenamingId(node.id),
      onDoneRename: () => setRenamingId(null),
      onNewChild: () => setCreating({ parentId: node.id }),
      onDelete: () => setDeleting(node),
    }
  }

  function renderRows() {
    return rows.map((row) => {
      if (row.type === "project") {
        const Row = draggable ? SortableProjectRow : StaticProjectRow
        return <Row key={row.node.id} node={row.node} {...rowProps(row.node)} />
      }
      return (
        <li key={`more:${row.parentId ?? "root"}`} role="none">
          <button
            type="button"
            aria-expanded={row.expanded}
            aria-label={`More projects (${row.count})${row.parentId ? ` in ${flat.find((project) => project.id === row.parentId)?.name}` : ""}`}
            onClick={() => toggleMore(row.parentId)}
            style={{ paddingLeft: `${row.depth * 16 + 8}px` }}
            className="flex h-8 w-full items-center gap-2 rounded-lg pr-2 text-left text-xs text-subtle hover:bg-white/[0.04] hover:text-foreground"
          >
            <ChevronRightIcon
              className={cn(
                "size-3.5 transition-transform",
                row.expanded && "rotate-90"
              )}
            />
            More projects{" "}
            <span className="ml-auto tabular-nums">{row.count}</span>
          </button>
        </li>
      )
    })
  }

  return (
    <div data-tour="tour-projects" className="mt-6 px-2">
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[11px] font-medium tracking-wider text-subtle uppercase">
          Projects
        </span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Manage sidebar"
                  disabled={!settings}
                  onClick={() => setManaging(true)}
                  className="flex size-5 items-center justify-center rounded text-subtle hover:bg-white/10 hover:text-foreground disabled:opacity-50"
                />
              }
            >
              <SlidersHorizontalIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Manage sidebar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="New project"
                  onClick={() => setCreating({ parentId: null })}
                  className="flex size-5 items-center justify-center rounded text-subtle hover:bg-white/10 hover:text-foreground"
                />
              }
            >
              <PlusIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>New project</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <QueryFeedback query={projectsQuery} label="projects" loading={false} />
      <QueryFeedback
        query={settingsQuery}
        label="sidebar preferences"
        loading={false}
      />
      {!isPending && !projectsQuery.isError && !flat.length && !creating ? (
        <button
          type="button"
          onClick={() => setCreating({ parentId: null })}
          className="mx-1 mt-1 flex w-[calc(100%-8px)] items-start gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-left text-xs text-subtle hover:border-border-strong hover:text-text-muted"
        >
          <FolderPlusIcon className="mt-0.5 size-3.5 shrink-0" />
          Create your first project to start organizing.
        </button>
      ) : draggable ? (
        <SortableContext
          items={visible.map((n) => n.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul role="tree" aria-label="Projects" className="space-y-0.5">
            {renderRows()}
          </ul>
        </SortableContext>
      ) : (
        <ul role="tree" aria-label="Projects" className="space-y-0.5">
          {renderRows()}
        </ul>
      )}

      {creating ? (
        <InlineCreateRow
          depth={
            creating.parentId
              ? (visible.find((n) => n.id === creating.parentId)?.depth ?? 0) +
                1
              : 0
          }
          parentId={creating.parentId}
          onDone={() => setCreating(null)}
        />
      ) : null}

      <DeleteProjectDialog
        project={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={async (mode) => {
          if (!deleting) return
          await deleteProject.mutateAsync({ id: deleting.id, mode })
        }}
      />
      {managing && settings && (
        <ManageSidebarDialog
          projects={flat}
          pinnedProjectIds={settings.pinnedProjectIds}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  )
}
