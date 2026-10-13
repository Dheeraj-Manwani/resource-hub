import { test, expect } from "./fixtures"
import { write } from "./helpers"
import { createWorkbook } from "../../lib/docs/workbook"

test("text and spreadsheet themes switch without losing edits and are remembered on reopen", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const textResponse = await page.request.post("/api/v1/quick-notes", {
    data: {
      kind: "text",
      title: "Text theme test",
      bodyText: "Keep this text",
      bodyJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Keep this text" }],
          },
        ],
      },
    },
  })
  expect(textResponse.ok()).toBe(true)
  const textDoc = await textResponse.json()
  const sheetResponse = await page.request.post("/api/v1/quick-notes", {
    data: {
      kind: "spreadsheet",
      title: "Sheet theme test",
      bodyJson: createWorkbook(),
    },
  })
  expect(sheetResponse.ok()).toBe(true)
  const sheetDoc = await sheetResponse.json()
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Text theme test", exact: true })
    .click()
  const textDialog = page.getByRole("dialog", {
    name: "Edit text doc",
    exact: true,
  })
  const editor = textDialog.locator(".tiptap")
  await expect(editor).toContainText("Keep this text")
  await editor.click()
  await page.keyboard.press("Control+End")
  await page.keyboard.type(" plus unsaved edits")
  await textDialog
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click()
  await expect(textDialog).toHaveAttribute("data-document-theme", "light")
  await expect(editor).toHaveCSS("color", "rgb(24, 24, 27)")
  await expect(editor).toContainText("Keep this text plus unsaved edits")
  await textDialog.screenshot({ path: testInfo.outputPath("text-light.png") })
  await textDialog
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click()
  await expect(editor).toHaveCSS("color", "rgb(245, 245, 244)")
  await expect(editor).toContainText("Keep this text plus unsaved edits")
  await textDialog
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click()
  await textDialog
    .getByRole("button", { name: "Full screen", exact: true })
    .click()
  await expect(
    textDialog.getByRole("button", { name: "Switch to dark mode", exact: true })
  ).toBeVisible()
  await textDialog
    .getByRole("button", { name: "Exit full screen", exact: true })
    .click()
  await write(page, "PATCH", `/quick-notes/${textDoc.id}`, () =>
    textDialog.getByRole("button", { name: "Save", exact: true }).click()
  )
  await expect(textDialog).toHaveCount(0)
  await page
    .getByRole("heading", { name: "Text theme test", exact: true })
    .click()
  await expect(textDialog).toHaveAttribute("data-document-theme", "light")
  await expect(editor).toContainText("Keep this text plus unsaved edits")
  await textDialog.getByRole("button", { name: "Cancel", exact: true }).click()

  await page
    .getByRole("heading", { name: "Sheet theme test", exact: true })
    .click()
  const sheetDialog = page.getByRole("dialog", {
    name: "Spreadsheet doc",
    exact: true,
  })
  await expect(
    sheetDialog.getByRole("button", { name: "Save", exact: true })
  ).toBeEnabled({ timeout: 90_000 })
  const grid = sheetDialog
    .getByLabel("Editable spreadsheet")
    .locator("canvas[data-u-unit-id]")
    .first()
  const unit = await grid.getAttribute("data-u-unit-id")
  await grid.click({ position: { x: 100, y: 60 } })
  await page.keyboard.type("Pending cell survives theme changes")
  // Toggle while the cell is still being edited, before Enter or Save.
  await sheetDialog
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click()
  await expect(sheetDialog).toHaveAttribute("data-document-theme", "light")
  await expect(grid).toHaveAttribute("data-u-unit-id", unit!)
  await sheetDialog.screenshot({
    path: testInfo.outputPath("spreadsheet-light.png"),
  })
  await sheetDialog
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click()
  await expect(sheetDialog).toHaveAttribute("data-document-theme", "dark")
  await sheetDialog
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click()
  await write(page, "PATCH", `/quick-notes/${sheetDoc.id}`, () =>
    sheetDialog.getByRole("button", { name: "Save", exact: true }).click()
  )
  await expect(sheetDialog.getByRole("status")).toHaveText("Saved")
  const saved = await (
    await page.request.get(`/api/v1/docs/${sheetDoc.id}`)
  ).json()
  expect(saved.bodyText).toContain("Pending cell survives theme changes")
  await sheetDialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(sheetDialog).toHaveCount(0)
  await page
    .getByRole("heading", { name: "Sheet theme test", exact: true })
    .click()
  await expect(sheetDialog).toHaveAttribute("data-document-theme", "light")
  await expect(
    sheetDialog.getByRole("button", { name: "Close", exact: true })
  ).toBeEnabled({ timeout: 90_000 })
  await sheetDialog.getByRole("button", { name: "Close", exact: true }).click()
})
