import { test, expect } from "./fixtures"
import { write } from "./helpers"
import type { Locator, Page } from "@playwright/test"

async function openDocument(page: Page, text: string) {
  const response = await page.request.post("/api/v1/quick-notes", {
    data: {
      title: "Text file workspace",
      bodyJson: { type: "plainText", version: 1 },
      bodyText: text,
    },
  })
  expect(response.ok()).toBe(true)
  const doc = await response.json()
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Text file workspace", exact: true })
    .click()
  const dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  const editor = dialog.getByRole("textbox", { name: "Plain text content" })
  await expect(editor).toBeVisible()
  return { doc, dialog, editor }
}

async function downloadText(page: Page, dialog: Locator) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Export .txt", exact: true }).click(),
  ])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) }
}

test("wrap, whitespace and indentation preferences preserve content and persist across reload", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const text = "a long line ".repeat(100) + "\n\t  second\n"
  const { doc, dialog, editor } = await openDocument(page, text)
  const controls = dialog.getByRole("group", {
    name: "Text controls",
    exact: true,
  })
  const scroller = dialog.locator(".cm-scroller")
  await expect
    .poll(() =>
      scroller.evaluate((node) => node.scrollWidth > node.clientWidth)
    )
    .toBe(true)
  const node = await editor.elementHandle()
  await controls.getByRole("button", { name: "Word wrap", exact: true }).click()
  await expect
    .poll(() =>
      scroller.evaluate((node) => node.scrollWidth <= node.clientWidth + 2)
    )
    .toBe(true)
  await expect(
    dialog.getByRole("group", { name: "Text position" })
  ).toContainText("3 lines")
  await controls
    .getByRole("button", { name: "Whitespace", exact: true })
    .click()
  await expect(dialog.locator(".cm-highlightTab")).toHaveCount(1)
  await expect(dialog.locator(".cm-highlightSpace").first()).toBeVisible()
  await controls.getByRole("button", { name: /^Indent:/ }).click()
  await dialog
    .getByRole("combobox", { name: "Indent using", exact: true })
    .selectOption("spaces")
  await dialog
    .getByRole("combobox", { name: "Tab width", exact: true })
    .selectOption("2")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  expect(
    (await (await page.request.get(`/api/v1/docs/${doc.id}`)).json()).bodyText
  ).toBe(text)
  expect(await node!.evaluate((element) => element.isConnected)).toBe(true)
  await editor.press("Control+End")
  await editor.press("Tab")
  await page.keyboard.type("Z")
  const saved = await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    editor.press("Control+s")
  )
  expect((await saved.json()).bodyText).toBe(text + "  Z")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.reload()
  await page
    .getByRole("heading", { name: "Text file workspace", exact: true })
    .click()
  await expect(
    controls.getByRole("button", { name: "Word wrap", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    controls.getByRole("button", { name: "Whitespace", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    controls.getByRole("button", { name: /^Indent:/ })
  ).toContainText("Spaces · 2")
  await controls.getByRole("button", { name: /^Indent:/ }).click()
  await dialog
    .getByRole("combobox", { name: "Indent using", exact: true })
    .selectOption("tabs")
  await dialog
    .getByRole("combobox", { name: "Tab width", exact: true })
    .selectOption("8")
  await expect(editor).toHaveCSS("tab-size", "8")
  await editor.press("Control+End")
  await editor.press("Tab")
  expect((await downloadText(page, dialog)).bytes.toString("utf8")).toBe(
    text + "  Z\t"
  )
  await editor.press("Control+z")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await controls
    .getByRole("button", { name: "Whitespace", exact: true })
    .click()
  await expect(
    dialog.locator(".cm-highlightSpace, .cm-highlightTab")
  ).toHaveCount(0)
  await dialog
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click()
  await page.setViewportSize({ width: 390, height: 844 })
  await dialog.screenshot({
    path: testInfo.outputPath("text-controls-mobile-light.png"),
  })
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true)
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})

test("UTF-8 import validates before replacing, supports undo, and exports byte-exact text before and after save", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const original = "Original  \n"
  const text = "\ufeff\n  café हिन्दी 👋\t  \r\n\nlast\r\n"
  const bytes = Buffer.from(text, "utf8")
  const { doc, dialog, editor } = await openDocument(page, original)
  const input = dialog.getByLabel("Choose UTF-8 text file", { exact: true })
  for (const file of [
    { name: "wrong.csv", mimeType: "text/plain", buffer: Buffer.from("data") },
    {
      name: "utf16.txt",
      mimeType: "text/plain",
      buffer: Buffer.from([0xff, 0xfe, 0x41, 0]),
    },
    {
      name: "large.txt",
      mimeType: "text/plain",
      buffer: Buffer.alloc(3_000_001, 65),
    },
  ]) {
    await input.setInputFiles(file)
    await expect(dialog.getByRole("alert")).toBeVisible()
    await expect(editor).toContainText("Original")
    await expect(dialog.getByRole("status")).toHaveText("Saved")
  }
  const file = { name: "unicode.txt", mimeType: "text/plain", buffer: bytes }
  await input.setInputFiles(file)
  const confirm = page.getByRole("dialog", {
    name: "Replace document text?",
    exact: true,
  })
  await expect(confirm).toBeVisible()
  await confirm
    .getByRole("button", { name: "Cancel import", exact: true })
    .click()
  await expect(editor).toContainText("Original")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await input.setInputFiles(file)
  await confirm
    .getByRole("button", { name: "Replace text", exact: true })
    .click()
  await expect(confirm).toHaveCount(0)
  await expect(editor).toBeFocused()
  await expect(dialog.getByRole("status")).toHaveText("Unsaved changes")
  const exported = await downloadText(page, dialog)
  expect(exported.name).toBe("Text file workspace.txt")
  expect(exported.bytes).toEqual(bytes)
  expect(
    (await (await page.request.get(`/api/v1/docs/${doc.id}`)).json()).bodyText
  ).toBe(original)
  await editor.press("Control+z")
  expect((await downloadText(page, dialog)).bytes.toString("utf8")).toBe(
    original
  )
  await editor.press("Control+y")
  const saved = await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    editor.press("Control+s")
  )
  const data = await saved.json()
  expect(data.bodyText).toBe(text)
  expect(data.title).toBe("Text file workspace")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.reload()
  await page
    .getByRole("heading", { name: "Text file workspace", exact: true })
    .click()
  await expect(editor).toContainText("café")
  expect((await downloadText(page, dialog)).bytes).toEqual(bytes)
  await input.setInputFiles({
    name: "empty.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(0),
  })
  await confirm
    .getByRole("button", { name: "Replace text", exact: true })
    .click()
  expect((await downloadText(page, dialog)).bytes.byteLength).toBe(0)
  await editor.press("Control+z")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  expect((await downloadText(page, dialog)).bytes).toEqual(bytes)
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})

