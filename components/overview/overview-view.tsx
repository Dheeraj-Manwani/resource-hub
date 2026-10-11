"use client"

import { useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCheckIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FileTextIcon,
  FolderIcon,
  LibraryBigIcon,
  Loader2Icon,
  NotebookPenIcon,
  PencilLineIcon,
  SheetIcon,
} from "lucide-react"
import { QueryFeedback } from "@/components/query-feedback"
import { ProjectItemMenu } from "@/components/projects/project-item-menu"
import { ResourceContextMenu } from "@/components/resources/resource-context-menu"
import { useResourcePreview } from "@/components/resources/resource-preview-provider"
import { TypeIcon } from "@/components/resources/type-icon"
import { TaskItemMenu } from "@/components/tasks/task-item-menu"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useShell } from "@/components/shell/shell-context"
import { useOverview } from "@/hooks/queries/overview"
import { useUpdateTask } from "@/hooks/queries/tasks"
import { useCompleteOccurrence } from "@/hooks/queries/calendar"
import { useUpdateResource } from "@/hooks/queries/resources"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import { formatRelative } from "@/lib/format"
import {
  dateInTimezone,
  isPastDue,
  overviewWindow,
  type DocSummary,
  type FocusTask,
  type OverviewProject,
  type OverviewSummary,
} from "@/lib/overview/model"
import { displayTitle, type ResourceDto } from "@/lib/resources/dto"
import { TASK_PRIORITY_LABELS } from "@/lib/tasks/types"
import { cn } from "@/lib/utils"

const OverviewDocDialog = dynamic(() => import("./overview-doc-dialog"), {
  ssr: false,
})
const TOUCH_LINK =
  "inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover"
const countLabel = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

