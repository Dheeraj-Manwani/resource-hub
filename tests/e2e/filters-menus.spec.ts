import { test, expect } from "./fixtures"
import { write } from "./helpers"

test("filters hide without clearing results and project Add menus keep both paths", async ({
  page,
  testAccount,
}, testInfo) => {
  const parentResponse = await page.request.post("/api/v1/projects", {
    data: { name: "Filter project" },
  })
  expect(parentResponse.ok(), testAccount.email).toBe(true)
  const parent = await parentResponse.json()
  const childResponse = await page.request.post("/api/v1/projects", {
    data: { name: "Filter child", parentId: parent.id },
  })
  expect(childResponse.ok()).toBe(true)
  const child = await childResponse.json()
  const resources = []
  for (const [text, projectIds] of [
    ["Parent filter note", [parent.id]],
    ["Child filter note", [child.id]],
    ["Existing filter note", []],
  ] as [string, string[]][]) {
    const response = await page.request.post("/api/v1/resources", {
      data: { type: "note", text, projectIds },
    })
    expect(response.ok()).toBe(true)
    resources.push(await response.json())
  }
  const favorite = await page.request.patch(
    `/api/v1/resources/${resources[0].id}`,
    { data: { isFavorite: true } }
  )
  expect(favorite.ok()).toBe(true)
  await page.goto("/resources")
  const toggle = page.locator("main").getByRole("button", { name: /^Filters/ })
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await expect(
    page.getByRole("combobox", { name: "Filter by type", exact: true })
  ).toHaveCount(0)
  await toggle.click()
  await page
    .locator("main")
    .getByRole("button", { name: "Favorites", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Parent filter note", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Child filter note", exact: true })
  ).toHaveCount(0)
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await expect(toggle).toContainText("1")
  await expect(
    page.getByRole("button", { name: "Parent filter note", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Child filter note", exact: true })
  ).toHaveCount(0)
  await toggle.click()
  await expect(
    page.locator("main").getByRole("button", { name: "Favorites", exact: true })
  ).toHaveAttribute("aria-pressed", "true")

  for (const [path, control, option] of [
    ["/tasks", "Filter by status", "In progress"],
    ["/search", "Filter by entity type", "Tasks"],
    ["/calendar", "Filter by project", parent.name],
  ]) {
    await page.goto(path)
    if (path === "/calendar")
      await expect(
        page.getByRole("region", { name: "Calendar dates" }).getByRole("grid")
      ).toBeVisible()
    await expect(
      page.getByRole("combobox", { name: control, exact: true })
    ).toHaveCount(0)
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    await page.getByRole("combobox", { name: control, exact: true }).click()
    await page.getByRole("option", { name: option, exact: true }).click()
    await toggle.click()
    await expect(toggle).toContainText("1")
    await toggle.click()
    await expect(
      page.getByRole("combobox", { name: control, exact: true })
    ).toContainText(option)
  }
  await page.goto("/tasks")
  await expect(page.getByText("No tasks yet", { exact: true })).toBeVisible()
  await page.keyboard.press("/")
  await expect(page.getByPlaceholder("Filter by title… (/)")).toBeFocused()

  await page.goto(`/projects/${parent.id}`)
  const tab = page.getByRole("tabpanel")
  await expect(
    tab.getByRole("button", { name: "Parent filter note", exact: true })
  ).toBeVisible()
  await expect(
    tab.getByRole("button", { name: "Child filter note", exact: true })
  ).toHaveCount(0)
  await toggle.click()
  await expect(
    page.getByRole("switch", { name: "Include sub-projects" })
  ).not.toBeChecked()
  await page.getByRole("switch", { name: "Include sub-projects" }).click()
  await expect(
    tab.getByRole("button", { name: "Child filter note", exact: true })
  ).toBeVisible()
  await toggle.click()
  await expect(toggle).toContainText("1")
  await expect(
    tab.getByRole("button", { name: "Child filter note", exact: true })
  ).toBeVisible()
  await toggle.click()
  await page.getByRole("switch", { name: "Include sub-projects" }).click()
  await toggle.click()
  await expect(
    tab.getByRole("button", { name: "Parent filter note", exact: true })
  ).toBeVisible()
  await expect(
    tab.getByRole("button", { name: "Child filter note", exact: true })
  ).toHaveCount(0)
  await tab.getByRole("button", { name: "Add", exact: true }).click()
  await page
    .getByRole("menuitem", { name: "Add existing resources", exact: true })
    .click()
  const dialog = page.getByRole("dialog", {
    name: "Add existing resources",
    exact: true,
  })
  await dialog
    .getByRole("checkbox", { name: "Existing filter note", exact: true })
    .check()
  await write(page, "POST", `/projects/${parent.id}/resources`, () =>
    dialog.getByRole("button", { name: "Add 1", exact: true }).click()
  )
  await expect(
    tab.getByRole("button", { name: "Existing filter note", exact: true })
  ).toBeVisible()

  await page.getByRole("tab", { name: /^Docs/ }).click()
  await expect(page.getByRole("tab", { name: /^Docs/ })).toHaveAttribute(
    "aria-selected",
    "true"
  )
  await tab.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("menuitem", { name: "Add new doc", exact: true }).click()
  await page
    .getByRole("button", { name: "Text — write plain text" })
    .click()
  const newNote = page.getByRole("dialog", {
    name: "New doc",
    exact: true,
  })
  await newNote.getByRole("button", { name: "Edit title", exact: true }).click()
  await newNote.getByPlaceholder("Untitled", { exact: true }).fill("Menu note")
  const saved = await write(page, "POST", "/quick-notes", () =>
    newNote.getByRole("button", { name: "Save", exact: true }).click()
  )
  expect((await saved.json()).projectId).toBe(parent.id)
  await expect(newNote).toHaveCount(0)
  await tab.getByRole("button", { name: "Add", exact: true }).click()
  await page
    .getByRole("menuitem", { name: "Add existing docs", exact: true })
    .click()
  await expect(
    page.getByRole("dialog", { name: "Add existing docs", exact: true })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await page.setViewportSize({ width: 390, height: 844 })
  await toggle.click()
  await expect(
    page.getByRole("switch", { name: "Include sub-projects" })
  ).toBeVisible()
  await toggle.click()
  await expect(
    page.getByRole("switch", { name: "Include sub-projects" })
  ).toHaveCount(0)

  // Every project toolbar belongs to the selected panel, below the same tab strip.
  // Resource-specific controls can wrap on mobile while retaining the shared order.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [label, action] of [
      ["Resources", "Add"],
      ["Tasks", "Add task"],
      ["Sub-projects", "Add sub-project"],
      ["Docs", "Add"],
    ]) {
      const selectedTab = page.getByRole("tab", {
        name: new RegExp(`^${label}`),
      })
      await selectedTab.click()
      await expect(selectedTab).toHaveAttribute("aria-selected", "true")
      const filters = tab.getByRole("button", { name: /^Filters/ })
      await expect(filters).toBeVisible()
      const tabBox = await page
        .getByRole("tablist", { name: "Project tabs" })
        .boundingBox()
      const filterBox = await filters.boundingBox()
      const actionBox = await tab
        .getByRole("button", { name: action, exact: true })
        .boundingBox()
      expect(tabBox).not.toBeNull()
      expect(filterBox).not.toBeNull()
      expect(actionBox).not.toBeNull()
      expect(filterBox!.y).toBeGreaterThanOrEqual(tabBox!.y + tabBox!.height)
      if (width === 1440)
        expect(Math.abs(actionBox!.y - filterBox!.y)).toBeLessThan(2)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true)
      await filters.click()
      const scope = tab.getByRole("switch", { name: "Include sub-projects" })
      await expect(scope).toBeVisible()
      if (
        label === "Resources" &&
        (await scope.getAttribute("aria-checked")) === "false"
      )
        await scope.click()
      await expect(scope).toBeChecked()
      await filters.click()
      await expect(filters).toContainText("1")
      if (label === "Tasks")
        await expect(
          tab.getByRole("heading", {
            name: "No tasks in this project yet",
            exact: true,
          })
        ).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath(
          `project-${label.toLowerCase()}-${width}.png`
        ),
        fullPage: true,
      })
    }
  }
})
