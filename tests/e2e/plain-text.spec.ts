import { test, expect } from "./fixtures"
import { write } from "./helpers"
import type { Locator, Page } from "@playwright/test"

const format = { type: "plainText", version: 1 }
const literal =
  "\n\n# Heading stays literal  \n\t- list stays literal\nhttps://example.com/test?q=1\n\ncafé हिन्दी 👋\t\n"
async function paste(
  editor: Locator,
  text: string,
  html = "<h1>Formatted paste</h1>"
) {
  await editor.focus()
  await editor.evaluate(
    (node, value) => {
      const data = new DataTransfer()
      data.setData("text/plain", value.text)
      data.setData("text/html", value.html)
      node.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        })
      )
    },
    { text, html }
  )
}
async function newText(page: Page) {
  await page
    .locator("main")
    .getByRole("button", { name: "New doc", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Text — write plain text", exact: true })
    .click()
  const dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  await expect(
    dialog.getByRole("textbox", { name: "Plain text content" })
  ).toBeVisible()
  return dialog
}
async function title(dialog: Locator, value: string) {
  await dialog.getByRole("button", { name: "Edit title", exact: true }).click()
  await dialog
    .getByRole("textbox", { name: "Document title", exact: true })
    .fill(value)
  await dialog
    .getByRole("textbox", { name: "Document title", exact: true })
    .press("Enter")
}
async function recoveryEntries(page: Page) {
  return page.evaluate(() =>
    Object.keys(sessionStorage).filter((key) =>
      key.startsWith("resource-hub:plain-text-draft:")
    )
  )
}

test("line navigation tracks blank lines and Unicode without changing saved content or undo history", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const text = "first\n\ne\u0301👨‍👩‍👧‍👦\t👍🏽\n" + "long line ".repeat(80) + "\n"
  const doc = await (
    await page.request.post("/api/v1/quick-notes", {
      data: { title: "Line navigation", bodyJson: format, bodyText: text },
    })
  ).json()
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Line navigation", exact: true })
    .click()
  const dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  const editor = dialog.getByRole("textbox", { name: "Plain text content" })
  const status = dialog.getByRole("group", { name: "Text position" })
  await expect(editor).toBeVisible()
  await expect(status).toContainText("Ln 1, Col 1")
  await expect(status).toContainText("5 lines")
  await expect(dialog.locator(".cm-lineNumbers")).toContainText("12345")
  await editor.press("Control+g")
  const panel = dialog.getByRole("form", { name: "Go to line", exact: true })
  const input = panel.getByRole("textbox", { name: "Go to line", exact: true })
  await expect(input).toBeFocused()
  for (const invalid of ["0", "6", "1.5"]) {
    await input.fill(invalid)
    await input.press("Enter")
    await expect(panel.getByRole("alert")).toHaveText(
      "Enter a whole line number from 1 to 5."
    )
    await expect(status).toContainText("Ln 1, Col 1")
  }
  await input.fill("2")
  await input.press("Enter")
  await expect(panel).toHaveCount(0)
  await expect(editor).toBeFocused()
  await expect(status).toContainText("Ln 2, Col 1")
  await expect(dialog.locator(".cm-activeLineGutter")).toHaveText("2")
  await expect(dialog.locator(".cm-activeLine")).toHaveText("")
  await editor.press("Control+g")
  await input.fill("3")
  await input.press("Enter")
  await editor.press("End")
  await expect(status).toContainText("Ln 3, Col 5")
  await editor.press("Shift+Home")
  await expect(status).toContainText("4 selected")
  await expect(status).toContainText("Ln 3, Col 1")
  await dialog
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click()
  await dialog.getByRole("button", { name: "Full screen", exact: true }).click()
  await expect(status).toContainText("4 selected")
  await dialog.screenshot({
    path: testInfo.outputPath("text-navigation-light.png"),
  })
  await status.getByRole("button", { name: /^Go to line/ }).click()
  await input.fill("5")
  await input.press("Escape")
  await expect(panel).toHaveCount(0)
  await expect(editor).toBeFocused()
  await expect(status).toContainText("4 selected")
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  expect(
    (await (await page.request.get(`/api/v1/docs/${doc.id}`)).json()).bodyText
  ).toBe(text)
  await editor.press("Control+End")
  await page.keyboard.type("Last")
  await expect(status).toContainText("Ln 5, Col 5")
  await editor.press("Control+g")
  await input.fill("2")
  await input.press("Enter")
  await editor.press("Control+z")
  await expect(editor).not.toContainText("Last")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await expect(status).toContainText("5 lines")
  await editor.press("Control+End")
  await editor.press("Enter")
  await expect(status).toContainText("6 lines")
  await editor.press("Control+z")
  await dialog
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(status).toContainText("5 lines")
  await status.getByRole("button", { name: /^Go to line/ }).click()
  await input.fill("4")
  await panel.getByRole("button", { name: "Go", exact: true }).click()
  await expect(status).toContainText("Ln 4, Col 1")
  await expect(dialog.locator(".cm-activeLineGutter")).toHaveText("4")
  await dialog.screenshot({
    path: testInfo.outputPath("text-navigation-mobile-dark.png"),
  })
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)
  ).toBe(true)
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test("Go to Line brings offscreen lines into view and fits on mobile", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  await page.request.post("/api/v1/quick-notes", {
    data: {
      title: "Long document",
      bodyJson: format,
      bodyText: Array.from(
        { length: 240 },
        (_, index) => `Line ${index + 1}`
      ).join("\n"),
    },
  })
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Long document", exact: true })
    .click()
  const dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  const editor = dialog.getByRole("textbox", { name: "Plain text content" })
  const status = dialog.getByRole("group", { name: "Text position" })
  const panel = dialog.getByRole("form", { name: "Go to line", exact: true })
  const input = panel.getByRole("textbox", { name: "Go to line", exact: true })
  await editor.press("Control+g")
  await input.fill("240")
  await input.press("Enter")
  await expect(status).toContainText("Ln 240, Col 1")
  await expect(dialog.locator(".cm-activeLine")).toHaveText("Line 240")
  await expect(dialog.locator(".cm-activeLine")).toBeInViewport()
  await expect
    .poll(() =>
      dialog.locator(".cm-scroller").evaluate((node) => node.scrollTop)
    )
    .toBeGreaterThan(1000)
  await editor.press("Control+g")
  await input.fill("1")
  await input.press("Enter")
  await expect(dialog.locator(".cm-activeLine")).toHaveText("Line 1")
  await expect
    .poll(() =>
      dialog.locator(".cm-scroller").evaluate((node) => node.scrollTop)
    )
    .toBeLessThan(24)
  await page.setViewportSize({ width: 390, height: 844 })
  await status.getByRole("button", { name: /^Go to line/ }).click()
  await expect(input).toBeFocused()
  await dialog.screenshot({
    path: testInfo.outputPath("go-to-line-mobile.png"),
  })
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)
  ).toBe(true)
  await panel.getByRole("button", { name: "Close", exact: true }).click()
  await expect(editor).toBeFocused()
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})

