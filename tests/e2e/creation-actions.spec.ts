import { test, expect } from "./fixtures"
import { addMenu, write } from "./helpers"

test("creation buttons remain available across screens and open their modals", async ({
  page,
  testAccount,
}) => {
  await page.goto("/overview")
  await expect(
    page.locator("main").getByRole("button", { name: "Add", exact: true })
  ).toBeVisible()
  for (const [path, label, title] of [
    ["/resources", "Add resource", "Add resource"],
    ["/tasks", "Add task", "New task"],
    ["/calendar", "Add task", "New task"],
    ["/quick-notes", "New note", "New quick note"],
    ["/search", "New project", "New project"],
    ["/tags", "New tag", "New tag"],
  ]) {
    await page.goto(path!)
    if (path === "/search") {
      await page
        .locator("main")
        .getByRole("button", { name: "Add", exact: true })
        .click()
      await page.getByRole("menuitem", { name: label, exact: true }).click()
    } else {
      await page
        .locator("main")
        .getByRole("button", { name: label, exact: true })
        .first()
        .click()
    }
    await expect(
      page.getByRole("dialog", { name: title, exact: true })
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
  }
  await page.goto("/tags")
  await expect(page.getByText("No tags yet", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "New tag", exact: true }).click()
  await page.getByLabel("Tag name", { exact: true }).fill("creation-test")
  await write(page, "POST", "/tags", () =>
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Create", exact: true })
      .click()
  )
  await expect(
    page.getByRole("button", { name: "#creation-test", exact: true })
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole("button", { name: "#creation-test", exact: true })
  ).toBeVisible()
  for (const path of ["/settings", "/trash"]) {
    await page.goto(path)
    await addMenu(page, "Add resource")
    await expect(
      page.getByRole("dialog", { name: "Add resource", exact: true })
    ).toBeVisible()
    await page.keyboard.press("Escape")
  }
  expect(testAccount.id).toBeTruthy()
})

test("project creation defaults work on desktop, mobile and resource details", async ({
  page,
  testAccount,
}) => {
  const response = await page.request.post("/api/v1/projects", {
    data: { name: "Creation context" },
  })
  expect(response.ok(), testAccount.email).toBe(true)
  const project = await response.json()
  await page.goto(`/projects/${project.id}?tab=tasks`)
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: "Add task", exact: true })
    .click()
  let dialog = page.getByRole("dialog", { name: "New task", exact: true })
  await expect(dialog.getByText(project.name, { exact: true })).toBeVisible()
  await dialog.locator("input").fill("Context task")
  const created = await write(page, "POST", "/tasks", () =>
    dialog.getByRole("button", { name: "Add", exact: true }).click()
  )
  expect((await created.json()).projectId).toBe(project.id)
  await expect(dialog).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "Add", exact: true }).last().click()
  await page.getByRole("menuitem", { name: "Add task", exact: true }).click()
  dialog = page.getByRole("dialog", { name: "New task", exact: true })
  await dialog.locator("input").fill("Mobile context task")
  const mobileTask = await write(page, "POST", "/tasks", () =>
    dialog.getByRole("button", { name: "Add", exact: true }).click()
  )
  expect((await mobileTask.json()).projectId).toBe(project.id)
  await expect(dialog).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 900 })
  await addMenu(page, "New quick note")
  const noteDialog = page.getByRole("dialog", {
    name: "New quick note",
    exact: true,
  })
  await noteDialog
    .getByPlaceholder("Untitled", { exact: true })
    .fill("Context note")
  const note = await write(page, "POST", "/quick-notes", () =>
    noteDialog.getByRole("button", { name: "Save", exact: true }).click()
  )
  expect((await note.json()).projectId).toBe(project.id)
  await expect(noteDialog).toHaveCount(0)
  await page.goto("/calendar")
  await page
    .locator("main")
    .getByRole("button", { name: /^Filters/ })
    .click()
  await page
    .getByRole("combobox", { name: "Filter by project", exact: true })
    .click()
  await page.getByRole("option", { name: project.name, exact: true }).click()
  await page
    .locator("main")
    .getByRole("button", { name: "Add task", exact: true })
    .click()
  dialog = page.getByRole("dialog", { name: "New task", exact: true })
  await dialog.locator("input").fill("Calendar context task")
  const calendarTask = await write(page, "POST", "/tasks", () =>
    dialog.getByRole("button", { name: "Add", exact: true }).click()
  )
  expect((await calendarTask.json()).projectId).toBe(project.id)
  await expect(dialog).toHaveCount(0)
  const resourceResponse = await page.request.post("/api/v1/resources", {
    data: { type: "note", text: "Linked resource", projectIds: [project.id] },
  })
  expect(resourceResponse.ok()).toBe(true)
  const resource = await resourceResponse.json()
  await page.goto(`/resources?r=${resource.id}`)
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add", exact: true })
    .click()
  await page
    .getByRole("menuitem", { name: "Add new task", exact: true })
    .click()
  dialog = page.getByRole("dialog", { name: "New task", exact: true })
  await dialog.locator("input").fill("Resource follow-up")
  const linkedResponse = await write(page, "POST", "/tasks", () =>
    dialog.getByRole("button", { name: "Add", exact: true }).click()
  )
  const linked = await linkedResponse.json()
  expect(linked.projectId).toBe(project.id)
  expect(linked.resources.map((item: { id: string }) => item.id)).toContain(
    resource.id
  )
  await expect(dialog).toHaveCount(0)
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add", exact: true })
    .click()
  await page
    .getByRole("menuitem", { name: "Link existing task", exact: true })
    .click()
  const picker = page.getByRole("dialog", {
    name: "Link existing task",
    exact: true,
  })
  const desktopTask = await created.json()
  await write(page, "POST", `/tasks/${desktopTask.id}/resources`, () =>
    picker.getByRole("button", { name: "Context task", exact: true }).click()
  )
  await expect(picker).toHaveCount(0)
})
