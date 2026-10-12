"use client"

import { overviewSectionLimit } from "@/lib/overview/sections"

import {
  FileTextIcon,
  NotebookPenIcon,
  PencilLineIcon,
  SheetIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatRelative } from "@/lib/format"
import type { DocSummary, OverviewSummary } from "@/lib/overview/model"
import type { OverviewSectionProps } from "./section-context"
import { pathFor, SectionHeader, PageLink } from "./section-ui"

export function DocRow({
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

export function RecentDocsSection({
  data,
  actions,
  options,
}: OverviewSectionProps) {
  const limit = overviewSectionLimit("recent-docs", options)
  const { docs } = data
  const { openDoc, openAddQuickNote } = actions
  return (
    <section aria-label="Recently edited docs">
      <SectionHeader title="Continue editing">
        <PageLink href="/docs">Docs</PageLink>
      </SectionHeader>
      {docs.recent.length ? (
        docs.recent
          .slice(0, limit)
          .map((doc) => (
            <DocRow key={doc.id} doc={doc} data={data} openDoc={openDoc} />
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
  )
}
