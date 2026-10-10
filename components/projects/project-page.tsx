"use client"

import { FilterPanel } from "@/components/filter-panel"
import { AddMenu } from "@/components/add-menu"

import { QueryFeedback } from "@/components/query-feedback"

import {
  ChevronRightIcon,
  InfoIcon,
  ListPlusIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import { LibraryView } from "@/components/resources/library-view"
import { ResourceChecklistContext } from "@/components/resources/resource-checklist"
import { useResourceChecklist } from "@/hooks/queries/resource-checklists"
import { useShell } from "@/components/shell/shell-context"
import { ProjectTasksSection } from "@/components/tasks/project-tasks-section"
import { useProjectTaskProgress } from "@/hooks/queries/tasks"
import { useQuickNotes } from "@/hooks/queries/quick-notes"
import { Button } from "@/components/ui/button"

import { Switch } from "@/components/ui/switch"
import {
  Tabs,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { useProject, useProjectTree } from "@/hooks/queries/projects"
import type { SettingsDto } from "@/lib/server/dal/settings"
import { cn } from "@/lib/utils"

import { AddExistingDialog } from "./add-existing-dialog"
import { ProjectItemMenu } from "./project-item-menu"
import { ProjectIconPicker } from "./project-icon-picker"
import { ProjectInfoModal } from "./project-info-modal"
import { ProjectQuickNotesTab } from "./project-quick-notes-tab"
import { ProjectSubprojectsTab } from "./project-subprojects-tab"

const TABS = ["resources", "tasks", "subprojects", "notes"] as const
type Tab = (typeof TABS)[number]

/** Keeps the active tab in the URL (`?tab=`) so it survives a refresh or a
 * shared link, matching how the detail drawer and smart filters already
 * live in the URL elsewhere in this app. */
function useProjectTab(): [Tab, (tab: Tab) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const raw = searchParams.get("tab")
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "")
    ? (raw as Tab)
    : "resources"

  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next === "resources") params.delete("tab")
      else params.set("tab", next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  return [tab, setTab]
}

function Breadcrumbs({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId)
  if (!data) return null
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-1 flex flex-wrap items-center gap-1 text-sm text-subtle"
    >
      <Link href="/resources" className="hover:text-text-muted hover:underline">
        Resources
      </Link>
      {data.ancestors.map((p) => (
        <span key={p.id} className="flex items-center gap-1">
          <ChevronRightIcon className="size-3.5" />
          <Link
            href={`/projects/${p.id}`}
            className="hover:text-text-muted hover:underline"
          >
            {p.name}
          </Link>
        </span>
      ))}
      <ChevronRightIcon className="size-3.5" />
      <span className="text-text-muted">{data.project.name}</span>
    </nav>
  )
}

function ProjectMenu({
  projectId,
  children,
}: {
  projectId: string
  children: React.ReactNode
}) {
  const { data } = useProject(projectId)
  if (!data)
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {children}
      </div>
    )
  return (
    <ProjectItemMenu
      project={{
        ...data.project,
        depth: 0,
        totalCount: data.project.directCount,
        children: [],
      }}
      label="Project options"
      trigger={
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3" />
      }
    >
      {children}
    </ProjectItemMenu>
  )
}

function TabCount({
  value,
  active,
}: {
  value: number | undefined
  active?: boolean
}) {
  if (!value) return null
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums transition-colors",
        active ? "bg-brand/15 text-brand" : "bg-white/[0.06] text-subtle"
      )}
    >
      {value}
    </span>
  )
}

