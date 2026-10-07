import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import type { IWorkbookData } from "@univerjs/presets"
import {
  createWorkbook,
  workbookSchema,
  workbookText,
} from "@/lib/docs/workbook"
import { importExcel, exportExcel } from "@/lib/docs/excel"

describe("Docs workbooks", () => {
  it("creates an empty job tracker with useful headers and a frozen header row", () => {
    const tracker = createWorkbook(true)
    expect(workbookSchema.safeParse(tracker).success).toBe(true)
    expect(tracker.sheets?.sheet1.cellData?.[0]?.[0]?.v).toBe("Company")
    expect(tracker.sheets?.sheet1.cellData?.[1]).toBeUndefined()
    expect(tracker.sheets?.sheet1.freeze?.ySplit).toBe(1)
    expect(workbookText(tracker)).toContain("Follow-up date")
  })
  it("rejects corrupt sheet references and oversized dimensions", () => {
    expect(
      workbookSchema.safeParse({ ...createWorkbook(), sheetOrder: ["missing"] })
        .success
    ).toBe(false)
    const book = createWorkbook()
    book.sheets!.sheet1.rowCount = 1_000_000
    expect(workbookSchema.safeParse(book).success).toBe(false)
  })
  it("imports multiple sheets, literal text, formulas, dates and basic formatting", async () => {
    const file = new ExcelJS.Workbook()
    const applications = file.addWorksheet("Applications")
    applications.getCell("A1").value = "Company"
    applications.getCell("A1").font = { bold: true }
    applications.getCell("A2").value = "Example Inc"
    applications.getCell("B2").value = "=literal, not formula"
    applications.getCell("C2").value = new Date("2026-10-07T00:00:00Z")
    const totals = file.addWorksheet("Totals")
    totals.getCell("A1").value = { formula: "1+2", result: 3 }
    const imported = await importExcel(
      (await file.xlsx.writeBuffer()) as ArrayBuffer
    )
    expect(imported.sheetOrder).toHaveLength(2)
    expect(workbookText(imported)).toContain("Example Inc")
    expect(imported.sheets!.sheet1.cellData?.[1]?.[2]?.v).toBe("2026-10-07")
    const exported = await exportExcel(imported as IWorkbookData)
    const roundtrip = new ExcelJS.Workbook()
    await roundtrip.xlsx.load(exported)
    expect(roundtrip.getWorksheet("Applications")!.getCell("A2").value).toBe(
      "Example Inc"
    )
    expect(roundtrip.getWorksheet("Applications")!.getCell("B2").value).toBe(
      "=literal, not formula"
    )
    expect(
      roundtrip.getWorksheet("Applications")!.getCell("A1").font.bold
    ).toBe(true)
    expect(roundtrip.getWorksheet("Totals")!.getCell("A1").formula).toBe("1+2")
  })
})
