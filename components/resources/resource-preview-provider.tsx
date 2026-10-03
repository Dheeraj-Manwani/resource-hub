"use client"

import dynamic from "next/dynamic"
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import { useDetailDrawer } from "@/hooks/use-detail-drawer"

const ResourcePreviewDialog = dynamic(
  () => import("./resource-preview-dialog").then((m) => m.ResourcePreviewDialog),
  { ssr: false }
)

type ResourcePreviewContextValue = {
  /** Opens the large read-only preview modal for a resource. */
  openPreview: (id: string) => void
}

const ResourcePreviewContext = createContext<ResourcePreviewContextValue | null>(
  null
)

function PreviewDialogHost({
  id,
  onClose,
}: {
  id: string
  onClose: () => void
}) {
  const { openResource } = useDetailDrawer()
  return (
    <ResourcePreviewDialog
      id={id}
      onClose={onClose}
      onEdit={(resourceId) => {
        onClose()
        openResource(resourceId)
      }}
    />
  )
}

export function ResourcePreviewProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  const value = useMemo(
    () => ({ openPreview: setPreviewId }),
    []
  )
  const close = useCallback(() => setPreviewId(null), [])

  return (
    <ResourcePreviewContext.Provider value={value}>
      {children}
      {previewId ? (
        <Suspense fallback={null}>
          <PreviewDialogHost id={previewId} onClose={close} />
        </Suspense>
      ) : null}
    </ResourcePreviewContext.Provider>
  )
}

export function useResourcePreview() {
  const ctx = useContext(ResourcePreviewContext)
  if (!ctx)
    throw new Error(
      "useResourcePreview must be used inside <ResourcePreviewProvider>"
    )
  return ctx
}
