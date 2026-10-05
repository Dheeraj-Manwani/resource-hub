import { test, expect } from "./fixtures"
import sharp from "sharp"

const storageConfigured = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
].every((key) => !!process.env[key]?.trim())

test("upload, edit and permanently delete an image and a file", async ({
  page,
  testAccount,
}) => {
  test.skip(
    !storageConfigured,
    "Real upload coverage requires R2 credentials in .env.local or .env."
  )
  expect(testAccount.id).toBeTruthy()
  await page.goto("/resources")
  const uploads = [
    {
      name: "e2e-image.png",
      mimeType: "image/png",
      buffer: await sharp({
        create: { width: 32, height: 32, channels: 4, background: "#5b5bd6" },
      })
        .png()
        .toBuffer(),
    },
    {
      name: "e2e-document.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Disposable Playwright document.\n"),
    },
  ]
  for (const file of uploads) {
    await test.step(`Upload and edit ${file.name}`, async () => {
      await page
        .locator("header")
        .getByRole("button", { name: "Add", exact: true })
        .click()
      await page
        .getByRole("menuitem", { name: "Add resource", exact: true })
        .click()
      const dialog = page.getByRole("dialog", {
        name: "Add resource",
        exact: true,
      })
      const [completed] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            /\/api\/v1\/uploads\/[^/]+\/complete$/.test(
              new URL(response.url()).pathname
            ),
          { timeout: 180_000 }
        ),
        dialog.locator('input[type="file"]').setInputFiles(file),
      ])
      expect(completed.ok(), await completed.text()).toBe(true)
      const resource = await completed.json()
      const originalTitle = resource.title ?? file.name
      await dialog.getByRole("button", { name: "Done", exact: true }).click()
      await expect(
        page.getByRole("button", { name: originalTitle, exact: true })
      ).toBeVisible()
      await page
        .getByRole("button", { name: originalTitle, exact: true })
        .click({ button: "right" })
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
      const drawer = page.getByRole("dialog")
      const title = `${file.name} edited`
      await drawer.locator("input").first().fill(title)
      const [edited] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === "PATCH" &&
            new URL(response.url()).pathname ===
              `/api/v1/resources/${resource.id}`
        ),
        drawer.locator("input").first().press("Enter"),
      ])
      expect(edited.ok()).toBe(true)
      await page.reload()
      await expect(
        page.getByRole("dialog").locator("input").first()
      ).toHaveValue(title)
      const [deleted] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === "DELETE" &&
            new URL(response.url()).pathname ===
              `/api/v1/resources/${resource.id}`
        ),
        page
          .getByRole("dialog")
          .getByRole("button", { name: "Delete", exact: true })
          .click(),
      ])
      expect(deleted.ok()).toBe(true)
      await page.goto("/trash")
      const row = page
        .locator("li")
        .filter({ has: page.getByText(title, { exact: true }) })
      await row
        .getByRole("button", { name: "Delete forever", exact: true })
        .click()
      const [purged] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === "DELETE" &&
            new URL(response.url()).pathname ===
              `/api/v1/trash/resource/${resource.id}`
        ),
        page
          .getByRole("dialog")
          .getByRole("button", { name: "Delete forever", exact: true })
          .click(),
      ])
      expect(purged.ok()).toBe(true)
      await expect(row).toHaveCount(0)
      await page.goto("/resources")
      await expect(
        page.getByRole("button", { name: title, exact: true })
      ).toHaveCount(0)
    })
  }
})
