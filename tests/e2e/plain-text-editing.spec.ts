import { test, expect } from "./fixtures"
import { write } from "./helpers"
import type { Locator, Page } from "@playwright/test"

async function openDocument(page: Page, text: string) {
  const response = await page.request.post("/api/v1/quick-notes", {
    data: {
      title: "Editing workspace",
      bodyJson: { type: "plainText", version: 1 },
      bodyText: text,
    },
  })
  expect(response.ok()).toBe(true)
  const doc = await response.json()
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Editing workspace", exact: true })
    .click()
  const dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  const editor = dialog.getByRole("textbox", { name: "Plain text content" })
  await expect(editor).toBeVisible()
  const status = dialog.getByRole("group", {
    name: "Text position",
    exact: true,
  })
  return { doc, dialog, editor, status }
}

async function point(editor: Locator, line: number, offset: number) {
  return editor
    .locator(".cm-line")
    .nth(line - 1)
    .evaluate((node, offset) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      let text = walker.nextNode()
      while (text) {
        const length = text.textContent!.length
        if (offset <= length) {
          const range = document.createRange()
          range.setStart(text, offset)
          range.collapse(true)
          const rect = range.getBoundingClientRect()
          return { x: rect.left, y: (rect.top + rect.bottom) / 2 }
        }
        offset -= length
        text = walker.nextNode()
      }
      throw new Error("Text offset is outside the rendered line")
    }, offset)
}

test("multiple cursors support occurrences, typing, modifier clicks, and Escape without closing the doc", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const { doc, dialog, editor, status } = await openDocument(
    page,
    "cat cat\ncat cat\nlast"
  )
  await editor.press("Control+Home")
  await editor.press("Control+d")
  await editor.press("Control+d")
  await editor.press("Control+d")
  await expect(status).toContainText("3 selections")
  await expect(status).toContainText("9 selected")
  await dialog
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click()
  await dialog.getByRole("button", { name: "Full screen", exact: true }).click()
  await expect(status).toContainText("3 selections")
  await editor.focus()
  await page.keyboard.type("dog")
  await expect(editor).toContainText("dog dog")
  await expect(status).toContainText("3 cursors")
  const changed = await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    editor.press("Control+s")
  )
  expect((await changed.json()).bodyText).toBe("dog dog\ndog cat\nlast")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await editor.press("Control+z")
  await expect(editor).toContainText("cat cat")
  await editor.press("Escape")
  await expect(status).not.toContainText("3 selections")
  await expect(status).not.toContainText("selected")
  await expect(dialog).toBeVisible()
  await editor.press("Control+Home")
  await editor.press("Control+Alt+ArrowDown")
  await expect(status).toContainText("2 cursors")
  await editor.press("Escape")
  await expect(status).not.toContainText("2 cursors")
  const first = await point(editor, 1, 0)
  const last = await point(editor, 3, 0)
  await page.mouse.click(first.x, first.y)
  await page.keyboard.down("Control")
  await page.mouse.click(last.x, last.y)
  await page.keyboard.up("Control")
  await expect(status).toContainText("2 cursors")
  await page.keyboard.type("X")
  await expect(editor).toContainText("Xcat cat")
  await expect(editor).toContainText("Xlast")
  await editor.press("Control+z")
  await editor.press("Escape")
  await status
    .getByRole("button", { name: "Editing actions", exact: true })
    .click()
  const actions = dialog.getByRole("group", {
    name: "Editing actions",
    exact: true,
  })
  await expect(
    actions.getByRole("button", { name: /Add cursor above/ })
  ).toBeVisible()
  await dialog.screenshot({
    path: testInfo.outputPath("editing-actions-light.png"),
  })
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.getByRole("button", { name: "Discard", exact: true }).click()
})

