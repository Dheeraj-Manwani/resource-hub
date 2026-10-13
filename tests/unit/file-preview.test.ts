import { readFileSync } from "node:fs"
import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { filePreviewKind, MAX_PREVIEW_BYTES } from "@/lib/resources/preview"
import {
  delimitedPreview,
  parseFilePreview,
  sanitizeDocument,
} from "@/lib/server/file-preview"

describe("resource file previews", () => {
  it("detects formats from MIME or filenames and URL paths with queries", () => {
    expect(filePreviewKind("application/octet-stream", "budget.XLSX")).toBe(
      "spreadsheet"
    )
    expect(filePreviewKind("application/pdf; charset=binary", "file")).toBe(
      "pdf"
    )
    expect(
      filePreviewKind("", "https://example.com/brief.PDF?download=1#page=2")
    ).toBe("pdf")
    expect(filePreviewKind("text/tab-separated-values", "data")).toBe(
      "spreadsheet"
    )
    expect(filePreviewKind("", "slides.pptx")).toBe("presentation")
    expect(filePreviewKind("", "bundle.zip")).toBe("archive")
    expect(filePreviewKind("", "clip.webm")).toBe("video")
    expect(filePreviewKind("", "sound.mp3")).toBe("audio")
    expect(filePreviewKind("", "script.ts")).toBe("text")
    expect(filePreviewKind("", "file.bin")).toBe("unsupported")
  })

  it("reads DOCX paragraphs, emphasis and tables", async () => {
    const bytes = readFileSync(
      new URL("../fixtures/resource-preview.docx", import.meta.url)
    )
    const result = await parseFilePreview(
      bytes,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "brief.docx"
    )
    expect(result.kind).toBe("document")
    if (result.kind !== "document") throw new Error("Expected document")
    expect(result.html).toContain("<strong>Resource preview brief</strong>")
    expect(result.html).toContain("<table>")
    expect(result.html).toContain("Alex")
  })

  it("removes active content and unsafe URLs from Word HTML", () => {
    const html = sanitizeDocument(
      '<p onclick="alert(1)">Safe</p><script>alert(1)</script><img src="https://tracker.test/pixel"><a href="javascript:alert(1)">bad</a><a href="https://example.com">good</a><iframe src="https://example.com"></iframe>'
    )
    expect(html).not.toMatch(/onclick|<script|<img|javascript:|<iframe/)
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it("reads multiple XLSX sheets, cached formulas, dates and empty cells", async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Budget")
    sheet.getCell("A1").value = "Revenue"
    sheet.getCell("C2").value = new Date("2026-10-13T00:00:00Z")
    sheet.getCell("B2").value = { formula: "1+2", result: 3 }
    workbook.addWorksheet("Empty")
    const result = await parseFilePreview(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "budget.xlsx"
    )
    if (result.kind !== "spreadsheet") throw new Error("Expected spreadsheet")
    expect(result.sheets.map((s) => s.name)).toEqual(["Budget", "Empty"])
    expect(result.sheets[0].rows).toEqual([
      ["Revenue", "", ""],
      ["", "3", "2026-10-13"],
    ])
    expect(result.sheets[1].rows).toEqual([])
  })

  it("reads quoted CSV, multiline cells, escaped quotes, BOMs and TSV", async () => {
    expect(
      delimitedPreview(
        '\uFEFFName,Notes,Value\r\n"Alex, Jr","Line 1\nLine ""2""",=1+2\r\n',
        ","
      ).rows
    ).toEqual([
      ["Name", "Notes", "Value"],
      ["Alex, Jr", 'Line 1\nLine "2"', "=1+2"],
    ])
    expect(
      (
        await parseFilePreview(
          Buffer.from("A\tB\n1\t2"),
          "text/tab-separated-values",
          "data.tsv"
        )
      ).kind
    ).toBe("spreadsheet")
    expect(() => delimitedPreview('"unfinished', ",")).toThrow("unfinished")
    expect(delimitedPreview('""', ",").rows).toEqual([[""]])
  })

  it("bounds table and text previews and rejects oversized and legacy Office input", async () => {
    const sheet = delimitedPreview(
      Array.from({ length: 502 }, () => Array(52).fill("cell").join(",")).join(
        "\n"
      ),
      ","
    )
    expect(sheet.rows).toHaveLength(500)
    expect(sheet.rows[0]).toHaveLength(50)
    expect(sheet.rowCount).toBe(502)
    expect(sheet.columnCount).toBe(52)
    expect(sheet.truncated).toBe(true)
    const text = await parseFilePreview(
      Buffer.from("x".repeat(200_001)),
      "text/plain",
      "text.txt"
    )
    expect(text).toEqual({
      kind: "text",
      text: "x".repeat(200_000),
      truncated: true,
    })
    await expect(
      parseFilePreview(
        Buffer.alloc(MAX_PREVIEW_BYTES + 1),
        "text/plain",
        "large.txt"
      )
    ).rejects.toThrow("10 MB")
    await expect(
      parseFilePreview(
        Buffer.from("legacy"),
        "application/msword",
        "legacy.doc"
      )
    ).rejects.toThrow(".docx")
    await expect(
      parseFilePreview(
        Buffer.from("legacy"),
        "application/vnd.ms-excel",
        "legacy.xls"
      )
    ).rejects.toThrow(".xlsx")
    await expect(
      parseFilePreview(
        Buffer.from("broken"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "broken.docx"
      )
    ).rejects.toThrow()
  })
})
