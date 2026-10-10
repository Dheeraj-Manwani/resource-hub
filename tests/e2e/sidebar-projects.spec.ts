import { test, expect } from "./fixtures"
import { write } from "./helpers"

test("dragging pinned projects preserves stored order with hidden siblings", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const projects = []
  for (const name of ["Hidden first", "Pinned second", "Pinned third"]) {
    const response = await page.request.post("/api/v1/projects", {
      data: { name },
    })
    expect(response.ok()).toBe(true)
    projects.push(await response.json())
  }
  const [hidden, second, third] = projects
  expect(
    (
      await page.request.patch("/api/v1/settings", {
        data: { pinnedProjectIds: [second.id, third.id] },
      })
    ).ok()
  ).toBe(true)
  await page.goto("/resources")
  const tree = page.locator("aside").getByRole("tree", { name: "Projects" })
  await tree
    .getByRole("button", { name: "More projects (1)", exact: true })
    .click()
  const source = await tree
    .getByRole("treeitem", { name: second.name, exact: true })
    .boundingBox()
  const target = await tree
    .getByRole("treeitem", { name: third.name, exact: true })
    .boundingBox()
  expect(source).not.toBeNull()
  expect(target).not.toBeNull()
  await page.mouse.move(source!.x + 100, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(target!.x + 100, target!.y + target!.height / 2, {
    steps: 12,
  })
  await write(page, "POST", `/projects/${second.id}/move`, () =>
    page.mouse.up()
  )
  await expect(tree.getByRole("treeitem")).toHaveText([
    third.name,
    second.name,
    hidden.name,
  ])
  const stored = await (await page.request.get("/api/v1/projects/tree")).json()
  expect(stored.items.map((project: { id: string }) => project.id)).toEqual([
    hidden.id,
    third.id,
    second.id,
  ])
})

