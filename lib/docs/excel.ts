import ExcelJS from "exceljs"
import type {
  ICellData,
  IWorkbookData,
  IWorksheetData,
  IStyleData,
} from "@univerjs/presets"
import { createWorkbook, workbookSchema } from "./workbook"

/** Deliberately bounded interchange for ordinary trackers, not lossless Office conversion. */
export async function importExcel(
  bytes: ArrayBuffer
): Promise<Partial<IWorkbookData>> {
  if (bytes.byteLength > 10_000_000)
    throw new Error("Choose an Excel file smaller than 10 MB.")
  const source = new ExcelJS.Workbook()
  await source.xlsx.load(bytes)
  if (!source.worksheets.length || source.worksheets.length > 30)
    throw new Error("Use a workbook with 1–30 sheets.")
  const workbook = createWorkbook()
  workbook.sheetOrder = []
  workbook.sheets = {}
  let count = 0
  for (const sheet of source.worksheets) {
    if (sheet.rowCount > 100_000 || sheet.columnCount > 1_000)
      throw new Error("This sheet is too large.")
    const id = `sheet${sheet.id}`
    const cellData: IWorksheetData["cellData"] = {}
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, column) => {
        if (++count > 50_000)
          throw new Error("Import supports up to 50,000 filled cells.")
        const data: ICellData = {}
        const value = cell.value
        if (cell.formula) {
          data.f = `=${cell.formula}`
          data.v =
            typeof cell.result === "number" || typeof cell.result === "string"
              ? cell.result
              : undefined
        } else if (value instanceof Date)
          data.v = value.toISOString().slice(0, 10)
        else if (
          typeof value === "number" ||
          typeof value === "boolean" ||
          typeof value === "string"
        )
          data.v = value
        else data.v = cell.text
        const style: IStyleData = {}
        if (cell.font?.bold) style.bl = 1
        if (cell.font?.italic) style.it = 1
        if (cell.font?.color?.argb)
          style.cl = { rgb: `#${cell.font.color.argb.slice(-6)}` }
        if (cell.fill?.type === "pattern" && cell.fill.fgColor?.argb)
          style.bg = { rgb: `#${cell.fill.fgColor.argb.slice(-6)}` }
        if (cell.numFmt && cell.numFmt !== "General")
          style.n = { pattern: cell.numFmt }
        if (Object.keys(style).length) data.s = style
        cellData[rowNumber - 1] ??= {}
        cellData[rowNumber - 1][column - 1] = data
      })
    })
    workbook.sheetOrder.push(id)
    workbook.sheets[id] = {
      id,
      name: sheet.name,
      rowCount: Math.max(500, sheet.rowCount + 20),
      columnCount: Math.max(26, sheet.columnCount + 2),
      cellData,
      defaultColumnWidth: 150,
      defaultRowHeight: 26,
    }
  }
  workbookSchema.parse(workbook)
  return workbook
}

export async function exportExcel(
  snapshot: IWorkbookData
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  for (const id of snapshot.sheetOrder) {
    const source = snapshot.sheets[id]
    if (!source) continue
    const sheet = workbook.addWorksheet(source.name)
    for (const [r, row] of Object.entries(source.cellData ?? {})) {
      for (const [c, data] of Object.entries(row) as [
        string,
        ICellData | null,
      ][]) {
        if (!data) continue
        const cell = sheet.getCell(Number(r) + 1, Number(c) + 1)
        if (data.f)
          cell.value = {
            formula: data.f.replace(/^=/, ""),
            result:
              typeof data.v === "number" || typeof data.v === "string"
                ? data.v
                : undefined,
          }
        else cell.value = data.p?.body?.dataStream?.trimEnd() ?? data.v ?? null
        const style =
          typeof data.s === "string" ? snapshot.styles?.[data.s] : data.s
        if (style) {
          cell.font = {
            bold: style.bl === 1,
            italic: style.it === 1,
            ...(style.cl?.rgb
              ? { color: { argb: `FF${style.cl.rgb.replace("#", "")}` } }
              : {}),
          }
          if (style.bg?.rgb)
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: `FF${style.bg.rgb.replace("#", "")}` },
            }
          if (style.n?.pattern) cell.numFmt = style.n.pattern
        }
      }
    }
    for (const merge of source.mergeData ?? [])
      sheet.mergeCells(
        merge.startRow + 1,
        merge.startColumn + 1,
        merge.endRow + 1,
        merge.endColumn + 1
      )
    sheet.columns.forEach((col, index) => {
      col.width =
        (source.columnData?.[index]?.w ?? source.defaultColumnWidth ?? 150) / 7
    })
    if (source.freeze?.ySplit)
      sheet.views = [{ state: "frozen", ySplit: source.freeze.ySplit }]
  }
  workbook.calcProperties.fullCalcOnLoad = true
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}

export function downloadFile(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = name.replace(/[<>:"/\\|?*]/g, "_")
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
