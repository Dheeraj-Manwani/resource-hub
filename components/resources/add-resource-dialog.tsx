"use client"

import {
  CheckCircle2Icon,
  FolderIcon,
  Loader2Icon,
  PaperclipIcon,
  TriangleAlertIcon,
  UploadCloudIcon,
  XCircleIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ProjectMultiPicker } from "@/components/projects/project-picker"
import { useShell } from "@/components/shell/shell-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  checkDuplicate,
  useBulkCreateResources,
  useCreateResource,
  type Duplicate,
} from "@/hooks/queries/resources"
import { useDetailDrawer } from "@/hooks/use-detail-drawer"
import { useUploads, type UploadItem } from "@/hooks/use-uploads"
import { parseInput } from "@/lib/resources/detect"
import { formatBytes, prettyUrl } from "@/lib/resources/dto"
import { RESOURCE_TYPE_LABELS, type ResourceType } from "@/lib/resources/types"
import { cn } from "@/lib/utils"

import { TagInput } from "./tag-input"
import { TypeIcon } from "./type-icon"

const URL_TYPES: ResourceType[] = [
  "youtube",
  "instagram",
  "x",
  "github",
  "pinterest",
  "link",
]

function UploadRow({ item }: { item: UploadItem }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{item.name}</span>
          <span className="shrink-0 text-xs text-subtle">
            {formatBytes(item.size)}
          </span>
        </div>
        {item.status === "error" ? (
          <p className="mt-1 text-xs text-destructive">{item.error}</p>
        ) : (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                "h-full rounded-full bg-brand transition-[width] duration-200",
                item.status === "processing" && "animate-pulse"
              )}
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </div>
        )}
      </div>
      {item.status === "done" ? (
        <CheckCircle2Icon className="size-4 text-emerald-400" />
      ) : item.status === "error" ? (
        <XCircleIcon className="size-4 text-destructive" />
      ) : (
        <Loader2Icon className="size-4 animate-spin text-subtle" />
      )}
    </li>
  )
}