test("sidebar selection preserves ancestry, persists, searches hidden projects and supports pin menus", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  async function create(name: string, parentId?: string) {
    const response = await page.request.post("/api/v1/projects", {
      data: { name, parentId },
    })
    expect(response.ok()).toBe(true)
    return response.json()
  }
  const work = await create("Sidebar work")
  const active = await create("Sidebar active", work.id)
  const other = await create("Sidebar other", work.id)
  const rest = await create("Sidebar rest")
  await page.goto("/resources")
  const sidebar = page.locator("aside")
  const tree = sidebar.getByRole("tree", { name: "Projects" })
  const row = (name: string) =>
    tree.getByRole("treeitem", { name, exact: true })
  await expect(row(work.name)).toBeVisible()
  await expect(row(active.name)).toBeVisible()
  await expect(row(other.name)).toBeVisible()
  await expect(row(rest.name)).toBeVisible()
  await sidebar
    .getByRole("button", { name: "Manage sidebar", exact: true })
    .click()
  const manager = page.getByRole("dialog", {
    name: "Manage sidebar",
    exact: true,
  })
  await manager
    .getByRole("button", { name: "Clear selection", exact: true })
    .click()
  await manager
    .getByRole("checkbox", { name: active.name, exact: true })
    .check()
  await write(page, "PATCH", "/settings", () =>
    manager.getByRole("button", { name: "Save selection", exact: true }).click()
  )
  await expect(manager).toHaveCount(0)
  await expect(row(work.name)).toBeVisible()
  await expect(row(active.name)).toHaveAttribute("aria-level", "2")
  await expect(row(other.name)).toHaveCount(0)
  await expect(row(rest.name)).toHaveCount(0)
  const nestedMore = sidebar.getByRole("button", {
    name: "More projects (1) in Sidebar work",
    exact: true,
  })
  const rootMore = sidebar.getByRole("button", {
    name: "More projects (1)",
    exact: true,
  })
  await expect(nestedMore).toHaveAttribute("aria-expanded", "false")
  await expect(rootMore).toHaveAttribute("aria-expanded", "false")
  await nestedMore.click()
  await expect(row(other.name)).toBeVisible()
  await expect(row(other.name)).toHaveCount(1)
  await rootMore.click()
  await expect(row(rest.name)).toBeVisible()
  await row(rest.name)
    .getByRole("button", { name: `${rest.name} options`, exact: true })
    .click()
  await write(page, "PATCH", "/settings", () =>
    page.getByRole("menuitem", { name: "Pin to sidebar", exact: true }).click()
  )
  await expect(rootMore).toHaveCount(0)
  const saved = await (await page.request.get("/api/v1/settings")).json()
  expect(saved.pinnedProjectIds.sort()).toEqual([active.id, rest.id].sort())
  await page.reload()
  await expect(row(rest.name)).toBeVisible()
  await expect(row(other.name)).toHaveCount(0)
  await row(rest.name)
    .getByRole("button", { name: `${rest.name} options`, exact: true })
    .click()
  await write(page, "PATCH", "/settings", () =>
    page
      .getByRole("menuitem", { name: "Unpin from sidebar", exact: true })
      .click()
  )
  await expect(row(rest.name)).toHaveCount(0)

  await page.keyboard.press("Control+k")
  await page.getByPlaceholder("Search everything, or jump to…").fill(rest.name)
  await page.getByRole("option", { name: rest.name, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${rest.id}$`))
  await expect(
    page.getByRole("heading", { name: rest.name, exact: true })
  ).toBeVisible()

  await sidebar
    .getByRole("button", { name: "Manage sidebar", exact: true })
    .click()
  await manager.getByLabel("Search sidebar projects").fill(other.name)
  await expect(
    manager.getByRole("checkbox", { name: other.name, exact: true })
  ).toBeVisible()
  await expect(
    manager.getByRole("link", { name: `Open ${other.name}`, exact: true })
  ).toHaveAttribute("href", `/projects/${other.id}`)
  await manager.getByRole("checkbox", { name: other.name, exact: true }).check()
  await write(page, "PATCH", "/settings", () =>
    manager.getByRole("button", { name: "Save selection", exact: true }).click()
  )
  await expect(row(other.name)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("selected-projects.png") })

  await sidebar
    .getByRole("button", { name: "Manage sidebar", exact: true })
    .click()
  await manager
    .getByRole("button", { name: "Clear selection", exact: true })
    .click()
  await write(page, "PATCH", "/settings", () =>
    manager.getByRole("button", { name: "Save selection", exact: true }).click()
  )
  await expect(tree.getByRole("treeitem")).toHaveCount(0)
  await expect(
    sidebar.getByRole("button", { name: "More projects (4)", exact: true })
  ).toBeVisible()
  await expect(
    sidebar.getByText("Create your first project to start organizing.")
  ).toHaveCount(0)
  await page.reload()
  await expect(
    sidebar.getByRole("button", { name: "More projects (4)", exact: true })
  ).toHaveAttribute("aria-expanded", "false")

  await sidebar
    .getByRole("button", { name: "Manage sidebar", exact: true })
    .click()
  await manager.getByRole("button", { name: "Select all", exact: true }).click()
  await page.route("**/api/v1/settings", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "Test preference failure" },
          }),
        })
      : route.continue()
  )
  await manager
    .getByRole("button", { name: "Save selection", exact: true })
    .click()
  await expect(manager.getByRole("alert")).toContainText(
    "Test preference failure"
  )
  await expect(manager).toBeVisible()
  await manager.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(tree.getByRole("treeitem")).toHaveCount(0)
  await page.unroute("**/api/v1/settings")
  await sidebar
    .getByRole("button", { name: "Manage sidebar", exact: true })
    .click()
  await manager.getByRole("button", { name: "Select all", exact: true }).click()
  await write(page, "PATCH", "/settings", () =>
    manager.getByRole("button", { name: "Save selection", exact: true }).click()
  )
  await expect(tree.getByRole("treeitem")).toHaveCount(4)
  expect(
    (await (await page.request.get("/api/v1/settings")).json()).pinnedProjectIds
  ).toBeNull()
  expect(
    (
      await page.request.patch("/api/v1/settings", {
        data: { pinnedProjectIds: ["bad-id"] },
      })
    ).status()
  ).toBe(400)
})
