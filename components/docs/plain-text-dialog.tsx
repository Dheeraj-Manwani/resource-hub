"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  FolderIcon,
  MaximizeIcon,
  MinimizeIcon,
  PencilIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ProjectSinglePicker,
  useProjectOptions,
} from "@/components/projects/project-picker"
import { useSession } from "@/lib/auth-client"
import {
  plainTextFormat,
  plainTextBodySchema,
  plainTextRecoverySchema,
  type PlainTextRecovery,
} from "@/lib/docs/plain-text"
import { cn } from "@/lib/utils"
import type {
  QuickNoteDraft,
  SaveOpts,
} from "@/components/quick-notes/quick-note-dialog"
import { DocumentThemeToggle, useDocumentTheme } from "./document-theme-toggle"

const PlainTextEditor = dynamic(() => import("./plain-text-editor"), {
  ssr: false,
  loading: () => <Skeleton className="min-h-40 flex-1" />,
})
type Content = Pick<PlainTextRecovery, "title" | "text" | "projectId">
const same = (a: Content, b: Content) =>
  a.title === b.title && a.text === b.text && a.projectId === b.projectId

type Props = {
  draft: QuickNoteDraft
  onOpenChange: (open: boolean) => void
  onSave: (next: QuickNoteDraft, opts: SaveOpts) => void
  saving: boolean
}

export function PlainTextDialog(props: Props) {
  const { data: session, error } = useSession()
  if (!session)
    return (
      <Dialog open onOpenChange={props.onOpenChange}>
        <DialogContent>
          <DialogTitle>Open text doc</DialogTitle>
          <DialogDescription>
            {error
              ? "Couldn't load your session. Close this dialog and try again."
              : "Loading your text workspace…"}
          </DialogDescription>
          {!error && <Skeleton className="h-40" />}
        </DialogContent>
      </Dialog>
    )
  return (
    <PlainTextSession
      key={session.session.id}
      {...props}
      sessionId={session.session.id}
    />
  )
}

function readRecovery(key: string, draft: QuickNoteDraft) {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(key)
  } catch {
    return { draft: null, error: true }
  }
  try {
    const parsed = plainTextRecoverySchema.safeParse(
      raw ? JSON.parse(raw) : null
    )
    if (
      parsed.success &&
      (!draft.id || parsed.data.id === draft.id) &&
      !same(parsed.data, {
        title: draft.title,
        projectId: draft.projectId,
        text: draft.bodyText ?? "",
      })
    )
      return { draft: parsed.data, error: false }
  } catch {
    /* Ignore malformed browser drafts; never replace saved content with them. */
  }
  return { draft: null, error: false }
}

