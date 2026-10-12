"use client"

import { useSyncController } from "@/components/sync-provider"

import { FolderIcon, PencilIcon, XIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { toast } from "react-hot-toast"
import { hasTemporaryImages } from "@/lib/docs/text-document"
import { cn } from "@/lib/utils"

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
import { createWorkbook } from "@/lib/docs/workbook"
import { SpreadsheetDialog } from "@/components/docs/spreadsheet-dialog"
import { DrawingDialog } from "@/components/docs/drawing-dialog"
import { createDrawing } from "@/lib/docs/drawing"
import { NewDocPicker } from "@/components/docs/new-doc-picker"

const NoteEditor = dynamic(
  () => import("@/components/resources/full-view/note-editor"),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

export type QuickNoteDraft = {
  kind?: "text" | "spreadsheet" | "drawing"
  revision?: number
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
  onSaved: (id: string, revision?: number) => boolean
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
  uploading = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveAndExit: () => void
  onDiscard: () => void
  saving: boolean
  uploading?: boolean
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
          <Button
            loading={saving}
            onClick={onSaveAndExit}
            disabled={saving || uploading}
          >
            Save & Exit
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
  fullscreen,
  onFullscreen,
  onUploadStateChange,
}: {
  draft: QuickNoteDraft
  onLiveChange: (patch: Partial<LiveDraft>) => void
  onCancel: () => void
  onSaveClick: () => void
  saving: boolean
  fullscreen: boolean
  onFullscreen: () => void
  onUploadStateChange: (pending: number) => void
}) {
  const sync = useSyncController()
  const [title, setTitle] = useState(draft.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const titleBeforeEdit = useRef(draft.title)
  const [projectId, setProjectId] = useState(draft.projectId)
  const [pendingUploads, setPendingUploads] = useState(0)
  const { options: projectOptions } = useProjectOptions()
  const project = projectId
    ? (projectOptions.find((p) => p.id === projectId) ?? draft.project ?? null)
    : null

  return (
    <>
      <DialogTitle className="sr-only">
        {draft.id ? "Edit text doc" : "New doc"}
      </DialogTitle>
      <DialogDescription className="sr-only">
        An optional title and a rich-text body you can paste images and links
        into.
      </DialogDescription>
      <DialogHeader
        className={cn(
          "shrink-0 flex-row items-center gap-2 border-b border-border px-4 py-1.5",
          fullscreen && "hidden"
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {editingTitle ? (
            <Input
              autoFocus
              aria-label="Document title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                onLiveChange({ title: e.target.value })
              }}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== "Escape") return
                e.preventDefault()
                e.stopPropagation()
                if (e.key === "Escape") {
                  setTitle(titleBeforeEdit.current)
                  onLiveChange({ title: titleBeforeEdit.current })
                }
                e.currentTarget.blur()
              }}
              placeholder="Untitled"
              disabled={saving}
              className="h-7 max-w-80 px-2 text-sm font-medium"
            />
          ) : (
            <>
              <span
                className="max-w-80 truncate text-sm font-medium"
                title={title || "Untitled"}
              >
                {title || "Untitled"}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Edit title"
                disabled={saving}
                onClick={() => {
                  titleBeforeEdit.current = title
                  setEditingTitle(true)
                }}
              >
                <PencilIcon />
              </Button>
            </>
          )}
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

      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col",
          !fullscreen && "px-4 py-3"
        )}
      >
        <NoteEditor
          content={(draft.bodyJson as Record<string, unknown>) ?? null}
          debounceMs={0}
          bare
          workspace
          documentTitle={title}
          fullscreen={fullscreen}
          onFullscreen={onFullscreen}
          onUploadStateChange={(pending) => {
            setPendingUploads(pending)
            onUploadStateChange(pending)
          }}
          onSave={(json, text) =>
            onLiveChange({ bodyJson: json, bodyText: text })
          }
          onUploadImage={(file) => uploadQuickNoteImage(file, sync)}
          onLinkPreview={fetchQuickNoteLinkPreview}
        />
        {fullscreen && (
          <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
            <Button
              loading={saving}
              onClick={onSaveClick}
              disabled={saving || pendingUploads > 0}
              className="shadow-lg"
            >
              Save
            </Button>
            <Button
              variant="destructive"
              size="icon"
              aria-label="Exit full screen"
              title="Exit full screen"
              onClick={onFullscreen}
              className="border border-destructive/30 bg-popover text-destructive shadow-lg hover:bg-destructive/20"
            >
              <XIcon />
            </Button>
          </div>
        )}
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3",
          fullscreen && "hidden"
        )}
      >
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
          <Button
            loading={saving}
            onClick={onSaveClick}
            disabled={saving || pendingUploads > 0}
          >
            Save
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
function TextNoteDialog({
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
  const savedRevision = useRef<number | undefined>(draft?.revision)
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
  const [fullscreen, setFullscreen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const pendingUploads = useRef(0)

  // Re-seed the "current" snapshot every time a (possibly different) note
  // is opened, so the dirty check always compares against the right note.
  useEffect(() => {
    savedId.current = draft?.id ?? null
    savedRevision.current = draft?.revision
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
      if (
        !draft ||
        (!pendingUploads.current && !isDirty(baseline.current, live.current))
      )
        return
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
    if (
      draft &&
      (pendingUploads.current > 0 || isDirty(baseline.current, live.current))
    ) {
      setConfirmOpen(true)
      return
    }
    onOpenChange(false)
  }

  function triggerSave(keepOpen = false) {
    if (!draft || saving) return
    if (
      pendingUploads.current > 0 ||
      hasTemporaryImages(live.current.bodyJson)
    ) {
      toast.error("Wait for image uploads to finish before saving.")
      return
    }
    const snapshot: LiveDraft = { ...live.current }
    onSave(
      {
        id: savedId.current,
        kind: "text",
        revision: savedRevision.current,
        ...snapshot,
      },
      {
        keepOpen,
        onSaved: (id, revision) => {
          setConfirmOpen(false)
          savedId.current = id
          savedRevision.current = revision
          baseline.current = snapshot
          return !isDirty(snapshot, live.current)
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
          className={cn(
            "flex flex-col gap-0 p-0",
            fullscreen
              ? "top-0 left-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none sm:max-w-none data-open:animate-none"
              : "h-[90vh] max-h-250 w-[95vw] max-w-5xl sm:max-w-5xl"
          )}
        >
          {draft ? (
            <DialogBody
              key={draft.id ?? "new"}
              draft={draft}
              onLiveChange={updateLive}
              onCancel={requestClose}
              onSaveClick={() => triggerSave(false)}
              saving={saving}
              fullscreen={fullscreen}
              onFullscreen={() => setFullscreen((value) => !value)}
              onUploadStateChange={(pending) => {
                pendingUploads.current = pending
                setUploading(pending > 0)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <UnsavedChangesDialog
        open={confirmOpen}
        onOpenChange={(open) => !saving && setConfirmOpen(open)}
        onSaveAndExit={() => triggerSave(false)}
        onDiscard={() => {
          setConfirmOpen(false)
          onOpenChange(false)
        }}
        saving={saving}
        uploading={uploading}
      />
    </>
  )
}

type DocDialogProps = {
  draft: QuickNoteDraft | null
  onOpenChange: (open: boolean) => void
  onSave: (next: QuickNoteDraft, opts: SaveOpts) => void
  saving: boolean
}

/** Keep the existing text editor; choose a type only when creating a doc. */
export function QuickNoteDialog(props: DocDialogProps) {
  if (!props.draft) return null
  return (
    <DocSession key={props.draft.id ?? "new"} {...props} draft={props.draft} />
  )
}

function DocSession(props: DocDialogProps & { draft: QuickNoteDraft }) {
  const [selected, setSelected] = useState<QuickNoteDraft | null>(() =>
    props.draft.kind || props.draft.id ? props.draft : null
  )
  if (!selected)
    return (
      <NewDocPicker
        onOpenChange={props.onOpenChange}
        onChoose={(choice) => {
          if (choice === "text") {
            setSelected({ ...props.draft, kind: "text" })
          } else if (choice === "drawing") {
            setSelected({
              ...props.draft,
              kind: "drawing",
              bodyJson: createDrawing(),
            })
          } else {
            setSelected({
              ...props.draft,
              kind: "spreadsheet",
              title:
                choice === "job-tracker" ? "Job tracker" : props.draft.title,
              bodyJson: createWorkbook(choice === "job-tracker"),
            })
          }
        }}
      />
    )
  if (selected.kind === "spreadsheet")
    return (
      <SpreadsheetDialog
        draft={selected}
        onClose={() => props.onOpenChange(false)}
      />
    )
  if (selected.kind === "drawing")
    return (
      <DrawingDialog
        draft={selected}
        onClose={() => props.onOpenChange(false)}
      />
    )
  return <TextNoteDialog {...props} draft={selected} />
}
