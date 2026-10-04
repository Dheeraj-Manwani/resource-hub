"use client"

import { FolderIcon, XIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"

import {
  ProjectSinglePicker,
  useProjectOptions,
} from "@/components/projects/project-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
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

export type SaveOpts = {
  /** False for the Save button and "Save & Exit": the dialog closes once
   * the save succeeds. True for Ctrl/Cmd+S: the note saves in place and
   * editing continues. */
  keepOpen: boolean
  /** The caller reports the id the backend assigned (or kept) for this
   * save, so a later save in the same session updates that note instead
   * of creating another one. */
  onSaved: (id: string) => void
}

function isDirty(baseline: LiveDraft, live: LiveDraft) {
  if (live.projectId !== baseline.projectId) return true
  if (live.title !== baseline.title) return true
  if ((live.bodyText ?? "") !== (baseline.bodyText ?? "")) return true
  return (
    JSON.stringify(live.bodyJson ?? null) !==
    JSON.stringify(baseline.bodyJson ?? null)
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
      <DialogHeader className="flex-row shrink-0 items-center gap-2 border-b border-border py-4 pr-4 pl-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0">
          <DialogTitle className="sr-only">
            {draft.id ? "Edit quick note" : "New quick note"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            An optional title and a rich-text body you can paste images and
            links into.
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
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              disabled={saving}
            />
          }
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
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

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-6 py-3">
        <ProjectSinglePicker
          value={projectId}
          onChange={(id) => {
            setProjectId(id)
            onLiveChange({ projectId: id })
          }}
          render={
            <button
              type="button"
              className="flex h-8 w-fit items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-text-muted hover:border-border-strong hover:bg-white/6 hover:text-text"
            />
          }
        >
          {project ? (
            <>
              <FolderIcon
                className="size-3.5"
                style={{ color: project.color ?? undefined }}
              />
              {project.name}
            </>
          ) : (
            <>
              <FolderIcon className="size-3.5" />
              No project
            </>
          )}
        </ProjectSinglePicker>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSaveClick} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
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
  onSave: (next: QuickNoteDraft, opts: SaveOpts) => void
  saving: boolean
}) {
  const live = useRef<LiveDraft>({
    projectId: null,
    title: "",
    bodyJson: null,
    bodyText: null,
  })
  // Tracks which note a save actually lands on. Starts at the opened
  // draft's id (or null for a brand-new note) and picks up the id the
  // backend assigns once a keep-open save (Ctrl/Cmd+S) creates that note,
  // so a later save in the same session updates it instead of creating a
  // second one.
  const savedId = useRef<string | null>(draft?.id ?? null)
  // What the dirty check compares against — the last-persisted content.
  // Re-seeded from `draft` on open, and advanced to the just-saved snapshot
  // after every successful save (including a keep-open Ctrl/Cmd+S), so
  // saving never leaves the dialog looking dirty.
  const baseline = useRef<LiveDraft>({
    projectId: null,
    title: "",
    bodyJson: null,
    bodyText: null,
  })
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Re-seed the "current" snapshot every time a (possibly different) note
  // is opened, so the dirty check always compares against the right note.
  useEffect(() => {
    savedId.current = draft?.id ?? null
    live.current = draft
      ? {
          projectId: draft.projectId,
          title: draft.title,
          bodyJson: draft.bodyJson,
          bodyText: draft.bodyText,
        }
      : { projectId: null, title: "", bodyJson: null, bodyText: null }
    baseline.current = live.current
  }, [draft])

  // Closing/reloading the tab mid-edit would otherwise silently drop
  // whatever hasn't been saved yet.
  useEffect(() => {
    if (!draft) return
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!draft || !isDirty(baseline.current, live.current)) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [draft])

  // Ctrl/Cmd+S saves instead of triggering the browser's "Save page" dialog.
  useEffect(() => {
    if (!draft) return
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return
      e.preventDefault()
      if (saving) return
      triggerSave(true)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [draft, saving])

  function updateLive(patch: Partial<LiveDraft>) {
    live.current = { ...live.current, ...patch }
  }

  function requestClose() {
    if (saving) return
    if (draft && isDirty(baseline.current, live.current)) {
      setConfirmOpen(true)
      return
    }
    onOpenChange(false)
  }

  function triggerSave(keepOpen = false) {
    if (!draft) return
    setConfirmOpen(false)
    const snapshot: LiveDraft = { ...live.current }
    onSave(
      { id: savedId.current, ...snapshot },
      {
        keepOpen,
        onSaved: (id) => {
          savedId.current = id
          baseline.current = snapshot
        },
      }
    )
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
          showCloseButton={false}
          className="flex h-[90vh] max-h-250 w-[95vw] max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl"
        >
          {draft ? (
            <DialogBody
              key={draft.id ?? "new"}
              draft={draft}
              onLiveChange={updateLive}
              onCancel={requestClose}
              onSaveClick={() => triggerSave(false)}
              saving={saving}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <UnsavedChangesDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onSaveAndExit={() => triggerSave(false)}
        onDiscard={() => {
          setConfirmOpen(false)
          onOpenChange(false)
        }}
        saving={saving}
      />
    </>
  )
}
