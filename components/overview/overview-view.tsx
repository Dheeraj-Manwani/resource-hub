"use client"

import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  FolderIcon,
  InboxIcon,
  LibraryBigIcon,
  StarIcon,
  FileExclamationPoint,
} from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { TypeIcon } from "@/components/resources/type-icon"
import { TaskRow } from "@/components/tasks/task-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useOverview } from "@/hooks/queries/overview"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import { formatRelative } from "@/lib/format"
import { displayTitle } from "@/lib/resources/dto"
import { cn } from "@/lib/utils"

const DATE_HEADING = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
})

function greeting(name: string) {
  const first = name.trim().split(/\s+/)[0] || name
  const hour = new Date().getHours()
  if (hour < 5) return `Still up, ${first}?`
  if (hour < 12) return `Good morning, ${first}`
  if (hour < 18) return `Good afternoon, ${first}`
  return `Good evening, ${first}`
}

function Panel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-card md:p-5",
        className
      )}
    >
      {children}
    </div>
  )
}

function PanelHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-subtle uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-0.5 text-base font-semibold">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function PanelLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="text-xs font-medium text-brand hover:text-brand-hover"
    >
      {children}
    </Link>
  )
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "danger" | "success"
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-border bg-surface px-3 py-3 text-center">
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "danger" && value > 0 && "text-destructive",
          tone === "success" && value > 0 && "text-emerald-400"
        )}
      >
        {value}
      </span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  )
}

function StatRow({
  href,
  icon: Icon,
  label,
  value,
}: {
  href?: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
}) {
  const inner = (
    <>
      <span className="flex items-center gap-2 text-sm">
        <Icon className="size-4 text-subtle" />
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </>
  )
  const className =
    "flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors"
  if (!href) return <div className={className}>{inner}</div>
  return (
    <Link href={href} className={cn(className, "hover:border-brand/40")}>
      {inner}
    </Link>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}

export function OverviewView({ userName }: { userName: string }) {
  const { data, isPending, isError, refetch } = useOverview()
  const { openTask, openResource } = useDetailDrawer()

  if (isPending) return <OverviewSkeleton />

  if (isError || !data) {
    return (
      <EmptyState
        icon={FileExclamationPoint}
        title="Couldn't load your overview"
        description="Something went wrong pulling your data together."
      >
        <Button onClick={() => refetch()}>Try again</Button>
      </EmptyState>
    )
  }

  const { tasks, resources, projects } = data

  return (
    <div className="space-y-5 pb-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-subtle uppercase">
          {DATE_HEADING.format(new Date())}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          {greeting(userName)}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {tasks.pastDue > 0
            ? `${tasks.pastDue} task${tasks.pastDue === 1 ? "" : "s"} could use some catching up on.`
            : tasks.dueToday > 0
              ? `${tasks.dueToday} task${tasks.dueToday === 1 ? "" : "s"} due today — a little clarity for the day ahead.`
              : "Nothing urgent on the board. A good day to get ahead."}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            eyebrow="On your desk"
            title="Today, in focus"
            action={<PanelLink href="/tasks">All tasks →</PanelLink>}
          />
          <div className="flex gap-2">
            <StatTile label="due today" value={tasks.dueToday} />
            <StatTile label="past due" value={tasks.pastDue} tone="danger" />
            <StatTile
              label="wrapped up"
              value={tasks.completedToday}
              tone="success"
            />
          </div>
          <div className="mt-4">
            {tasks.upNext.length ? (
              <div className="divide-y divide-border rounded-lg border border-border">
                {tasks.upNext.map((task) => (
                  <TaskRow key={task.id} task={task} onOpen={openTask} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong/70 px-3 py-4 text-sm text-text-muted">
                <CheckCircle2Icon className="size-4 shrink-0 text-emerald-400" />
                Nothing due today. Keep that feeling.
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader eyebrow="Resources snapshot" title="Your stuff" />
          <div className="space-y-2">
            <StatRow
              href="/resources?filter=independent"
              icon={InboxIcon}
              label="Inbox"
              value={resources.inbox}
            />
            <StatRow
              icon={StarIcon}
              label="Favorites"
              value={resources.favorites}
            />
            <StatRow
              icon={LibraryBigIcon}
              label="Saved in total"
              value={resources.total}
            />
          </div>
          <div className="mt-3">
            <PanelLink href="/resources">Visit resources →</PanelLink>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            eyebrow="Just saved"
            title="Recently collected"
            action={<PanelLink href="/resources">Visit resources →</PanelLink>}
          />
          {resources.recent.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {resources.recent.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openResource(r.id)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2 text-left transition-colors hover:border-brand/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-raised">
                    {r.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <TypeIcon type={r.type} className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {displayTitle(r)}
                    </span>
                    <span className="block truncate text-xs text-subtle">
                      {formatRelative(r.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={LibraryBigIcon}
              title="Your resources start here"
              description="Save a useful page, a thought, or a file for later."
            />
          )}
        </Panel>

        <Panel>
          <PanelHeader eyebrow="Things in motion" title="Projects" />
          {projects.top.length ? (
            <div className="space-y-2">
              {projects.top.map((p) => {
                const pct = p.taskTotal
                  ? Math.round((p.taskDone / p.taskTotal) * 100)
                  : 0
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="block rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-brand/40"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color ?? "var(--brand)" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {p.name}
                      </span>
                      <span className="shrink-0 text-xs text-subtle">
                        {p.directCount}
                      </span>
                    </div>
                    {p.taskTotal ? (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={FolderIcon}
              title="Start with a project"
              description="Group related resources and tasks — create one from the sidebar."
            />
          )}
        </Panel>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-subtle">
        <span className="flex items-center gap-1.5">
          {resources.total} saved · {tasks.activeTotal} tasks in motion ·{" "}
          {projects.total} projects
        </span>
        <Link
          href="/calendar"
          className="flex items-center gap-1 font-medium text-brand hover:text-brand-hover"
        >
          See what&apos;s coming next
          <CalendarDaysIcon className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
