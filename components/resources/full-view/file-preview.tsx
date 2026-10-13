"use client"

import { useQuery } from "@tanstack/react-query"
import {
  FileIcon,
  FileTextIcon,
  Music2Icon,
  DownloadIcon,
  ExternalLinkIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { LoadingState } from "@/components/query-feedback"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api-client"
import {
  displayTitle,
  formatBytes,
  type ResourceDto,
} from "@/lib/resources/dto"
import {
  FILE_PREVIEW_LABELS,
  resourcePreviewKind,
  type ParsedFilePreview,
  type PreviewSheet,
} from "@/lib/resources/preview"
import { cn } from "@/lib/utils"
import { ResourceImage } from "../embeds/resource-image"

function columnLabel(index: number): string {
  let label = ""
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label
  return label
}

function SpreadsheetPreview({ sheets }: { sheets: PreviewSheet[] }) {
  const [active, setActive] = useState(0)
  const sheet = sheets[active] ?? sheets[0]
  if (!sheet)
    return <p className="p-8 text-text-muted">This workbook has no sheets.</p>
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-xs text-text-muted">
        <span>
          {sheet.rowCount.toLocaleString()} rows ·{" "}
          {sheet.columnCount.toLocaleString()} columns
        </span>
        <span>Read-only · Saved values</span>
      </div>
      {sheet.truncated ? (
        <p
          role="status"
          className="border-b border-border bg-muted px-4 py-2 text-xs"
        >
          Showing up to 500 rows and 50 columns. Download for the complete
          workbook.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {sheet.rows.length ? (
          <table
            aria-label={`${sheet.name} spreadsheet`}
            className="w-full border-separate border-spacing-0 text-xs"
          >
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th
                  aria-label="Row number"
                  className="sticky left-0 z-20 min-w-12 border-r border-b border-border bg-muted px-3 py-2"
                />
                {Array.from(
                  { length: Math.min(sheet.columnCount, 50) },
                  (_, c) => (
                    <th
                      scope="col"
                      key={c}
                      className="min-w-32 border-r border-b border-border px-3 py-2 font-medium text-text-muted"
                    >
                      {columnLabel(c)}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r} className="hover:bg-muted/40">
                  <th
                    scope="row"
                    className="sticky left-0 border-r border-b border-border bg-muted px-3 py-2 text-center font-normal text-text-muted"
                  >
                    {r + 1}
                  </th>
                  {Array.from(
                    { length: Math.min(sheet.columnCount, 50) },
                    (_, c) => (
                      <td
                        key={c}
                        title={row[c] ?? ""}
                        className="max-w-80 min-w-32 truncate border-r border-b border-border px-3 py-2 whitespace-pre"
                      >
                        {row[c] ?? ""}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-8 text-center text-text-muted">
            This sheet is empty.
          </p>
        )}
      </div>
      <div
        role="tablist"
        aria-label="Workbook sheets"
        className="flex shrink-0 gap-1 overflow-x-auto border-t border-border bg-muted/50 px-3 py-2"
      >
        {sheets.map((item, index) => (
          <Button
            role="tab"
            aria-selected={active === index}
            aria-controls="resource-preview-sheet"
            key={index}
            size="sm"
            variant={active === index ? "secondary" : "ghost"}
            onClick={() => setActive(index)}
          >
            {item.name}
          </Button>
        ))}
      </div>
    </div>
  )
}

function ParsedPreview({
  resource,
  modal,
}: {
  resource: ResourceDto
  modal: boolean
}) {
  const [zoom, setZoom] = useState(100)
  const file = resource.file!
  const query = useQuery({
    queryKey: ["file-preview", file.id],
    queryFn: ({ signal }) =>
      api<ParsedFilePreview>(`/api/files/${file.id}/preview`, { signal }),
    staleTime: 5 * 60_000,
    retry: false,
  })
  if (query.isPending)
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center">
        <LoadingState label="Preparing preview…" />
      </div>
    )
  if (query.isError)
    return (
      <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <FileTextIcon className="size-10 text-text-muted" />
        <p role="alert" className="max-w-md text-sm text-text-muted">
          {query.error.message}
        </p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Retry preview
        </Button>
      </div>
    )
  const data = query.data
  if (data.kind === "spreadsheet")
    return (
      <div
        id="resource-preview-sheet"
        role="tabpanel"
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          !modal && "h-[60vh] flex-none"
        )}
      >
        <SpreadsheetPreview sheets={data.sheets} />
      </div>
    )
  if (data.kind === "text")
    return (
      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto bg-surface",
          !modal && "max-h-[60vh]"
        )}
      >
        {data.truncated ? (
          <p className="sticky top-0 bg-muted px-4 py-2 text-xs">
            Showing the first 200,000 characters. Download for the complete
            file.
          </p>
        ) : null}
        <pre className="p-5 font-mono text-xs leading-6 break-words whitespace-pre-wrap">
          {data.text || "This file is empty."}
        </pre>
      </div>
    )
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-2">
        <p className="text-xs text-text-muted">
          Reading view · Layout may differ from the original
        </p>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom out"
            disabled={zoom <= 75}
            onClick={() => setZoom((z) => z - 25)}
          >
            <ZoomOutIcon />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums">{zoom}%</span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom in"
            disabled={zoom >= 175}
            onClick={() => setZoom((z) => z + 25)}
          >
            <ZoomInIcon />
          </Button>
        </div>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto bg-muted/40 p-4 sm:p-8",
          !modal && "max-h-[60vh]"
        )}
      >
        {/* Converted on the server and sanitized with a strict HTML allowlist. */}
        <article
          style={{ fontSize: `${zoom}%` }}
          className="mx-auto min-h-80 max-w-[760px] rounded-sm border border-border bg-surface p-6 leading-relaxed shadow-sm sm:p-12 [&_a]:text-brand [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_h1]:mb-6 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:my-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:my-4 [&_h3]:text-xl [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{
            __html: data.html || "<p>This document is empty.</p>",
          }}
        />
      </div>
    </div>
  )
}