export function ProjectPage({
  projectId,
  initialSettings,
}: {
  projectId: string
  initialSettings: SettingsDto
}) {
  const { openAddResource } = useShell()
  const projectQuery = useProject(projectId)
  const { data } = projectQuery
  const projectName = data?.project.name
  // Follow optimistic renames (and rollbacks) without waiting for navigation.
  useEffect(() => {
    if (projectName) document.title = `${projectName} | RH`
  }, [projectName])
  const { data: tree } = useProjectTree()
  const [includeDescendants, setIncludeDescendants] = useState(false)
  const [addingExisting, setAddingExisting] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [tab, setTab] = useProjectTab()
  const checklist = useResourceChecklist(projectId, includeDescendants)
  const checklistData = checklist.query.data
  const checklistContext = useMemo(
    () =>
      checklistData?.enabled
        ? {
            checkedIds: new Set(checklistData.checkedResourceIds),
            pending: checklist.mutation.isPending,
            onCheck: (resourceId: string, checked: boolean) =>
              checklist.mutation.mutate({
                action: "check",
                resourceId,
                checked,
              }),
          }
        : null,
    [checklistData, checklist.mutation]
  )

  // Lightweight counts only (not the full lists) so the tab badges stay
  // accurate without loading an inactive tab's content.
  const { data: taskProgress } = useProjectTaskProgress(
    projectId,
    includeDescendants
  )
  const subProjectCount = useMemo(
    () => tree?.filter((p) => p.parentId === projectId).length ?? 0,
    [tree, projectId]
  )
  const { data: notes } = useQuickNotes({ projectId, includeDescendants })

  const baseFilters = useMemo(
    () => ({ projectId, includeDescendants }),
    [projectId, includeDescendants]
  )

  if (projectQuery.isError && !data)
    return <QueryFeedback query={projectQuery} label="project" />

  const project = data?.project

  return (
    <>
      <QueryFeedback query={projectQuery} label="project" loading={false} />
      <Breadcrumbs projectId={projectId} />
      <ProjectMenu projectId={projectId}>
        <div className="flex min-w-0 items-center gap-2.5">
          {project ? (
            <ProjectIconPicker project={project} size={20} />
          ) : (
            <span className="size-8 shrink-0" />
          )}
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
            {project ? (
              project.name
            ) : (
              <span className="inline-block h-7 w-40 animate-pulse rounded bg-white/5" />
            )}
          </h1>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Project info"
            disabled={!project}
            onClick={() => setInfoOpen(true)}
          >
            <InfoIcon />
          </Button>
        </div>
      </ProjectMenu>

      {tab !== "resources" ? (
        <FilterPanel activeCount={includeDescendants ? 1 : 0}>
          {" "}
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <Switch
              size="sm"
              checked={includeDescendants}
              onCheckedChange={setIncludeDescendants}
            />
            Include sub-projects
          </label>
        </FilterPanel>
      ) : null}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList variant="pill" className="mb-3">
          <TabsIndicator />
          <TabsTrigger value="resources">
            Resources
            <TabCount
              value={project?.directCount}
              active={tab === "resources"}
            />
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Tasks
            <TabCount value={taskProgress?.total} active={tab === "tasks"} />
          </TabsTrigger>
          <TabsTrigger value="subprojects">
            Sub-projects
            <TabCount value={subProjectCount} active={tab === "subprojects"} />
          </TabsTrigger>
          <TabsTrigger value="notes">
            Docs
            <TabCount value={notes?.length} active={tab === "notes"} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resources">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-sm text-text-muted" role="status">
              {checklistData?.enabled
                ? `${checklistData.checkedResourceIds.length} of ${checklistData.resourceIds.length} done`
                : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <AddMenu
                size="xs"
                items={[
                  {
                    label: "Add new resource",
                    icon: <PlusIcon />,
                    onSelect: () => openAddResource(undefined, [projectId]),
                  },
                  {
                    label: "Add existing resources",
                    icon: <ListPlusIcon />,
                    onSelect: () => setAddingExisting(true),
                  },
                ]}
              />
              <label className="flex items-center gap-2 text-xs text-text-muted">
                <Switch
                  size="sm"
                  checked={checklistData?.enabled ?? false}
                  disabled={!checklistData || checklist.mutation.isPending}
                  onCheckedChange={(enabled) =>
                    checklist.mutation.mutate({ action: "mode", enabled })
                  }
                />
                Checklist mode
              </label>
              {checklistData?.enabled ? (
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="Reset checklist"
                  title="Reset checklist"
                  className="text-text-muted hover:text-foreground"
                  disabled={
                    checklist.mutation.isPending ||
                    !checklistData.checkedResourceIds.length
                  }
                  onClick={() => checklist.mutation.mutate({ action: "reset" })}
                >
                  <RotateCcwIcon /> Reset
                </Button>
              ) : null}
            </div>
          </div>
          <QueryFeedback
            query={checklist.query}
            label="resource checklist"
            loading={false}
          />
          {checklistData?.enabled ? (
            <p className="mb-3 text-xs text-subtle">
              Check off resources as you finish. Reset the checklist whenever
              you want to start again.
            </p>
          ) : null}
          <ResourceChecklistContext.Provider value={checklistContext}>
            <LibraryView
              title={project?.name ?? "Project"}
              initialSettings={initialSettings}
              baseFilters={baseFilters}
              emptyTitle="Nothing filed here yet"
              emptyDescription="Add a new resource here, add existing Inbox items, or drag a resource onto this project in the sidebar."
              hideHeader
              extraFilters={
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <Switch
                    size="sm"
                    checked={includeDescendants}
                    onCheckedChange={setIncludeDescendants}
                  />
                  Include sub-projects
                </label>
              }
              extraActiveCount={includeDescendants ? 1 : 0}
            />
          </ResourceChecklistContext.Provider>
        </TabsContent>

        <TabsContent value="tasks">
          <ProjectTasksSection
            projectId={projectId}
            projectName={project?.name ?? ""}
            includeDescendants={includeDescendants}
          />
        </TabsContent>

        <TabsContent value="subprojects">
          <ProjectSubprojectsTab
            projectId={projectId}
            includeDescendants={includeDescendants}
          />
        </TabsContent>

        <TabsContent value="notes">
          <ProjectQuickNotesTab
            projectId={projectId}
            includeDescendants={includeDescendants}
          />
        </TabsContent>
      </Tabs>

      <AddExistingDialog
        projectId={projectId}
        open={addingExisting}
        onOpenChange={setAddingExisting}
      />
      <ProjectInfoModal
        projectId={projectId}
        open={infoOpen}
        onOpenChange={setInfoOpen}
      />
    </>
  )
}
