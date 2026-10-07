import { test, expect } from "./fixtures"
import { write } from "./helpers"

test("project resource checklist persists, hides, and resets repeatedly without dates", async ({
  page,
  testAccount,
}) => {
  const parentResponse = await page.request.post("/api/v1/projects", {
    data: { name: "Job search" },
  })
  expect(parentResponse.ok(), testAccount.email).toBe(true)
  const parent = await parentResponse.json()
  const response = await page.request.post("/api/v1/projects", {
    data: { name: "Job Portals", parentId: parent.id },
  })
  expect(response.ok()).toBe(true)
  const project = await response.json()
  const created = await page.request.post("/api/v1/resources", {
    data: {
      type: "note",
      title: "Portal one",
      text: "Portal one",
      projectIds: [project.id],
    },
  })
  expect(created.ok()).toBe(true)
  const resource = await created.json()
  const unrelatedResponse = await page.request.post("/api/v1/resources", {
    data: { type: "note", title: "Unrelated", text: "Unrelated" },
  })
  expect(unrelatedResponse.ok()).toBe(true)
  const unrelated = await unrelatedResponse.json()
  const rejected = await page.request.patch(
    `/api/v1/projects/${project.id}/checklist`,
    { data: { action: "check", resourceId: unrelated.id, checked: true } }
  )
  expect(rejected.status()).toBe(404)

  await page.goto(`/projects/${project.id}`)
  const mode = page.getByRole("switch", { name: "Checklist mode", exact: true })
  await expect(
    page.getByRole("button", { name: "Reset checklist" })
  ).toHaveCount(0)
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: "Add", exact: true })
    .click()
  await expect(page.getByRole("menuitem")).toHaveCount(2)
  await expect(
    page.getByRole("menuitem", { name: "Add new resource" })
  ).toBeVisible()
  await expect(
    page.getByRole("menuitem", { name: "Add existing resources" })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await write(page, "PATCH", `/projects/${project.id}/checklist`, () =>
    mode.click()
  )
  const checkbox = () =>
    page.getByRole("checkbox", { name: /Mark Portal one as/ })
  await expect(checkbox()).not.toBeChecked()
  await write(page, "PATCH", `/projects/${project.id}/checklist`, () =>
    checkbox().click()
  )
  await expect(
    page.getByRole("status").filter({ hasText: "1 of 1 done" })
  ).toBeVisible()
  await page.reload()
  await expect(checkbox()).toBeChecked()

  // Mode changes preserve progress, independently of the current view.
  await write(page, "PATCH", `/projects/${project.id}/checklist`, () =>
    mode.click()
  )
  await expect(checkbox()).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Reset checklist" })
  ).toHaveCount(0)
  await page.reload()
  await expect(mode).not.toBeChecked()
  await write(page, "PATCH", `/projects/${project.id}/checklist`, () =>
    mode.click()
  )
  await expect(checkbox()).toBeChecked()

  await page.getByRole("button", { name: "List", exact: true }).click()
  await expect(checkbox()).toBeChecked()
  await page.getByRole("button", { name: "Focus", exact: true }).click()
  await expect(checkbox()).toBeChecked()

  for (let pass = 0; pass < 2; pass++) {
    await write(page, "PATCH", `/projects/${project.id}/checklist`, () =>
      page.getByRole("button", { name: "Reset checklist" }).click()
    )
    await expect(checkbox()).not.toBeChecked()
    await expect(checkbox()).toBeEnabled()
    await write(page, "PATCH", `/projects/${project.id}/checklist`, () =>
      checkbox().click()
    )
    await expect(checkbox()).toBeChecked()
  }
  const saved = await page.request.get(
    `/api/v1/projects/${project.id}/checklist`
  )
  expect(await saved.json()).toEqual({
    enabled: true,
    resourceIds: [resource.id],
    checkedResourceIds: [resource.id],
  })
  const parentState = await page.request.get(
    `/api/v1/projects/${parent.id}/checklist?includeDescendants=true`
  )
  expect(await parentState.json()).toEqual({
    enabled: false,
    resourceIds: [resource.id],
    checkedResourceIds: [],
  })
})
