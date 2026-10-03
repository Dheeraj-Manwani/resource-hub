"use client"

import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useEffect, useRef, useState } from "react"

import { useMoveTask } from "@/hooks/queries/tasks"
import { arrayMoveItems } from "@/lib/projects/dnd-projection"
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskDto,
  type TaskStatus,
} from "@/lib/tasks/types"
import { cn } from "@/lib/utils"

import { TaskMeta } from "./task-card"
import { StatusIcon } from "./task-status"

type Columns = Record<TaskStatus, TaskDto[]>

function toColumns(items: TaskDto[]): Columns {
  const cols: Columns = { todo: [], in_progress: [], blocked: [], done: [] }
  for (const t of items) cols[t.status].push(t)
  for (const status of TASK_STATUSES) {
    cols[status].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
  }
  return cols
}

function findColumn(cols: Columns, id: string): TaskStatus | null {
  if ((TASK_STATUSES as readonly string[]).includes(id)) return id as TaskStatus
  for (const status of TASK_STATUSES) {
    if (cols[status].some((t) => t.id === id)) return status
  }
  return null
}

type DragWiring = {
  setNodeRef: (el: HTMLElement | null) => void
  style?: React.CSSProperties
  attributes?: React.HTMLAttributes<HTMLElement>
  listeners?: Record<string, unknown>
  isDragging: boolean
}

function BoardCardView({
  task,
  onOpen,
  drag,
}: {
  task: TaskDto
  onOpen: (id: string) => void
  drag?: DragWiring
}) {
  return (
    <div
      ref={drag?.setNodeRef}
      style={drag?.style}
      {...drag?.attributes}
      {...drag?.listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(task.id)}
      className={cn(
        "cursor-grab rounded-lg border border-border bg-surface p-2.5 text-left shadow-card outline-none focus-visible:border-brand/50",
        drag?.isDragging && "opacity-40"
      )}
    >
      <p className="text-sm font-medium">{task.title}</p>
      <TaskMeta task={task} className="mt-1.5" />
    </div>
  )
}

function BoardCard({ task, onOpen }: { task: TaskDto; onOpen: (id: string) => void }) {
  const sortable = useSortable({ id: task.id })
  return (
    <BoardCardView
      task={task}
      onOpen={onOpen}
      drag={{
        setNodeRef: sortable.setNodeRef,
        style: {
          transform: CSS.Translate.toString(sortable.transform),
          transition: sortable.transition,
        },
        attributes: sortable.attributes,
        listeners: sortable.listeners,
        isDragging: sortable.isDragging,
      }}
    />
  )
}

function Column({
  status,
  tasks,
  onOpen,
}: {
  status: TaskStatus
  tasks: TaskDto[]
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium">
        <StatusIcon status={status} className="size-3.5" />
        {TASK_STATUS_LABELS[status]}
        <span className="text-xs font-normal text-subtle">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 rounded-xl border border-dashed border-border p-2 transition-colors",
          isOver && "border-brand/50 bg-brand-soft/30"
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <BoardCard key={task.id} task={task} onOpen={onOpen} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

/** Four-column board (To do / In progress / Blocked / Done); drag within and
 * across columns persists a fractional `sortKey` via `moveTask`. */
export function TaskBoard({
  items,
  onOpen,
}: {
  items: TaskDto[]
  onOpen: (id: string) => void
}) {
  const [cols, setCols] = useState<Columns>(() => toColumns(items))
  const dragging = useRef(false)
  const move = useMoveTask()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    if (!dragging.current) setCols(toColumns(items))
  }, [items])

  function onDragStart() {
    dragging.current = true
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return
    const fromCol = findColumn(cols, active.id as string)
    const toCol = findColumn(cols, over.id as string)
    if (!fromCol || !toCol || fromCol === toCol) return
    setCols((prev) => {
      const activeItem = prev[fromCol].find((t) => t.id === active.id)
      if (!activeItem) return prev
      const overIndex = prev[toCol].findIndex((t) => t.id === over.id)
      const next = {
        ...prev,
        [fromCol]: prev[fromCol].filter((t) => t.id !== active.id),
        [toCol]: [...prev[toCol]],
      }
      const insertAt = overIndex === -1 ? next[toCol].length : overIndex
      next[toCol].splice(insertAt, 0, { ...activeItem, status: toCol })
      return next
    })
  }

  function onDragEnd(e: DragEndEvent) {
    dragging.current = false
    const { active, over } = e
    if (!over) return
    const finalCol = findColumn(cols, over.id as string) ?? findColumn(cols, active.id as string)
    if (!finalCol) return
    const column = cols[finalCol]
    const activeIndex = column.findIndex((t) => t.id === active.id)
    const overIndex = column.findIndex((t) => t.id === over.id)
    const ordered =
      activeIndex === -1 || overIndex === -1 || activeIndex === overIndex
        ? column
        : arrayMoveItems(column, activeIndex, overIndex)
    const newIndex = ordered.findIndex((t) => t.id === active.id)
    if (newIndex === -1) return
    move.mutate({
      id: active.id as string,
      input: {
        status: finalCol,
        afterId: ordered[newIndex - 1]?.id,
        beforeId: ordered[newIndex + 1]?.id,
      },
    })
  }

  function onDragCancel() {
    dragging.current = false
    setCols(toColumns(items))
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {TASK_STATUSES.map((status) => (
          <Column key={status} status={status} tasks={cols[status]} onOpen={onOpen} />
        ))}
      </div>
    </DndContext>
  )
}
