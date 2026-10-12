"use client"

import { useState } from "react"
import { QueryFeedback } from "@/components/query-feedback"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useOverviewSection } from "@/hooks/queries/overview"
import { DocRow } from "./recent-docs-section"
import type { OverviewSectionProps } from "./section-context"
import { countLabel, PageLink, pathFor, SectionHeader } from "./section-ui"

export function DocsByProjectSection({ data, actions }: OverviewSectionProps) {
  const [projectId, setProjectId] = useState("all")
  // A deleted project should not leave the picker stuck on an unavailable filter.
  const selected =
    projectId === "unassigned" || data.projectPaths[projectId]
      ? projectId
      : "all"
  const query = useOverviewSection(
    "docs-by-project",
    selected === "all" ? undefined : selected
  )
  const choices = {
    all: "Recently edited projects",
    unassigned: "No project",
    ...data.projectPaths,
  }
  return (
    <section aria-label="Docs by project">
      <SectionHeader title="Docs by project">
        <PageLink href="/docs">All docs</PageLink>
      </SectionHeader>
      <Select
        value={selected}
        onValueChange={(value) => setProjectId(value ?? "all")}
        items={choices}
      >
        <SelectTrigger
          aria-label="Docs project"
          className="min-h-11 w-full min-w-0"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Recently edited projects</SelectItem>
          <SelectItem value="unassigned">No project</SelectItem>
          {Object.entries(data.projectPaths)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <p className="mt-2 text-xs text-subtle">
        {selected === "all"
          ? "Latest four groups · Up to three docs per group"
          : selected === "unassigned"
            ? "Docs without a project"
            : "Docs filed directly in this project"}
      </p>
      <QueryFeedback query={query} label="docs by project" />
      {query.data &&
        (query.data.groups.length ? (
          query.data.groups.map((group) => (
            <div key={group.projectId ?? "unassigned"} className="mt-4">
              <h3 className="text-sm font-medium break-words">
                {pathFor(data, group.projectId)}{" "}
                <span className="text-xs font-normal text-subtle">
                  · {countLabel(group.total, "doc")}
                </span>
              </h3>
              {group.docs.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  data={data}
                  openDoc={actions.openDoc}
                />
              ))}
              {group.total > group.docs.length && (
                <PageLink
                  href={
                    group.projectId
                      ? `/projects/${group.projectId}?tab=notes`
                      : "/docs"
                  }
                >
                  View all docs
                </PageLink>
              )}
            </div>
          ))
        ) : (
          <div className="py-4">
            <p className="text-sm text-text-muted">
              No docs in this selection yet.
            </p>
            <Button
              variant="ghost"
              className="mt-2 min-h-11"
              onClick={() =>
                actions.openAddQuickNote(
                  selected === "all" || selected === "unassigned"
                    ? undefined
                    : selected
                )
              }
            >
              New doc
            </Button>
          </div>
        ))}
    </section>
  )
}
