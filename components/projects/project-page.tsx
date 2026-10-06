"use client"

import { FilterPanel } from "@/components/filter-panel"
import { AddMenu } from "@/components/add-menu"

import { QueryFeedback } from "@/components/query-feedback"

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronRightIcon,
  InfoIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import { LibraryView } from "@/components/resources/library-view"
import { useShell } from "@/components/shell/shell-context"
import { ProjectTasksSection } from "@/components/tasks/project-tasks-section"
import { useProjectTaskProgress } from "@/hooks/queries/tasks"
import { useQuickNotes } from "@/hooks/queries/quick-notes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import {
  Tabs,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  useDeleteProject,
  useProject,
  useProjectTree,
  useUpdateProject,
} from "@/hooks/queries/projects"
import type { SettingsDto } from "@/lib/server/dal/settings"
import { cn } from "@/lib/utils"

import { AddExistingDialog } from "./add-existing-dialog"
import { DeleteProjectDialog } from "./delete-project-dialog"
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

function ProjectMenu({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId)
  const update = useUpdateProject()
  const deleteProject = useDeleteProject()
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  if (!data) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" aria-label="Project options" />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              update.mutate({
                id: projectId,
                patch: { archived: !data.project.archivedAt },
              })
            }
          >
            {data.project.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            {data.project.archivedAt ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleting(true)}
          >
            <Trash2Icon />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteProjectDialog
        project={
          deleting
            ? { ...data.project, depth: 0, totalCount: 0, children: [] }
            : null
        }
        onOpenChange={(open) => !open && setDeleting(false)}
        onConfirm={async (mode) => {
          await deleteProject.mutateAsync({ id: projectId, mode })
          router.push("/resources")
        }}
      />
    </>
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex shrink-0 items-center gap-2">
          <ProjectMenu projectId={projectId} />
        </div>
      </div>

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
            Notes
            <TabCount value={notes?.length} active={tab === "notes"} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resources">
          <div className="mb-2 flex justify-end">
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
          </div>
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
