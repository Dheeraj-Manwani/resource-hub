"use client"

import { rowCache } from "@/lib/optimistic/rows"
import { inProject } from "@/lib/optimistic/lists"
import type { ProjectDto } from "@/lib/projects/types"
import { syncMutation } from "@/lib/sync/mutations"
import type { SyncController } from "@/lib/sync/controller"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { toast } from "react-hot-toast"

import { api, toQueryString } from "@/lib/api-client"
import type { QuickNoteDto } from "@/lib/quick-notes/dto"

const KEY = ["quick-notes"]
export const quickNoteCache = rowCache<QuickNoteDto>(
  "quick-note",
  KEY,
  (row) => row.id,
  (row, key, client) => {
    const filter = key[1] as QuickNoteFilters | undefined
    return (
      !filter?.projectId ||
      inProject(
        client,
        row.projectId,
        filter.projectId,
        filter.includeDescendants
      ) !== false
    )
  }
)

export type QuickNoteFilters = {
  projectId?: string
  includeDescendants?: boolean
}

export const quickNoteKeys = {
  all: KEY,
  list: (filters?: QuickNoteFilters) =>
    filters?.projectId ? [...KEY, filters] : KEY,
}

type QuickNoteInput = {
  projectId?: string | null
  title?: string | null
  bodyJson?: unknown
  bodyText?: string | null
}

export function useQuickNotes(filters: QuickNoteFilters = {}) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: quickNoteKeys.list(filters),
    queryFn: ({ signal }) =>
      api<{ items: QuickNoteDto[] }>(
        `/api/v1/quick-notes${toQueryString(filters)}`,
        { signal }
      ).then((data) => ({
        ...data,
        items: quickNoteCache.received(qc, data.items),
      })),
    select: (d) =>
      quickNoteCache.project(qc, d.items, quickNoteKeys.list(filters)),
  })
}

/** Beyond the unfiltered list (patched directly for instant feedback), any
 * project-scoped lists (the project page's Notes tab) just get invalidated
 * and refetch from the server. */
function invalidateFilteredLists(qc: QueryClient) {
  if (quickNoteCache.pending(qc)) return Promise.resolve()
  return qc.invalidateQueries({ queryKey: KEY }).catch(() => {})
}

export function useCreateQuickNote() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("quick-note.create"),
    mutationFn: (input: QuickNoteInput = {}) =>
      api<QuickNoteDto>("/api/v1/quick-notes", { method: "POST", body: input }),
    onSuccess: (note) => {
      qc.setQueryData<{ items: QuickNoteDto[] }>(KEY, (d) =>
        d ? { items: [note, ...d.items] } : { items: [note] }
      )
      invalidateFilteredLists(qc)
    },
    onError: (error) => toast.error(`Couldn't create note: ${error.message}`),
  })
}

export function useUpdateQuickNote() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("quick-note.update"),
    mutationFn: ({ id, ...patch }: QuickNoteInput & { id: string }) =>
      api<QuickNoteDto>(`/api/v1/quick-notes/${id}`, {
        method: "PATCH",
        body: patch,
      }),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: KEY })
      return {
        token: quickNoteCache.begin(qc, id, (note) => {
          if (!note) return note
          const projectId =
            patch.projectId === undefined ? note.projectId : patch.projectId
          const project = qc
            .getQueryData<{ items: ProjectDto[] }>(["projects", "tree"])
            ?.items.find((row) => row.id === projectId)
          return {
            ...note,
            ...patch,
            projectId,
            project:
              patch.projectId === undefined
                ? note.project
                : project
                  ? {
                      id: project.id,
                      name: project.name,
                      icon: project.icon,
                      color: project.color,
                    }
                  : null,
          }
        }),
      }
    },
    onSuccess: (note, { id }, context) =>
      quickNoteCache.settle(qc, id, context?.token, note),
    onError: (error, { id }, context) => {
      quickNoteCache.settle(qc, id, context?.token)
      toast.error(`Couldn't save note: ${error.message}`)
    },
    onSettled: () => invalidateFilteredLists(qc),
  })
}

export function useDeleteQuickNote() {
  const qc = useQueryClient()
  return useMutation({
    ...syncMutation("quick-note.delete"),
    mutationFn: (id: string) =>
      api<null>(`/api/v1/quick-notes/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.setQueryData<{ items: QuickNoteDto[] }>(KEY, (d) =>
        d ? { items: d.items.filter((n) => n.id !== id) } : d
      )
      invalidateFilteredLists(qc)
      toast.success("Note deleted")
    },
    onError: (error) => toast.error(`Couldn't delete: ${error.message}`),
  })
}

type StartImageResponse = {
  fileId: string
  uploadUrl: string
  headers: Record<string, string>
}

export type QuickNoteImage = {
  id: string
  url: string
  width: number | null
  height: number | null
}

/** Uploads one pasted/dropped image straight to storage for use inside a
 * quick note's body — never creates a Resource, unlike the Library's
 * upload flow. */
export async function uploadQuickNoteImage(
  file: File,
  sync: SyncController
): Promise<QuickNoteImage> {
  return sync.track(
    {
      label: "Uploading note image",
      source: "upload",
      entityKeys: ["quick-note:all"],
      href: "/quick-notes",
    },
    async (saved) => {
      const start = await api<StartImageResponse>(
        "/api/v1/quick-notes/images",
        {
          method: "POST",
          body: { name: file.name, mime: file.type, size: file.size },
        }
      )
      const put = await fetch(start.uploadUrl, {
        method: "PUT",
        headers: start.headers,
        body: file,
      })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)
      const result = await api<QuickNoteImage>(
        `/api/v1/quick-notes/images/${start.fileId}/complete`,
        {
          method: "POST",
        }
      )
      saved()
      return result
    }
  )
}

/** Best-effort title for a pasted URL; resolves to `null` rather than
 * throwing so a failed lookup never disrupts the paste. */
export async function fetchQuickNoteLinkPreview(
  url: string
): Promise<{ title: string | null }> {
  try {
    return await api<{ title: string | null }>(
      `/api/v1/quick-notes/link-preview${toQueryString({ url })}`
    )
  } catch {
    return { title: null }
  }
}
