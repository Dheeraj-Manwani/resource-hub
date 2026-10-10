import { test, expect } from "./fixtures"
import { createDrawing } from "../../lib/docs/drawing"

test("drawing docs save freehand strokes, reopen, export, import and restore history", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  await page.goto("/docs")
  await page
    .getByRole("button", { name: "New doc", exact: true })
    .first()
    .click()
  await page
    .getByRole("button", { name: "Drawing — sketch freely with Excalidraw" })
    .click()
  const dialog = page.getByRole("dialog", { name: "Drawing doc", exact: true })
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true })
  ).toBeEnabled({ timeout: 90_000 })
  await page.getByLabel("Document title").fill("Sketch plan")
  const canvas = page.locator(".excalidraw canvas.interactive")
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  await canvas.click({ position: { x: 400, y: 300 } })
  await page.keyboard.press("p")
  await page.mouse.move(box.x + 400, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x + 500, box.y + 350, { steps: 10 })
  await page.mouse.move(box.x + 550, box.y + 300, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.press("t")
  await canvas.click({ position: { x: 420, y: 420 } })
  await page.locator("textarea.excalidraw-wysiwyg").fill("Sketch idea")
  await page.keyboard.press("Control+s")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  const list = await (await page.request.get("/api/v1/quick-notes")).json()
  const doc = list.items.find(
    (item: { title: string }) => item.title === "Sketch plan"
  )
  expect(doc.kind).toBe("drawing")
  expect(doc.bodyJson.elements[0].type).toBe("freedraw")
  expect(doc.bodyJson.elements[0].points.length).toBeGreaterThan(2)
  expect(doc.bodyText).toContain("Sketch idea")
  const font = await page.request.get(
    "/api/drawing-assets/fonts/Virgil/Virgil-Regular.woff2"
  )
  expect(font.ok()).toBe(true)
  expect(font.headers()["content-type"]).toBe("font/woff2")
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole("button", { name: "Drawings", exact: true }).click()
  await page.getByRole("button", { name: /Sketch plan/ }).click()
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true })
  ).toBeEnabled()
  const download = page.waitForEvent("download")
  await page
    .getByRole("button", { name: "Export drawing", exact: true })
    .click()
  const exported = await download
  expect(exported.suggestedFilename()).toBe("Sketch plan.excalidraw")
  const file = testInfo.outputPath("sketch.excalidraw")
  await exported.saveAs(file)
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await page.getByLabel("Drawing file").setInputFiles({
    name: "broken.excalidraw",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  })
  await expect(
    page
      .getByRole("dialog", { name: "Import drawing", exact: true })
      .getByRole("alert")
  ).toBeVisible()
  await page.getByLabel("Drawing file").setInputFiles(file)
  await expect(
    page.getByRole("dialog", { name: "Import drawing", exact: true })
  ).toHaveCount(0)
  await page.getByLabel("Document title").fill("Updated sketch")
  await page.keyboard.press("Control+s")
  await expect(dialog.getByRole("status")).toHaveText("Saved")
  await page.getByRole("button", { name: "History", exact: true }).click()
  await page
    .getByRole("button", { name: new RegExp(`Restore v${doc.revision} ·`) })
    .click()
  await expect(page.getByLabel("Document title")).toHaveValue("Sketch plan")
  await page.screenshot({ path: testInfo.outputPath("drawing-canvas.png") })
  await page.getByRole("button", { name: "Close", exact: true }).click()
  const restored = await (
    await page.request.get(`/api/v1/docs/${doc.id}`)
  ).json()
  expect(restored.bodyJson.elements[0].points).toEqual(
    doc.bodyJson.elements[0].points
  )
  await page.screenshot({ path: testInfo.outputPath("drawing-docs.png") })
})

test("drawing saves validate scenes, require revisions and reject stale writes", async ({
  page,
  testAccount,
}) => {
  void testAccount
  for (const bodyJson of [
    undefined,
    {},
    { ...createDrawing(), elements: [{ type: "freedraw" }] },
  ]) {
    expect(
      (
        await page.request.post("/api/v1/quick-notes", {
          data: { kind: "drawing", bodyJson },
        })
      ).status()
    ).toBe(400)
  }
  const response = await page.request.post("/api/v1/quick-notes", {
    data: { kind: "drawing", bodyJson: createDrawing() },
  })
  expect(response.ok()).toBe(true)
  const doc = await response.json()
  expect(
    (
      await page.request.patch(`/api/v1/quick-notes/${doc.id}`, {
        data: { bodyJson: doc.bodyJson },
      })
    ).status()
  ).toBe(400)
  expect(
    (
      await page.request.patch(`/api/v1/quick-notes/${doc.id}`, {
        data: { bodyJson: doc.bodyJson, expectedRevision: doc.revision },
      })
    ).ok()
  ).toBe(true)
  expect(
    (
      await page.request.patch(`/api/v1/quick-notes/${doc.id}`, {
        data: { bodyJson: doc.bodyJson, expectedRevision: doc.revision },
      })
    ).status()
  ).toBe(409)
  expect(
    (
      await page.request.patch(`/api/v1/quick-notes/${doc.id}`, {
        data: { kind: "text" },
      })
    ).status()
  ).toBe(400)
})