/** Shared file rendering for the preview modal, detail drawer and focus view. */
export function FilePreview({
  resource,
  modal = false,
}: {
  resource: ResourceDto
  modal?: boolean
}) {
  const src = resource.file?.url ?? resource.url
  const kind = resourcePreviewKind(resource)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const parsed =
    !!resource.file && ["document", "spreadsheet", "text"].includes(kind)
  const native = !!src && ["pdf", "video", "audio", "image"].includes(kind)
  useEffect(() => {
    if (!native || !loading || failed) return
    const timer = setTimeout(() => setSlow(true), 15_000)
    return () => clearTimeout(timer)
  }, [native, loading, failed, attempt])
  const retry = () => {
    setLoading(true)
    setFailed(false)
    setSlow(false)
    setAttempt((a) => a + 1)
  }
  const ready = () => setLoading(false)
  const unavailable = () => {
    setLoading(false)
    setFailed(true)
  }
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border",
        modal && "h-full rounded-none border-0"
      )}
    >
      {parsed ? (
        <ParsedPreview resource={resource} modal={modal} />
      ) : native && !failed ? (
        <div
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden",
            kind === "video" || kind === "image" ? "bg-black/95" : "bg-surface",
            !modal && kind === "pdf" && "h-[70vh] flex-none"
          )}
        >
          {loading && kind !== "image" ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <LoadingState label="Loading preview…" />
            </div>
          ) : null}
          {kind === "pdf" ? (
            <iframe
              key={attempt}
              src={src!}
              title={displayTitle(resource)}
              className={cn(
                "min-h-0 w-full flex-1 border-0",
                modal ? "h-full" : "h-[70vh]"
              )}
              onLoad={ready}
              onError={unavailable}
            />
          ) : kind === "video" ? (
            <video
              key={attempt}
              src={src!}
              controls
              playsInline
              className="max-h-[65vh] min-h-0 w-full flex-1"
              preload="metadata"
              onLoadedMetadata={ready}
              onError={unavailable}
            />
          ) : kind === "image" ? (
            <ResourceImage
              src={src}
              alt={displayTitle(resource)}
              type="image"
              recovery
              fit="contain"
              className="max-h-[65vh] w-full"
            />
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-5 bg-gradient-to-b from-brand/10 to-surface p-8">
              <div className="flex size-24 items-center justify-center rounded-full border border-brand/20 bg-brand/10">
                <Music2Icon className="size-10 text-brand" />
              </div>
              <p className="text-center font-medium">
                {displayTitle(resource)}
              </p>
              <audio
                key={attempt}
                src={src!}
                controls
                className="w-full max-w-lg"
                preload="metadata"
                onLoadedMetadata={ready}
                onError={unavailable}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 bg-muted/30 p-8 text-center">
          <FileIcon className="size-12 text-text-muted" />
          <p className="font-medium">
            {resource.file?.name ?? displayTitle(resource)}
          </p>
          <p className="max-w-sm text-sm text-text-muted">
            {failed
              ? "Couldn't load this preview."
              : kind === "archive"
                ? "Download this archive to extract its contents."
                : kind === "presentation"
                  ? "Download this presentation to view the slides, or upload a PDF export for an inline preview."
                  : !resource.file &&
                      ["document", "spreadsheet", "text"].includes(kind)
                    ? "Upload this file to read it here, or open the original below."
                    : "An inline preview isn't available for this format. Open or download the original."}
          </p>
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-surface px-4 py-2.5">
        <span className="mr-auto text-xs text-text-muted">
          {FILE_PREVIEW_LABELS[kind as keyof typeof FILE_PREVIEW_LABELS] ??
            "File"}
          {resource.file ? ` · ${formatBytes(resource.file.size)}` : ""}
        </span>
        {slow && loading && native ? (
          <p role="status" className="w-full text-xs text-text-muted">
            Preview is taking longer than expected. You can open or download the
            original.
          </p>
        ) : null}
        {failed || (slow && loading && native) ? (
          <Button size="sm" variant="outline" onClick={retry}>
            Retry preview
          </Button>
        ) : null}
        {src ? (
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            render={<a href={src} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLinkIcon />
            Open original
          </Button>
        ) : null}
        {resource.file ? (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={resource.file.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <DownloadIcon />
            Download
          </Button>
        ) : null}
      </div>
    </div>
  )
}
