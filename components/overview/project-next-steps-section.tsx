"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDownIcon, FileTextIcon, FolderIcon } from "lucide-react"
import { ProjectItemMenu } from "@/components/projects/project-item-menu"
import { TypeIcon } from "@/components/resources/type-icon"
import { Button } from "@/components/ui/button"
import type { OverviewProject, OverviewSummary } from "@/lib/overview/model"
import { displayTitle } from "@/lib/resources/dto"
import { cn } from "@/lib/utils"
import type { OverviewSectionProps } from "./section-context"
import {
  countLabel,
  pathFor,
  TOUCH_LINK,
  SectionHeader,
  PageLink,
} from "./section-ui"

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

export function ProjectNextStepsSection({
  data,
  actions,
}: OverviewSectionProps) {
  const { projects } = data
  const { openTask, openResource, openDoc, openAddProject } = actions
  return (
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
            openDoc={openDoc}
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
  )
}
