"use client"
import { QueryFeedback } from "@/components/query-feedback"
import { ApiClientError } from "@/lib/api-client"

import {
  CopyIcon,
  ExternalLinkIcon,
  FolderIcon,
  PlusIcon,
  TriangleAlertIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import dynamic from "next/dynamic"
import { useState } from "react"

import { EmptyState } from "@/components/empty-state"
import { ProjectSinglePicker } from "@/components/projects/project-picker"
import { TypeIcon } from "@/components/resources/type-icon"
import { TagInput } from "@/components/resources/tag-input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useArchiveTask,
  useDeleteTask,
  useDuplicateTask,
  useTask,
  useUnlinkTaskResources,
  useUpdateTask,
} from "@/hooks/queries/tasks"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import { formatDate, formatRelative } from "@/lib/format"
import type { TaskDto } from "@/lib/tasks/types"

import { DueDateField } from "./due-date-field"
import { PrioritySelect } from "./task-priority"
import { RecurrenceField } from "./recurrence-field"
import { RemindersField } from "./reminders-field"
import { StatusSelect } from "./task-status"
import { TaskChecklist } from "./task-checklist"
import { TaskResourcePickerDialog } from "./task-resource-picker-dialog"
const NoteEditor = dynamic(
  () => import("@/components/resources/full-view/note-editor"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-32 w-full" />,
  }
)

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium tracking-wide text-subtle uppercase"
      >
        {label}
      </Label>
      {children}
    </div>
  )
}

/** Text input that saves on blur/Enter when its value changed. */

function InlineTitle({
  value,
  onSave,
}: {
  value: string
  onSave: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(value)
  }
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() && draft !== value) onSave(draft.trim())
        else setDraft(value)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        if (e.key === "Escape") setDraft(value)
      }}
      className="w-full rounded-md border border-transparent bg-transparent px-0 text-lg font-semibold outline-none hover:border-border focus-visible:border-border-strong focus-visible:px-2"
    />
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-5 pt-14">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}

function ResourcesField({ task }: { task: TaskDto }) {
  const [picking, setPicking] = useState(false)
  const unlink = useUnlinkTaskResources()
  const linkedIds = new Set(task.resources.map((r) => r.id))

  return (
    <Field label="Resources">
      <div className="space-y-1.5">
        {task.resources.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2"
          >
            <TypeIcon type={r.type as never} />
            <span className="min-w-0 flex-1 truncate text-sm">
              {r.title || r.url || "Untitled"}
            </span>
            {r.url ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Open original"
                      nativeButton={false}
                      render={
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    />
                  }
                >
                  <ExternalLinkIcon />
                </TooltipTrigger>
                <TooltipContent>Open original</TooltipContent>
              </Tooltip>
            ) : null}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Unlink resource"
              onClick={() =>
                unlink.mutate({ taskId: task.id, resourceIds: [r.id] })
              }
            >
              <XIcon />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
          <PlusIcon />
          Link resource
        </Button>
      </div>
      <TaskResourcePickerDialog
        taskId={task.id}
        excludeIds={linkedIds}
        open={picking}
        onOpenChange={setPicking}
      />
    </Field>
  )
}

function DetailContent({ task }: { task: TaskDto }) {
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const duplicate = useDuplicateTask()
  const archive = useArchiveTask()
  const { close } = useDetailDrawer()
  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) =>
    update.mutate({ id: task.id, patch })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-4 py-2.5 pr-12">
        <span className="text-xs font-medium text-subtle">Task</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Duplicate"
                  disabled={duplicate.isPending}
                  onClick={() => duplicate.mutate(task.id)}
                />
              }
            >
              <CopyIcon />
            </TooltipTrigger>
            <TooltipContent>Duplicate</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Delete"
                  disabled={remove.isPending}
                  className="hover:text-destructive"
                  onClick={() => {
                    remove.mutate(task.id, { onSuccess: close })
                  }}
                />
              }
            >
              <Trash2Icon />
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <div>
          <SheetTitle className="sr-only">{task.title}</SheetTitle>
          <SheetDescription className="sr-only">Task details</SheetDescription>
          <InlineTitle value={task.title} onSave={(title) => save({ title })} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect
            value={task.status}
            onChange={(status) => save({ status })}
          />
          <PrioritySelect
            value={task.priority}
            onChange={(priority) => save({ priority })}
          />
        </div>

        <Field label="Due">
          <DueDateField
            value={{
              dueAt: task.dueAt,
              dueDate: task.dueDate,
              allDay: task.allDay,
            }}
            onChange={(v) => save(v)}
          />
        </Field>

        {task.seriesId ? null : (
          <Field label="Repeat">
            <RecurrenceField
              rrule={task.rrule}
              onChange={(rrule) => save({ rrule })}
            />
          </Field>
        )}

        <Field label="Reminders">
          <RemindersField taskId={task.id} reminders={task.reminders} />
        </Field>

        <Field label="Description">
          <NoteEditor
            draftKey={`task:${task.id}`}
            content={task.descriptionJson}
            onSave={(doc, text) =>
              update
                .mutateAsync({
                  id: task.id,
                  patch: { descriptionJson: doc, descriptionText: text },
                })
                .then(() => undefined)
            }
          />
        </Field>

        <Field label="Project">
          <ProjectSinglePicker
            value={task.projectId}
            onChange={(projectId) => save({ projectId })}
            render={
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:border-border-strong"
              />
            }
          >
            {task.project ? (
              <>
                <FolderIcon
                  className="size-3.5"
                  style={{ color: task.project.color ?? undefined }}
                />
                {task.project.name}
              </>
            ) : (
              <>
                <FolderIcon className="size-3.5 text-subtle" />
                No project (Inbox)
              </>
            )}
          </ProjectSinglePicker>
        </Field>

        <Field label="Tags">
          <TagInput
            value={task.tags.map((t) => t.name)}
            onChange={(tags) => save({ tags })}
          />
        </Field>

        <Field label="Checklist">
          <TaskChecklist taskId={task.id} checklist={task.checklist} />
        </Field>

        <ResourcesField task={task} />

        <div className="flex items-center justify-between border-t border-border pt-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            <dt className="text-subtle">Added</dt>
            <dd className="text-text-muted">{formatDate(task.createdAt)}</dd>
            <dt className="text-subtle">Updated</dt>
            <dd className="text-text-muted">
              {formatRelative(task.updatedAt)}
            </dd>
          </dl>
          <Button
            variant="outline"
            size="sm"
            disabled={archive.isPending}
            onClick={() => archive.mutate(task.id)}
          >
            {task.archivedAt ? "Unarchive" : "Archive"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function TaskDetail({ id }: { id: string }) {
  const query = useTask(id)
  const { data, isPending } = query
  if (isPending && !data) return <DetailSkeleton />
  if (
    !data &&
    query.isError &&
    !(query.error instanceof ApiClientError && query.error.status === 404)
  )
    return (
      <div className="p-6 pt-14">
        <SheetTitle className="sr-only">Unable to load task</SheetTitle>
        <QueryFeedback query={query} label="task" />
      </div>
    )
  if (!data) {
    return (
      <div className="p-6 pt-14">
        <SheetTitle className="sr-only">Not found</SheetTitle>
        <EmptyState
          icon={TriangleAlertIcon}
          title="Task not found"
          description="It may have been deleted."
        />
      </div>
    )
  }
  return (
    <>
      <div className="px-6">
        <QueryFeedback query={query} label="task" loading={false} />
      </div>
      <DetailContent task={data} />
    </>
  )
}
