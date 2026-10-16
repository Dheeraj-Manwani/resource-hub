"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { QueryFeedback } from "@/components/query-feedback"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  QuickNoteDialog,
  type QuickNoteDraft,
} from "@/components/quick-notes/quick-note-dialog"
import {
  quickNoteCache,
  useUpdateQuickNote,
  useCreateQuickNote,
} from "@/hooks/queries/quick-notes"
import { api } from "@/lib/api-client"
import type { QuickNoteDto } from "@/lib/quick-notes/dto"

function LoadedDoc({
  doc,
  onClose,
}: {
  doc: QuickNoteDto
  onClose: () => void
}) {
  const update = useUpdateQuickNote()
  const create = useCreateQuickNote()
  const [draft] = useState<QuickNoteDraft>(() => ({
    id: doc.id,
    kind: doc.kind,
    revision: doc.revision,
    projectId: doc.projectId,
    project: doc.project,
    title: doc.title ?? "",
    bodyJson: doc.bodyJson,
    bodyText: doc.bodyText,
  }))
  return (
    <QuickNoteDialog
      draft={draft}
      saving={update.isPending || create.isPending}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      onSave={(next, opts) => {
        const payload = {
          clientId: next.clientId,
          kind: next.kind,
          projectId: next.projectId,
          expectedRevision: next.revision,
          title: next.title || null,
          bodyJson: next.bodyJson,
          bodyText: next.bodyText,
        }
        const callbacks = {
          onError: opts.onError,
          onSuccess: (saved: QuickNoteDto) => {
            const current = opts.onSaved(saved.id, saved.revision)
            if (current && !opts.keepOpen) onClose()
          },
        }
        if (next.id) update.mutate({ id: next.id, ...payload }, callbacks)
        else create.mutate(payload, callbacks)
      }}
    />
  )
}

export default function OverviewDocDialog({
  id,
  onClose,
}: {
  id: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ["quick-notes", "detail", id],
    queryFn: async ({ signal }) => {
      const doc = await api<QuickNoteDto>(`/api/v1/docs/${id}`, { signal })
      return { items: quickNoteCache.received(qc, [doc]) }
    },
    select: (data) =>
      quickNoteCache.project(qc, data.items, ["quick-notes", "detail", id])[0],
    staleTime: 0,
  })
  if (query.data) return <LoadedDoc doc={query.data} onClose={onClose} />
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open doc</DialogTitle>
        </DialogHeader>
        {query.isPending ? (
          <Skeleton className="h-36 w-full" />
        ) : (
          <QueryFeedback query={query} label="doc" />
        )}
      </DialogContent>
    </Dialog>
  )
}
