import { readFileSync } from "node:fs"
import ExcelJS from "exceljs"
import { test, expect } from "./fixtures"
import type { ResourceDto } from "../../lib/resources/dto"

const storageConfigured = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
].every((key) => !!process.env[key]?.trim())

test("preview uploaded Word, Excel and text files, switch sheets, and recover from unavailable previews", async ({
  page,
  testAccount,
}, testInfo) => {
  test.skip(
    !storageConfigured,
    "Real preview coverage requires R2 storage credentials."
  )
  expect(testAccount.id).toBeTruthy()
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet("Budget").addRows([
    ["Revenue", "Amount"],
    ["Sales", 1500],
  ])
  workbook.addWorksheet("Summary").getCell("A1").value = "Quarterly total"
  const fixtures = [
    {
      name: "preview-budget.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: Buffer.from(await workbook.xlsx.writeBuffer()),
    },
    {
      name: "preview-brief.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: readFileSync(
        new URL("../fixtures/resource-preview.docx", import.meta.url)
      ),
    },
    {
      name: "preview-document.pdf",
      mime: "application/pdf",
      bytes: readFileSync(
        new URL("../fixtures/resource-preview.pdf", import.meta.url)
      ),
    },
    {
      name: "preview-data.csv",
      mime: "text/csv",
      bytes: Buffer.from('Name,Notes\nAlex,"Quoted, value"'),
    },
    {
      name: "preview-text.txt",
      mime: "text/plain",
      bytes: Buffer.from("<script>Literal text, never executed</script>"),
    },
    {
      name: "preview-legacy.doc",
      mime: "application/msword",
      bytes: Buffer.from("legacy format"),
    },
    {
      name: "preview-slides.pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      bytes: Buffer.from("presentation fallback"),
    },
  ]
  const resources: ResourceDto[] = []
  for (const file of fixtures) {
    const pending = await page.request.post("/api/v1/uploads", {
      data: { name: file.name, mime: file.mime, size: file.bytes.length },
    })
    expect(pending.ok(), await pending.text()).toBe(true)
    const upload = await pending.json()
    const stored = await page.request.put(upload.uploadUrl, {
      headers: upload.headers,
      data: file.bytes,
    })
    expect(stored.ok(), await stored.text()).toBe(true)
    const complete = await page.request.post(
      `/api/v1/uploads/${upload.fileId}/complete`,
      { data: {} }
    )
    expect(complete.ok(), await complete.text()).toBe(true)
    resources.push(await complete.json())
  }
  await page.goto("/resources")
  for (const resource of resources) {
    const item = page
      .locator("[data-item-menu]")
      .filter({ has: page.getByText(resource.title!, { exact: true }) })
    await item.click({ button: "right" })
    await page.getByRole("menuitem", { name: "Preview", exact: true }).click()
    const dialog = page.getByRole("dialog", {
      name: resource.title!,
      exact: true,
    })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "Download", exact: true })
    ).toHaveAttribute("href", resource.file!.downloadUrl)
    if (resource.file!.name.endsWith(".xlsx")) {
      await expect(dialog.getByRole("table")).toContainText("Sales", {
        timeout: 90_000,
      })
      await dialog.getByRole("tab", { name: "Summary", exact: true }).click()
      await expect(dialog.getByRole("table")).toContainText("Quarterly total")
      expect(
        (await dialog.getByRole("tabpanel").boundingBox())!.height
      ).toBeGreaterThan(300)
      await dialog.screenshot({
        path: testInfo.outputPath("spreadsheet-preview.png"),
      })
    } else if (resource.file!.name.endsWith(".docx")) {
      await expect(dialog.getByRole("article")).toContainText(
        "Resource preview brief",
        { timeout: 90_000 }
      )
      await dialog.getByRole("button", { name: "Zoom in", exact: true }).click()
      await expect(dialog.getByText("125%", { exact: true })).toBeVisible()
      await dialog.screenshot({ path: testInfo.outputPath("word-preview.png") })
      await page.setViewportSize({ width: 390, height: 844 })
      const bounds = await dialog.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.width).toBeLessThanOrEqual(390)
      await expect(
        dialog.getByRole("button", { name: "Zoom out", exact: true })
      ).toBeVisible()
      await dialog.screenshot({
        path: testInfo.outputPath("word-preview-mobile.png"),
      })
      await page.setViewportSize({ width: 1440, height: 900 })
    } else if (resource.file!.name.endsWith(".pdf")) {
      await expect(dialog.locator("iframe")).toHaveAttribute(
        "src",
        resource.file!.url
      )
      expect(
        (await dialog.locator("iframe").boundingBox())!.height
      ).toBeGreaterThan(300)
    } else if (resource.file!.name.endsWith(".csv")) {
      await expect(dialog.getByRole("table")).toContainText("Quoted, value")
    } else if (resource.file!.name.endsWith(".txt")) {
      await expect(dialog.locator("pre")).toContainText(
        "<script>Literal text, never executed</script>"
      )
    } else if (resource.file!.name.endsWith(".doc")) {
      await expect(dialog.getByRole("alert")).toContainText(".docx")
      await expect(
        dialog.getByRole("button", { name: "Retry preview", exact: true })
      ).toBeVisible()
    } else {
      await expect(
        dialog.getByText("Download this presentation", { exact: false })
      ).toBeVisible()
    }
    await dialog
      .getByRole("button", { name: "Resource details", exact: true })
      .click()
    await expect(dialog.locator("#resource-preview-details")).toBeVisible()
    await dialog.locator('[data-slot="dialog-close"]').click()
    await expect(dialog).toHaveCount(0)
  }
})