test("new Text docs preserve literal content, undo, themes, full screen, saves, projects and version snapshots", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const project = await (
    await page.request.post("/api/v1/projects", {
      data: { name: "Text workspace" },
    })
  ).json()
  let previews = 0
  page.on("request", (request) => {
    if (request.url().includes("/quick-notes/link-preview")) previews++
  })
  await page.goto("/docs")
  let dialog = await newText(page)
  await title(dialog, "Literal notes")
  let editor = dialog.getByRole("textbox", { name: "Plain text content" })
  await paste(editor, literal)
  await expect(dialog.getByRole("status")).toHaveText("Unsaved changes")
  await expect(editor.locator("h1, a, strong, img")).toHaveCount(0)
  const originalNode = await editor.elementHandle()
  await dialog
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click()
  await expect(editor).toHaveCSS("color", "rgb(24, 24, 27)")
  await dialog.getByRole("button", { name: "Full screen", exact: true }).click()
  expect(await originalNode!.evaluate((node) => node.isConnected)).toBe(true)
  await expect(dialog).toHaveCSS("height", "900px")
  await editor.focus()
  await page.keyboard.press("Control+z")
  await expect(editor).not.toContainText("Heading stays literal")
  await page.keyboard.press("Control+y")
  await expect(editor).toContainText("Heading stays literal")
  await dialog.screenshot({ path: testInfo.outputPath("plain-text-light.png") })
  await dialog
    .getByRole("button", { name: "Exit full screen", exact: true })
    .click()
  await dialog
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click()
  await expect(editor).toHaveCSS("color", "rgb(245, 245, 244)")
  await dialog.getByRole("button", { name: "No project", exact: true }).click()
  await page
    .getByRole("button", { name: "Text workspace", exact: true })
    .click()
  const created = await write(page, "POST", "/quick-notes", () =>
    editor.press("Control+s")
  )
  const doc = await created.json()
  expect(doc.bodyJson).toEqual(format)
  expect(doc.bodyText).toBe(literal)
  expect(doc.projectId).toBe(project.id)
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await editor.press("Control+End")
  await page.keyboard.type("Next edit")
  const response = await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    dialog.getByRole("button", { name: "Save", exact: true }).click()
  )
  expect((await response.json()).bodyText).toBe(literal + "Next edit")
  await expect(dialog).toHaveCount(0)
  expect(previews).toBe(0)
  expect(
    (await (await page.request.get("/api/v1/quick-notes")).json()).items
  ).toHaveLength(1)
  expect(
    (
      await page.request.patch(`/api/v1/quick-notes/${doc.id}`, {
        data: { bodyText: "No revision" },
      })
    ).status()
  ).toBe(400)
  expect(
    (
      await page.request.patch(`/api/v1/quick-notes/${doc.id}`, {
        data: { bodyJson: { type: "doc" }, expectedRevision: 1 },
      })
    ).status()
  ).toBe(400)
  expect(
    (
      await page.request.post(`/api/v1/docs/${doc.id}/versions`, {
        data: { revision: 0, expectedRevision: 1 },
      })
    ).ok()
  ).toBe(true)
  await page.reload()
  await page
    .getByRole("heading", { name: "Literal notes", exact: true })
    .click()
  dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  editor = dialog.getByRole("textbox", { name: "Plain text content" })
  await expect(editor).toContainText("Heading stays literal")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  const restored = await (
    await page.request.get(`/api/v1/docs/${doc.id}`)
  ).json()
  expect(restored.bodyJson).toEqual(format)
  expect(restored.bodyText).toBe(literal)
  await page.setViewportSize({ width: 390, height: 844 })
  await dialog.screenshot({
    path: testInfo.outputPath("plain-text-mobile.png"),
  })
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)
  ).toBe(true)
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})

