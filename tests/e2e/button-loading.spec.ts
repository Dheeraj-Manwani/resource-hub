import type { Locator, Page } from "@playwright/test"
import { test, expect } from "./fixtures"
import { addMenu } from "./helpers"

type HeldWrite = {
  method: string
  path: string
  gate: Promise<void>
  fail: boolean
}
const heldWrites = new WeakMap<Page, HeldWrite>()

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const held = heldWrites.get(page)
    if (
      held &&
      route.request().method() === held.method &&
      new URL(route.request().url()).pathname === `/api/v1${held.path}`
    ) {
      await held.gate
      if (held.fail)
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Test save failed" } }),
        })
    }
    await route.continue()
  })
})

// Hold the request so loading feedback is checked before the real DB write.
async function pendingAction(
  page: Page,
  method: string,
  path: string,
  button: Locator,
  during?: () => Promise<void>,
  fail = false
) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  heldWrites.set(page, { method, path, gate, fail })
  const response = page.waitForResponse(
    (res) =>
      res.request().method() === method &&
      new URL(res.url()).pathname === `/api/v1${path}`
  )
  try {
    await button.click()
    await expect(button).toHaveAttribute("aria-busy", "true")
    await expect(button).toBeDisabled()
    await expect(button.locator('[data-slot="button-spinner"]')).toBeVisible()
    await during?.()
  } finally {
    release()
  }
  const result = await response
  if (fail) expect(result.status()).toBe(500)
  else expect(result.ok()).toBe(true)
  heldWrites.delete(page)
  return result
}

test("create buttons show loading, preserve dialogs and allow retry after errors", async ({
  page,
  testAccount,
}) => {
  await page.goto("/resources")
  await addMenu(page, "Add resource")
  const resourceDialog = page.getByRole("dialog", {
    name: "Add resource",
    exact: true,
  })
  await resourceDialog
    .getByLabel("URL, text or links")
    .fill("Loading test resource")
  const save = resourceDialog.getByRole("button", { name: "Save", exact: true })
  await pendingAction(
    page,
    "POST",
    "/resources",
    save,
    async () => {
      const cancel = resourceDialog.getByRole("button", {
        name: "Cancel",
        exact: true,
      })
      await expect(cancel).toBeDisabled()
      await expect(cancel.locator('[data-slot="button-spinner"]')).toHaveCount(
        0
      )
      await page.keyboard.press("Escape")
      await expect(resourceDialog).toBeVisible()
    },
    true
  )
  await expect(save).toBeEnabled()
  await expect(save).toHaveAttribute("aria-busy", "false")
  await expect(resourceDialog.getByLabel("URL, text or links")).toHaveValue(
    "Loading test resource"
  )
  await pendingAction(page, "POST", "/resources", save)
  await expect(resourceDialog).toHaveCount(0)

  await addMenu(page, "Add task")
  const taskDialog = page.getByRole("dialog", { name: "New task", exact: true })
  await taskDialog.locator("input").first().fill("Loading test task")
  await pendingAction(
    page,
    "POST",
    "/tasks",
    taskDialog.getByRole("button", { name: "Add", exact: true })
  )
  await expect(taskDialog).toHaveCount(0)

  await page.goto("/tags")
  await expect(page.getByText("No tags yet", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "New tag", exact: true }).click()
  const tagDialog = page.getByRole("dialog", { name: "New tag", exact: true })
  await tagDialog.getByLabel("Tag name", { exact: true }).fill("loading-test")
  await pendingAction(
    page,
    "POST",
    "/tags",
    tagDialog.getByRole("button", { name: "Create", exact: true })
  )
  await expect(tagDialog).toHaveCount(0)

  await page.goto("/quick-notes")
  await page
    .locator("main")
    .getByRole("button", { name: "New note", exact: true })
    .first()
    .click()
  const noteDialog = page.getByRole("dialog", {
    name: "New quick note",
    exact: true,
  })
  await noteDialog
    .getByPlaceholder("Untitled", { exact: true })
    .fill("Loading quick note")
  await page.keyboard.press("Escape")
  const unsaved = page.getByRole("dialog", {
    name: "Unsaved changes",
    exact: true,
  })
  await pendingAction(
    page,
    "POST",
    "/quick-notes",
    unsaved.getByRole("button", { name: "Save & Exit", exact: true }),
    async () => {
      await expect(unsaved).toBeVisible()
    }
  )
  await expect(noteDialog).toHaveCount(0)
  await expect(unsaved).toHaveCount(0)
  expect(testAccount.id).toBeTruthy()
})

test("project create, update and delete show loading inside the action button", async ({
  page,
  testAccount,
}) => {
  await page.goto("/resources")
  await addMenu(page, "New project")
  const createDialog = page.getByRole("dialog", {
    name: "New project",
    exact: true,
  })
  await createDialog
    .getByPlaceholder("Project name", { exact: true })
    .fill("Loading project")
  const created = await pendingAction(
    page,
    "POST",
    "/projects",
    createDialog.getByRole("button", { name: "Create", exact: true })
  )
  const project = await created.json()
  await expect(
    page.getByRole("heading", { name: "Loading project", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Project info", exact: true }).click()
  await page
    .getByRole("button", { name: "Edit project info", exact: true })
    .click()
  const editDialog = page.getByRole("dialog", {
    name: "Edit project",
    exact: true,
  })
  await editDialog.locator("input").fill("Loading project edited")
  await pendingAction(
    page,
    "PATCH",
    `/projects/${project.id}`,
    editDialog.getByRole("button", { name: "Save", exact: true }),
    async () => {
      await page.keyboard.press("Escape")
      await expect(editDialog).toBeVisible()
    }
  )
  await expect(editDialog).toHaveCount(0)
  await page.keyboard.press("Escape")
  await page
    .getByRole("button", { name: "Project options", exact: true })
    .click()
  await page.getByRole("menuitem", { name: "Delete…", exact: true }).click()
  const deleteDialog = page.getByRole("dialog", {
    name: 'Delete "Loading project edited"?',
    exact: true,
  })
  await pendingAction(
    page,
    "DELETE",
    `/projects/${project.id}`,
    deleteDialog.getByRole("button", { name: "Delete", exact: true })
  )
  await expect(deleteDialog).toHaveCount(0)
  expect(testAccount.id).toBeTruthy()
})
