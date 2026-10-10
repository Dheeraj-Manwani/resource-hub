import { test, expect } from "./fixtures"
import { createWorkbook } from "../../lib/docs/workbook"

test("Docs preserves text, saves spreadsheets, prevents stale writes and restores deleted docs", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const original = await page.request.post("/api/v1/quick-notes", {
    data: {
      title: "Existing text",
      bodyJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Keep this text" }],
          },
        ],
      },
      bodyText: "Keep this text",
    },
  })
  expect(original.ok()).toBe(true)
  await page.goto("/quick-notes")
  await expect(page).toHaveURL(/\/docs$/, { timeout: 90_000 })
  await expect(
    page.getByRole("heading", { name: "Docs", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Existing text" }).click()
  await expect(page.locator(".tiptap")).toContainText("Keep this text")
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await page
    .getByRole("button", { name: "New doc", exact: true })
    .first()
    .click()
  await page
    .getByRole("button", {
      name: "Job tracker — start with application columns",
    })
    .click()
  await expect(page.getByLabel("Document title")).toHaveValue("Job tracker")
  await expect(
    page.getByRole("button", { name: "Save", exact: true })
  ).toBeEnabled({ timeout: 90_000 })
  await expect(page.locator("canvas").first()).toBeVisible()
  const grid = page
    .getByLabel("Editable spreadsheet")
    .locator("canvas[data-u-unit-id]")
    .first()
  await grid.click({ position: { x: 100, y: 60 } })
  await page.keyboard.type("Company entered in the grid")
  await page.keyboard.press("Enter")
  await page.getByLabel("Document title").fill("Applications 2026")
  await expect(
    page
      .getByRole("dialog", { name: "Spreadsheet doc", exact: true })
      .getByRole("status")
  ).toHaveText("Saved")
  await page.screenshot({
    path: "test-results/docs-spreadsheet.png",
    fullPage: true,
  })
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await expect(
    page.getByRole("dialog", { name: "Spreadsheet doc", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("dialog", { name: "Close spreadsheet?", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("heading", { name: "Applications 2026" })
  ).toBeVisible()
  const listed = await (await page.request.get("/api/v1/quick-notes")).json()
  const doc = listed.items.find(
    (item: { title: string }) => item.title === "Applications 2026"
  )
  expect(doc.kind).toBe("spreadsheet")
  expect(doc.bodyJson.sheets.sheet1.cellData[0][0].v).toBe("Company")
  expect(doc.bodyJson.sheets.sheet1.cellData[1][0].v).toBe(
    "Company entered in the grid"
  )
  const updatedBook = structuredClone(doc.bodyJson)
  updatedBook.sheets.sheet1.cellData[1] = {
    0: { v: "Acme" },
    1: { v: "Engineer" },
  }
  const updated = await page.request.patch(`/api/v1/quick-notes/${doc.id}`, {
    data: { bodyJson: updatedBook, expectedRevision: doc.revision },
  })
  expect(updated.ok()).toBe(true)
  const stale = await page.request.patch(`/api/v1/quick-notes/${doc.id}`, {
    data: { bodyJson: doc.bodyJson, expectedRevision: doc.revision },
  })
  expect(stale.status()).toBe(409)
  await page.reload()
  await page
    .getByRole("button", { name: /Applications 2026/ })
    .first()
    .click()
  await expect(
    page.getByRole("button", { name: "Save", exact: true })
  ).toBeEnabled({ timeout: 90_000 })
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export Excel" }).click()
  const excel = await download
  expect(excel.suggestedFilename()).toBe("Applications 2026.xlsx")
  const excelPath = testInfo.outputPath("applications.xlsx")
  await excel.saveAs(excelPath)
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await page.getByLabel("Spreadsheet file").setInputFiles(excelPath)
  await expect(
    page.getByRole("dialog", { name: "Import spreadsheet", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Save", exact: true })
  ).toBeEnabled()
  await page
    .getByLabel("Editable spreadsheet")
    .locator("canvas[data-u-unit-id]")
    .first()
    .click({ position: { x: 100, y: 86 } })
  await page.keyboard.type("Pending cell saved")
  await page.keyboard.press("Control+s")
  await expect(
    page
      .getByRole("dialog", { name: "Spreadsheet doc", exact: true })
      .getByRole("status")
  ).toHaveText("Saved")
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await expect(
    page.getByRole("dialog", { name: "Spreadsheet doc", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("dialog", { name: "Close spreadsheet?", exact: true })
  ).toHaveCount(0)
  expect(
    (await page.request.delete(`/api/v1/quick-notes/${doc.id}`)).ok()
  ).toBe(true)
  expect((await page.request.get(`/api/v1/docs/${doc.id}`)).status()).toBe(404)
  expect(
    (
      await page.request.post("/api/v1/docs/trash", { data: { id: doc.id } })
    ).ok()
  ).toBe(true)
  const restored = await (
    await page.request.get(`/api/v1/docs/${doc.id}`)
  ).json()
  expect(restored.bodyJson.sheets.sheet1.cellData[1][0].v).toBe("Acme")
  expect(restored.bodyJson.sheets.sheet1.cellData[2][0].v).toBe(
    "Pending cell saved"
  )
  const versions = await (
    await page.request.get(`/api/v1/docs/${doc.id}/versions`)
  ).json()
  expect(versions.items.length).toBeGreaterThan(0)
  expect(
    (
      await page.request.post(`/api/v1/docs/${doc.id}/versions`, {
        data: { revision: 0, expectedRevision: restored.revision },
      })
    ).ok()
  ).toBe(true)
  const exported = await (await page.request.get("/api/v1/export")).json()
  expect(exported.docs.some((item: { id: string }) => item.id === doc.id)).toBe(
    true
  )
})

test("spreadsheet payloads are validated", async ({ page, testAccount }) => {
  void testAccount
  expect(
    (
      await page.request.post("/api/v1/quick-notes", {
        data: { kind: "spreadsheet", expectedRevision: 1 },
      })
    ).status()
  ).toBe(400)
  expect(
    (
      await page.request.post("/api/v1/quick-notes", {
        data: { kind: "spreadsheet", bodyJson: {} },
      })
    ).status()
  ).toBe(400)
  const payload = {
    kind: "spreadsheet",
    bodyJson: createWorkbook(),
    clientId: crypto.randomUUID(),
  }
  const created = await page.request.post("/api/v1/quick-notes", {
    data: payload,
  })
  expect(created.ok()).toBe(true)
  const doc = await created.json()
  const retried = await page.request.post("/api/v1/quick-notes", {
    data: payload,
  })
  expect(retried.ok()).toBe(true)
  expect((await retried.json()).id).toBe(doc.id)
  expect(
    (await (await page.request.get("/api/v1/quick-notes")).json()).items
  ).toHaveLength(1)
  expect(
    (
      await page.request.patch(`/api/v1/quick-notes/${doc.id}`, {
        data: { kind: "text" },
      })
    ).status()
  ).toBe(400)
})
