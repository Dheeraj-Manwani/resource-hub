import type { ResourceDto } from "../../lib/resources/dto"
import { test, expect } from "./fixtures"
import { write } from "./helpers"

test("add resources directly to a project and a populated sub-project", async ({
  page,
  testAccount,
}) => {
  // API setup uses the fixture's verified disposable account and real database.
  const parentResponse = await page.request.post("/api/v1/projects", {
    data: { name: "Resource button project" },
  })
  expect(parentResponse.ok(), testAccount.email).toBe(true)
  const parent = await parentResponse.json()
  const childResponse = await page.request.post("/api/v1/projects", {
    data: { name: "Resource button child", parentId: parent.id },
  })
  expect(childResponse.ok()).toBe(true)
  const child = await childResponse.json()

  for (const [projectId, titles] of [
    [parent.id, ["Parent resource"]],
    [child.id, ["First child resource", "Second child resource"]],
  ] as [string, string[]][]) {
    await page.goto(`/projects/${projectId}`)
    const tab = page.getByRole("tabpanel")
    for (const title of titles) {
      await tab
        .getByRole("button", { name: "Resource options", exact: true })
        .click()
      await page
        .getByRole("menuitem", { name: "Add new resource", exact: true })
        .click()
      const dialog = page.getByRole("dialog", {
        name: "Add resource",
        exact: true,
      })
      await dialog.getByLabel("URL, text or links").fill(title)
      const response = await write(page, "POST", "/resources", () =>
        dialog.getByRole("button", { name: "Save", exact: true }).click()
      )
      const resource: ResourceDto = await response.json()
      expect(resource.projects.map((project) => project.id)).toEqual([
        projectId,
      ])
      await expect(dialog).toHaveCount(0)
      await expect(
        tab.getByRole("button", { name: title, exact: true })
      ).toBeVisible()
      await page.reload()
      await expect(
        tab.getByRole("button", { name: title, exact: true })
      ).toBeVisible()
      const persisted = await page.request.get(
        `/api/v1/resources/${resource.id}`
      )
      expect(persisted.ok()).toBe(true)
      expect(
        (await persisted.json()).projects.map(
          (project: { id: string }) => project.id
        )
      ).toEqual([projectId])
    }
  }
})
