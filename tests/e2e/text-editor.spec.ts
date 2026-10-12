import { test, expect } from "./fixtures"
import { write } from "./helpers"
import sharp from "sharp"
import { readFile } from "node:fs/promises"
import type { Editor } from "@tiptap/react"

const imageUrl = "https://editor-images.test/original.png"
const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
})

test("Tab inserts four spaces in doc text and code, with undo and save persistence", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const created = await page.request.post("/api/v1/quick-notes", {
    data: {
      kind: "text",
      title: "Tab indentation",
      bodyJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Read", marks: [{ type: "bold" }] },
            ],
          },
          { type: "codeBlock", content: [{ type: "text", text: "code" }] },
        ],
      },
      bodyText: "Read\ncode",
    },
  })
  expect(created.ok()).toBe(true)
  const doc = await created.json()
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Tab indentation", exact: true })
    .click()
  const editor = page.locator(".tiptap")
  const text = editor.locator("p").first()
  await expect(editor).toHaveCSS("white-space", /^(pre-wrap|break-spaces)$/)
  await text.click()
  await page.keyboard.press("Control+Home")
  await page.keyboard.press("Tab")
  await expect(editor).toBeFocused()
  expect(await text.textContent()).toBe("    Read")
  await page.keyboard.press("Control+z")
  expect(await text.textContent()).toBe("Read")
  await page.keyboard.press("Control+Shift+z")
  expect(await text.textContent()).toBe("    Read")
  await page.keyboard.press("Shift+Tab")
  await expect(editor).not.toBeFocused()
  expect(await text.textContent()).toBe("    Read")
  await text.click()
  await editor.evaluate((element) => {
    const instance = (element as HTMLElement & { editor: Editor }).editor
    instance.commands.setTextSelection(6) // Immediately after R, keeping four leading spaces.
  })
  await page.keyboard.press("Tab")
  expect(await text.textContent()).toBe("    R    ead")
  expect(await editor.locator("strong").textContent()).toBe("    R    ead")
  await editor.locator("pre").click()
  await editor.evaluate((element) => {
    const instance = (element as HTMLElement & { editor: Editor }).editor
    instance.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock")
        instance.commands.setTextSelection(pos + 1 + node.content.size)
    })
  })
  await page.keyboard.press("Tab")
  expect(await editor.locator("pre").textContent()).toBe("code    ")
  await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    page.getByRole("button", { name: "Save", exact: true }).click()
  )
  const saved = await (await page.request.get(`/api/v1/docs/${doc.id}`)).json()
  expect(saved.bodyText.startsWith("    R    ead\ncode    ")).toBe(true)
  expect(saved.bodyJson.content[1].content[0].text).toBe("code    ")
  expect(saved.bodyJson.content[0].content[0].marks).toContainEqual({
    type: "bold",
  })
  await page
    .getByRole("heading", { name: "Tab indentation", exact: true })
    .click()
  expect(await text.textContent()).toBe("    R    ead")
  expect(await editor.locator("pre").textContent()).toBe("code    ")
})

