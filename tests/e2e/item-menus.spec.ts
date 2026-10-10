import type { Locator, Page } from "@playwright/test"
import { test, expect } from "./fixtures"
import { write } from "./helpers"

test.use({ hasTouch: true })

const item = (page: Page, text: string) =>
  page
    .locator("[data-item-menu]")
    .filter({ has: page.getByText(text, { exact: true }) })

async function create(page: Page, path: string, data: object) {
  const response = await page.request.post(`/api/v1/${path}`, { data })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

test("right-click actions work across resources, docs, tasks, projects, tags, search and trash", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const resource = await create(page, "resources", {
    text: "Context resource",
    title: "Context resource",
    tags: ["context-tag"],
  })
  const doc = await create(page, "quick-notes", {
    title: "Context doc",
    bodyText: "Document text",
  })
  const task = await create(page, "tasks", { title: "Context task" })
  const project = await create(page, "projects", { name: "Context project" })
  await page.goto("/resources")
  await item(page, resource.title).click({ button: "right" })
  await write(page, "PATCH", `/resources/${resource.id}`, () =>
    page
      .getByRole("menuitem", { name: "Add to favorites", exact: true })
      .click()
  )
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/v1/resources/${resource.id}`)
          ).json()
        ).isFavorite
    )
    .toBe(true)

  await page.goto("/docs")
  await item(page, doc.title).click({ button: "right" })
  await page.getByRole("menuitem", { name: "Open / edit", exact: true }).click()
  await expect(page.getByPlaceholder("Untitled", { exact: true })).toHaveValue(
    doc.title
  )
  await page.getByRole("button", { name: "Cancel", exact: true }).click()

  await page.goto("/tasks")
  await item(page, task.title).click({ button: "right" })
  await write(page, "PATCH", `/tasks/${task.id}`, () =>
    page.getByRole("menuitem", { name: "Mark as done", exact: true }).click()
  )
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/v1/tasks/${task.id}`)).json())
          .status
    )
    .toBe("done")

  const treeRow = page
    .locator("aside")
    .getByRole("treeitem", { name: project.name, exact: true })
  await treeRow.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click()
  const projectInput = treeRow.locator("input")
  await expect(projectInput).toBeFocused()
  await projectInput.fill("Renamed context project")
  await write(page, "PATCH", `/projects/${project.id}`, () =>
    projectInput.press("Enter")
  )
  await expect(
    page
      .locator("aside")
      .getByRole("treeitem", { name: "Renamed context project", exact: true })
  ).toBeVisible()

  await page.goto("/tags")
  await item(page, "#context-tag").click({ button: "right" })
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click()
  const tagInput = page.locator("[data-item-menu]").getByRole("textbox")
  await expect(tagInput).toBeFocused()
  await tagInput.fill("renamed-context-tag")
  await tagInput.press("Enter")
  await expect(
    page.getByRole("button", { name: "#renamed-context-tag", exact: true })
  ).toBeVisible()

  await page.goto("/search?q=Context")
  await item(page, resource.title).click({ button: "right" })
  await expect(
    page.getByRole("menuitem", { name: "Open in new tab", exact: true })
  ).toHaveAttribute("href", `/resources?r=${resource.id}`)
  await page.getByRole("menuitem", { name: "Open", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`r=${resource.id}`))
  await page.goto("/resources")
  await item(page, resource.title).click({ button: "right" })
  await write(page, "DELETE", `/resources/${resource.id}`, () =>
    page.getByRole("menuitem", { name: "Move to trash", exact: true }).click()
  )
  await page.goto("/trash")
  await item(page, resource.title).click({ button: "right" })
  await page
    .getByRole("menuitem", { name: "Delete forever", exact: true })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await item(page, resource.title).click({ button: "right" })
  await page.getByRole("menuitem", { name: "Restore", exact: true }).click()
  await expect(item(page, resource.title)).toHaveCount(0)
})

test("touch holds open options without opening items; scrolling cancels and tapping still opens", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const doc = await create(page, "quick-notes", {
    title: "Touch doc",
    bodyText: "Keep typing native",
  })
  const project = await create(page, "projects", { name: "Touch project" })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/docs")
  const card = item(page, doc.title)
  const cdp = await page.context().newCDPSession(page)
  async function hold(target: Locator, move = false, duration = 650) {
    const box = await target.boundingBox()
    expect(box).not.toBeNull()
    const point = { x: box!.x + 30, y: box!.y + box!.height / 2 }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    })
    if (move) {
      await page.waitForTimeout(100)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...point, y: point.y + 35 }],
      })
    }
    await page.waitForTimeout(duration)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
  }
  await expect(card).toBeVisible()
  // A hold longer than the synthetic-click suppression window must still be safe.
  await hold(card, false, 2300)
  await expect(
    page.getByRole("menuitem", { name: "Open / edit", exact: true })
  ).toBeVisible()
  await expect(page.getByPlaceholder("Untitled", { exact: true })).toHaveCount(
    0
  )
  await page.getByRole("menuitem", { name: "Open / edit", exact: true }).click()
  await expect(page.getByPlaceholder("Untitled", { exact: true })).toHaveValue(
    doc.title
  )
  await hold(page.getByPlaceholder("Untitled", { exact: true }))
  await expect(page.getByRole("menu")).toHaveCount(0)
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await hold(card, true)
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(page.getByPlaceholder("Untitled", { exact: true })).toHaveCount(
    0
  )
  await card.tap({ position: { x: 30, y: 30 } })
  await expect(page.getByPlaceholder("Untitled", { exact: true })).toHaveValue(
    doc.title
  )
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await card.focus()
  await page.keyboard.press("Shift+F10")
  await expect(
    page.getByRole("menuitem", { name: "Open / edit", exact: true })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await card
    .getByRole("button", { name: "Touch doc options", exact: true })
    .click()
  await expect(
    page.getByRole("menuitem", { name: "Open / edit", exact: true })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click()
  const nav = page.getByRole("dialog", { name: "Navigation", exact: true })
  await hold(nav.getByRole("link", { name: project.name, exact: true }))
  await expect(
    page.getByRole("menuitem", { name: "Open project", exact: true })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/docs$/)
})

