"use client"

import { FolderIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"

import {
  ProjectSinglePicker,
  useProjectOptions,
} from "@/components/projects/project-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchQuickNoteLinkPreview,
  uploadQuickNoteImage,
} from "@/hooks/queries/quick-notes"
import type { QuickNoteProjectDto } from "@/lib/quick-notes/dto"

const NoteEditor = dynamic(
  () => import("@/components/resources/full-view/note-editor"),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

export type QuickNoteDraft = {
  id: string | null
  projectId: string | null
  project?: QuickNoteProjectDto | null
  title: string
  bodyJson: unknown
  bodyText: string | null
}

type LiveDraft = {
  projectId: string | null
  title: string
  bodyJson: unknown
  bodyText: string | null
}

function isDirty(draft: QuickNoteDraft, live: LiveDraft) {
  if (live.projectId !== draft.projectId) return true
  if (live.title !== draft.title) return true
  if ((live.bodyText ?? "") !== (draft.bodyText ?? "")) return true
  return (
    JSON.stringify(live.bodyJson ?? null) !==
    JSON.stringify(draft.bodyJson ?? null)
  )
}

function UnsavedChangesDialog({
  open,
  onOpenChange,
  onSaveAndExit,
  onDiscard,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveAndExit: () => void
  onDiscard: () => void
  saving: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            This note has changes that haven&apos;t been saved yet. Save them
            before closing, or discard them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Keep editing
          </Button>
          <Button variant="destructive" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
          <Button onClick={onSaveAndExit} disabled={saving}>
            {saving ? "Saving…" : "Save & Exit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogBody({
  draft,
  onLiveChange,
  onCancel,
  onSaveClick,
  saving,
}: {
  draft: QuickNoteDraft
  onLiveChange: (patch: Partial<LiveDraft>) => void
  onCancel: () => void
  onSaveClick: () => void
  saving: boolean
}) {
  const [title, setTitle] = useState(draft.title)
  const [projectId, setProjectId] = useState(draft.projectId)
  const { options: projectOptions } = useProjectOptions()
  const project = projectId
    ? (projectOptions.find((p) => p.id === projectId) ?? draft.project ?? null)
    : null

  return (
    <>
      <DialogHeader className="shrink-0 gap-0 border-b border-border py-4 pr-14 pl-6">
        <DialogTitle className="sr-only">
          {draft.id ? "Edit quick note" : "New quick note"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          An optional title and a rich-text body you can paste images and links
          into.
        </DialogDescription>
        <Input
          autoFocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            onLiveChange({ title: e.target.value })
          }}
          placeholder="Untitled"
          className="h-auto border-none bg-transparent px-3.5 py-2 text-2xl font-semibold shadow-none focus-visible:ring-0"
        />
        <ProjectSinglePicker
          value={projectId}
          onChange={(id) => {
            setProjectId(id)
            onLiveChange({ projectId: id })
          }}
          render={
            <button
              type="button"
              className="mx-3.5 flex h-6 w-fit items-center gap-1.5 rounded-md px-1.5 text-xs text-subtle hover:bg-white/[0.06] hover:text-text-muted"
            />
          }
        >
          {project ? (
            <>
              <FolderIcon
                className="size-3"
                style={{ color: project.color ?? undefined }}
              />
              {project.name}
            </>
          ) : (
            <>
              <FolderIcon className="size-3" />
              No project
            </>
          )}
        </ProjectSinglePicker>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <NoteEditor
          content={(draft.bodyJson as Record<string, unknown>) ?? null}
          debounceMs={0}
          bare
          onSave={(json, text) =>
            onLiveChange({ bodyJson: json, bodyText: text })
          }
          onUploadImage={uploadQuickNoteImage}
          onLinkPreview={fetchQuickNoteLinkPreview}
        />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-3">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSaveClick} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  )
}

/** Huge centered modal for creating/editing a single quick note: an
 * optional title plus a Tiptap body. Nothing is persisted until Save.
 * Closing it any other way (Cancel, Esc, backdrop click, the × button, or
 * even closing the browser tab) is guarded: with unsaved changes, it asks
 * whether to save or discard them instead of silently losing them. */
export function QuickNoteDialog({
  draft,
  onOpenChange,
  onSave,
  saving,
}: {
  draft: QuickNoteDraft | null
  onOpenChange: (open: boolean) => void
  onSave: (next: QuickNoteDraft) => void
  saving: boolean
}) {
  const live = useRef<LiveDraft>({
    projectId: null,
    title: "",
    bodyJson: null,
    bodyText: null,
  })
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Re-seed the "current" snapshot every time a (possibly different) note
  // is opened, so the dirty check always compares against the right note.
  useEffect(() => {
    live.current = draft
      ? {
          projectId: draft.projectId,
          title: draft.title,
          bodyJson: draft.bodyJson,
          bodyText: draft.bodyText,
        }
      : { projectId: null, title: "", bodyJson: null, bodyText: null }
  }, [draft])

  // Closing/reloading the tab mid-edit would otherwise silently drop
  // whatever hasn't been saved yet.
  useEffect(() => {
    if (!draft) return
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!draft || !isDirty(draft, live.current)) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [draft])

  function updateLive(patch: Partial<LiveDraft>) {
    live.current = { ...live.current, ...patch }
  }

  function requestClose() {
    if (saving) return
    if (draft && isDirty(draft, live.current)) {
      setConfirmOpen(true)
      return
    }
    onOpenChange(false)
  }

  function triggerSave() {
    if (!draft) return
    setConfirmOpen(false)
    onSave({
      id: draft.id,
      projectId: live.current.projectId,
      title: live.current.title,
      bodyJson: live.current.bodyJson,
      bodyText: live.current.bodyText,
    })
  }

  return (
    <>
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) requestClose()
        }}
      >
        <DialogContent
          showCloseButton={!saving}
          className="flex h-[90vh] max-h-250 w-[95vw] max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl"
        >
          {draft ? (
            <DialogBody
              key={draft.id ?? "new"}
              draft={draft}
              onLiveChange={updateLive}
              onCancel={requestClose}
              onSaveClick={triggerSave}
              saving={saving}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <UnsavedChangesDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onSaveAndExit={triggerSave}
        onDiscard={() => {
          setConfirmOpen(false)
          onOpenChange(false)
        }}
        saving={saving}
      />
    </>
  )
}
