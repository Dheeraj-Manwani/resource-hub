import type { ResourceDto } from "./dto"

export type FilePreviewKind =
  | "pdf"
  | "spreadsheet"
  | "document"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "presentation"
  | "archive"
  | "unsupported"

export function fileExtension(name: string) {
  try {
    name = decodeURIComponent(new URL(name).pathname)
  } catch {
    /* filename */
  }
  return name.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase() ?? ""
}

export function filePreviewKind(mime: string, name: string): FilePreviewKind {
  mime = mime.split(";", 1)[0].trim().toLowerCase()
  const ext = fileExtension(name)
  if (mime === "application/pdf" || ext === "pdf") return "pdf"
  if (
    mime.startsWith("image/") ||
    /^(png|jpe?g|gif|webp|avif|svg|bmp)$/.test(ext)
  )
    return "image"
  if (mime.startsWith("video/") || /^(mp4|webm|mov|m4v|ogv)$/.test(ext))
    return "video"
  if (mime.startsWith("audio/") || /^(mp3|wav|m4a|aac|ogg|flac)$/.test(ext))
    return "audio"
  if (
    /spreadsheet|excel|csv|tab-separated/.test(mime) ||
    /^(xlsx|xlsm|xls|csv|tsv|ods)$/.test(ext)
  )
    return "spreadsheet"
  if (
    /wordprocessingml|msword|opendocument.text|rtf/.test(mime) ||
    /^(docx|doc|odt|rtf)$/.test(ext)
  )
    return "document"
  if (/presentation|powerpoint/.test(mime) || /^(pptx|ppt|odp)$/.test(ext))
    return "presentation"
  if (
    /zip|compressed|x-tar|gzip/.test(mime) ||
    /^(zip|rar|7z|tar|gz)$/.test(ext)
  )
    return "archive"
  if (
    mime.startsWith("text/") ||
    /^(txt|md|json|xml|yaml|yml|log|js|ts|tsx|jsx|py|css|html|sql|sh)$/.test(
      ext
    ) ||
    mime === "application/json" ||
    mime === "application/xml"
  )
    return "text"
  return "unsupported"
}

export function resourcePreviewKind(resource: ResourceDto) {
  if (resource.file)
    return filePreviewKind(resource.file.mime, resource.file.name)
  if (resource.type === "file" || resource.type === "link") {
    const kind = filePreviewKind("", resource.url ?? "")
    if (kind !== "unsupported") return kind
  }
  return resource.type
}

export const FILE_PREVIEW_LABELS: Record<FilePreviewKind, string> = {
  pdf: "PDF",
  spreadsheet: "Spreadsheet",
  document: "Word document",
  text: "Text & code",
  image: "Image",
  video: "Video",
  audio: "Audio",
  presentation: "Presentation",
  archive: "Archive",
  unsupported: "File",
}

export type PreviewSheet = {
  name: string
  rows: string[][]
  rowCount: number
  columnCount: number
  truncated: boolean
}
export type ParsedFilePreview =
  | { kind: "document"; html: string }
  | { kind: "spreadsheet"; sheets: PreviewSheet[] }
  | { kind: "text"; text: string; truncated: boolean }

export const MAX_PREVIEW_BYTES = 10 * 1024 * 1024
