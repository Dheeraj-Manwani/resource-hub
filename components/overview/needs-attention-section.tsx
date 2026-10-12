"use client"

import { overviewSectionLimit } from "@/lib/overview/sections"

import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { OverviewSectionProps } from "./section-context"
import { countLabel, pathFor, TOUCH_LINK } from "./section-ui"

export function NeedsAttentionSection({
  data,
  actions,
  options,
}: OverviewSectionProps) {
  const limit = overviewSectionLimit("needs-attention", options)
  const { tasks, resources } = data
  const { openTask, reviewResources } = actions
  if (!tasks.blockedCount && !resources.toReviewCount) return null
  return (
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
          {tasks.blocked.slice(0, limit).map((task) => (
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
            onClick={reviewResources}
          >
            Review resources
            <ArrowRightIcon className="size-3.5" />
          </button>
        </div>
      )}
    </section>
  )
}
