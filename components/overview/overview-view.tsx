"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { SlidersHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSettings, useUpdateSettings } from "@/hooks/queries/settings"
import type { SettingsDto } from "@/lib/server/dal/settings"
import { QueryFeedback } from "@/components/query-feedback"
import { useResourcePreview } from "@/components/resources/resource-preview-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { useShell } from "@/components/shell/shell-context"
import { useOverview } from "@/hooks/queries/overview"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import {
  readOverviewConfiguration,
  type OverviewConfiguration,
} from "@/lib/overview/sections"
import type { OverviewSectionContext } from "./section-context"
import { OverviewSections } from "./overview-sections"
import { countLabel } from "./section-ui"
import { OverviewCustomizer } from "./overview-customizer"

const OverviewDocDialog = dynamic(() => import("./overview-doc-dialog"), {
  ssr: false,
})
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
  initialSettings,
}: {
  userName: string
  initialSettings?: SettingsDto
}) {
  const overviewQuery = useOverview()
  const settingsQuery = useSettings(initialSettings)
  const updateSettings = useUpdateSettings()
  const router = useRouter()
  const { data } = overviewQuery
  const { openTask, openResource } = useDetailDrawer()
  const { openPreview } = useResourcePreview()
  const { openAddTask, openAddProject, openAddQuickNote, openAddResource } =
    useShell()
  const [docId, setDocId] = useState<string | null>(null)
  const [draft, setDraft] = useState<OverviewConfiguration | null>(null)
  const [saveError, setSaveError] = useState("")
  const savedConfiguration = readOverviewConfiguration(
    settingsQuery.data?.overviewConfiguration
  )
  const shownConfiguration = draft ?? savedConfiguration
  if (overviewQuery.isPending || settingsQuery.isPending)
    return <OverviewSkeleton />
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
      reviewResources: () => {
        const section = document.getElementById("overview-resources")
        if (section) section.scrollIntoView({ block: "start" })
        else router.push("/resources?reviewed=false")
      },
    },
  }
  return (
    <div
      className="mx-auto max-w-6xl space-y-7 pb-4"
      aria-label={`Overview for ${userName}`}
    >
      <QueryFeedback query={overviewQuery} label="overview" loading={false} />
      <QueryFeedback
        query={settingsQuery}
        label="overview preferences"
        loading={false}
      />
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs tracking-wide text-subtle uppercase">{date}</p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={!settingsQuery.data || draft !== null}
            aria-expanded={draft !== null}
            aria-controls="overview-customizer"
            onClick={() => {
              setSaveError("")
              updateSettings.reset()
              setDraft(structuredClone(savedConfiguration))
            }}
          >
            <SlidersHorizontalIcon /> Customize overview
          </Button>
        </div>
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

      {draft && (
        <OverviewCustomizer
          configuration={draft}
          onChange={setDraft}
          onCancel={() => {
            setDraft(null)
            setSaveError("")
          }}
          saving={updateSettings.isPending}
          paused={updateSettings.isPaused}
          error={saveError}
          onSave={async () => {
            setSaveError("")
            try {
              await updateSettings.mutateAsync({ overviewConfiguration: draft })
              setDraft(null)
            } catch (error) {
              setSaveError(
                error instanceof Error
                  ? error.message
                  : "Could not save overview preferences."
              )
            }
          }}
        />
      )}
      <OverviewSections configuration={shownConfiguration} context={context} />
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
