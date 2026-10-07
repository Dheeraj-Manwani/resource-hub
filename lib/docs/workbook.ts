import { z } from "zod"
import type { IWorkbookData, ICellData } from "@univerjs/presets"

export const MAX_WORKBOOK_BYTES = 3_000_000
const sheetSchema = z
  .object({
    id: z.string().max(100),
    name: z.string().max(100),
    rowCount: z.number().int().min(1).max(100_000),
    columnCount: z.number().int().min(1).max(1_000),
    cellData: z
      .record(z.string(), z.record(z.string(), z.unknown()))
      .optional(),
  })
  .passthrough()
  .superRefine((sheet, ctx) => {
    for (const [r, row] of Object.entries(sheet.cellData ?? {})) {
      if (!/^\d+$/.test(r) || Number(r) >= sheet.rowCount) {
        ctx.addIssue({
          code: "custom",
          message: "Cell row is outside the worksheet.",
        })
        return
      }
      for (const [c, cell] of Object.entries(row)) {
        if (
          !/^\d+$/.test(c) ||
          Number(c) >= sheet.columnCount ||
          (cell !== null && (typeof cell !== "object" || Array.isArray(cell)))
        ) {
          ctx.addIssue({ code: "custom", message: "Invalid worksheet cell." })
          return
        }
      }
    }
  })
export const workbookSchema = z
  .object({
    id: z.string().max(100),
    name: z.string().max(200),
    sheetOrder: z.array(z.string()).min(1).max(30),
    sheets: z.record(z.string(), sheetSchema),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
      MAX_WORKBOOK_BYTES
    )
      ctx.addIssue({
        code: "custom",
        message: "This spreadsheet is too large (3 MB limit).",
      })
    if (
      new Set(value.sheetOrder).size !== value.sheetOrder.length ||
      value.sheetOrder.some(
        (id) => !value.sheets[id] || value.sheets[id].id !== id
      )
    )
      ctx.addIssue({ code: "custom", message: "Invalid worksheet order." })
  })

export function createWorkbook(jobTracker = false): Partial<IWorkbookData> {
  const headers = [
    "Company",
    "Role",
    "Status",
    "Applied date",
    "Follow-up date",
    "Job link",
    "Contact",
    "Location",
    "Salary",
    "Notes",
  ]
  const cellData: Record<number, Record<number, { v: string; s?: string }>> = {}
  if (jobTracker)
    cellData[0] = Object.fromEntries(
      headers.map((v, i) => [i, { v, s: "header" }])
    )
  return {
    id: crypto.randomUUID(),
    name: jobTracker ? "Job tracker" : "Spreadsheet",
    appVersion: "1.0.3",
    locale: "enUS" as IWorkbookData["locale"],
    styles: {
      header: { bl: 1, bg: { rgb: "#DBEAFE" }, cl: { rgb: "#172554" } },
    },
    sheetOrder: ["sheet1"],
    sheets: {
      sheet1: {
        id: "sheet1",
        name: jobTracker ? "Applications" : "Sheet 1",
        rowCount: 500,
        columnCount: 26,
        cellData,
        defaultColumnWidth: 150,
        defaultRowHeight: 26,
        ...(jobTracker
          ? { freeze: { startRow: 1, startColumn: -1, xSplit: 0, ySplit: 1 } }
          : {}),
      },
    },
  }
}

/** Search/preview text, bounded independently of the full saved workbook. */
export function workbookText(data: unknown): string {
  const workbook = data as Partial<IWorkbookData>
  const parts: string[] = []
  let length = 0
  for (const id of workbook.sheetOrder ?? []) {
    const sheet = workbook.sheets?.[id]
    if (!sheet) continue
    parts.push(sheet.name ?? "Sheet")
    for (const row of Object.values(sheet.cellData ?? {})) {
      for (const cell of Object.values(row) as (ICellData | null)[]) {
        const text = String(cell?.v ?? cell?.p?.body?.dataStream?.trim() ?? "")
        if (text) {
          parts.push(text)
          length += text.length
        }
        if (length > 50_000) return parts.join(" · ").slice(0, 50_000)
      }
    }
  }
  return parts.join(" · ")
}
