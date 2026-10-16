import { test, expect } from "./fixtures"
import { write } from "./helpers"
import type { Page } from "@playwright/test"

async function openDocument(page: Page, text: string) {
  const response = await page.request.post("/api/v1/quick-notes", {
    data: {
      title: "Search document",
      bodyJson: { type: "plainText", version: 1 },
      bodyText: text,
    },
  })
  expect(response.ok()).toBe(true)
  const doc = await response.json()
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Search document", exact: true })
    .click()
  const dialog = page.locator('[role="dialog"][data-document-format="plain"]')
  const editor = dialog.getByRole("textbox", { name: "Plain text content" })
  await expect(editor).toBeVisible()
  return { doc, dialog, editor }
}

test("find options, highlighting and navigation preserve content and cooperate with Go to Line", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const text = "cat Cat scatter cat\ncafé caféine 👋\none\\ntwo\nlast cat"
  const { doc, dialog, editor } = await openDocument(page, text)
  await editor.press("Control+f")
  const panel = dialog.getByRole("search", { name: "Find and replace" })
  const find = panel.getByRole("textbox", { name: "Find text" })
  const count = panel.locator("[data-search-count]")
  await expect(find).toBeFocused()
  await find.fill("cat")
  await expect(count).toHaveText("5 matches")
  await expect(dialog.locator(".cm-searchMatch")).toHaveCount(5)
  await panel.getByRole("checkbox", { name: "Whole word", exact: true }).check()
  await expect(count).toHaveText("4 matches")
  await panel.getByRole("checkbox", { name: "Match case", exact: true }).check()
  await expect(count).toHaveText("3 matches")
  await find.press("Enter")
  await expect(
    dialog.getByRole("group", { name: "Text position" })
  ).toContainText("Ln 1, Col 4")
  await find.press("F3")
  await expect(
    dialog.getByRole("group", { name: "Text position" })
  ).toContainText("Ln 1, Col 20")
  await find.press("Shift+F3")
  await expect(
    dialog.getByRole("group", { name: "Text position" })
  ).toContainText("Ln 1, Col 4")
  await find.press("Shift+Enter")
  await expect(
    dialog.getByRole("group", { name: "Text position" })
  ).toContainText("Ln 4, Col 9")
  await find.fill("café")
  await expect(count).toHaveText("1 match")
  await find.fill("not present")
  await expect(count).toHaveText("0 matches")
  await expect(
    panel.getByRole("button", { name: "Next", exact: true })
  ).toBeDisabled()
  await panel
    .getByRole("checkbox", { name: "Whole word", exact: true })
    .uncheck()
  await find.fill("\\n")
  await expect(count).toHaveText("1 match")
  await panel.getByRole("checkbox", { name: "Regex", exact: true }).check()
  await find.fill("[")
  await expect(panel.getByRole("alert")).toContainText(
    "Invalid regular expression"
  )
  await expect(
    panel.getByRole("button", { name: "Replace all", exact: true })
  ).toBeDisabled()
  await find.fill("c.t")
  await expect(panel.getByRole("alert")).toBeHidden()
  await expect(count).toHaveText("4 matches")
  await dialog
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click()
  await dialog.getByRole("button", { name: "Full screen", exact: true }).click()
  await expect(find).toHaveValue("c.t")
  await expect(count).toHaveText("4 matches")
  await dialog.screenshot({
    path: testInfo.outputPath("find-replace-light.png"),
  })
  await find.press("Escape")
  await expect(panel).toHaveCount(0)
  await expect(editor).toBeFocused()
  await expect(dialog).toBeVisible()
  await dialog
    .getByRole("button", { name: "Find and replace", exact: true })
    .click()
  await find.press("Control+g")
  await expect(panel).toHaveCount(0)
  const line = dialog.getByRole("textbox", { name: "Go to line", exact: true })
  await expect(line).toBeFocused()
  await line.fill("2")
  await line.press("Enter")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  expect(
    (await (await page.request.get(`/api/v1/docs/${doc.id}`)).json()).bodyText
  ).toBe(text)
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})

