import { test, expect } from "./fixtures"
import { write } from "./helpers"

test("mobile navigation shares saved project visibility and exposes pin controls", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const response = await page.request.post("/api/v1/projects", {
    data: { name: "Mobile sidebar project" },
  })
  expect(response.ok()).toBe(true)
  const project = await response.json()
  expect(
    (
      await page.request.patch("/api/v1/settings", {
        data: { pinnedProjectIds: [] },
      })
    ).ok()
  ).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/resources")
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click()
  const nav = page.getByRole("dialog", { name: "Navigation", exact: true })
  await expect(
    nav.getByRole("treeitem", { name: project.name, exact: true })
  ).toHaveCount(0)
  await nav
    .getByRole("button", { name: "More projects (1)", exact: true })
    .click()
  const row = nav.getByRole("treeitem", { name: project.name, exact: true })
  await row
    .getByRole("button", { name: `${project.name} options`, exact: true })
    .click()
  await write(page, "PATCH", "/settings", () =>
    page.getByRole("menuitem", { name: "Pin to sidebar", exact: true }).click()
  )
  await expect(nav.getByRole("button", { name: /^More projects/ })).toHaveCount(
    0
  )
  await expect(row).toBeVisible()
  await nav.getByRole("button", { name: "Manage sidebar", exact: true }).click()
  const manager = page.getByRole("dialog", {
    name: "Manage sidebar",
    exact: true,
  })
  await expect(
    manager.getByRole("checkbox", { name: project.name, exact: true })
  ).toBeChecked()
  await manager
    .getByRole("button", { name: "Clear selection", exact: true })
    .click()
  await write(page, "PATCH", "/settings", () =>
    manager.getByRole("button", { name: "Save selection", exact: true }).click()
  )
  await expect(manager).toHaveCount(0)
  await page.reload()
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click()
  await expect(
    nav.getByRole("button", { name: "More projects (1)", exact: true })
  ).toHaveAttribute("aria-expanded", "false")
  await expect(
    nav.getByRole("treeitem", { name: project.name, exact: true })
  ).toHaveCount(0)
})