test("Alt-drag selects a rectangle and configured indentation applies at every cursor", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const { doc, dialog, editor, status } = await openDocument(
    page,
    "AA11zz\nBB22zz\nCC33zz"
  )
  const start = await point(editor, 1, 2)
  const end = await point(editor, 3, 4)
  await page.keyboard.down("Alt")
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.mouse.up()
  await page.keyboard.up("Alt")
  await expect(status).toContainText("3 selections")
  await expect(status).toContainText("6 selected")
  await page.keyboard.type("Q")
  await expect(status).toContainText("3 cursors")
  await dialog.getByRole("button", { name: /^Indent:/ }).click()
  await dialog
    .getByRole("combobox", { name: "Indent using", exact: true })
    .selectOption("spaces")
  await dialog
    .getByRole("combobox", { name: "Tab width", exact: true })
    .selectOption("2")
  await editor.focus()
  await editor.press("Tab")
  const saved = await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    editor.press("Control+s")
  )
  expect((await saved.json()).bodyText).toBe("AAQ zz\nBBQ zz\nCCQ zz")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await editor.press("Escape")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})

test("line actions preserve CRLF and BOM, remain individually undoable, and work from visible controls", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const original = "\ufefffirst\r\nmiddle👋\r\nlast"
  const { doc, dialog, editor, status } = await openDocument(page, original)
  await editor.press("Control+g")
  const line = dialog.getByRole("textbox", { name: "Go to line", exact: true })
  await line.fill("2")
  await line.press("Enter")
  await editor.press("Alt+ArrowUp")
  await expect(editor.locator(".cm-line").first()).toContainText("middle👋")
  await editor.press("Alt+Shift+ArrowDown")
  await expect(status).toContainText("4 lines")
  await editor.press("Alt+ArrowDown")
  await expect(editor.locator(".cm-line").nth(1)).toHaveText("first\r")
  await editor.press("Control+z")
  await editor.press("Control+z")
  await editor.press("Control+z")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await editor.press("Control+g")
  await line.fill("2")
  await line.press("Enter")
  await status
    .getByRole("button", { name: "Editing actions", exact: true })
    .click()
  const actions = dialog.getByRole("group", {
    name: "Editing actions",
    exact: true,
  })
  await actions.getByRole("button", { name: /^Move line down/ }).click()
  const saved = await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    editor.press("Control+s")
  )
  expect((await saved.json()).bodyText).toBe("\ufefffirst\r\nlast\r\nmiddle👋")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await page.setViewportSize({ width: 390, height: 844 })
  await dialog.screenshot({
    path: testInfo.outputPath("editing-actions-mobile-dark.png"),
  })
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)
  ).toBe(true)
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})

test("line actions use logical wrapped lines, keep boundary cursors, and respect draft recovery", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const original = "long line ".repeat(60) + "\nB\nC"
  const { dialog, editor, status } = await openDocument(page, original)
  await dialog.getByRole("button", { name: "Word wrap", exact: true }).click()
  await editor.press("Control+Home")
  await editor.press("Alt+Shift+ArrowDown")
  await expect(status).toContainText("4 lines")
  await editor.press("Control+z")
  await expect(status).toContainText("3 lines")
  await editor.press("Control+Home")
  await editor.press("Control+Alt+ArrowDown")
  await expect(status).toContainText("2 cursors")
  await editor.press("Alt+ArrowUp")
  await expect(status).toContainText("2 cursors")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await editor.press("Escape")
  await editor.press("Control+End")
  await page.keyboard.type(" draft")
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
  page.on("dialog", (event) => event.accept())
  await page.reload()
  await page
    .getByRole("heading", { name: "Editing workspace", exact: true })
    .click()
  await expect(editor).toHaveAttribute("contenteditable", "false")
  await status
    .getByRole("button", { name: "Editing actions", exact: true })
    .click()
  const actions = dialog.getByRole("group", {
    name: "Editing actions",
    exact: true,
  })
  for (const name of [
    /^Duplicate line above/,
    /^Duplicate line below/,
    /^Move line up/,
    /^Move line down/,
  ])
    await expect(actions.getByRole("button", { name })).toBeDisabled()
  await dialog
    .getByRole("button", { name: "Discard draft", exact: true })
    .click()
  await expect(
    actions.getByRole("button", { name: /^Duplicate line below/ })
  ).toBeEnabled()
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})