test("draft recovery survives reload and failures, and stale browser edits cannot overwrite newer text", async ({
  page,
  context,
  testAccount,
}) => {
  void testAccount
  const doc = await (
    await page.request.post("/api/v1/quick-notes", {
      data: { title: "Recoverable", bodyJson: format, bodyText: "Saved" },
    })
  ).json()
  await page.goto("/docs")
  await page.getByRole("heading", { name: "Recoverable", exact: true }).click()
  let dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  let editor = dialog.getByRole("textbox", { name: "Plain text content" })
  await editor.focus()
  await editor.press("Control+End")
  await paste(editor, "\n\tUnsaved  \n\n")
  await expect.poll(() => recoveryEntries(page)).toHaveLength(1)
  page.on("dialog", (event) => event.accept())
  await page.reload()
  await page.getByRole("heading", { name: "Recoverable", exact: true }).click()
  dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  editor = dialog.getByRole("textbox", { name: "Plain text content" })
  await expect(
    dialog.getByRole("button", { name: "Restore draft", exact: true })
  ).toBeVisible()
  await expect(editor).toHaveAttribute("contenteditable", "false")
  await dialog
    .getByRole("button", { name: "Restore draft", exact: true })
    .click()
  await expect(editor).toContainText("Unsaved")
  await page.route(`**/api/v1/quick-notes/${doc.id}`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Save failed for test" } }),
    })
  )
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Save failed for test")
  await expect(editor).toContainText("Unsaved")
  await page.unroute(`**/api/v1/quick-notes/${doc.id}`)
  const saved = await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    editor.press("Control+s")
  )
  expect((await saved.json()).bodyText).toBe("Saved\n\tUnsaved  \n\n")
  await expect.poll(() => recoveryEntries(page)).toHaveLength(0)
  const other = await context.newPage()
  await other.goto("/docs")
  await other.getByRole("heading", { name: "Recoverable", exact: true }).click()
  const second = other.getByRole("textbox", { name: "Plain text content" })
  await second.press("Control+End")
  await paste(second, "Older tab")
  await editor.press("Control+End")
  await paste(editor, "Newer text")
  await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    editor.press("Control+s")
  )
  const conflict = other.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().endsWith(`/quick-notes/${doc.id}`)
  )
  await second.press("Control+s")
  expect((await conflict).status()).toBe(409)
  await expect(other.getByRole("alert")).toContainText(
    "Your text is still available"
  )
  await expect(second).toContainText("Older tab")
  expect(
    (await (await page.request.get(`/api/v1/docs/${doc.id}`)).json()).bodyText
  ).toMatch(/Newer text$/)
  await other.getByRole("button", { name: "Cancel", exact: true }).click()
  await other.getByRole("button", { name: "Discard", exact: true }).click()
  await other.close()
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})

