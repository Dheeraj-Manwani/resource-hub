"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-hot-toast"

import { api, toQueryString } from "@/lib/api-client"
import type {
  ResourceChecklistAction,
  ResourceChecklistDto,
} from "@/lib/projects/resource-checklist"
import { syncMutation } from "@/lib/sync/mutations"

export function useResourceChecklist(
  projectId: string,
  includeDescendants: boolean
) {
  const qc = useQueryClient()
  const prefix = ["projects", "checklist", projectId]
  const query = useQuery({
    queryKey: [...prefix, includeDescendants],
    queryFn: ({ signal }) =>
      api<ResourceChecklistDto>(
        `/api/v1/projects/${projectId}/checklist${toQueryString({ includeDescendants })}`,
        { signal }
      ),
  })
  const mutation = useMutation({
    ...syncMutation("project.checklist"),
    mutationFn: (action: ResourceChecklistAction) =>
      api<{ saved: boolean }>(`/api/v1/projects/${projectId}/checklist`, {
        method: "PATCH",
        body: action,
      }),
    onMutate: async (action) => {
      await qc.cancelQueries({ queryKey: prefix })
      const previous = qc.getQueriesData<ResourceChecklistDto>({
        queryKey: prefix,
      })
      qc.setQueriesData<ResourceChecklistDto>({ queryKey: prefix }, (data) => {
        if (!data) return data
        if (action.action === "mode")
          return { ...data, enabled: action.enabled }
        if (action.action === "reset")
          return { ...data, checkedResourceIds: [] }
        const checks = new Set(data.checkedResourceIds)
        if (action.checked && data.resourceIds.includes(action.resourceId))
          checks.add(action.resourceId)
        else checks.delete(action.resourceId)
        return { ...data, checkedResourceIds: [...checks] }
      })
      return { previous }
    },
    onError: (error, _action, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error(`Couldn't save checklist: ${error.message}`)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: prefix }),
  })
  return { query, mutation }
}
