"use client"

import dynamic from "next/dynamic"
import {
  AsyncDialogFeedback,
  AsyncDialogBoundary,
} from "@/components/async-dialog"
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
  () =>
    import("./resource-preview-dialog").then((m) => m.ResourcePreviewDialog),
  { ssr: false, loading: () => <PreviewLoading /> }
)

type ResourcePreviewContextValue = {
  /** Opens the large read-only preview modal for a resource. */
  openPreview: (id: string) => void
  closePreview: () => void
}

const ResourcePreviewContext =
  createContext<ResourcePreviewContextValue | null>(null)

function PreviewLoading() {
  const { closePreview } = useResourcePreview()
  return <AsyncDialogFeedback label="resource preview" onClose={closePreview} />
}

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
  const close = useCallback(() => setPreviewId(null), [])
  const value = useMemo(
    () => ({ openPreview: setPreviewId, closePreview: close }),
    [close]
  )

  return (
    <ResourcePreviewContext.Provider value={value}>
      {children}
      {previewId ? (
        <AsyncDialogBoundary
          key={previewId}
          fallback={
            <AsyncDialogFeedback
              label="resource preview"
              onClose={close}
              failed
            />
          }
        >
          <Suspense fallback={<PreviewLoading />}>
            <PreviewDialogHost id={previewId} onClose={close} />
          </Suspense>
        </AsyncDialogBoundary>
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
