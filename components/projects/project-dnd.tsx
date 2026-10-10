"use client"

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { FolderIcon } from "lucide-react"
import { createContext, useContext, useMemo, useState } from "react"
import { toast } from "react-hot-toast"
import { useSettings } from "@/hooks/queries/settings"
import {
  sidebarLayout,
  type SidebarTreeRow,
} from "@/lib/projects/sidebar-layout"

import {
  useLinkResources,
  useMoveProject,
  useProjectTree,
} from "@/hooks/queries/projects"
import { useCollapsedProjects } from "@/lib/projects/use-collapsed"
import {
  findSiblingAnchors,
  getProjection,
} from "@/lib/projects/dnd-projection"
import {
  buildProjectTree,
  flattenTree,
  isSelfOrDescendant,
} from "@/lib/projects/tree"
import { TypeIcon } from "@/components/resources/type-icon"
import { displayTitle } from "@/lib/resources/dto"
import type { ResourceDto } from "@/lib/resources/dto"

export const RESOURCE_DRAG_PREFIX = "resource-drag:"
export const resourceDragId = (id: string) => `${RESOURCE_DRAG_PREFIX}${id}`

type DragState = { activeId: string; type: "project" | "resource" } | null

const ProjectDndStateContext = createContext<DragState>(null)
const ProjectSidebarContext = createContext<{
  rows: SidebarTreeRow[]
  isCollapsed: (id: string) => boolean
  toggle: (id: string) => void
  toggleMore: (parentId: string | null) => void
} | null>(null)

export function useProjectSidebarLayout() {
  const value = useContext(ProjectSidebarContext)
  if (!value) throw new Error("Project sidebar requires ProjectDndProvider")
  return value
}

/** Which project row (if any) is currently the target of an in-flight drag,
 * so the sidebar tree can highlight it. Sidebar rows read this. */
export function useProjectDndActive() {
  return useContext(ProjectDndStateContext)
}

const INDENT_WIDTH = 16

/**
 * Single shell-level DndContext covering two interactions: reordering /
 * reparenting sidebar project rows, and dragging a resource card onto a
 * sidebar project row to file it there. Must wrap both the sidebar and the
 * resource grid.
 */
export function ProjectDndProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: flat = [] } = useProjectTree()
  const { isCollapsed, toggle } = useCollapsedProjects()
  const { data: settings } = useSettings()
  const [expandedMore, setExpandedMore] = useState<Set<string | null>>(
    new Set()
  )
  function toggleMore(parentId: string | null) {
    setExpandedMore((previous) => {
      const next = new Set(previous)
      if (next.has(parentId)) next.delete(parentId)
      else next.add(parentId)
      return next
    })
  }
  const moveProject = useMoveProject()
  const linkResources = useLinkResources()
  const [active, setActive] = useState<
    | { type: "project"; id: string; label: string }
    | { type: "resource"; id: string; resource: ResourceDto }
    | null
  >(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const rows = useMemo(
    () =>
      sidebarLayout(
        flat,
        settings?.pinnedProjectIds ?? null,
        isCollapsed,
        expandedMore
      ),
    [flat, settings?.pinnedProjectIds, isCollapsed, expandedMore]
  )
  const visibleItems = rows.flatMap((row) =>
    row.type === "project" ? [row.node] : []
  )

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current
    if (!data) return
    if (data.type === "project") {
      const node = visibleItems.find((n) => n.id === event.active.id)
      if (node) setActive({ type: "project", id: node.id, label: node.name })
    } else if (data.type === "resource") {
      setActive({
        type: "resource",
        id: String(event.active.id),
        resource: data.resource,
      })
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active: activeEl, over, delta } = event
    const data = activeEl.data.current
    setActive(null)
    if (!data || !over) return

    if (data.type === "resource" && over.data.current?.type === "project") {
      const projectId = String(over.id)
      const projectName = over.data.current.name as string
      const resourceId = data.resourceId as string
      linkResources.mutate(
        { projectId, resourceIds: [resourceId] },
        { onSuccess: () => toast.success(`Added to ${projectName}`) }
      )
      return
    }

    if (data.type === "project") {
      const activeId = String(activeEl.id)
      const overId = String(over.id)
      if (activeId === overId) return
      if (isSelfOrDescendant(flat, activeId, overId)) return // can't drop into own subtree
      const items = visibleItems.map((n) => ({
        id: n.id,
        parentId: n.parentId,
        depth: n.depth,
      }))
      const projection = getProjection(
        items,
        activeId,
        overId,
        delta.x,
        INDENT_WIDTH
      )
      if (!projection) return
      if (
        projection.parentId &&
        isSelfOrDescendant(flat, activeId, projection.parentId)
      )
        return
      // Resolve sort-key anchors in stored order, including hidden siblings.
      // Pinned/More display order can differ from the actual sibling order.
      const anchors = findSiblingAnchors(
        flattenTree(buildProjectTree(flat), () => false),
        activeId,
        overId,
        projection.parentId
      )
      moveProject.mutate({
        id: activeId,
        input: { parentId: projection.parentId, ...anchors },
      })
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <ProjectSidebarContext.Provider
        value={{ rows, isCollapsed, toggle, toggleMore }}
      >
        <ProjectDndStateContext.Provider
          value={active ? { activeId: active.id, type: active.type } : null}
        >
          {children}
        </ProjectDndStateContext.Provider>
      </ProjectSidebarContext.Provider>
      <DragOverlay>
        {active?.type === "project" ? (
          <div className="flex h-8 items-center gap-2 rounded-lg border border-brand/50 bg-surface-raised px-3 text-sm shadow-popover">
            <FolderIcon className="size-3.5 text-brand" />
            {active.label}
          </div>
        ) : active?.type === "resource" ? (
          <div className="flex max-w-56 items-center gap-2 rounded-lg border border-brand/50 bg-surface-raised px-3 py-2 text-sm shadow-popover">
            <TypeIcon type={active.resource.type} />
            <span className="truncate">{displayTitle(active.resource)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