function DialogBody({
  initialText,
  initialProjectIds,
  onClose,
}: {
  initialText?: string
  initialProjectIds?: string[]
  onClose: () => void
}) {
  const [text, setText] = useState(initialText ?? "")
  const [tags, setTags] = useState<string[]>([])
  const [projectIds, setProjectIds] = useState<string[]>(
    initialProjectIds ?? []
  )
  const [typeOverride, setTypeOverride] = useState<ResourceType | null>(null)
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const create = useCreateResource()
  const bulk = useBulkCreateResources()
  const uploads = useUploads()
  const { openResource } = useDetailDrawer()

  const parsed = useMemo(() => parseInput(text), [text])
  const single =
    parsed.kind === "urls" && parsed.items.length === 1
      ? parsed.items[0]!
      : null
  const detectedType = single?.type ?? null
  const effectiveType = typeOverride ?? detectedType

  // Debounced duplicate check for a single URL.
  const singleUrl = single?.url
  useEffect(() => {
    if (!singleUrl) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      checkDuplicate(singleUrl, controller.signal)
        .then(setDuplicate)
        .catch(() => {})
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      setDuplicate(null)
    }
  }, [singleUrl])

  const busy = create.isPending || bulk.isPending
  const uploading = uploads.items.some(
    (i) => i.status === "uploading" || i.status === "processing"
  )

  function addFiles(files: FileList | File[] | null) {
    const list = Array.from(files ?? [])
    if (list.length) void uploads.start(list, tags, projectIds)
  }

  async function submit(force = false) {
    if (parsed.kind === "empty") return
    if (duplicate && !force) return
    try {
      if (parsed.kind === "note") {
        await create.mutateAsync({ text: parsed.text, type: "note", tags, projectIds })
        toast.success("Note saved")
      } else if (parsed.items.length === 1) {
        const item = parsed.items[0]!
        await create.mutateAsync({
          url: item.url,
          type: typeOverride ?? undefined,
          title: parsed.titleHint,
          tags,
          projectIds,
        })
        toast.success("Saved", { description: prettyUrl(item.url) })
      } else {
        const result = await bulk.mutateAsync({
          urls: parsed.items.map((i) => i.url),
          tags,
          projectIds,
        })
        toast.success(`Saved ${result.created.length} links`, {
          description: result.invalid.length
            ? `${result.invalid.length} lines were skipped`
            : "Details are filling in…",
        })
      }
      onClose()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add resource</DialogTitle>
        <DialogDescription>
          Paste a link, many links (one per line), any text, or drop files.
        </DialogDescription>
      </DialogHeader>

      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault()
            setDragging(false)
            addFiles(e.dataTransfer.files)
          }
        }}
        className={cn(
          "relative rounded-lg transition-shadow",
          dragging && "shadow-glow"
        )}
      >
        <textarea
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setTypeOverride(null)
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault()
              addFiles(e.clipboardData.files)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder={
            "https://youtube.com/watch?v=…\nhttps://github.com/owner/repo\n…or just type a note"
          }
          rows={5}
          className="w-full resize-y rounded-lg border border-input bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-subtle focus:border-brand/60 focus:ring-3 focus:ring-brand/20"
          aria-label="URL, text or links"
        />
        {dragging ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/70 text-sm text-foreground">
            <UploadCloudIcon className="mr-2 size-4 text-brand" />
            Drop files to upload
          </div>
        ) : null}
      </div>

      {/* What we detected */}
      {parsed.kind === "urls" && single ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-muted">Detected</span>
          <Select
            value={effectiveType ?? "link"}
            onValueChange={(v) => setTypeOverride(v as ResourceType)}
          >
            <SelectTrigger
              size="sm"
              className="h-7 gap-1.5"
              aria-label="Resource type"
            >
              <SelectValue>
                {(v: string) => (
                  <span className="flex items-center gap-1.5">
                    <TypeIcon type={v as ResourceType} />
                    {RESOURCE_TYPE_LABELS[v as ResourceType]}
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {URL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  <TypeIcon type={t} />
                  {RESOURCE_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {parsed.titleHint ? (
            <span className="truncate text-xs text-subtle">
              “{parsed.titleHint}”
            </span>
          ) : null}
        </div>
      ) : parsed.kind === "urls" ? (
        <div className="space-y-1.5">
          <p className="text-sm text-text-muted">
            {parsed.items.length} links detected
          </p>
          <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {parsed.items.map((item) => (
              <li
                key={item.urlNormalized}
                className="flex items-center gap-2 text-xs"
              >
                <TypeIcon type={item.type} />
                <span className="truncate text-text-muted">
                  {prettyUrl(item.url)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : parsed.kind === "note" ? (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <TypeIcon type="note" /> Will be saved as a note
        </p>
      ) : null}

      {duplicate ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <TriangleAlertIcon className="size-4 text-amber-400" />
          <span className="min-w-0 flex-1">
            Already saved
            {duplicate.title ? (
              <>
                : <span className="font-medium">{duplicate.title}</span>
              </>
            ) : null}
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              onClose()
              openResource(duplicate.id)
            }}
          >
            Open existing
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void submit(true)}
            disabled={busy}
          >
            Add anyway
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <ProjectMultiPicker
          value={projectIds}
          onChange={setProjectIds}
          render={
            <button
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs text-text-muted hover:border-border-strong"
            />
          }
        >
          <FolderIcon className="size-3.5" />
          {projectIds.length
            ? `${projectIds.length} project${projectIds.length === 1 ? "" : "s"}`
            : "Inbox"}
        </ProjectMultiPicker>
      </div>

      <TagInput value={tags} onChange={setTags} />

      {uploads.items.length ? (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto">
          {uploads.items.map((item) => (
            <UploadRow key={item.key} item={item} />
          ))}
        </ul>
      ) : null}

      <DialogFooter className="sm:justify-between">
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ""
          }}
        />
        <Button variant="ghost" onClick={() => fileInput.current?.click()}>
          <PaperclipIcon />
          Upload files
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            {uploads.items.length && !uploading ? "Done" : "Cancel"}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={parsed.kind === "empty" || busy || !!duplicate}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            {parsed.kind === "urls" && parsed.items.length > 1
              ? `Save ${parsed.items.length} links`
              : "Save"}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

export function AddResourceDialog() {
  const { addResource, closeAddResource } = useShell()
  return (
    <Dialog
      open={addResource.open}
      onOpenChange={(open) => (!open ? closeAddResource() : undefined)}
    >
      <DialogContent className="gap-4 sm:max-w-xl">
        {addResource.open ? (
          <DialogBody
            initialText={addResource.initialText}
            initialProjectIds={addResource.initialProjectIds}
            onClose={closeAddResource}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