test("literal and regex replacements are undoable, update counts, and save exact text", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const text = "cat cat cat\nitem-12 item-34\ncat"
  const { doc, dialog, editor } = await openDocument(page, text)
  await editor.press("Control+h")
  const panel = dialog.getByRole("search", { name: "Find and replace" })
  const find = panel.getByRole("textbox", { name: "Find text" })
  const replace = panel.getByRole("textbox", { name: "Replace with" })
  const count = panel.locator("[data-search-count]")
  await expect(replace).toBeFocused()
  await find.fill("cat")
  await replace.fill("dog\\n")
  await panel.getByRole("button", { name: "Replace next", exact: true }).click()
  await expect(count).toHaveText("3 matches")
  await expect(editor).toContainText("dog\\n cat cat")
  await expect(dialog.getByRole("status")).toHaveText("Unsaved changes")
  await panel.getByRole("button", { name: "Replace all", exact: true }).click()
  await expect(count).toHaveText("0 matches")
  await find.press("Escape")
  await editor.press("Control+z")
  await expect(editor).toContainText("dog\\n cat cat")
  await editor.press("Control+z")
  await expect(editor).toContainText("cat cat cat")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await editor.press("Control+Home")
  await editor.press("Control+h")
  await panel.getByRole("checkbox", { name: "Regex", exact: true }).check()
  await find.fill("item-(\\d+)")
  await replace.fill("$1\\t$&")
  await expect(count).toHaveText("2 matches")
  await panel.getByRole("button", { name: "Replace all", exact: true }).click()
  await expect(count).toHaveText("2 matches")
  await find.press("Escape")
  await editor.press("Control+z")
  await expect(editor).toContainText("item-12 item-34")
  await editor.press("Control+y")
  await expect(editor).toContainText("12\titem-12 34\titem-34")
  await editor.press("Control+h")
  await find.fill("cat")
  await replace.fill("fox")
  await panel.getByRole("checkbox", { name: "Regex", exact: true }).uncheck()
  await page.setViewportSize({ width: 390, height: 844 })
  await dialog.screenshot({
    path: testInfo.outputPath("find-replace-mobile.png"),
  })
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)
  ).toBe(true)
  await panel.getByRole("button", { name: "Replace all", exact: true }).click()
  await expect(count).toHaveText("0 matches")
  await find.press("Escape")
  const saved = await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    editor.press("Control+s")
  )
  expect((await saved.json()).bodyText).toBe(
    "fox fox fox\n12\titem-12 34\titem-34\nfox"
  )
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})

test("search respects read-only draft recovery and updates when editing resumes", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const { dialog, editor } = await openDocument(page, "cat")
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
    .getByRole("heading", { name: "Search document", exact: true })
    .click()
  await expect(editor).toHaveAttribute("contenteditable", "false")
  await dialog
    .getByRole("button", { name: "Find and replace", exact: true })
    .click()
  const panel = dialog.getByRole("search", { name: "Find and replace" })
  await panel.getByRole("textbox", { name: "Find text" }).fill("cat")
  await expect(panel.locator("[data-search-count]")).toHaveText("1 match")
  await expect(
    panel.getByRole("textbox", { name: "Replace with" })
  ).toBeDisabled()
  await expect(
    panel.getByRole("button", { name: "Replace next", exact: true })
  ).toBeDisabled()
  await expect(
    panel.getByRole("button", { name: "Replace all", exact: true })
  ).toBeDisabled()
  await dialog
    .getByRole("button", { name: "Discard draft", exact: true })
    .click()
  await expect(editor).toHaveAttribute("contenteditable", "true")
  const replacement = panel.getByRole("textbox", { name: "Replace with" })
  await expect(replacement).toBeEnabled()
  await replacement.fill("dog")
  await panel.getByRole("button", { name: "Replace all", exact: true }).click()
  await expect(editor).toContainText("dog")
  await replacement.press("Escape")
  await editor.press("Control+z")
  await expect(editor).toContainText("cat")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
})
