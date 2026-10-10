import { test, expect } from "./fixtures"
import { write } from "./helpers"
import { createWorkbook } from "../../lib/docs/workbook"
import { createDrawing } from "../../lib/docs/drawing"

for (const kind of ["spreadsheet", "drawing"] as const) {
  test(`${kind} waits for a minute of inactivity but saves immediately on request`, async ({
    page,
    testAccount,
  }) => {
    void testAccount
    const title = `Slow autosave ${kind}`
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
    await page.getByRole("button", { name: new RegExp(title) }).click()
    const editor = page.getByRole("dialog", {
      name: kind === "spreadsheet" ? "Spreadsheet doc" : "Drawing doc",
      exact: true,
    })
    await expect(
      editor.getByRole("button", { name: "Save", exact: true })
    ).toBeEnabled({ timeout: 90_000 })
    await expect(editor.getByRole("status")).toHaveText("Saved")
    let writes = 0
    page.on("request", (request) => {
      if (
        request.method() === "PATCH" &&
        new URL(request.url()).pathname === `/api/v1/quick-notes/${doc.id}`
      )
        writes++
    })
    await page.clock.install()
    await page.getByLabel("Document title").fill(`${title} first edit`)
    await page.clock.fastForward(55_000)
    expect(writes).toBe(0)
    await page.getByLabel("Document title").fill(`${title} latest edit`)
    await page.clock.fastForward(55_000)
    expect(writes).toBe(0)
    await expect(editor.getByRole("status")).toHaveText("Unsaved changes")
    await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
      page.clock.fastForward(5_000)
    )
    await expect(editor.getByRole("status")).toHaveText("Saved")
    expect(writes).toBe(1)
    await page.clock.fastForward(120_000)
    expect(writes).toBe(1)

    await page.getByLabel("Document title").fill(`${title} manual save`)
    await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
      page.keyboard.press("Control+s")
    )
    await expect(editor.getByRole("status")).toHaveText("Saved")
    expect(writes).toBe(2)
    await page.getByLabel("Document title").fill(`${title} close save`)
    const warnsOnUnload = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(warnsOnUnload).toBe(true)
    await editor.getByRole("button", { name: "Close", exact: true }).click()
    const confirmation = page.getByRole("dialog", {
      name: `Close ${kind}?`,
      exact: true,
    })
    await expect(confirmation).toBeVisible()
    await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
      confirmation
        .getByRole("button", { name: "Save & close", exact: true })
        .click()
    )
    await expect(editor).toHaveCount(0)
    expect(writes).toBe(3)
    const saved = await (
      await page.request.get(`/api/v1/docs/${doc.id}`)
    ).json()
    expect(saved.title).toBe(`${title} close save`)
  })
}
