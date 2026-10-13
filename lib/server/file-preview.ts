import "server-only"

import sanitizeHtml from "sanitize-html"
import {
  fileExtension,
  filePreviewKind,
  MAX_PREVIEW_BYTES,
  type ParsedFilePreview,
  type PreviewSheet,
} from "@/lib/resources/preview"

const MAX_ROWS = 500
const MAX_COLUMNS = 50

/** Quoted delimiters, escaped quotes and multiline cells, with bounded output. */
export function delimitedPreview(
  text: string,
  delimiter: string
): PreviewSheet {
  const rows: string[][] = []
  let row: string[] = [],
    cell = "",
    quoted = false,
    hasRecord = false,
    clipped = false,
    columns = 0,
    count = 0
  const pushCell = () => {
    if (row.length < MAX_COLUMNS) row.push(cell.slice(0, 2000))
    cell = ""
    columns++
  }
  const pushRow = () => {
    pushCell()
    count++
    if (rows.length < MAX_ROWS) rows.push(row)
    row = []
    columns = 0
    hasRecord = false
  }
  let columnCount = 0
  text = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char !== "\r" && char !== "\n") hasRecord = true
    if (char === '"' && (quoted || !cell)) {
      if (quoted && text[i + 1] === '"') {
        if (cell.length < 2000) cell += '"'
        else clipped = true
        i++
      } else quoted = !quoted
    } else if (char === delimiter && !quoted) pushCell()
    else if ((char === "\n" || char === "\r") && !quoted) {
      columnCount = Math.max(columnCount, columns + 1)
      pushRow()
      if (char === "\r" && text[i + 1] === "\n") i++
    } else if (cell.length < 2000) cell += char
    else clipped = true
  }
  if (quoted) throw new Error("This file has an unfinished quoted cell.")
  if (hasRecord || cell || row.length || columns) {
    columnCount = Math.max(columnCount, columns + 1)
    pushRow()
  }
  return {
    name: "Sheet 1",
    rows,
    rowCount: count,
    columnCount,
    truncated: clipped || count > MAX_ROWS || columnCount > MAX_COLUMNS,
  }
}

export function sanitizeDocument(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "strong",
      "em",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "a",
      "sup",
      "sub",
      "hr",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  })
}

export async function parseFilePreview(
  bytes: Buffer,
  mime: string,
  name: string
): Promise<ParsedFilePreview> {
  if (bytes.byteLength > MAX_PREVIEW_BYTES)
    throw new Error(
      "Inline previews support files up to 10 MB. Download this file to view it."
    )
  const kind = filePreviewKind(mime, name)
  const ext = fileExtension(name)
  if (kind === "text") {
    const text = bytes.toString("utf8")
    return {
      kind: "text",
      text: text.slice(0, 200_000),
      truncated: text.length > 200_000,
    }
  }
  if (kind === "document") {
    if (
      ext !== "docx" &&
      mime !==
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
      throw new Error(
        "Inline Word preview supports .docx files. Download this file or save it as .docx."
      )
    const mammoth = await import("mammoth")
    const result = await mammoth.convertToHtml(
      { buffer: bytes },
      {
        externalFileAccess: false,
        convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
      }
    )
    return { kind: "document", html: sanitizeDocument(result.value) }
  }
  if (kind === "spreadsheet") {
    if (ext === "csv" || ext === "tsv" || /csv|tab-separated/.test(mime))
      return {
        kind: "spreadsheet",
        sheets: [
          delimitedPreview(
            bytes.toString("utf8"),
            ext === "tsv" || mime.includes("tab-separated") ? "\t" : ","
          ),
        ],
      }
    if (
      !/^(xlsx|xlsm)$/.test(ext) &&
      !/openxmlformats-officedocument.spreadsheetml|macroEnabled/.test(mime)
    )
      throw new Error(
        "Inline Excel preview supports .xlsx, .xlsm, .csv and .tsv. Download this file or save it as .xlsx."
      )
    const { default: ExcelJS } = await import("exceljs")
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(
      bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]
    )
    if (!workbook.worksheets.length || workbook.worksheets.length > 30)
      throw new Error("Preview supports workbooks with 1–30 sheets.")
    const sheets = workbook.worksheets.map((sheet): PreviewSheet => {
      const rowCount = sheet.rowCount,
        columnCount = sheet.columnCount
      let clipped = false
      const rows = Array.from(
        { length: Math.min(rowCount, MAX_ROWS) },
        (_, r) =>
          Array.from({ length: Math.min(columnCount, MAX_COLUMNS) }, (_, c) => {
            const cell = sheet.getCell(r + 1, c + 1)
            // Cached formula results only; never execute workbook formulas or macros.
            const value =
              cell.value instanceof Date
                ? cell.value.toISOString().slice(0, 10)
                : cell.text
            if (value.length > 2000) clipped = true
            return value.slice(0, 2000)
          })
      )
      return {
        name: sheet.name,
        rows,
        rowCount,
        columnCount,
        truncated: clipped || rowCount > MAX_ROWS || columnCount > MAX_COLUMNS,
      }
    })
    return { kind: "spreadsheet", sheets }
  }
  throw new Error("This file type does not have an inline preview.")
}
