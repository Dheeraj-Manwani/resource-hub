"use client"

import { useState, type CSSProperties, type HTMLAttributes } from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeOffIcon,
  GripVerticalIcon,
  PlusIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  createDefaultOverviewConfiguration,
  OVERVIEW_SECTION_REGISTRY,
  reorderOverviewSection,
  setOverviewSectionEnabled,
  type OverviewConfiguration,
  type OverviewSectionConfig,
  type OverviewSectionEntity,
  type OverviewSectionId,
} from "@/lib/overview/sections"
import { cn } from "@/lib/utils"

const ENTITY_LABELS: Record<OverviewSectionEntity, string> = {
  mixed: "Daily overview",
  tasks: "Tasks",
  projects: "Projects",
  resources: "Resources",
  docs: "Docs",
  habits: "Habits",
}

type RowProps = {
  section: OverviewSectionConfig
  index: number
  count: number
  disabled: boolean
  onMove: (direction: -1 | 1) => void
  onHide: () => void
}
type DragWiring = {
  setNodeRef: (element: HTMLElement | null) => void
  setActivatorNodeRef: (element: HTMLElement | null) => void
  style: CSSProperties
  attributes: HTMLAttributes<HTMLElement>
  listeners?: Record<string, unknown>
  isDragging: boolean
}

function SectionRowView({
  section,
  index,
  count,
  disabled,
  onMove,
  onHide,
  drag,
}: RowProps & { drag?: DragWiring }) {
  const definition = OVERVIEW_SECTION_REGISTRY[section.id]
  return (
    <li
      ref={drag?.setNodeRef}
      style={drag?.style}
      data-section-id={section.id}
      className={cn(
        "relative flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-2",
        drag?.isDragging && "z-10 opacity-60"
      )}
    >
      <button
        type="button"
        ref={drag?.setActivatorNodeRef}
        {...drag?.attributes}
        {...drag?.listeners}
        disabled={disabled}
        aria-label={`Reorder ${definition.label}`}
        className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-subtle focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{definition.label}</p>
        <p className="text-xs text-subtle">
          {ENTITY_LABELS[definition.entity]}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          className="size-11"
          aria-label={`Move ${definition.label} up`}
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUpIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          className="size-11"
          aria-label={`Move ${definition.label} down`}
          disabled={disabled || index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDownIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          aria-label={`Hide ${definition.label}`}
          disabled={disabled}
          onClick={onHide}
        >
          <EyeOffIcon className="size-4" />
          Hide
        </Button>
      </div>
    </li>
  )
}

function SortableSectionRow(props: RowProps) {
  const sortable = useSortable({
    id: props.section.id,
    disabled: props.disabled,
  })
  return (
    <SectionRowView
      {...props}
      drag={{
        setNodeRef: sortable.setNodeRef,
        setActivatorNodeRef: sortable.setActivatorNodeRef,
        style: {
          transform: CSS.Transform.toString(sortable.transform),
          transition: sortable.transition,
        },
        attributes: sortable.attributes,
        listeners: sortable.listeners,
        isDragging: sortable.isDragging,
      }}
    />
  )
}

export function OverviewCustomizer({
  configuration,
  onChange,
  onSave,
  onCancel,
  saving,
  paused,
  error,
}: {
  configuration: OverviewConfiguration
  onChange: (configuration: OverviewConfiguration) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  paused: boolean
  error: string
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const visible = configuration.sections.filter((section) => section.enabled)
  const hidden = configuration.sections.filter((section) => !section.enabled)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function move(id: OverviewSectionId, target: OverviewSectionId) {
    onChange(reorderOverviewSection(configuration, id, target))
  }
  function dragEnd({ active, over }: DragEndEvent) {
    if (saving || !over) return
    const source = visible.find((section) => section.id === active.id)
    const target = visible.find((section) => section.id === over.id)
    if (source && target) move(source.id, target.id)
  }

  return (
    <section
      id="overview-customizer"
      aria-label="Customize overview"
      className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Customize overview</h2>
          <p className="mt-1 text-sm text-text-muted">
            Choose sections and their order. Preview your changes below before
            saving.
          </p>
          <p id="overview-reorder-help" className="mt-1 text-xs text-subtle">
            Drag a handle, use the arrow buttons, or press Space on a handle and
            use the arrow keys.
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={saving || hidden.length === 0}
          onClick={() => setPickerOpen(true)}
        >
          <PlusIcon /> Add section
        </Button>
      </div>
      {visible.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={dragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "Press Space to pick up a section, arrow keys to move it, Space to drop, or Escape to cancel.",
            },
          }}
        >
          <SortableContext
            items={visible.map((section) => section.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol
              aria-label="Overview section order"
              aria-describedby="overview-reorder-help"
              className="max-h-96 space-y-2 overflow-y-auto"
            >
              {visible.map((section, index) => (
                <SortableSectionRow
                  key={section.id}
                  section={section}
                  index={index}
                  count={visible.length}
                  disabled={saving}
                  onMove={(direction) => {
                    const target = visible[index + direction]
                    if (target) move(section.id, target.id)
                  }}
                  onHide={() =>
                    onChange(
                      setOverviewSectionEnabled(
                        configuration,
                        section.id,
                        false
                      )
                    )
                  }
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="py-3 text-sm text-text-muted">
          No sections selected. Add a section or reset to the default overview.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error} Your changes are still here. Try saving again or cancel.
        </p>
      )}
      {paused && (
        <p role="status" className="text-sm text-text-muted">
          Waiting for a connection to save your overview.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={saving}
          onClick={() => onChange(createDefaultOverviewConfiguration())}
        >
          Reset to default
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="min-h-11"
            disabled={saving}
            loading={saving}
            onClick={onSave}
          >
            Save overview
          </Button>
        </div>
      </div>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Add section</DialogTitle>
          <DialogDescription>
            Choose a section to add to the end of your overview.
          </DialogDescription>
          <div className="max-h-[60dvh] space-y-4 overflow-y-auto">
            {(
              Object.entries(ENTITY_LABELS) as [OverviewSectionEntity, string][]
            ).map(([entity, label]) => {
              const sections = hidden.filter(
                (section) =>
                  OVERVIEW_SECTION_REGISTRY[section.id].entity === entity
              )
              if (!sections.length) return null
              return (
                <section key={entity} aria-label={label}>
                  <h3 className="mb-1 text-xs font-medium text-subtle">
                    {label}
                  </h3>
                  {sections.map((section) => (
                    <Button
                      key={section.id}
                      variant="ghost"
                      className="min-h-11 w-full justify-between text-left whitespace-normal"
                      disabled={saving}
                      onClick={() => {
                        onChange(
                          setOverviewSectionEnabled(
                            configuration,
                            section.id,
                            true
                          )
                        )
                        setPickerOpen(false)
                      }}
                    >
                      {OVERVIEW_SECTION_REGISTRY[section.id].label}
                      <PlusIcon />
                    </Button>
                  ))}
                </section>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