function PlainTextSession({
  draft,
  onOpenChange,
  onSave,
  saving,
  sessionId,
}: Props & { sessionId: string }) {
  const { theme, changeTheme } = useDocumentTheme("text")
  const { options: projects } = useProjectOptions()
  const [live, setLive] = useState<Content>(() => ({
    title: draft.title,
    projectId: draft.projectId,
    text: draft.bodyText ?? "",
  }))
  const latest = useRef(live)
  const [savedContent, setSavedContent] = useState<Content>(() =>
    draft.id ? live : { title: "", text: "", projectId: draft.projectId }
  )
  const baseline = useRef(savedContent)
  const identity = useRef({
    id: draft.id,
    revision: draft.revision ?? 0,
    clientId: draft.clientId ?? crypto.randomUUID(),
  })
  const [savedOnce, setSavedOnce] = useState(!!draft.id)
  const [fullscreen, setFullscreen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const key = `resource-hub:plain-text-draft:${sessionId}:${draft.id ?? `new:${draft.projectId ?? "personal"}`}`
  const recoveryKey = useRef(key)
  const [initialRecovery] = useState(() => readRecovery(key, draft))
  const [recovery, setRecovery] = useState<PlainTextRecovery | null>(
    initialRecovery.draft
  )
  const [storageError, setStorageError] = useState(initialRecovery.error)
  const [saveError, setSaveError] = useState("")
  const [recoveredOldRevision, setRecoveredOldRevision] = useState(false)
  const writing = useRef(false)
  const dirty = !same(live, savedContent)

  useEffect(() => {
    if (!saving) writing.current = false
  }, [saving])

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        for (const storedKey of Object.keys(sessionStorage))
          if (
            storedKey.startsWith("resource-hub:plain-text-draft:") &&
            !storedKey.startsWith(`resource-hub:plain-text-draft:${sessionId}:`)
          )
            sessionStorage.removeItem(storedKey)
      } catch {
        setStorageError(true)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [sessionId])

  const removeRecovery = useCallback(() => {
    try {
      sessionStorage.removeItem(recoveryKey.current)
    } catch {
      setStorageError(true)
    }
  }, [])

  const persistRecovery = useCallback(() => {
    if (recovery || same(latest.current, baseline.current)) return
    try {
      sessionStorage.setItem(
        recoveryKey.current,
        JSON.stringify({ version: 1, ...identity.current, ...latest.current })
      )
    } catch {
      setStorageError(true)
    }
  }, [recovery])

  useEffect(() => {
    if (recovery) return
    const timer = setTimeout(
      () => (dirty ? persistRecovery() : removeRecovery()),
      200
    )
    return () => clearTimeout(timer)
  }, [live, dirty, recovery, persistRecovery, removeRecovery])

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (same(latest.current, baseline.current)) return
      persistRecovery()
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", beforeUnload)
    window.addEventListener("pagehide", persistRecovery)
    return () => {
      persistRecovery()
      window.removeEventListener("beforeunload", beforeUnload)
      window.removeEventListener("pagehide", persistRecovery)
    }
  }, [persistRecovery])

  function update(patch: Partial<Content>) {
    latest.current = { ...latest.current, ...patch }
    setLive(latest.current)
  }
  function save(keepOpen: boolean) {
    if (saving || writing.current || recovery) return
    const validation = plainTextBodySchema.safeParse(latest.current.text)
    if (!validation.success) {
      setSaveError(validation.error.issues[0].message)
      return
    }
    writing.current = true
    const snapshot = { ...latest.current }
    setSaveError("")
    persistRecovery()
    onSave(
      {
        id: identity.current.id,
        clientId: identity.current.clientId,
        revision: identity.current.revision,
        kind: "text",
        title: snapshot.title,
        projectId: snapshot.projectId,
        bodyJson: plainTextFormat(),
        bodyText: snapshot.text,
      },
      {
        keepOpen,
        onError(error) {
          writing.current = false
          setSaveError(error.message)
        },
        onSaved(id, revision) {
          removeRecovery()
          recoveryKey.current = `resource-hub:plain-text-draft:${sessionId}:${id}`
          identity.current = {
            ...identity.current,
            id,
            revision: revision ?? identity.current.revision + 1,
          }
          baseline.current = snapshot
          setSavedContent(snapshot)
          writing.current = false
          setSavedOnce(true)
          setConfirmOpen(false)
          setRecoveredOldRevision(false)
          const currentSaved = same(snapshot, latest.current)
          if (currentSaved) removeRecovery()
          else persistRecovery()
          return currentSaved
        },
      }
    )
  }
  function close() {
    if (saving || writing.current) return
    if (!same(latest.current, baseline.current)) setConfirmOpen(true)
    else onOpenChange(false)
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent
          data-document-format="plain"
          showCloseButton={false}
          data-document-theme={theme}
          className={cn(
            "document-theme flex flex-col gap-0 overflow-hidden p-0",
            fullscreen
              ? "top-0 left-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none sm:max-w-none data-open:animate-none"
              : "h-[90dvh] max-h-250 w-[95vw] max-w-5xl sm:max-w-5xl"
          )}
          onKeyDownCapture={(event) => {
            if (
              (event.ctrlKey || event.metaKey) &&
              event.key.toLowerCase() === "s"
            ) {
              event.preventDefault()
              event.stopPropagation()
              save(true)
            }
          }}
        >
          <DialogTitle className="sr-only">
            {draft.id ? "Edit text doc" : "New doc"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            A plain-text document. Text, spaces, tabs and blank lines are saved
            without rich formatting.
          </DialogDescription>
          <DialogHeader className="shrink-0 flex-row items-center gap-2 border-b px-4 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {editingTitle ? (
                <Input
                  autoFocus
                  disabled={!!recovery}
                  maxLength={200}
                  aria-label="Document title"
                  placeholder="Untitled"
                  value={live.title}
                  onChange={(event) => update({ title: event.target.value })}
                  onBlur={() => setEditingTitle(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") {
                      event.preventDefault()
                      event.stopPropagation()
                      setEditingTitle(false)
                    }
                  }}
                  className="h-7 max-w-80 text-sm"
                />
              ) : (
                <>
                  <span
                    className="truncate text-sm font-medium"
                    title={live.title || "Untitled"}
                  >
                    {live.title || "Untitled"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Edit title"
                    disabled={saving || !!recovery}
                    onClick={() => setEditingTitle(true)}
                  >
                    <PencilIcon />
                  </Button>
                </>
              )}
            </div>
            <DocumentThemeToggle theme={theme} onChange={changeTheme} />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              title={fullscreen ? "Exit full screen" : "Full screen"}
              onClick={() => setFullscreen((value) => !value)}
            >
              {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              disabled={saving}
              onClick={close}
            >
              <XIcon />
            </Button>
          </DialogHeader>
          {recovery && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-brand-soft px-4 py-3 text-sm">
              <p className="min-w-0 flex-1">
                An unsaved draft is available in this tab.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  identity.current = {
                    clientId: recovery.clientId ?? identity.current.clientId,
                    id: recovery.id,
                    revision: recovery.revision,
                  }
                  setRecoveredOldRevision(
                    !!draft.id && recovery.revision !== (draft.revision ?? 0)
                  )
                  update({
                    title: recovery.title,
                    projectId: recovery.projectId,
                    text: recovery.text,
                  })
                  setRecovery(null)
                }}
              >
                Restore draft
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  removeRecovery()
                  setRecovery(null)
                }}
              >
                Discard draft
              </Button>
            </div>
          )}
          {recoveredOldRevision && (
            <p
              role="alert"
              className="border-b px-4 py-2 text-sm text-text-muted"
            >
              The saved document changed after this draft. Copy your recovered
              text before reopening; saving an older revision will be blocked.
            </p>
          )}
          {storageError && (
            <p
              role="alert"
              className="border-b px-4 py-2 text-xs text-text-muted"
            >
              Browser draft recovery is unavailable. Save your changes before
              leaving this page.
            </p>
          )}
          {saveError && (
            <p
              role="alert"
              className="border-b px-4 py-2 text-sm text-destructive"
            >
              {saveError} Your text is still available in this editor.
            </p>
          )}
          {
            <PlainTextEditor
              editable={!recovery}
              title={live.title}
              value={live.text}
              theme={theme}
              onChange={(text) => update({ text })}
            />
          }
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
            <ProjectSinglePicker
              value={live.projectId}
              onChange={(projectId) => update({ projectId })}
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="max-w-44"
                  disabled={!!recovery}
                />
              }
            >
              <FolderIcon />
              <span className="truncate">
                {live.projectId
                  ? (projects.find((project) => project.id === live.projectId)
                      ?.name ??
                    (draft.project?.id === live.projectId
                      ? draft.project.name
                      : "Project"))
                  : "No project"}
              </span>
            </ProjectSinglePicker>
            <div className="ml-auto flex items-center gap-2">
              <span role="status" className="mr-1 text-xs text-subtle">
                {saving
                  ? "Saving…"
                  : dirty
                    ? "Unsaved changes"
                    : savedOnce
                      ? "Saved"
                      : "Not saved yet"}
              </span>
              <Button variant="outline" onClick={close} disabled={saving}>
                Cancel
              </Button>
              <Button
                loading={saving}
                onClick={() => save(false)}
                disabled={saving || !!recovery}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              Save your changes before closing, or discard them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => {
                baseline.current = latest.current
                removeRecovery()
                setConfirmOpen(false)
                onOpenChange(false)
              }}
            >
              Discard
            </Button>
            <Button
              loading={saving}
              disabled={saving}
              onClick={() => save(false)}
            >
              Save & Exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
