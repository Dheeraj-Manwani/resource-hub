import { test, expect } from "./fixtures"
import { addMenu, write } from "./helpers"

test("link capture, bulk capture/delete, optimistic favorites and global syncing", async ({
  page,
  testAccount,
}) => {
  await page.goto("/resources")
  let id = ""
  await test.step("Capture a URL through Add resource", async () => {
    await addMenu(page, "Add resource")
    const dialog = page.getByRole("dialog", {
      name: "Add resource",
      exact: true,
    })
    await dialog
      .getByLabel("URL, text or links")
      .fill(`E2E link https://example.com/?e2e=${testAccount.id}`)
    const created = await write(page, "POST", "/resources", () =>
      dialog.getByRole("button", { name: "Save", exact: true }).click()
    )
    id = (await created.json()).id
    await expect(
      page.getByRole("button", { name: "E2E link", exact: true })
    ).toBeVisible()
  })

  await test.step("Show optimistic Favorite and sidebar Syncing while a real write waits", async () => {
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const writing = new Promise<void>((resolve) => {
      started = resolve
    })
    const path = `**/api/v1/resources/${id}`
    await page.route(path, async (route) => {
      if (route.request().method() === "PATCH") {
        started()
        await gate
      }
      // Delay only: the actual app endpoint and database still handle the write.
      await route.continue()
    })
    const response = page.waitForResponse(
      (res) =>
        res.request().method() === "PATCH" &&
        new URL(res.url()).pathname === `/api/v1/resources/${id}`,
      { timeout: 30_000 }
    )
    try {
      const card = page.getByRole("button", { name: "E2E link", exact: true })
      await card.click({ button: "right" })
      await page
        .getByRole("menuitem", { name: "Add to favorites", exact: true })
        .click()
      await writing
      await expect(
        card.getByRole("button", { name: "Remove from favorites", exact: true })
      ).toBeVisible()
      await expect(
        page.locator("aside").getByRole("button", { name: /^Syncing/ })
      ).toBeVisible()
    } finally {
      release()
    }
    expect((await response).ok()).toBe(true)
    await page.unroute(path)
    await expect(
      page.locator("aside").getByRole("button", { name: /^Syncing/ })
    ).toHaveCount(0)
    await page.reload()
    await expect(
      page
        .getByRole("button", { name: "E2E link", exact: true })
        .getByRole("button", { name: "Remove from favorites", exact: true })
    ).toBeVisible()
  })

  await test.step("Capture multiple URLs and bulk-delete every selected resource", async () => {
    await addMenu(page, "Add resource")
    const dialog = page.getByRole("dialog", {
      name: "Add resource",
      exact: true,
    })
    await dialog
      .getByLabel("URL, text or links")
      .fill(
        `https://example.com/?e2e=${testAccount.id}-a\nhttps://example.com/?e2e=${testAccount.id}-b`
      )
    const created = await write(page, "POST", "/resources/bulk", () =>
      dialog.getByRole("button", { name: "Save 2 links", exact: true }).click()
    )
    expect((await created.json()).created).toHaveLength(2)
    await expect(dialog).toHaveCount(0)
    await page.getByRole("button", { name: "Select", exact: true }).click()
    const selection = page.getByRole("checkbox", {
      name: "Select",
      exact: true,
    })
    await expect(selection).toHaveCount(3)
    // Click the first remaining unchecked box: checked boxes become Deselect.
    for (let index = 0; index < 3; index++) await selection.first().click()
    await expect(page.getByText("3 selected", { exact: true })).toBeVisible()
    await write(page, "POST", "/resources/bulk-actions", () =>
      page.getByRole("button", { name: "Delete", exact: true }).click()
    )
    await page.goto("/trash")
    await expect(
      page.locator("main").getByRole("button", { name: "Restore", exact: true })
    ).toHaveCount(3)
    await page.getByRole("button", { name: "Empty Trash", exact: true }).click()
    await write(page, "POST", "/trash/empty", () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Empty Trash", exact: true })
        .click()
    )
    await expect(
      page.getByRole("heading", { name: "Trash is empty", exact: true })
    ).toBeVisible()
  })
})