test("image controls preserve layout, captions, undo and replacement across saves", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const png = await sharp({
    create: { width: 640, height: 400, channels: 3, background: "#3977a8" },
  })
    .png()
    .toBuffer()
  await page.route("https://editor-images.test/**", (route) =>
    route.fulfill({ body: png, contentType: "image/png" })
  )
  const response = await page.request.post("/api/v1/quick-notes", {
    data: {
      kind: "text",
      title: "Image controls journey",
      bodyJson: {
        type: "doc",
        content: [
          paragraph("Before image"),
          {
            type: "image",
            attrs: {
              src: imageUrl,
              alt: "Original picture",
              width: 400,
              height: 250,
            },
          },
          paragraph("After image"),
        ],
      },
      bodyText: "Before image\nAfter image",
    },
  })
  expect(response.ok()).toBe(true)
  const saved = await response.json()
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Image controls journey", exact: true })
    .click()
  const editor = page.locator(".tiptap")
  const image = editor.locator("figure img")
  await image.click()
  await expect(page.getByLabel("Image controls", { exact: true })).toBeVisible()
  const resize = editor.getByRole("button", {
    name: "Resize image bottom-right",
  })
  const bounds = await resize.boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + 7, bounds!.y + 7)
  await page.mouse.down()
  await page.mouse.move(bounds!.x - 73, bounds!.y - 43, { steps: 8 })
  await page.mouse.up()
  await expect(image).toHaveCSS("width", "320px")
  await page.keyboard.press("Control+z")
  await expect(image).toHaveCSS("width", "400px")
  await page.keyboard.press("Control+Shift+z")
  await expect(image).toHaveCSS("width", "320px")
  await page.getByRole("button", { name: "Align image center" }).click()
  await page.getByRole("button", { name: "Caption & alt text" }).click()
  await page.getByLabel("Caption", { exact: true }).fill("Project architecture")
  await page
    .getByLabel("Alt text", { exact: true })
    .fill("Blue architecture illustration")
  await page.getByRole("button", { name: "Apply image details" }).click()
  await expect(editor.locator("figcaption")).toHaveText("Project architecture")
  await page.getByRole("button", { name: "Move image down" }).click()
  await expect(editor.locator(":scope > *").nth(1)).toHaveText("After image")
  await page.getByRole("button", { name: "Preview image", exact: true }).click()
  await expect(
    page
      .getByRole("dialog", { name: "Image preview" })
      .getByAltText("Blue architecture illustration")
  ).toBeVisible()
  await page
    .getByRole("dialog", { name: "Image preview" })
    .getByRole("button", { name: "Close", exact: true })
    .click()
  await image.click()
  await write(page, "PATCH", `/quick-notes/${saved.id}`, () =>
    page.getByRole("button", { name: "Save", exact: true }).click()
  )
  await page
    .getByRole("heading", { name: "Image controls journey", exact: true })
    .click()
  await expect(image).toHaveCSS("width", "320px")
  await expect(editor.locator("figure")).toHaveAttribute(
    "data-alignment",
    "center"
  )
  await expect(image).toHaveAttribute("alt", "Blue architecture illustration")
  await image.click()
  await page
    .getByRole("button", { name: "Drag selected block", exact: true })
    .dragTo(editor.locator("p").first(), { targetPosition: { x: 1, y: 1 } })
  await expect(editor.locator("figure")).toHaveCount(1)
  await expect(editor.locator(":scope > *").first()).toHaveAttribute(
    "data-document-image",
    ""
  )
  await page.keyboard.press("Control+z")
  await expect(editor.locator(":scope > *").first()).toHaveText("Before image")
  await image.click()
  await page.getByRole("button", { name: "Size", exact: true }).click()
  await page.getByRole("button", { name: "Full width", exact: true }).click()
  await expect(editor.locator("figure")).toHaveAttribute(
    "data-width-mode",
    "full"
  )
  await page.keyboard.press("Control+z")
  await expect(image).toHaveCSS("width", "320px")
  await page.screenshot({
    path: testInfo.outputPath("image-editor.png"),
    fullPage: true,
  })

  await page.route("**/api/v1/quick-notes/images", (route) =>
    route.fulfill({
      json: {
        fileId: "fake-upload",
        uploadUrl: "/editor-test-upload",
        headers: {},
      },
    })
  )
  let finishUpload!: () => void
  const wait = new Promise<void>((resolve) => {
    finishUpload = resolve
  })
  await page.route("**/editor-test-upload", async (route) => {
    await wait
    await route.fulfill({ status: 200 })
  })
  await page.route(
    "**/api/v1/quick-notes/images/fake-upload/complete",
    (route) =>
      route.fulfill({
        json: {
          url: "https://editor-images.test/replacement.png",
          width: 640,
          height: 400,
        },
      })
  )
  await page.getByRole("button", { name: "Replace image", exact: true }).click()
  await page.getByLabel("Replace image file").setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: png,
  })
  await expect(
    page.getByRole("button", { name: "Save", exact: true })
  ).toBeDisabled()
  await expect(image).toHaveAttribute("src", imageUrl)
  finishUpload()
  await expect(image).toHaveAttribute(
    "src",
    "https://editor-images.test/replacement.png"
  )
  await expect(image).toHaveCSS("width", "320px")
  await expect(editor.locator("figcaption")).toHaveText("Project architecture")
  await page.keyboard.press("Control+z")
  await expect(image).toHaveAttribute("src", imageUrl)
  await page.keyboard.press("Control+Shift+z")
  await expect(image).toHaveAttribute(
    "src",
    "https://editor-images.test/replacement.png"
  )
  await write(page, "PATCH", `/quick-notes/${saved.id}`, () =>
    page.getByRole("button", { name: "Save", exact: true }).click()
  )
  const doc = await (await page.request.get(`/api/v1/docs/${saved.id}`)).json()
  const imageNode = doc.bodyJson.content.find(
    (node: { type: string }) => node.type === "image"
  )
  expect(imageNode.attrs).toMatchObject({
    width: 320,
    height: 200,
    caption: "Project architecture",
    alignment: "center",
    src: "https://editor-images.test/replacement.png",
  })
  await page
    .getByRole("heading", { name: "Image controls journey", exact: true })
    .click()
  await page.setViewportSize({ width: 390, height: 844 })
  await image.click()
  expect(
    await page.locator("body").evaluate((element) => element.scrollWidth)
  ).toBeLessThanOrEqual(390)
  const mobileImage = await image.boundingBox()
  const mobileEditor = await editor.boundingBox()
  expect(mobileImage!.width).toBeLessThanOrEqual(mobileEditor!.width)
  await page.screenshot({
    path: testInfo.outputPath("image-editor-mobile.png"),
    fullPage: true,
  })
})

