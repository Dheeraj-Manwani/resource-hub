"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { IWorkbookData } from "@univerjs/presets"
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
  createWorkbook,
  workbookSchema,
  workbookText,
} from "@/lib/docs/workbook"
import { api } from "@/lib/api-client"

const SheetEditor = dynamic(() => import("./sheet-editor"), {
  ssr: false,
  loading: () => <p className="p-6">Loading spreadsheet…</p>,
})
type Version = { revision: number; title: string | null; createdAt: string }

export function SpreadsheetDialog({
  draft,
  onClose,
}: {
  draft: QuickNoteDraft
  onClose: () => void
}) {
  const [initial, setInitial] = useState(
    () => (draft.bodyJson ?? createWorkbook()) as Partial<IWorkbookData>
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
  const getSnapshot = useRef<(() => Promise<IWorkbookData>) | null>(null)
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
    dirty.current = true
    serial.current++
    setStatus("Unsaved changes")
    setChanges((v) => v + 1)
  }
  function replaceWorkbook(value: Partial<IWorkbookData>) {
    workbookSchema.parse(value)
    live.current.bodyJson = value
    getSnapshot.current = null
    setReady(false)
    setInitial(value)
    setEditorKey((v) => v + 1)
    changed()
  }
  async function save() {
    if (saving.current || !getSnapshot.current) return false
    saving.current = true
    setBusy(true)
    setError("")
    setStatus("Saving…")
    try {
      const bodyJson = await getSnapshot.current()
      workbookSchema.parse(bodyJson)
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
        kind: "spreadsheet" as const,
        bodyJson,
        bodyText: workbookText(bodyJson),
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
    if (!ready || busy || !dirty.current || failure.current) return
    const timer = setTimeout(() => void save(), 1800)
    return () => clearTimeout(timer)
    // save reads the live refs, never a stale workbook or revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes, ready, busy])
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      // An active cell may not yet have committed into the workbook snapshot.
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

  async function download(backup: boolean) {
    try {
      const value = await getSnapshot.current?.()
      if (!value) return
      const { downloadFile, exportExcel } = await import("@/lib/docs/excel")
      if (backup)
        downloadFile(
          JSON.stringify(value),
          `${live.current.title || "Spreadsheet"}.json`,
          "application/json"
        )
      else
        downloadFile(
          await exportExcel(value),
          `${live.current.title || "Spreadsheet"}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed")
    }
  }
  async function importFile(file: File) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    try {
      if (file.size > 10_000_000)
        throw new Error("Choose a file smaller than 10 MB.")
      const value = file.name.toLowerCase().endsWith(".json")
        ? workbookSchema.parse(JSON.parse(await file.text()))
        : await (
            await import("@/lib/docs/excel")
          ).importExcel(await file.arrayBuffer())
      replaceWorkbook(value as Partial<IWorkbookData>)
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
      replaceWorkbook(doc.bodyJson as Partial<IWorkbookData>)
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
          <DialogTitle className="sr-only">Spreadsheet doc</DialogTitle>
          <DialogDescription className="sr-only">
            An editable workbook with autosave, Excel import and export.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <Input
              aria-label="Document title"
              maxLength={200}
              placeholder="Untitled spreadsheet"
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
              onClick={() => void download(false)}
            >
              Export Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!ready || busy}
              onClick={() => void download(true)}
            >
              Backup
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
              onClick={() => setClosing(true)}
            >
              Close
            </Button>
          </div>
          {error && (
            <p role="alert" className="px-4 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="px-4 py-1 text-xs text-text-muted">
            Excel export includes cells, formulas and basic formatting. Charts,
            images, macros and advanced Excel features are not preserved. Backup
            keeps the full in-app workbook.
          </p>
          <div className="min-h-0 flex-1 bg-[#18181b] text-[#f4f4f5]">
            <SheetEditor
              key={editorKey}
              initial={initial}
              onReady={(getter) => {
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
          <DialogTitle>Close spreadsheet?</DialogTitle>
          <DialogDescription>
            Save your latest edits before closing.
          </DialogDescription>
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
          <DialogTitle>Import spreadsheet</DialogTitle>
          <DialogDescription>
            Replace the current sheet with an .xlsx file or a Resource Hub JSON
            backup. Excel import keeps cell values, formulas and basic
            formatting; keep your original file for advanced features. Save
            first if you want the current sheet in History.
          </DialogDescription>
          <input
            aria-label="Spreadsheet file"
            ref={fileInput}
            type="file"
            accept=".xlsx,.json"
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