test("formatted docs stay editable and create separate plain-text copies after saving the original", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const original = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Original bold text",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ],
  }
  const doc = await (
    await page.request.post("/api/v1/quick-notes", {
      data: {
        title: "Formatted original",
        bodyJson: original,
        bodyText: "Original bold text",
      },
    })
  ).json()
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Formatted original", exact: true })
    .click()
  const rich = page.locator(".tiptap")
  await expect(rich.locator("strong")).toContainText("Original bold text")
  await rich.click()
  await rich.press("Control+End")
  await page.keyboard.type(" plus latest edit")
  await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    page
      .getByRole("button", { name: "Create plain-text copy", exact: true })
      .click()
  )
  const dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  await expect(
    dialog.getByRole("textbox", { name: "Plain text content" })
  ).toContainText("plus latest edit")
  const created = await write(page, "POST", "/quick-notes", () =>
    dialog.getByRole("button", { name: "Save", exact: true }).click()
  )
  const copy = await created.json()
  expect(copy.id).not.toBe(doc.id)
  expect(copy.bodyJson).toEqual(format)
  expect(copy.bodyText).toBe("Original bold text plus latest edit")
  const preserved = await (
    await page.request.get(`/api/v1/docs/${doc.id}`)
  ).json()
  expect(preserved.bodyJson.content[0].content[0].marks).toContainEqual({
    type: "bold",
  })
  expect(preserved.bodyText).toBe(copy.bodyText)
})

test("an unsaved new document can be recovered without creating duplicate docs", async ({
  page,
  testAccount,
}) => {
  void testAccount
  await page.goto("/docs")
  let dialog = await newText(page)
  await title(dialog, "New recovered note")
  await paste(
    dialog.getByRole("textbox", { name: "Plain text content" }),
    literal
  )
  await expect.poll(() => recoveryEntries(page)).toHaveLength(1)
  page.on("dialog", (event) => event.accept())
  await page.reload()
  dialog = await newText(page)
  await dialog
    .getByRole("button", { name: "Restore draft", exact: true })
    .click()
  await expect(
    dialog.getByText("New recovered note", { exact: true })
  ).toBeVisible()
  const editor = dialog.getByRole("textbox", { name: "Plain text content" })
  let committedId = ""
  await page.route("**/api/v1/quick-notes", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    committedId = (await response.json()).id
    await route.abort("failed")
  })
  await editor.press("Control+s")
  await expect(dialog.getByRole("alert")).toContainText(
    "Your text is still available"
  )
  await page.unroute("**/api/v1/quick-notes")
  const response = await write(page, "POST", "/quick-notes", () =>
    editor.press("Control+s")
  )
  const doc = await response.json()
  expect(doc.id).toBe(committedId)
  expect(doc.bodyText).toBe(literal)
  // A network response arrives before the save callback has updated the dialog.
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    editor.press("Control+s")
  )
  expect(
    (await (await page.request.get("/api/v1/quick-notes")).json()).items
  ).toHaveLength(1)
  await editor.press("Control+End")
  await paste(editor, "Recovered after first save")
  await expect
    .poll(() => recoveryEntries(page))
    .toEqual([expect.stringContaining(`:${doc.id}`)])
  await page.reload()
  await page
    .getByRole("heading", { name: "New recovered note", exact: true })
    .click()
  dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  await dialog
    .getByRole("button", { name: "Restore draft", exact: true })
    .click()
  await expect(
    dialog.getByRole("textbox", { name: "Plain text content" })
  ).toContainText("Recovered after first save")
  const recoveredSave = await write(
    page,
    "PATCH",
    `/quick-notes/${doc.id}`,
    () =>
      dialog
        .getByRole("textbox", { name: "Plain text content" })
        .press("Control+s")
  )
  expect((await recoveredSave.json()).bodyText).toBe(
    literal + "Recovered after first save"
  )
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})
