"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { QueryFeedback } from "@/components/query-feedback"
import { useResourcePreview } from "@/components/resources/resource-preview-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { useShell } from "@/components/shell/shell-context"
import { useOverview } from "@/hooks/queries/overview"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import {
  createDefaultOverviewConfiguration,
  type OverviewConfiguration,
} from "@/lib/overview/sections"
import type { OverviewSectionContext } from "./section-context"
import { OverviewSections } from "./overview-sections"
import { countLabel } from "./section-ui"

const OverviewDocDialog = dynamic(() => import("./overview-doc-dialog"), {
  ssr: false,
})
const DEFAULT_CONFIGURATION = createDefaultOverviewConfiguration()
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

export function OverviewView({
  userName,
  configuration = DEFAULT_CONFIGURATION,
}: {
  userName: string
  configuration?: OverviewConfiguration
}) {
  const overviewQuery = useOverview()
  const { data } = overviewQuery
  const { openTask, openResource } = useDetailDrawer()
  const { openPreview } = useResourcePreview()
  const { openAddTask, openAddProject, openAddQuickNote, openAddResource } =
    useShell()
  const [docId, setDocId] = useState<string | null>(null)
  if (overviewQuery.isPending) return <OverviewSkeleton />
  if (!data) return <QueryFeedback query={overviewQuery} label="overview" />
  const { tasks, resources, projects } = data
  const date = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: data.timezone,
  }).format(new Date(data.generatedAt))
  const context: OverviewSectionContext = {
    data,
    actions: {
      openTask,
      openResource,
      openPreview,
      openDoc: setDocId,
      openAddTask,
      openAddProject,
      openAddQuickNote,
      openAddResource,
    },
  }
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

      <OverviewSections configuration={configuration} context={context} />
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
