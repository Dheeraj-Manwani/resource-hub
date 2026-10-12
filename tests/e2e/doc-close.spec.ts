import { test, expect } from "./fixtures"
import { createWorkbook } from "../../lib/docs/workbook"
import { createDrawing } from "../../lib/docs/drawing"

for (const kind of ["spreadsheet", "drawing"] as const) {
  test(`${kind} Escape closes clean and reverted docs, but protects pending and failed edits`, async ({
    page,
    testAccount,
  }) => {
    void testAccount
    page.on("console", (message) => {
      if (message.text().startsWith("doc ")) console.log(message.text())
    })
    const title = `Saved ${kind}`
    const response = await page.request.post("/api/v1/quick-notes", {
      data: {
        kind,
        title,
        bodyJson: kind === "spreadsheet" ? createWorkbook() : createDrawing(),
      },
    })
    expect(response.ok()).toBe(true)
    const doc = await response.json()
    await page.goto("/docs")
    const editor = page.getByRole("dialog", {
      name: kind === "spreadsheet" ? "Spreadsheet doc" : "Drawing doc",
      exact: true,
    })
    const confirmation = page.getByRole("dialog", {
      name: `Close ${kind}?`,
      exact: true,
    })
    async function open() {
      await page
        .getByRole("button", { name: new RegExp(title) })
        .filter({
          has: page.getByRole("heading", { name: title, exact: true }),
        })
        .click()
      await expect(
        editor.getByRole("button", { name: "Save", exact: true })
      ).toBeEnabled({ timeout: 90_000 })
      await expect(editor.getByRole("status")).toHaveText("Saved")
    }
    async function closeClean() {
      await page.keyboard.press("Escape")
      await expect(editor).toHaveCount(0)
      await expect(confirmation).toHaveCount(0)
    }
    await open()
    if (kind === "spreadsheet") {
      await page
        .getByLabel("Editable spreadsheet")
        .locator("canvas[data-u-unit-id]")
        .first()
        .click({ position: { x: 100, y: 60 } })
    } else {
      await page
        .locator(".excalidraw canvas.interactive")
        .click({ position: { x: 400, y: 300 } })
    }
    await closeClean()
    expect(
      (await (await page.request.get(`/api/v1/docs/${doc.id}`)).json()).revision
    ).toBe(doc.revision)

    await open()
    for (const name of [`Import ${kind}`, "Version history"]) {
      await editor
        .getByRole("button", {
          name: name === "Version history" ? "History" : "Import",
          exact: true,
        })
        .click()
      const popup = page.getByRole("dialog", { name, exact: true })
      await expect(popup).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(popup).toHaveCount(0)
      await expect(editor).toBeVisible()
      await expect(confirmation).toHaveCount(0)
    }
    await page.getByLabel("Document title").fill("Reverted edit")
    await page.getByLabel("Document title").fill(title)
    await expect(editor.getByRole("status")).toHaveText("Saved")
    await closeClean()

    // Failed autosaves keep pending edits deterministic throughout this check.
    let attemptedBodyText = ""
    await page.route(`**/api/v1/quick-notes/${doc.id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue()
      attemptedBodyText = route.request().postDataJSON().bodyText
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Test save failure" } }),
      })
    })
    await open()
    if (kind === "spreadsheet") {
      const grid = page
        .getByLabel("Editable spreadsheet")
        .locator("canvas[data-u-unit-id]")
        .first()
      await grid.click({ position: { x: 100, y: 60 } })
      await page.keyboard.type("Pending cell")
    } else {
      const canvas = page.locator(".excalidraw canvas.interactive")
      await canvas.click({ position: { x: 400, y: 300 } })
      await page.keyboard.press("t")
      await canvas.click({ position: { x: 400, y: 300 } })
      await page.locator("textarea.excalidraw-wysiwyg").fill("Pending text")
    }
    await page.keyboard.press("Escape")
    await expect(confirmation).toBeVisible()
    await confirmation
      .getByRole("button", { name: "Save & close", exact: true })
      .click()
    await expect(confirmation.getByRole("alert")).toContainText(
      "Test save failure"
    )
    expect(attemptedBodyText).toContain(
      kind === "spreadsheet" ? "Pending cell" : "Pending text"
    )
    await expect(confirmation).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(confirmation).toHaveCount(0)
    await expect(editor).toBeVisible()
    await expect(editor.getByRole("status")).toHaveText("Save failed")
    await editor.getByRole("button", { name: "Close", exact: true }).click()
    await expect(confirmation).toBeVisible()
    await confirmation
      .getByRole("button", {
        name: "Close without saving pending edits",
        exact: true,
      })
      .click()
    await expect(editor).toHaveCount(0)
    expect(
      (await (await page.request.get(`/api/v1/docs/${doc.id}`)).json()).revision
    ).toBe(doc.revision)

    await page.unroute(`**/api/v1/quick-notes/${doc.id}`)
    await open()
    await page.getByLabel("Document title").fill(`${title} updated`)
    await editor.getByRole("button", { name: "Save", exact: true }).click()
    await expect(editor.getByRole("status")).toHaveText("Saved")
    await closeClean()
    const saved = await (
      await page.request.get(`/api/v1/docs/${doc.id}`)
    ).json()
    expect(saved.title).toBe(`${title} updated`)
  })
}