test("slash commands, block actions and workspace controls preserve unsaved content", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const response = await page.request.post("/api/v1/quick-notes", {
    data: {
      kind: "text",
      title: "Workspace journey",
      bodyJson: {
        type: "doc",
        content: [paragraph("First paragraph"), paragraph("Second paragraph")],
      },
      bodyText: "First paragraph\nSecond paragraph",
    },
  })
  expect(response.ok()).toBe(true)
  const doc = await response.json()
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Workspace journey", exact: true })
    .click()
  const editor = page.locator(".tiptap")
  const dialog = page.getByRole("dialog", {
    name: "Edit text doc",
    exact: true,
  })
  const toolbar = dialog.getByRole("toolbar", { name: "Document toolbar" })
  await expect(
    dialog.getByLabel("Document title", { exact: true })
  ).toHaveCount(0)
  await expect(
    dialog.getByText("Workspace journey", { exact: true })
  ).toBeVisible()
  await expect(toolbar).toBeVisible()
  await expect(toolbar.getByLabel("Writing width")).toBeVisible()
  await expect(
    toolbar.getByRole("button", { name: "Block actions", exact: true })
  ).toBeVisible()
  await expect(page.getByLabel("Word count")).toHaveCount(0)
  await dialog.getByRole("button", { name: "Edit title" }).click()
  await dialog
    .getByLabel("Document title", { exact: true })
    .fill("Discarded title")
  await page.keyboard.press("Escape")
  await expect(
    dialog.getByText("Workspace journey", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("dialog", { name: "Unsaved changes" })
  ).toHaveCount(0)
  await editor.locator("p").last().click()
  await page.keyboard.press("Control+End")
  await expect
    .poll(() =>
      editor.evaluate((element) => {
        const instance = (element as HTMLElement & { editor: Editor }).editor
        return (
          instance.state.selection.from === instance.state.doc.content.size - 1
        )
      })
    )
    .toBe(true)
  await page.keyboard.press("Enter")
  await expect(editor.locator("p")).toHaveCount(3)
  await expect(editor.locator("p").nth(0)).toHaveText("First paragraph")
  await expect(editor.locator("p").nth(1)).toHaveText("Second paragraph")
  await page.keyboard.type("/hea")
  await expect(
    page.getByRole("listbox", { name: "Insert block" })
  ).toBeVisible()
  await page.keyboard.press("Enter")
  await expect(editor.locator("p").nth(0)).toHaveText("First paragraph")
  await expect(editor.locator("p").nth(1)).toHaveText("Second paragraph")
  await page.keyboard.type("New section")
  await expect(editor.locator("h2")).toHaveText("New section")
  await page.getByRole("button", { name: "Block actions", exact: true }).click()
  await page
    .getByRole("button", { name: "Duplicate block", exact: true })
    .click()
  await expect(editor.locator("h2")).toHaveCount(2)
  await editor.locator("p").first().click()
  await page.getByRole("button", { name: "Block actions", exact: true }).click()
  await page.getByRole("button", { name: "Quote", exact: true }).click()
  await expect(editor.locator("blockquote")).toHaveText("First paragraph")
  await page.keyboard.press("Control+z")
  await expect(editor.locator("blockquote")).toHaveCount(0)
  await editor.locator("h2").last().click()
  await page.getByRole("button", { name: "Block actions", exact: true }).click()
  await page.getByRole("button", { name: "Move up", exact: true }).click()
  await page.getByLabel("Writing width").selectOption("narrow")
  await expect(editor).toHaveCSS("max-width", "608px")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download Markdown" }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe("Workspace journey.md")
  const path = testInfo.outputPath(file.suggestedFilename())
  await file.saveAs(path)
  const markdown = await readFile(path, "utf8")
  expect(markdown).toContain("# Workspace journey")
  expect(markdown.match(/## New section/g)).toHaveLength(2)
  await page.keyboard.press("Escape")
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[title="Document print preview"]'
      )
      if (!iframe?.contentWindow) return
      iframe.contentWindow.print = () => {
        document.body.dataset.printedTitle = iframe.contentDocument?.title ?? ""
        document.body.dataset.printedText =
          iframe.contentDocument?.body.textContent ?? ""
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true })
  })
  await page.getByRole("button", { name: "Export", exact: true }).click()
  await page
    .getByRole("button", { name: "Print / Save as PDF", exact: true })
    .click()
  await expect(page.locator("body")).toHaveAttribute(
    "data-printed-title",
    "Workspace journey"
  )
  await expect(page.locator("body")).toHaveAttribute(
    "data-printed-text",
    /New section/
  )
  await page.keyboard.press("Escape")
  await dialog.getByRole("button", { name: "Edit title" }).click()
  await dialog
    .getByLabel("Document title", { exact: true })
    .fill("Workspace revised")
  await page.keyboard.press("Enter")
  await expect(
    dialog.getByLabel("Document title", { exact: true })
  ).toHaveCount(0)
  await expect(
    dialog.getByText("Workspace revised", { exact: true })
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("compact-editor.png") })
  const editorElement = await editor.elementHandle()
  await page.getByRole("button", { name: "Full screen", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Exit full screen" })
  ).toBeVisible()
  await expect(toolbar).toBeHidden()
  await expect(
    dialog.getByText("Workspace revised", { exact: true })
  ).toBeHidden()
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true })
  ).toBeHidden()
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true })
  ).toHaveCount(1)
  await expect(editor).toHaveCSS("padding-top", "64px")
  await expect(editor.locator("h2")).toHaveCount(2)
  await editor.locator("h2").last().click()
  await page.keyboard.press("Control+End")
  await page.keyboard.press("Enter")
  await page.keyboard.type("Writing in full screen")
  await expect(editor).toContainText("Writing in full screen")
  await page.keyboard.press("Control+z")
  await expect(editor).not.toContainText("Writing in full screen")
  await page.keyboard.press("Control+Shift+z")
  await expect(editor).toContainText("Writing in full screen")
  await page.screenshot({ path: testInfo.outputPath("fullscreen-editor.png") })
  await page.getByRole("button", { name: "Exit full screen" }).click()
  await expect(toolbar).toBeVisible()
  expect(await editorElement!.evaluate((element) => element.isConnected)).toBe(
    true
  )
  await expect(editor).toContainText("Writing in full screen")
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.left >= 0 && bounds.right <= window.innerWidth
      })
    )
    .toBe(true)
  expect(
    await toolbar.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("compact-editor-mobile.png"),
  })
  await page.getByRole("button", { name: "Full screen", exact: true }).click()
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true })
  ).toBeVisible()
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return (
          Math.round(bounds.left) === 0 &&
          Math.round(bounds.top) === 0 &&
          Math.round(bounds.width) === window.innerWidth &&
          Math.round(bounds.height) === window.innerHeight
        )
      })
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("fullscreen-editor-mobile.png"),
  })
  await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    page.getByRole("button", { name: "Save", exact: true }).click()
  )
  await page
    .getByRole("heading", { name: "Workspace revised", exact: true })
    .click()
  await expect(editor.locator("h2")).toHaveCount(2)
  await expect(editor).toContainText("Writing in full screen")
  await expect(
    dialog.getByText("Workspace revised", { exact: true })
  ).toBeVisible()
})