test("import into an empty doc recovers as a draft and cannot replace read-only recovery text", async ({
  page,
  testAccount,
}) => {
  void testAccount
  await page.goto("/docs")
  async function newText() {
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
  let dialog = await newText()
  const text = "Imported new doc\n\t  👋\n"
  await dialog
    .getByLabel("Choose UTF-8 text file", { exact: true })
    .setInputFiles({
      name: "new.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(text),
    })
  await expect(
    dialog.getByRole("textbox", { name: "Plain text content" })
  ).toContainText("Imported new doc")
  await expect(
    page.getByRole("dialog", { name: "Replace document text?", exact: true })
  ).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith("resource-hub:plain-text-draft:")
          ).length
      )
    )
    .toBe(1)
  expect(
    (await (await page.request.get("/api/v1/quick-notes")).json()).items
  ).toHaveLength(0)
  page.on("dialog", (event) => event.accept())
  await page.reload()
  dialog = await newText()
  await expect(
    dialog.getByRole("button", { name: "Import .txt", exact: true })
  ).toBeDisabled()
  await dialog
    .getByLabel("Choose UTF-8 text file", { exact: true })
    .setInputFiles({
      name: "ignored.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Should not replace recovery"),
    })
  await expect(
    dialog.getByRole("textbox", { name: "Plain text content" })
  ).not.toContainText("Should not replace")
  await dialog
    .getByRole("button", { name: "Restore draft", exact: true })
    .click()
  await expect(
    dialog.getByRole("button", { name: "Import .txt", exact: true })
  ).toBeEnabled()
  const saved = await write(page, "POST", "/quick-notes", () =>
    dialog
      .getByRole("textbox", { name: "Plain text content" })
      .press("Control+s")
  )
  expect((await saved.json()).bodyText).toBe(text)
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})
