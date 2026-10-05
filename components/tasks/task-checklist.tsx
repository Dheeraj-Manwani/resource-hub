"use client"

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  GripVerticalIcon,
  LoaderCircleIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useRef, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress"
import {
  useAddChecklistItem,
  useDeleteChecklistItem,
  useReorderChecklistItem,
  useUpdateChecklistItem,
} from "@/hooks/queries/tasks"
import { arrayMoveItems } from "@/lib/projects/dnd-projection"
import { checklistProgress, type ChecklistItemDto } from "@/lib/tasks/types"
import { cn } from "@/lib/utils"

type DragWiring = {
  setNodeRef: (el: HTMLElement | null) => void
  style?: React.CSSProperties
  attributes?: React.HTMLAttributes<HTMLElement>
  listeners?: Record<string, unknown>
  isDragging: boolean
}

/** Takes the sortable wiring as a plain prop (rather than reading a dnd-kit
 * hook result directly in the JSX below) — the same split `sidebar-tree.tsx`
 * uses to keep the `react-hooks/refs` rule happy with `setNodeRef`. */
function ChecklistRowView({
  taskId,
  item,
  drag,
}: {
  taskId: string
  item: ChecklistItemDto
  drag?: DragWiring
}) {
  const update = useUpdateChecklistItem()
  const remove = useDeleteChecklistItem()
  const [draft, setDraft] = useState(item.title)
  const pending = item.id.startsWith("pending-checklist:")

  return (
    <li
      ref={drag?.setNodeRef}
      style={drag?.style}
      className={cn(
        "group/item flex items-center gap-1.5 rounded-md px-1",
        drag?.isDragging && "opacity-40"
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        disabled={pending}
        {...drag?.attributes}
        {...drag?.listeners}
        className="flex size-5 shrink-0 cursor-grab items-center justify-center text-subtle opacity-0 group-hover/item:opacity-100"
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      <Checkbox
        disabled={pending}
        aria-label={
          pending ? "Creating checklist item" : `Complete ${item.title}`
        }
        checked={item.done}
        onCheckedChange={(done) =>
          update.mutate({ taskId, itemId: item.id, patch: { done: !!done } })
        }
      />
      <Input
        disabled={pending}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && draft !== item.title) {
            update.mutate({
              taskId,
              itemId: item.id,
              patch: { title: draft.trim() },
            })
          } else setDraft(item.title)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          if (e.key === "Escape") setDraft(item.title)
        }}
        className={cn(
          "h-7 flex-1 border-transparent bg-transparent px-1.5 shadow-none hover:border-border focus-visible:border-border-strong",
          item.done && "text-text-muted line-through"
        )}
      />
      <button
        type="button"
        aria-label={remove.isPending ? "Deleting item" : "Delete item"}
        disabled={pending || remove.isPending}
        onClick={() => remove.mutate({ taskId, itemId: item.id })}
        className="flex size-6 shrink-0 items-center justify-center rounded text-subtle opacity-0 group-hover/item:opacity-100 hover:bg-white/10 hover:text-destructive"
      >
        {pending || remove.isPending ? (
          <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" />
        ) : (
          <Trash2Icon className="size-3.5" />
        )}
      </button>
    </li>
  )
}

function ChecklistRow({
  taskId,
  item,
}: {
  taskId: string
  item: ChecklistItemDto
}) {
  const sortable = useSortable({ id: item.id })
  return (
    <ChecklistRowView
      taskId={taskId}
      item={item}
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

function AddItemRow({ taskId }: { taskId: string }) {
  const [title, setTitle] = useState("")
  const add = useAddChecklistItem()
  const ref = useRef<HTMLInputElement>(null)

  function submit() {
    const trimmed = title.trim()
    if (!trimmed || add.isPending) return
    add.mutate(
      { taskId, title: trimmed },
      {
        onSuccess: () => {
          setTitle("")
          ref.current?.focus()
        },
      }
    )
  }

  return (
    <div className="flex items-center gap-1.5 px-1">
      {add.isPending ? (
        <LoaderCircleIcon
          aria-label="Adding item"
          className="size-3.5 animate-spin motion-reduce:animate-none"
        />
      ) : (
        <PlusIcon className="size-3.5 shrink-0 text-subtle" />
      )}
      <Input
        ref={ref}
        aria-label="Checklist item title"
        disabled={add.isPending}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            submit()
          }
        }}
        placeholder="Add an item…"
        className="h-7 flex-1 border-transparent bg-transparent px-1.5 shadow-none hover:border-border focus-visible:border-border-strong"
      />
    </div>
  )
}

export function TaskChecklist({
  taskId,
  checklist,
}: {
  taskId: string
  checklist: ChecklistItemDto[]
}) {
  const reorder = useReorderChecklistItem()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )
  const { done, total } = checklistProgress(checklist)

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (
      !over ||
      active.id === over.id ||
      checklist.some((item) => item.id.startsWith("pending-checklist:"))
    )
      return
    const activeIndex = checklist.findIndex((i) => i.id === active.id)
    const overIndex = checklist.findIndex((i) => i.id === over.id)
    if (activeIndex === -1 || overIndex === -1) return
    const reordered = arrayMoveItems(checklist, activeIndex, overIndex)
    const newIndex = reordered.findIndex((i) => i.id === active.id)
    reorder.mutate({
      taskId,
      itemId: active.id as string,
      afterId: reordered[newIndex - 1]?.id,
      beforeId: reordered[newIndex + 1]?.id,
    })
  }

  return (
    <div className="space-y-2">
      {total ? (
        <div className="flex items-center gap-2">
          <Progress value={total ? (done / total) * 100 : 0} className="flex-1">
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
          <span className="shrink-0 text-xs text-subtle tabular-nums">
            {done}/{total}
          </span>
        </div>
      ) : null}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext
          items={checklist.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-0.5">
            {checklist.map((item) => (
              <ChecklistRow key={item.id} taskId={taskId} item={item} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <AddItemRow taskId={taskId} />
    </div>
  )
}
