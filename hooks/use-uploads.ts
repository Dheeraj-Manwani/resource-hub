"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { toast } from "react-hot-toast"

import { WorkQueue } from "@/lib/memory/work-queue"

import { api, ApiClientError } from "@/lib/api-client"
import type { ResourceDto } from "@/lib/resources/dto"
import type { SyncController } from "@/lib/sync/controller"
import { useSyncController } from "@/components/sync-provider"

import {
  invalidateResourceLists,
  upsertResourceInCache,
} from "./queries/resources"

const transferQueue = new WorkQueue(3)
let uploadSequence = 0

export type UploadItem = {
  key: string
  name: string
  size: number
  progress: number
  status: "queued" | "uploading" | "processing" | "done" | "error"
  error?: string
}

const EXTENSION_MIME: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  txt: "text/plain",
  json: "application/json",
  pdf: "application/pdf",
  zip: "application/zip",
  heic: "image/heic",
}

export function mimeOf(file: File) {
  if (file.type) return file.type
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  return EXTENSION_MIME[ext] ?? "application/octet-stream"
}

function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (p: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.timeout = 180_000
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Try the file again."))
    xhr.onabort = () => reject(new Error("Upload cancelled"))
    xhr.setRequestHeader("Content-Type", contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`))
    xhr.onerror = () =>
      reject(
        new Error("Upload failed: network error or storage CORS not configured")
      )
    xhr.send(file)
  })
}

type StartResponse = {
  fileId: string
  uploadUrl: string
  headers: Record<string, string>
}

/** Uploads one file straight to R2 (presigned PUT), then completes it. */
export async function uploadFile(
  file: File,
  {
    purpose = "resource",
    resourceId,
    tags,
    projectIds,
    onProgress,
    onStart,
    sync,
  }: {
    purpose?: "resource" | "thumbnail"
    resourceId?: string
    tags?: string[]
    projectIds?: string[]
    onProgress?: (p: number) => void
    onStart?: () => void
    sync: SyncController
  }
) {
  return sync.track(
    {
      label: purpose === "thumbnail" ? "Uploading thumbnail" : "Uploading file",
      source: "upload",
      entityKeys: [
        resourceId
          ? `resource:${resourceId}`
          : `resource:new-upload:${++uploadSequence}`,
      ],
      href: resourceId ? `/resources?r=${resourceId}` : "/resources",
    },
    (saved, isCurrent) =>
      transferQueue.run(async () => {
        const checkSession = () => {
          if (!isCurrent())
            throw new ApiClientError(
              499,
              "Upload cancelled because the session changed"
            )
        }
        checkSession()
        onStart?.()
        const mime = mimeOf(file)
        const start = await api<StartResponse>("/api/v1/uploads", {
          method: "POST",
          body: { name: file.name, mime, size: file.size, purpose, resourceId },
          signal: AbortSignal.timeout(30_000),
        })
        checkSession()
        await putWithProgress(start.uploadUrl, file, mime, (p) =>
          onProgress?.(p)
        )
        checkSession()
        const result = await api<ResourceDto>(
          `/api/v1/uploads/${start.fileId}/complete`,
          {
            method: "POST",
            body: { tags, projectIds },
            signal: AbortSignal.timeout(45_000),
          }
        )
        checkSession()
        saved()
        return result
      })
  )
}

/** Multi-file upload queue with per-file progress (used by the add dialog). */
export function useUploads() {
  const sync = useSyncController()
  const qc = useQueryClient()
  const [items, setItems] = useState<UploadItem[]>([])

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((list) =>
      list.map((i) => (i.key === key ? { ...i, ...patch } : i))
    )

  const start = useCallback(
    async (files: File[], tags?: string[], projectIds?: string[]) => {
      if (!files.length) return
      const toastId = toast.loading(
        `Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`
      )
      let uploaded = 0
      const queued = files.map((file) => ({
        file,
        item: {
          key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size,
          progress: 0,
          status: "queued" as const,
        },
      }))
      setItems((list) => [...list, ...queued.map((q) => q.item)])
      await Promise.all(
        queued.map(async ({ file, item }) => {
          try {
            const resource = await uploadFile(file, {
              sync,
              onStart: () => update(item.key, { status: "uploading" }),
              tags,
              projectIds,
              onProgress: (progress) =>
                update(item.key, {
                  progress,
                  status: progress >= 1 ? "processing" : "uploading",
                }),
            })
            update(item.key, { status: "done", progress: 1 })
            uploaded += 1
            upsertResourceInCache(qc, resource)
          } catch (error) {
            update(item.key, {
              status: "error",
              error: (error as Error).message,
            })
          }
        })
      )
      const failed = files.length - uploaded
      if (failed) {
        toast.error(
          `${uploaded ? `${uploaded} uploaded; ` : ""}${failed} file${failed === 1 ? "" : "s"} failed to upload. See file details for the error.`,
          { id: toastId }
        )
      } else {
        toast.success(`Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}`, {
          id: toastId,
        })
      }
      await invalidateResourceLists(qc)
    },
    [qc, sync]
  )

  const reset = useCallback(() => setItems([]), [])
  return { items, start, reset }
}
