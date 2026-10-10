"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { DrawingData } from "@/lib/docs/drawing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { ProjectSinglePicker } from "@/components/projects/project-picker"
import {
  useCreateQuickNote,
  useUpdateQuickNote,
} from "@/hooks/queries/quick-notes"
import type { QuickNoteDraft } from "@/components/quick-notes/quick-note-dialog"
import type { QuickNoteDto } from "@/lib/quick-notes/dto"
import {
  createDrawing,
  drawingSchema,
  drawingText,
  MAX_DRAWING_BYTES,
} from "@/lib/docs/drawing"
import { api } from "@/lib/api-client"

const DrawingEditor = dynamic(() => import("./drawing-editor"), {
  ssr: false,
  loading: () => <p className="p-6">Loading drawing…</p>,
})
type Version = { revision: number; title: string | null; createdAt: string }

export function DrawingDialog({
  draft,
  onClose,
}: {
  draft: QuickNoteDraft
  onClose: () => void
}) {
  const [initial, setInitial] = useState(
    () => (draft.bodyJson ?? createDrawing()) as DrawingData
  )
  const [editorKey, setEditorKey] = useState(0)
  const [title, setTitle] = useState(draft.title)
  const [projectId, setProjectId] = useState(draft.projectId)
  const [status, setStatus] = useState(draft.id ? "Saved" : "Not saved yet")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [changes, setChanges] = useState(0)
  const [history, setHistory] = useState<Version[] | null>(null)
  const [closing, setClosing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const getSnapshot = useRef<
    ((commitEditing?: boolean) => Promise<DrawingData>) | null
  >(null)
  const live = useRef({
    title: draft.title,
    projectId: draft.projectId,
    bodyJson: initial,
  })
  const lastSaved = useRef(
    draft.id
      ? JSON.stringify({
          title: draft.title,
          projectId: draft.projectId,
          bodyJson: initial,
        })
      : null
  )
  const normalizeBaseline = useRef(!!draft.id)
  const id = useRef(draft.id)
  const clientId = useRef(crypto.randomUUID())
  const revision = useRef(draft.revision ?? 0)
  const dirty = useRef(!draft.id)
  const saving = useRef(false)
  const failure = useRef(false)
  const serial = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const create = useCreateQuickNote()
  const update = useUpdateQuickNote()
  const qc = useQueryClient()

  function changed() {
    dirty.current = lastSaved.current !== JSON.stringify(live.current)
    serial.current++
    setStatus(dirty.current ? "Unsaved changes" : "Saved")
    setChanges((v) => v + 1)
  }
  function replaceDrawing(value: DrawingData, saved = false) {
    drawingSchema.parse(value)
    live.current.bodyJson = value
    normalizeBaseline.current = saved
    getSnapshot.current = null
    setReady(false)
    setInitial(value)
    setEditorKey((v) => v + 1)
    changed()
  }
  async function requestClose() {
    if (saving.current || !getSnapshot.current) return
    saving.current = true
    setBusy(true)
    try {
      live.current.bodyJson = await getSnapshot.current()
      dirty.current = lastSaved.current !== JSON.stringify(live.current)
      if (dirty.current) setClosing(true)
      else onClose()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not check pending edits."
      )
      setClosing(true)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  async function save(commitEditing = true) {
    if (saving.current || !getSnapshot.current) return false
    saving.current = true
    setBusy(true)
    setError("")
    setStatus("Saving…")
    try {
      const bodyJson = await getSnapshot.current(commitEditing)
      drawingSchema.parse(bodyJson)
      live.current.bodyJson = bodyJson
      const savedSerial = serial.current
      const contents = JSON.stringify(live.current)
      if (lastSaved.current === contents) {
        dirty.current = false
        failure.current = false
        setStatus("Saved")
        return true
      }
      const payload = {
        ...live.current,
        kind: "drawing" as const,
        bodyJson,
        bodyText: drawingText(bodyJson),
        expectedRevision: revision.current,
      }
      const doc = id.current
        ? await update.mutateAsync({ id: id.current, ...payload })
        : await create.mutateAsync({ ...payload, clientId: clientId.current })
      id.current = doc.id
      revision.current = doc.revision
      lastSaved.current = contents
      dirty.current = serial.current !== savedSerial
      failure.current = false
      setStatus(dirty.current ? "Unsaved changes" : "Saved")
      return !dirty.current
    } catch (e) {
      dirty.current = true
      failure.current = true
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Your edits are still open here."
      )
      setStatus("Save failed")
      return false
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  // Serialize saves; failed/conflicting writes require an explicit retry.
  useEffect(() => {
    if (!ready || busy || closing || !dirty.current || failure.current) return
    const timer = setTimeout(() => void save(false), 1800)
    return () => clearTimeout(timer)
    // save reads the live refs, never a stale drawing or revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes, ready, busy, closing])
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      // Warn only when edits are pending or a save is in flight.
      if (!dirty.current && !saving.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    function keyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener("beforeunload", beforeUnload)
    window.addEventListener("keydown", keyDown)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      window.removeEventListener("keydown", keyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function download() {
    try {
      const value = await getSnapshot.current?.()
      if (!value) return
      const blob = new Blob([JSON.stringify(value)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${live.current.title || "Drawing"}.excalidraw`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed")
    }
  }
  async function importFile(file: File) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    try {
      if (file.size > MAX_DRAWING_BYTES)
        throw new Error("Choose a drawing smaller than 3 MB.")
      const value = drawingSchema.parse(JSON.parse(await file.text()))
      replaceDrawing(value as DrawingData)
      setImportOpen(false)
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed")
    } finally {
      saving.current = false
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }
  async function showHistory() {
    if (!(await save()) || !id.current) return
    try {
      setHistory(
        (await api<{ items: Version[] }>(`/api/v1/docs/${id.current}/versions`))
          .items
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load versions")
    }
  }
  async function restore(version: Version) {
    if (!id.current || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      const doc = await api<QuickNoteDto>(
        `/api/v1/docs/${id.current}/versions`,
        {
          method: "POST",
          body: {
            revision: version.revision,
            expectedRevision: revision.current,
          },
        }
      )
      revision.current = doc.revision
      live.current.title = doc.title ?? ""
      setTitle(doc.title ?? "")
      replaceDrawing(doc.bodyJson as DrawingData, true)
      lastSaved.current = JSON.stringify(live.current)
      dirty.current = false
      setStatus("Saved")
      setHistory(null)
      await qc.invalidateQueries({ queryKey: ["quick-notes"] })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed")
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open modal={false}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 rounded-none p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">Drawing doc</DialogTitle>
          <DialogDescription className="sr-only">
            A freehand canvas with autosave, shapes, text, and Excalidraw import
            and export.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <Input
              aria-label="Document title"
              maxLength={200}
              placeholder="Untitled drawing"
              value={title}
              className="min-w-44 flex-1"
              onChange={(e) => {
                setTitle(e.target.value)
                live.current.title = e.target.value
                changed()
              }}
            />
            <span role="status" className="text-xs text-text-muted">
              {status}
            </span>
            <ProjectSinglePicker
              value={projectId}
              render={<Button size="sm" variant="outline" />}
              onChange={(value) => {
                setProjectId(value)
                live.current.projectId = value
                changed()
              }}
            >
              {projectId ? "Change project" : "No project"}
            </ProjectSinglePicker>
            <Button
              size="sm"
              disabled={busy || !ready}
              onClick={() => setImportOpen(true)}
            >
              Import
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!ready || busy}
              onClick={() => void download()}
            >
              Export drawing
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={!ready || busy}
              onClick={() => void showHistory()}
            >
              History
            </Button>
            <Button
              size="sm"
              loading={busy}
              disabled={!ready || busy}
              onClick={() => void save()}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !ready}
              onClick={() => void requestClose()}
            >
              Close
            </Button>
          </div>
          {error && !importOpen && !closing && history === null && (
            <p role="alert" className="px-4 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="min-h-0 flex-1 bg-[#18181b] text-[#f4f4f5]">
            <DrawingEditor
              key={editorKey}
              initial={initial}
              onReady={(getter, baseline) => {
                live.current.bodyJson = baseline
                if (normalizeBaseline.current && lastSaved.current) {
                  lastSaved.current = JSON.stringify({
                    ...JSON.parse(lastSaved.current),
                    bodyJson: baseline,
                  })
                }
                normalizeBaseline.current = false
                dirty.current =
                  lastSaved.current !== JSON.stringify(live.current)
                setStatus(dirty.current ? "Unsaved changes" : "Saved")
                getSnapshot.current = getter
                setReady(true)
              }}
              onChange={(value) => {
                if (
                  JSON.stringify(value) ===
                  JSON.stringify(live.current.bodyJson)
                )
                  return
                live.current.bodyJson = value
                changed()
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={closing} onOpenChange={setClosing}>
        <DialogContent>
          <DialogTitle>Close drawing?</DialogTitle>
          <DialogDescription>
            Save your latest edits before closing.
          </DialogDescription>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            disabled={busy}
            onClick={async () => {
              if (await save()) onClose()
            }}
          >
            Save & close
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setClosing(false)}
          >
            Keep editing
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onClose}>
            Close without saving pending edits
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={importOpen}
        onOpenChange={(open) => !busy && setImportOpen(open)}
      >
        <DialogContent>
          <DialogTitle>Import drawing</DialogTitle>
          <DialogDescription>
            Replace this canvas with an .excalidraw file or JSON drawing backup.
            Save first to keep the current drawing in History.
          </DialogDescription>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <input
            aria-label="Drawing file"
            ref={fileInput}
            type="file"
            accept=".excalidraw,.json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFile(file)
            }}
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setImportOpen(false)}
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={history !== null}
        onOpenChange={(open) => !open && setHistory(null)}
      >
        <DialogContent>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Restore a previous save as a new version. Your current version is
            kept.
          </DialogDescription>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="max-h-80 space-y-2 overflow-auto">
            {history?.length ? (
              history.map((v) => (
                <Button
                  key={v.revision}
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void restore(v)}
                >
                  Restore v{v.revision} ·{" "}
                  {new Date(v.createdAt).toLocaleString()}
                </Button>
              ))
            ) : (
              <p>No earlier versions yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