test("alternate resource views, task board, calendar occurrences and project cards share contextual actions", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const resource = await create(page, "resources", {
    text: "Views resource",
    title: "Views resource",
  })
  const project = await create(page, "projects", { name: "Views project" })
  const child = await create(page, "projects", {
    name: "Views child",
    parentId: project.id,
  })
  const task = await create(page, "tasks", { title: "Views task" })
  await page.goto("/resources")
  for (const view of ["List", "Focus"]) {
    await write(page, "PATCH", "/settings", () =>
      page.getByRole("button", { name: view, exact: true }).click()
    )
    await expect(
      page.getByRole("button", { name: view, exact: true })
    ).toHaveAttribute("aria-pressed", "true")
    const surface = item(page, resource.title)
    // Focus view contains an inline text editor whose native editing menu is preserved.
    await (view === "Focus" ? surface.getByRole("heading") : surface).click({
      button: "right",
    })
    await expect(
      page.getByRole("menuitem", { name: "Mark as reviewed", exact: true })
    ).toBeVisible()
    await page.keyboard.press("Escape")
  }
  await item(page, resource.title).focus()
  await page.keyboard.press("Shift+F10")
  await page.getByRole("menuitem", { name: "Preview", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("dialog").locator('[data-slot="dialog-close"]').click()

  await page.goto("/tasks")
  await page.getByRole("button", { name: "Board", exact: true }).click()
  await item(page, task.title).click({ button: "right" })
  await page.getByRole("menuitem", { name: "Priority", exact: true }).click()
  await write(page, "PATCH", `/tasks/${task.id}`, () =>
    page.getByRole("menuitem", { name: "High", exact: true }).click()
  )
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/api/v1/tasks/${task.id}`)).json())
          .priority
    )
    .toBe("high")
  await item(page, task.title).click({ button: "right" })
  await write(page, "POST", `/tasks/${task.id}/duplicate`, () =>
    page.getByRole("menuitem", { name: "Duplicate", exact: true }).click()
  )

  await page.goto(`/projects/${project.id}?tab=subprojects`)
  await page
    .locator("main [data-item-menu]")
    .filter({ has: page.getByText(child.name, { exact: true }) })
    .click({ button: "right" })
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click()
  await page
    .getByRole("dialog", { name: "Rename project", exact: true })
    .getByLabel("Project name")
    .fill("Renamed views child")
  await write(page, "PATCH", `/projects/${child.id}`, () =>
    page
      .getByRole("dialog", { name: "Rename project", exact: true })
      .getByRole("button", { name: "Save", exact: true })
      .click()
  )
  await page
    .getByRole("heading", { name: project.name, exact: true })
    .click({ button: "right" })
  await page.getByRole("menuitem", { name: "Delete…", exact: true }).click()
  await expect(
    page.getByText("Move children up a level", { exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.goto("/overview")
  await page
    .locator("main [data-item-menu]")
    .filter({ has: page.getByText(project.name, { exact: true }) })
    .click({ button: "right" })
  await expect(
    page.getByRole("menuitem", { name: "New sub-project", exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("project-context-menu.png"),
  })
})

test("calendar context actions complete only the selected recurring occurrence", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  })
  const recurring = await create(page, "tasks", {
    title: "Recurring context task",
    allDay: true,
    startDate: today,
    dueDate: today,
    rrule: "FREQ=DAILY;COUNT=2",
  })
  await page.goto("/calendar")
  const event = page
    .locator(".fc [data-item-menu]")
    .filter({ has: page.getByText(recurring.title, { exact: true }) })
    .first()
  await event
    .getByText(recurring.title, { exact: true })
    .click({ button: "right" })
  await write(page, "PATCH", `/tasks/${recurring.id}/occurrences`, () =>
    page.getByRole("menuitem", { name: "Mark as done", exact: true }).click()
  )
  await expect(
    page.getByRole("checkbox", {
      name: `Mark ${recurring.title} incomplete`,
      exact: true,
    })
  ).toBeChecked()
  // Completing one recurring occurrence must leave the master and next occurrence active.
  expect(
    (await (await page.request.get(`/api/v1/tasks/${recurring.id}`)).json())
      .status
  ).toBe("todo")
  await expect(
    page.getByRole("checkbox", {
      name: `Mark ${recurring.title} complete`,
      exact: true,
    })
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  const mobileEvent = page
    .locator(".fc [data-item-menu]")
    .filter({ has: page.getByText(recurring.title, { exact: true }) })
    .last()
  await expect(mobileEvent).toBeVisible()
  const box = await mobileEvent
    .getByText(recurring.title, { exact: true })
    .boundingBox()
  expect(box).not.toBeNull()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box!.x + 20, y: box!.y + box!.height / 2 }],
  })
  await page.waitForTimeout(2300)
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await expect(page).toHaveURL(/\/calendar$/)
  await page.getByRole("menuitem", { name: "Open / edit", exact: true }).click()
  await expect(
    page.getByRole("dialog", { name: recurring.title, exact: true })
  ).toBeVisible()
  await expect(page).toHaveURL(/\/calendar\?t=/)
})