function SectionHeader({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </div>
  )
}
function PageLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={TOUCH_LINK}>
      {children}
      <ArrowUpRightIcon className="size-3.5" />
    </Link>
  )
}
function pathFor(data: OverviewSummary, id: string | null) {
  return id ? (data.projectPaths[id] ?? "Project") : "No project"
}
function dueLabel(row: FocusTask, data: OverviewSummary) {
  const window = overviewWindow(data.timezone, new Date(data.generatedAt))
  const day =
    row.dueDate ?? (row.dueAt ? dateInTimezone(row.dueAt, data.timezone) : null)
  const overdue = isPastDue(row, window)
  if (!day) return { label: "No due date", overdue: false }
  const dayLabel =
    day === data.todayDate
      ? "Today"
      : new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${day}T12:00:00Z`))
  const time = row.dueAt
    ? new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: data.timezone,
      }).format(new Date(row.dueAt))
    : ""
  return {
    label: `${dayLabel}${time ? `, ${time}` : ""}${overdue ? " · Overdue" : ""}`,
    overdue,
  }
}

function FocusTaskRow({
  row,
  data,
  onOpen,
}: {
  row: FocusTask
  data: OverviewSummary
  onOpen: (id: string) => void
}) {
  const update = useUpdateTask()
  const occurrence = useCompleteOccurrence()
  const busy = update.isPending || occurrence.isPending
  const due = dueLabel(row, data)
  const checklistDone = row.task.checklist.filter((item) => item.done).length
  const content = (
    <>
      <div className="relative mt-3 shrink-0">
        {busy ? (
          <Loader2Icon
            className="size-4 animate-spin text-brand"
            aria-label="Completing task"
          />
        ) : (
          <Checkbox
            className="after:-inset-3.5"
            aria-label={`Complete ${row.title}`}
            checked={false}
            disabled={busy}
            onCheckedChange={(checked) => {
              if (!checked) return
              if (row.occurrenceAt)
                occurrence.complete(row.taskId, row.occurrenceAt)
              else update.mutate({ id: row.taskId, patch: { status: "done" } })
            }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(row.taskId)}
          className="min-h-11 w-full text-left text-sm font-medium break-words hover:text-brand"
        >
          {row.title}
        </button>
        <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-subtle">
          <span>{pathFor(data, row.projectId)}</span>
          {(row.priority === "urgent" || row.priority === "high") && (
            <span>· {TASK_PRIORITY_LABELS[row.priority]} priority</span>
          )}
          {row.task.checklist.length > 0 && (
            <span>
              · {checklistDone}/{row.task.checklist.length} checklist items
            </span>
          )}
          {row.task.resources.length > 0 && (
            <span>· {row.task.resources.length} linked resources</span>
          )}
          {row.occurrenceAt && <span>· Repeating task</span>}
        </p>
        <p
          className={cn(
            "mt-1 text-xs lg:hidden",
            due.overdue ? "text-destructive" : "text-subtle"
          )}
        >
          {due.label}
        </p>
      </div>
      <span
        className={cn(
          "mt-3 hidden max-w-36 shrink-0 text-right text-xs lg:block",
          due.overdue ? "text-destructive" : "text-subtle"
        )}
      >
        {due.label}
      </span>
    </>
  )
  const className = "relative flex gap-3 border-b border-border py-2.5 pr-8"
  // Whole-task context-menu actions are inappropriate for a single occurrence.
  return row.occurrenceAt ? (
    <div className={className}>{content}</div>
  ) : (
    <TaskItemMenu
      task={row.task}
      onOpen={onOpen}
      trigger={<div className={className} />}
      buttonClassName="absolute top-3 right-0"
    >
      {content}
    </TaskItemMenu>
  )
}

function ProjectRow({
  project,
  data,
  openTask,
  openResource,
  openDoc,
}: {
  project: OverviewProject
  data: OverviewSummary
  openTask: (id: string) => void
  openResource: (id: string) => void
  openDoc: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const progress = project.taskTotal
    ? Math.round((project.taskDone / project.taskTotal) * 100)
    : 0
  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
        <Link
          href={`/projects/${project.id}`}
          className="flex min-h-11 items-center gap-2 text-sm font-medium hover:text-brand"
        >
          <FolderIcon
            className="size-4"
            style={{ color: project.color ?? undefined }}
          />
          {project.name}
        </Link>
        <span className="text-xs text-subtle">
          {project.taskDone} / {project.taskTotal} tasks done
        </span>
      </div>
      {project.taskTotal > 0 && (
        <div
          className="my-2 h-1 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label={`${project.name} task completion`}
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <p className="text-xs text-subtle">
          {project.subprojectCount > 0 && (
            <>{countLabel(project.subprojectCount, "sub-project")} · </>
          )}
          {countLabel(project.resourceCount, "resource")} ·{" "}
          {countLabel(project.docCount, "doc")}
        </p>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`project-context-${project.id}`}
          onClick={() => setExpanded(!expanded)}
          className={TOUCH_LINK}
        >
          {expanded ? "Hide context" : "View context"}
          <ChevronDownIcon
            className={cn("size-3.5", expanded && "rotate-180")}
          />
        </button>
      </div>
      {project.nextTask ? (
        <button
          type="button"
          className="min-h-11 w-full text-left text-xs hover:text-brand"
          onClick={() => openTask(project.nextTask!.taskId)}
        >
          Next: {project.nextTask.title}
          <span className="ml-2 text-subtle">
            {project.nextTask.projectId !== project.id
              ? pathFor(data, project.nextTask.projectId)
              : ""}
          </span>
        </button>
      ) : (
        <p className="py-2 text-xs text-subtle">
          {project.blockedCount
            ? "Resolve blocked tasks to move this project forward."
            : "No open tasks in this project."}
        </p>
      )}
      <div
        id={`project-context-${project.id}`}
        hidden={!expanded}
        className="mt-2 rounded-lg border border-border bg-card p-3"
      >
        {project.docs.map((doc) => (
          <button
            key={doc.id}
            type="button"
            className="flex min-h-11 w-full items-center gap-2 text-left text-xs hover:text-brand"
            onClick={() => openDoc(doc.id)}
          >
            <FileTextIcon className="size-3.5" />
            {doc.title || "Untitled doc"}
          </button>
        ))}
        {project.resources.map((resource) => (
          <button
            key={resource.id}
            type="button"
            className="flex min-h-11 w-full items-center gap-2 text-left text-xs hover:text-brand"
            onClick={() => openResource(resource.id)}
          >
            <TypeIcon type={resource.type} className="size-3.5" />
            <span className="min-w-0 truncate">{displayTitle(resource)}</span>
          </button>
        ))}
        <PageLink href={`/projects/${project.id}`}>Open project</PageLink>
      </div>
    </>
  )
  return (
    <ProjectItemMenu
      project={{
        ...project,
        depth: 0,
        totalCount: project.resourceCount,
        children: [],
      }}
      trigger={<div className="relative border-b border-border py-3" />}
      buttonClassName="absolute top-5 right-0"
    >
      {content}
    </ProjectItemMenu>
  )
}

function DocRow({
  doc,
  data,
  openDoc,
}: {
  doc: DocSummary
  data: OverviewSummary
  openDoc: (id: string) => void
}) {
  const Icon =
    doc.kind === "spreadsheet"
      ? SheetIcon
      : doc.kind === "drawing"
        ? PencilLineIcon
        : FileTextIcon
  const kind =
    doc.kind === "spreadsheet"
      ? "Spreadsheet"
      : doc.kind === "drawing"
        ? "Drawing"
        : "Text"
  return (
    <button
      type="button"
      onClick={() => openDoc(doc.id)}
      className="flex min-h-16 w-full items-start gap-3 border-b border-border py-3 text-left hover:text-brand"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-raised">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium break-words">
          {doc.title || "Untitled doc"}
        </span>
        <span className="mt-1 block text-xs text-subtle">
          {kind} · {pathFor(data, doc.projectId)}
        </span>
        <span className="mt-1 block text-xs text-subtle">
          Edited {formatRelative(doc.updatedAt)}
        </span>
      </span>
    </button>
  )
}

function ReviewResourceRow({
  resource,
  data,
  openResource,
  openPreview,
}: {
  resource: ResourceDto
  data: OverviewSummary
  openResource: (id: string) => void
  openPreview: (id: string) => void
}) {
  const update = useUpdateResource()
  return (
    <ResourceContextMenu
      resource={resource}
      onEdit={openResource}
      onPreview={openPreview}
      buttonClassName="absolute top-3 right-0"
      trigger={
        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-3 pr-8" />
      }
    >
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-raised">
        {resource.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resource.thumbnailUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <TypeIcon type={resource.type} className="size-4" />
        )}
      </span>
      <button
        type="button"
        className="min-h-11 min-w-0 flex-1 text-left hover:text-brand"
        onClick={() => openPreview(resource.id)}
      >
        <span className="block text-sm font-medium break-words">
          {displayTitle(resource)}
        </span>
        <span className="mt-1 block text-xs text-subtle">
          {resource.projects.length
            ? pathFor(data, resource.projects[0].id)
            : "Independent resource"}{" "}
          · Saved {formatRelative(resource.createdAt)}
        </span>
      </button>
      <div className="flex basis-full flex-wrap gap-x-3 pl-13 sm:basis-auto sm:pl-0">
        <button
          type="button"
          className={TOUCH_LINK}
          onClick={() => openPreview(resource.id)}
        >
          Preview
        </button>
        <Button
          variant="ghost"
          className="min-h-11 text-xs text-brand"
          loading={update.isPending}
          onClick={() =>
            update.mutate({ id: resource.id, patch: { isReviewed: true } })
          }
        >
          Mark reviewed
        </Button>
      </div>
    </ResourceContextMenu>
  )
}

function OverviewSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Skeleton className="h-3 w-36" />
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid gap-7 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}

export function OverviewView({ userName }: { userName: string }) {
  const overviewQuery = useOverview()
  const { data } = overviewQuery
  const { openTask, openResource } = useDetailDrawer()
  const { openPreview } = useResourcePreview()
  const { openAddTask, openAddProject, openAddQuickNote, openAddResource } =
    useShell()
  const [docId, setDocId] = useState<string | null>(null)
  if (overviewQuery.isPending) return <OverviewSkeleton />
  if (!data) return <QueryFeedback query={overviewQuery} label="overview" />
  const { tasks, resources, projects, docs } = data
  const blocked = tasks.blocked[0]
  const focus =
    tasks.today[0] ??
    (blocked ? undefined : (tasks.week[0] ?? tasks.suggested[0]))
  const date = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: data.timezone,
  }).format(new Date(data.generatedAt))
  const briefTitle =
    tasks.pastDue > 0
      ? "Clear overdue tasks, then take the next step."
      : tasks.dueToday > 0
        ? "Start with what's due today."
        : blocked
          ? "Unblock a task to keep things moving."
          : focus
            ? "Choose a task and move it forward."
            : resources.toReviewCount > 0
              ? "Revisit something you saved."
              : "Make room for your next idea."
  const briefReason = focus
    ? `${focus.title} · ${pathFor(data, focus.projectId)} · ${dueLabel(focus, data).label}`
    : blocked
      ? `${blocked.title} · Marked blocked`
      : resources.toReviewCount
        ? `${countLabel(resources.toReviewCount, "saved resource")} ${resources.toReviewCount === 1 ? "hasn't" : "haven't"} been marked reviewed.`
        : "Save a resource, plan a task, or start a doc."
  const action = focus
    ? () => openTask(focus.taskId)
    : blocked
      ? () => openTask(blocked.id)
      : resources.toReviewCount
        ? () =>
            document
              .getElementById("overview-resources")
              ?.scrollIntoView({ block: "start" })
        : () => openAddTask()
  const actionLabel = focus
    ? "Open next task"
    : blocked
      ? "Open blocked task"
      : resources.toReviewCount
        ? "Review resources"
        : "New task"
  const hasAttention = tasks.blockedCount > 0 || resources.toReviewCount > 0
  return (
    <div
      className="mx-auto max-w-6xl space-y-7 pb-4"
      aria-label={`Overview for ${userName}`}
    >
      <QueryFeedback query={overviewQuery} label="overview" loading={false} />
      <header>
        <p className="text-xs tracking-wide text-subtle uppercase">{date}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Your day, with a clear next step.
        </h1>
        <p
          className="mt-2 text-sm text-text-muted"
          data-testid="overview-summary"
        >
          {countLabel(tasks.pastDue, "overdue task")} · {tasks.dueToday} due
          today · {tasks.blockedCount} blocked
        </p>
      </header>
      <section
        aria-label="Daily brief"
        className="flex flex-col items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center"
      >
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium tracking-wide text-brand uppercase">
            Today&apos;s focus
          </p>
          <h2 className="text-base font-medium">{briefTitle}</h2>
          <p className="mt-2 text-sm text-text-muted">{briefReason}</p>
        </div>
        <Button className="min-h-11 shrink-0" onClick={action}>
          {actionLabel}
          <ArrowRightIcon />
        </Button>
      </section>
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(220px,1fr)]">
        <div className="min-w-0 space-y-7">
          <section aria-label="Task priorities">
            <SectionHeader title="What needs doing">
              <PageLink href="/tasks">All tasks</PageLink>
            </SectionHeader>
            <Tabs defaultValue="today">
              <TabsList variant="line" className="h-11 border-b border-border">
                <TabsTrigger value="today" className="min-h-11">
                  Today{" "}
                  <span className="ml-1 text-xs text-subtle">
                    {tasks.todayCount}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="week" className="min-h-11">
                  Next 7 days
                </TabsTrigger>
              </TabsList>
              {(["today", "week"] as const).map((horizon) => (
                <TabsContent key={horizon} value={horizon}>
                  {tasks[horizon].length ? (
                    tasks[horizon].map((row) => (
                      <FocusTaskRow
                        key={row.key}
                        row={row}
                        data={data}
                        onOpen={openTask}
                      />
                    ))
                  ) : (
                    <div className="border-b border-border py-6">
                      <p className="flex items-center gap-2 text-sm">
                        <CheckCircle2Icon className="size-4 text-subtle" />
                        {horizon === "today"
                          ? "No actionable tasks due today."
                          : "No actionable tasks due in the next 7 days."}
                      </p>
                      {tasks.suggested.length > 0 ? (
                        <>
                          <p className="mt-3 text-xs text-subtle">
                            Tasks you can choose to work on
                          </p>
                          {tasks.suggested.map((row) => (
                            <FocusTaskRow
                              key={row.key}
                              row={row}
                              data={data}
                              onOpen={openTask}
                            />
                          ))}
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          className="mt-2 min-h-11"
                          onClick={() => openAddTask()}
                        >
                          Plan a task
                        </Button>
                      )}
                    </div>
                  )}
                  {(horizon === "today" ? tasks.todayCount : tasks.weekCount) >
                    tasks[horizon].length && (
                    <PageLink href="/tasks">View all tasks</PageLink>
                  )}
                </TabsContent>
              ))}
            </Tabs>
            <p
              className="mt-3 flex items-center gap-2 text-xs text-subtle"
              aria-live="polite"
            >
              <CheckCheckIcon className="size-4" />
              {tasks.completedToday} completed today
            </p>
          </section>
          <section aria-label="Project next steps">
            <SectionHeader title="Move a project forward">
              <span className="text-xs text-subtle">Includes sub-projects</span>
            </SectionHeader>
            {projects.top.length ? (
              projects.top.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  data={data}
                  openTask={openTask}
                  openResource={openResource}
                  openDoc={setDocId}
                />
              ))
            ) : (
              <div className="py-4">
                <p className="text-sm text-text-muted">
                  Group related resources, tasks and docs in a project.
                </p>
                <Button
                  variant="outline"
                  className="mt-3 min-h-11"
                  onClick={() => openAddProject()}
                >
                  New project
                </Button>
              </div>
            )}
          </section>
        </div>
        <aside className="min-w-0 space-y-7">
          {hasAttention && (
            <section
              aria-label="Needs attention"
              className="rounded-xl border border-border bg-card p-5"
            >
              <h2 className="mb-3 text-base font-semibold">Needs attention</h2>
              {tasks.blockedCount > 0 && (
                <div className="pb-3">
                  <p className="text-sm font-medium">
                    {tasks.blockedCount === 1
                      ? "Resolve a blocked task"
                      : `${tasks.blockedCount} blocked tasks`}
                  </p>
                  {tasks.blocked.map((task) => (
                    <div key={task.id} className="mt-2">
                      <p className="text-xs text-subtle">
                        {task.title} · {pathFor(data, task.projectId)}
                      </p>
                      <button
                        type="button"
                        onClick={() => openTask(task.id)}
                        className={TOUCH_LINK}
                      >
                        Open blocked task
                        <ArrowUpRightIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {resources.toReviewCount > 0 && (
                <div
                  className={cn(
                    tasks.blockedCount > 0 && "border-t border-border pt-3"
                  )}
                >
                  <p className="text-sm font-medium">
                    {countLabel(resources.toReviewCount, "resource")} to review
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    Saved and not marked reviewed.
                  </p>
                  <button
                    type="button"
                    className={TOUCH_LINK}
                    onClick={() =>
                      document
                        .getElementById("overview-resources")
                        ?.scrollIntoView({ block: "start" })
                    }
                  >
                    Review resources
                    <ArrowRightIcon className="size-3.5" />
                  </button>
                </div>
              )}
            </section>
          )}
          <section aria-label="Recently edited docs">
            <SectionHeader title="Continue editing">
              <PageLink href="/docs">Docs</PageLink>
            </SectionHeader>
            {docs.recent.length ? (
              docs.recent.map((doc) => (
                <DocRow key={doc.id} doc={doc} data={data} openDoc={setDocId} />
              ))
            ) : (
              <div className="py-3">
                <p className="text-sm text-text-muted">
                  Keep text, spreadsheets and drawings in Docs.
                </p>
                <Button
                  variant="ghost"
                  className="mt-2 min-h-11"
                  onClick={() => openAddQuickNote()}
                >
                  <NotebookPenIcon />
                  New doc
                </Button>
              </div>
            )}
          </section>
        </aside>
      </div>
      <section
        id="overview-resources"
        className="scroll-mt-24"
        aria-label="Resources to review"
      >
        <SectionHeader title="Saved to revisit">
          <PageLink href="/resources?reviewed=false">Not reviewed yet</PageLink>
        </SectionHeader>
        {resources.toReview.length ? (
          resources.toReview.map((resource) => (
            <ReviewResourceRow
              key={resource.id}
              resource={resource}
              data={data}
              openResource={openResource}
              openPreview={openPreview}
            />
          ))
        ) : (
          <div className="flex flex-wrap items-center gap-3 border-b border-border py-5">
            <LibraryBigIcon className="size-4 text-subtle" />
            <p className="text-sm text-text-muted">
              {resources.total
                ? "Your saved resources are reviewed."
                : "Save a useful link, a thought, or a file."}
            </p>
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => openAddResource()}
            >
              Save resource
            </Button>
          </div>
        )}
      </section>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-subtle">
        <span>
          {countLabel(resources.total, "resource")} ·{" "}
          {countLabel(tasks.activeTotal, "open task")} ·{" "}
          {countLabel(projects.total, "project")}
        </span>
        <span>
          Times in {data.timezone} ·{" "}
          <Link className="text-brand hover:text-brand-hover" href="/calendar">
            Open calendar
          </Link>
        </span>
      </footer>
      {docId && (
        <OverviewDocDialog
          key={docId}
          id={docId}
          onClose={() => setDocId(null)}
        />
      )}
    </div>
  )
}