test("uploads keep their insertion point and failed uploads leave no broken images", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const png = await sharp({
    create: { width: 100, height: 60, channels: 3, background: "#3977a8" },
  })
    .png()
    .toBuffer()
  await page.route("https://editor-images.test/**", (route) =>
    route.fulfill({ body: png, contentType: "image/png" })
  )
  const response = await page.request.post("/api/v1/quick-notes", {
    data: {
      kind: "text",
      title: "Upload journey",
      bodyJson: {
        type: "doc",
        content: [paragraph("Before"), paragraph("After")],
      },
      bodyText: "Before\nAfter",
    },
  })
  const doc = await response.json()
  await page.goto("/docs")
  await page
    .getByRole("heading", { name: "Upload journey", exact: true })
    .click()
  const editor = page.locator(".tiptap")
  await editor.locator("p").first().click()
  await page.keyboard.press("End")
  let finishUpload!: () => void
  const wait = new Promise<void>((resolve) => {
    finishUpload = resolve
  })
  await page.route("**/api/v1/quick-notes/images", (route) =>
    route.fulfill({
      json: {
        fileId: "fake-upload",
        uploadUrl: "/editor-test-upload",
        headers: {},
      },
    })
  )
  await page.route("**/editor-test-upload", async (route) => {
    await wait
    await route.fulfill({ status: 200 })
  })
  await page.route(
    "**/api/v1/quick-notes/images/fake-upload/complete",
    (route) =>
      route.fulfill({ json: { url: imageUrl, width: 100, height: 60 } })
  )
  await page
    .getByLabel("Insert image file")
    .setInputFiles({ name: "image.png", mimeType: "image/png", buffer: png })
  await expect(
    page.getByRole("button", { name: "Save", exact: true })
  ).toBeDisabled()
  await expect(editor.locator("figure")).toHaveCount(0)
  await expect(editor.locator(".document-image-upload")).toBeVisible()
  await editor.locator("p").last().click()
  await page.keyboard.press("End")
  await page.keyboard.type(" edited while uploading")
  finishUpload()
  await expect(editor.locator("figure img")).toHaveAttribute("src", imageUrl)
  await expect(
    editor.locator("figure").locator("xpath=following-sibling::p").last()
  ).toHaveText("After edited while uploading")
  await expect(editor.locator(".document-image-upload")).toHaveCount(0)
  await page.getByRole("button", { name: "Formatting options" }).click()
  await page.getByRole("button", { name: "Insert image", exact: true }).click()
  await page.route("**/editor-test-upload", (route) =>
    route.fulfill({ status: 500 })
  )
  await page
    .getByLabel("Insert image file")
    .setInputFiles({ name: "failed.png", mimeType: "image/png", buffer: png })
  await expect(
    page.getByRole("button", { name: "Save", exact: true })
  ).toBeEnabled()
  await expect(editor.locator("figure")).toHaveCount(1)
  await expect(editor.locator(".document-image-upload")).toHaveCount(0)
  await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    page.getByRole("button", { name: "Save", exact: true }).click()
  )
  const saved = await (await page.request.get(`/api/v1/docs/${doc.id}`)).json()
  expect(JSON.stringify(saved.bodyJson)).not.toContain("blob:")
  expect(saved.bodyText).toContain("After edited while uploading")
})

test("temporary image URLs cannot be persisted by the API", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const response = await page.request.post("/api/v1/quick-notes", {
    data: {
      kind: "text",
      title: "Invalid image",
      bodyJson: {
        type: "doc",
        content: [{ type: "image", attrs: { src: "blob:pending" } }],
      },
    },
  })
  expect(response.status()).toBe(400)
})
