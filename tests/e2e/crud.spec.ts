import type { Page } from "@playwright/test"
import { test, expect } from "./fixtures"
import { write, addMenu } from "./helpers"

async function deleteProject(page: Page, id: string, name: string) {
  await page.goto(`/projects/${id}`)
  await page.getByRole("button", { name: "Project options" }).click()
  await page.getByRole("menuitem", { name: "Delete…", exact: true }).click()
  await write(page, "DELETE", `/projects/${id}`, () =>
    page
      .getByRole("dialog", { name: `Delete "${name}"?` })
      .getByRole("button", { name: "Delete", exact: true })
      .click()
  )
}

test("real account: projects, resources, tasks, notes, tags, associations and trash CRUD", async ({
  page,
  testAccount,
}) => {
  let projectId = ""
  let childId = ""
  let resourceId = ""
  let taskId = ""
  const projectName = "E2E project edited"
  const resourceName = "E2E resource edited"
  const taskName = "E2E task edited"

  await test.step("Sign in with the disposable account and verify the session", async () => {
    await page.goto("/resources")
    await expect(page).toHaveURL(/\/resources$/)
    await page.getByRole("button", { name: "Account menu" }).click()
    await expect(
      page.getByText(testAccount.email, { exact: true })
    ).toBeVisible()
    await page.keyboard.press("Escape")
  })

  await test.step("Add and edit a project, then create a sub-project", async () => {
    await addMenu(page, "New project")
    await page
      .getByPlaceholder("Project name", { exact: true })
      .fill("E2E project")
    const created = await write(page, "POST", "/projects", () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Create", exact: true })
        .click()
    )
    projectId = (await created.json()).id
    await expect(
      page.getByRole("heading", { name: "E2E project", exact: true })
    ).toBeVisible()
    await page
      .getByRole("button", { name: "Project info", exact: true })
      .click()
    await page
      .getByRole("button", { name: "Edit project info", exact: true })
      .click()
    const dialog = page.getByRole("dialog", {
      name: "Edit project",
      exact: true,
    })
    await dialog.locator("input").fill(projectName)
    await dialog
      .getByPlaceholder("What's this project for?")
      .fill("Created and edited through the visible browser.")
    await write(page, "PATCH", `/projects/${projectId}`, () =>
      dialog.getByRole("button", { name: "Save", exact: true }).click()
    )
    await page.keyboard.press("Escape")
    await page.reload()
    await expect(
      page.getByRole("heading", { name: projectName, exact: true })
    ).toBeVisible()
    await page.getByRole("tab", { name: /Sub-projects/ }).click()
    await page
      .getByRole("button", { name: "New sub-project", exact: true })
      .click()
    await page
      .getByPlaceholder("Project name", { exact: true })
      .fill("E2E child")
    const child = await write(page, "POST", "/projects", () =>
      page.getByPlaceholder("Project name", { exact: true }).press("Enter")
    )
    childId = (await child.json()).id
    await expect(
      page.getByRole("link", { name: /E2E child/ }).last()
    ).toBeVisible()
  })

  await test.step("Add a note resource and tag, edit fields, file and unfile it", async () => {
    await page.goto("/resources")
    await addMenu(page, "Add resource")
    const dialog = page.getByRole("dialog", {
      name: "Add resource",
      exact: true,
    })
    await dialog.getByLabel("URL, text or links").fill("E2E resource original")
    await dialog.getByLabel("Tags", { exact: true }).fill("e2etag")
    await dialog.getByLabel("Tags", { exact: true }).press("Enter")
    const created = await write(page, "POST", "/resources", () =>
      dialog.getByRole("button", { name: "Save", exact: true }).click()
    )
    resourceId = (await created.json()).id
    await expect(
      page.getByRole("button", { name: "E2E resource original", exact: true })
    ).toBeVisible()
    await page
      .getByRole("button", { name: "E2E resource original", exact: true })
      .click({ button: "right" })
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const drawer = page.getByRole("dialog")
    await drawer.locator("input").first().fill(resourceName)
    await write(page, "PATCH", `/resources/${resourceId}`, () =>
      drawer.locator("input").first().press("Enter")
    )
    await drawer
      .getByLabel("Notes", { exact: true })
      .fill("Resource notes survive reload.")
    await write(page, "PATCH", `/resources/${resourceId}`, () =>
      drawer.getByRole("button", { name: "Save", exact: true }).click()
    )
    await drawer
      .getByRole("button", { name: "Add to project", exact: true })
      .click()
    await write(page, "POST", `/projects/${projectId}/resources`, () =>
      page.getByRole("button", { name: projectName, exact: true }).click()
    )
    await expect(
      drawer.getByRole("link", { name: projectName, exact: true })
    ).toBeVisible()
    await write(page, "DELETE", `/projects/${projectId}/resources`, () =>
      drawer
        .getByRole("button", {
          name: `Remove from ${projectName}`,
          exact: true,
        })
        .click()
    )
    await page.reload()
    await expect(page.getByRole("dialog").locator("input").first()).toHaveValue(
      resourceName
    )
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
      "Resource notes survive reload."
    )
    await page.keyboard.press("Escape")
  })

  await test.step("Add and edit a task, status, project, checklist and reminders", async () => {
    await page.goto("/tasks")
    const input = page.getByPlaceholder(
      "finish landing page friday 5pm #project !high"
    )
    await input.fill("E2E task original tomorrow !high")
    const created = await write(page, "POST", "/tasks", () =>
      input.press("Enter")
    )
    taskId = (await created.json()).id
    await page.getByText("E2E task original", { exact: true }).click()
    const drawer = page.getByRole("dialog")
    await drawer.locator("input").first().fill(taskName)
    await write(page, "PATCH", `/tasks/${taskId}`, () =>
      drawer.locator("input").first().press("Enter")
    )
    await drawer.getByRole("combobox", { name: "Status", exact: true }).click()
    await write(page, "PATCH", `/tasks/${taskId}`, () =>
      page.getByRole("option", { name: "In progress", exact: true }).click()
    )
    await drawer
      .getByRole("button", { name: "No project (Inbox)", exact: true })
      .click()
    await write(page, "PATCH", `/tasks/${taskId}`, () =>
      page.getByRole("button", { name: projectName, exact: true }).click()
    )
    await drawer.getByLabel("Checklist item title").fill("E2E checklist")
    const item = await write(page, "POST", `/tasks/${taskId}/checklist`, () =>
      drawer.getByLabel("Checklist item title").press("Enter")
    )
    const itemId = (await item.json()).checklist[0].id
    const row = drawer.locator("li").filter({
      has: page.getByRole("checkbox", {
        name: "Complete E2E checklist",
        exact: true,
      }),
    })
    await row.getByRole("textbox").fill("E2E checklist edited")
    await write(page, "PATCH", `/tasks/${taskId}/checklist/${itemId}`, () =>
      row.getByRole("textbox").press("Enter")
    )
    await write(page, "PATCH", `/tasks/${taskId}/checklist/${itemId}`, () =>
      drawer
        .getByRole("checkbox", {
          name: "Complete E2E checklist edited",
          exact: true,
        })
        .click()
    )
    await expect(
      drawer.getByRole("checkbox", {
        name: "Complete E2E checklist edited",
        exact: true,
      })
    ).toBeChecked()
    await drawer
      .getByRole("button", { name: "Add reminder", exact: true })
      .click()
    const reminder = await write(
      page,
      "POST",
      `/tasks/${taskId}/reminders`,
      () =>
        page
          .getByRole("option", { name: "5 minutes before", exact: true })
          .click()
    )
    const reminderId = (await reminder.json()).id
    await expect(
      drawer.getByText("5 minutes before", { exact: true })
    ).toBeVisible()
    await page.reload()
    await expect(page.getByRole("dialog").locator("input").first()).toHaveValue(
      taskName
    )
    await expect(
      page.getByRole("combobox", { name: "Status", exact: true })
    ).toContainText("In progress")
    await expect(
      page.getByRole("checkbox", {
        name: "Complete E2E checklist edited",
        exact: true,
      })
    ).toBeChecked()
    await write(
      page,
      "DELETE",
      `/tasks/${taskId}/reminders/${reminderId}`,
      () =>
        page
          .getByRole("button", { name: "Remove reminder", exact: true })
          .click()
    )
    await write(page, "DELETE", `/tasks/${taskId}/checklist/${itemId}`, () =>
      page.getByRole("button", { name: "Delete item", exact: true }).click()
    )
    await expect(
      page.getByRole("checkbox", {
        name: "Complete E2E checklist edited",
        exact: true,
      })
    ).toHaveCount(0)
  })

  await test.step("Link and unlink a resource from a task", async () => {
    await page
      .getByRole("button", { name: "Link resource", exact: true })
      .click()
    const picker = page.getByRole("dialog", {
      name: "Link resources",
      exact: true,
    })
    await picker.getByText(resourceName, { exact: true }).click()
    await write(page, "POST", `/tasks/${taskId}/resources`, () =>
      picker.getByRole("button", { name: "Add 1", exact: true }).click()
    )
    await expect(
      page.getByRole("dialog").getByText(resourceName, { exact: true })
    ).toBeVisible()
    await write(page, "DELETE", `/tasks/${taskId}/resources`, () =>
      page.getByRole("button", { name: "Unlink resource", exact: true }).click()
    )
    await expect(
      page.getByRole("button", { name: "Unlink resource", exact: true })
    ).toHaveCount(0)
    await page.keyboard.press("Escape")
  })

  await test.step("Find saved entities through search and complete a task from Calendar", async () => {
    await page.goto("/search")
    await page
      .getByPlaceholder("Search everything…", { exact: true })
      .fill("E2E")
    await expect(
      page.locator("main").getByText(resourceName, { exact: true })
    ).toBeVisible()
    await expect(
      page
        .locator("main")
        .getByRole("button", { name: new RegExp(`^${taskName}`) })
    ).toBeVisible()
    await page.goto("/calendar")
    const checkbox = page.getByRole("checkbox", {
      name: `Mark ${taskName} complete`,
      exact: true,
    })
    await expect(checkbox).toBeVisible()
    await write(page, "PATCH", `/tasks/${taskId}/occurrences`, () =>
      checkbox.click()
    )
    await expect(
      page.getByRole("checkbox", {
        name: `Mark ${taskName} incomplete`,
        exact: true,
      })
    ).toBeChecked()
    await page.reload()
    await expect(
      page.getByRole("checkbox", {
        name: `Mark ${taskName} incomplete`,
        exact: true,
      })
    ).toBeChecked()
  })

  await test.step("Add, edit and delete a rich-text quick note", async () => {
    await page.goto("/quick-notes")
    await addMenu(page, "New quick note")
    const dialog = page.getByRole("dialog", {
      name: "New quick note",
      exact: true,
    })
    await dialog
      .getByPlaceholder("Untitled", { exact: true })
      .fill("E2E quick note")
    await dialog
      .locator('[contenteditable="true"]')
      .fill("A real rich-text note body.")
    const created = await write(page, "POST", "/quick-notes", () =>
      dialog.getByRole("button", { name: "Save", exact: true }).click()
    )
    const id = (await created.json()).id
    await page
      .getByRole("heading", { name: "E2E quick note", exact: true })
      .click()
    const edit = page.getByRole("dialog", {
      name: "Edit quick note",
      exact: true,
    })
    await edit
      .getByPlaceholder("Untitled", { exact: true })
      .fill("E2E quick note edited")
    await edit
      .locator('[contenteditable="true"]')
      .fill("Edited rich-text content.")
    await edit.getByRole("button", { name: "No project", exact: true }).click()
    await page.getByRole("button", { name: projectName, exact: true }).click()
    await write(page, "PATCH", `/quick-notes/${id}`, () =>
      edit.getByRole("button", { name: "Save", exact: true }).click()
    )
    await page.reload()
    await expect(
      page.getByRole("heading", { name: "E2E quick note edited", exact: true })
    ).toBeVisible()
    await expect(
      page.getByText("Edited rich-text content.", { exact: true })
    ).toBeVisible()
    await page.getByRole("button", { name: /E2E quick note edited/ }).hover()
    await page.getByRole("button", { name: "Delete note", exact: true }).click()
    await write(page, "DELETE", `/quick-notes/${id}`, () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click()
    )
    await expect(
      page.getByRole("heading", { name: "E2E quick note edited", exact: true })
    ).toHaveCount(0)
  })

  await test.step("Rename, recolor and delete the resource tag", async () => {
    await page.goto("/tags")
    await page.getByRole("button", { name: "#e2etag", exact: true }).click()
    const row = page.locator("li").filter({
      has: page.getByRole("checkbox", {
        name: "Select #e2etag",
        exact: true,
      }),
    })
    await row.getByRole("textbox").fill("e2etag-edited")
    const renamed = await writeTag(page, "PATCH", () =>
      row.getByRole("textbox").press("Enter")
    )
    const tagId = (await renamed.json()).id
    const editedRow = page.locator("li").filter({
      has: page.getByRole("button", { name: "#e2etag-edited", exact: true }),
    })
    await editedRow
      .getByRole("button", { name: "Change color", exact: true })
      .click()
    await writeTag(page, "PATCH", () =>
      page
        .getByRole("button", { name: /^Color / })
        .first()
        .click()
    )
    await page.keyboard.press("Escape")
    await page.reload()
    await expect(
      page.getByRole("button", { name: "#e2etag-edited", exact: true })
    ).toBeVisible()
    await page
      .getByRole("button", { name: "Delete #e2etag-edited", exact: true })
      .click()
    await write(page, "DELETE", `/tags/${tagId}`, () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click()
    )
    await expect(
      page.getByRole("button", { name: "#e2etag-edited", exact: true })
    ).toHaveCount(0)
  })

  await test.step("Create and revoke an API token", async () => {
    await page.goto("/settings")
    await page.getByLabel("Token name", { exact: true }).fill("E2E token")
    const created = await write(page, "POST", "/tokens", () =>
      page.getByRole("button", { name: "Create token", exact: true }).click()
    )
    await expect(
      page.getByRole("button", { name: "Revoke E2E token", exact: true })
    ).toBeVisible()
    await write(page, "DELETE", `/tokens/${(await created.json()).id}`, () =>
      page
        .getByRole("button", { name: "Revoke E2E token", exact: true })
        .click()
    )
    await expect(
      page.getByRole("button", { name: "Revoke E2E token", exact: true })
    ).toHaveCount(0)
  })

  await test.step("Delete task/resource/projects; restore all entity types; permanently delete and empty Trash", async () => {
    await page.goto(`/resources?r=${resourceId}`)
    await write(page, "DELETE", `/resources/${resourceId}`, () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click()
    )
    await page.goto(`/tasks?t=${taskId}`)
    await write(page, "DELETE", `/tasks/${taskId}`, () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click()
    )
    await deleteProject(page, childId, "E2E child")
    await deleteProject(page, projectId, projectName)
    await page.goto("/trash")
    for (const [type, id, name] of [
      ["resource", resourceId, resourceName],
      ["task", taskId, taskName],
      ["project", projectId, projectName],
      ["project", childId, "E2E child"],
    ]) {
      const row = page
        .locator("main")
        .locator("li")
        .filter({ has: page.getByText(name, { exact: true }) })
      await expect(row).toBeVisible()
      await write(page, "POST", `/trash/${type}/${id}/restore`, () =>
        row.getByRole("button", { name: "Restore", exact: true }).click()
      )
      await expect(row).toHaveCount(0)
    }
    await page.reload()
    await expect(
      page.getByRole("heading", { name: "Trash is empty", exact: true })
    ).toBeVisible()
    await page.goto(`/resources?r=${resourceId}`)
    await expect(page.getByRole("dialog").locator("input").first()).toHaveValue(
      resourceName
    )
    await write(page, "DELETE", `/resources/${resourceId}`, () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click()
    )
    await page.goto("/trash")
    await page
      .getByRole("button", { name: "Delete forever", exact: true })
      .click()
    await write(page, "DELETE", `/trash/resource/${resourceId}`, () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete forever", exact: true })
        .click()
    )
    await page.goto(`/tasks?t=${taskId}`)
    await expect(page.getByRole("dialog").locator("input").first()).toHaveValue(
      taskName
    )
    await write(page, "DELETE", `/tasks/${taskId}`, () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click()
    )
    await deleteProject(page, childId, "E2E child")
    await deleteProject(page, projectId, projectName)
    await page.goto("/trash")
    await page.getByRole("button", { name: "Empty Trash", exact: true }).click()
    await write(page, "POST", "/trash/empty", () =>
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Empty Trash", exact: true })
        .click()
    )
    await page.reload()
    await expect(
      page.getByRole("heading", { name: "Trash is empty", exact: true })
    ).toBeVisible()
  })

  await test.step("Log out and verify protected pages require authentication again", async () => {
    await page
      .getByRole("button", { name: "Account menu", exact: true })
      .click()
    await page.getByRole("menuitem", { name: "Log out", exact: true }).click()
    await expect(
      page.getByRole("button", { name: "Continue with Google", exact: true })
    ).toBeVisible()
    await page.goto("/resources")
    await expect(page).toHaveURL(/\/\?next=%2Fresources$/)
  })
})

async function writeTag(
  page: Page,
  method: string,
  action: () => Promise<unknown>
) {
  const response = page.waitForResponse(
    (res) =>
      res.request().method() === method &&
      /\/api\/v1\/tags\/[^/]+$/.test(new URL(res.url()).pathname)
  )
  await action()
  const result = await response
  expect(result.ok(), await result.text()).toBe(true)
  return result
}
