"use client"

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { useCollapsedProjects } from "@/lib/projects/use-collapsed"
import { buildProjectTree, flattenTree } from "@/lib/projects/tree"
import type { ProjectTreeNode } from "@/lib/projects/types"
import { cn } from "@/lib/utils"

import { DeleteProjectDialog } from "./delete-project-dialog"
import { useProjectDndActive } from "./project-dnd"
import { ProjectIcon } from "./project-icon"
import { ProjectIconColorFields } from "./project-icon-picker"

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
  useEffect(() => ref.current?.focus(), [])

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return onDone()
    create.mutate({ name: trimmed, parentId }, { onSuccess: onDone })
  }

  return (
    <div
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      className="flex h-8 items-center gap-2 pr-2"
    >
      <FolderIcon className="size-3.5 shrink-0 text-subtle" />
      <Input
        ref={ref}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
          if (e.key === "Escape") onDone()
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
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  function submit() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === project.name) return onDone()
    update.mutate(
      { id: project.id, patch: { name: trimmed } },
      { onSuccess: onDone }
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

function ProjectMenu({
  project,
  onRename,
  onNewChild,
  onDelete,
}: {
  project: ProjectTreeNode
  onRename: () => void
  onNewChild: () => void
  onDelete: () => void
}) {
  const update = useUpdateProject()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`${project.name} options`}
            onClick={(e) => e.stopPropagation()}
            className="flex size-5 shrink-0 items-center justify-center rounded text-subtle opacity-0 group-hover/row:opacity-100 hover:bg-white/10 hover:text-foreground data-popup-open:opacity-100"
          />
        }
      >
        <MoreHorizontalIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuItem onClick={onNewChild}>
          <FolderPlusIcon />
          New sub-project
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRename}>
          <PencilIcon />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            update.mutate({
              id: project.id,
              patch: { archived: !project.archivedAt },
            })
          }
        >
          {project.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
          {project.archivedAt ? "Unarchive" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ProjectIcon icon={project.icon} color={project.color} size={14} />
            Icon & color
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-72 overflow-hidden p-0">
            <ProjectIconColorFields project={project} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2Icon />
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <div
        role="treeitem"
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
            <ProjectMenu
              project={node}
              onRename={onStartRename}
              onNewChild={onNewChild}
              onDelete={onDelete}
            />
          </>
        ) : null}
      </div>
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
  const { data: flat = [], isPending } = useProjectTree()
  const { isCollapsed, toggle } = useCollapsedProjects()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [creating, setCreating] = useState<CreateTarget>(null)
  const [deleting, setDeleting] = useState<ProjectTreeNode | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const deleteProject = useDeleteProject()

  const tree = buildProjectTree(flat)
  const visible = flattenTree(tree, isCollapsed)

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
        else if (node.children.length) setFocusedId(node.children[0]!.id)
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

  return (
    <div data-tour="tour-projects" className="mt-6 px-2">
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[11px] font-medium tracking-wider text-subtle uppercase">
          Projects
        </span>
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

      {!isPending && !visible.length && !creating ? (
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
            {visible.map((node) => (
              <SortableProjectRow
                key={node.id}
                node={node}
                {...rowProps(node)}
              />
            ))}
          </ul>
        </SortableContext>
      ) : (
        <ul role="tree" aria-label="Projects" className="space-y-0.5">
          {visible.map((node) => (
            <StaticProjectRow key={node.id} node={node} {...rowProps(node)} />
          ))}
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
        onConfirm={(mode) => {
          if (!deleting) return
          deleteProject.mutate({ id: deleting.id, mode })
          setDeleting(null)
        }}
      />
    </div>
  )
}
