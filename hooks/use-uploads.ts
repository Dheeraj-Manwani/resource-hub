"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"

import { api } from "@/lib/api-client"
import type { ResourceDto } from "@/lib/resources/dto"

import {
  invalidateResourceLists,
  upsertResourceInCache,
} from "./queries/resources"

export type UploadItem = {
  key: string
  name: string
  size: number
  progress: number
  status: "uploading" | "processing" | "done" | "error"
  error?: string
  resource?: ResourceDto
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
    onProgress,
  }: {
    purpose?: "resource" | "thumbnail"
    resourceId?: string
    tags?: string[]
    onProgress?: (p: number) => void
  } = {}
) {
  const mime = mimeOf(file)
  const start = await api<StartResponse>("/api/v1/uploads", {
    method: "POST",
    body: { name: file.name, mime, size: file.size, purpose, resourceId },
  })
  await putWithProgress(start.uploadUrl, file, mime, (p) => onProgress?.(p))
  return api<ResourceDto>(`/api/v1/uploads/${start.fileId}/complete`, {
    method: "POST",
    body: { tags },
  })
}

/** Multi-file upload queue with per-file progress (used by the add dialog). */
export function useUploads() {
  const qc = useQueryClient()
  const [items, setItems] = useState<UploadItem[]>([])

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((list) =>
      list.map((i) => (i.key === key ? { ...i, ...patch } : i))
    )

  const start = useCallback(
    async (files: File[], tags?: string[]) => {
      const queued = files.map((file) => ({
        file,
        item: {
          key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size,
          progress: 0,
          status: "uploading" as const,
        },
      }))
      setItems((list) => [...list, ...queued.map((q) => q.item)])
      await Promise.all(
        queued.map(async ({ file, item }) => {
          try {
            const resource = await uploadFile(file, {
              tags,
              onProgress: (progress) =>
                update(item.key, {
                  progress,
                  status: progress >= 1 ? "processing" : "uploading",
                }),
            })
            update(item.key, { status: "done", progress: 1, resource })
            upsertResourceInCache(qc, resource)
          } catch (error) {
            update(item.key, {
              status: "error",
              error: (error as Error).message,
            })
          }
        })
      )
      await invalidateResourceLists(qc)
    },
    [qc]
  )

  const reset = useCallback(() => setItems([]), [])
  return { items, start, reset }
}
