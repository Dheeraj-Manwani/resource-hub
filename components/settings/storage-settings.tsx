"use client"

import { useQuery } from "@tanstack/react-query"
import { DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import { formatBytes } from "@/lib/resources/dto"

type Usage = { storageUsedBytes: number; storageQuotaBytes: number }

export function StorageSettings() {
  const { data } = useQuery({
    queryKey: ["usage"],
    queryFn: ({ signal }) => api<Usage>("/api/v1/usage", { signal }),
  })
  const used = data?.storageUsedBytes ?? 0
  const quota = data?.storageQuotaBytes ?? 1
  const pct = Math.min(100, Math.round((used / quota) * 100))

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-text-muted">
            {data ? `${formatBytes(used)} of ${formatBytes(quota)} used` : "Loading…"}
          </span>
          <span className="text-subtle">{data ? `${pct}%` : ""}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
          <div
            className={`h-full rounded-full ${pct >= 90 ? "bg-priority-urgent" : "bg-brand"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href="/api/v1/export" download />}
        >
          <DownloadIcon />
          Export my data (JSON)
        </Button>
        <p className="mt-2 text-xs text-subtle">
          Downloads every project, resource, task and tag you own as one JSON file.
        </p>
      </div>
    </div>
  )
}
