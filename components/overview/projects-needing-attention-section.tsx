"use client"

import Link from "next/link"
import { FolderIcon } from "lucide-react"
import { QueryFeedback } from "@/components/query-feedback"
import { Button } from "@/components/ui/button"
import { useOverviewSection } from "@/hooks/queries/overview"
import type { OverviewSectionProps } from "./section-context"
import { countLabel, pathFor, SectionHeader } from "./section-ui"

export function ProjectsNeedingAttentionSection({
  data,
  actions,
}: OverviewSectionProps) {
  const query = useOverviewSection("projects-needing-attention")
  return (
    <section aria-label="Projects needing attention">
      <SectionHeader title="Projects needing attention">
        <span className="text-xs text-subtle">Includes sub-projects</span>
      </SectionHeader>
      <QueryFeedback query={query} label="projects needing attention" />
      {query.data &&
        (query.data.items.length ? (
          <>
            {query.data.items.map((project) => (
              <div key={project.id} className="border-b border-border py-3">
                <Link
                  href={`/projects/${project.id}?tab=tasks`}
                  className="flex min-h-11 items-center gap-2 text-sm font-medium break-words hover:text-brand"
                >
                  <FolderIcon
                    className="size-4 shrink-0"
                    style={{ color: project.color ?? undefined }}
                  />
                  {project.name}
                </Link>
                <p className="text-xs text-subtle">
                  {countLabel(project.overdueCount, "overdue task")} ·{" "}
                  {project.blockedCount} blocked
                  {project.subprojectCount > 0 &&
                    ` · ${countLabel(project.subprojectCount, "sub-project")}`}
                </p>
                {project.attentionTask && (
                  <button
                    type="button"
                    className="min-h-11 w-full text-left text-xs break-words hover:text-brand"
                    onClick={() => actions.openTask(project.attentionTask!.id)}
                  >
                    Resolve: {project.attentionTask.title}
                    <span className="ml-2 text-subtle">
                      {pathFor(data, project.attentionTask.projectId)}
                    </span>
                  </button>
                )}
              </div>
            ))}
            {query.data.total > query.data.items.length && (
              <p className="mt-3 text-xs text-subtle">
                Showing {query.data.items.length} of {query.data.total} projects
                needing attention. Find more projects in the sidebar.
              </p>
            )}
          </>
        ) : (
          <div className="py-4">
            <p className="text-sm text-text-muted">
              No active projects have overdue or blocked tasks.
            </p>
            {data.projects.total === 0 && (
              <Button
                variant="ghost"
                className="mt-2 min-h-11"
                onClick={() => actions.openAddProject()}
              >
                New project
              </Button>
            )}
          </div>
        ))}
    </section>
  )
}
