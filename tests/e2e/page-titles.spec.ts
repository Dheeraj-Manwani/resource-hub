import { randomUUID } from "node:crypto"

import { test, expect } from "./fixtures"
import { write } from "./helpers"

test("public and app pages use descriptive RH tab titles", async ({
  page,
  testAccount,
  baseURL,
}) => {
  const signedOut = await page.context().browser()!.newContext({ baseURL })
  try {
    const landing = await signedOut.newPage()
    await landing.goto("/")
    await expect(landing).toHaveTitle("Resource Hub | RH")
  } finally {
    await signedOut.close()
  }

  for (const [path, title] of [
    ["/overview", "Overview"],
    ["/resources", "Resources"],
    ["/tasks", "Tasks"],
    ["/calendar", "Calendar"],
    ["/quick-notes", "Quick Notes"],
    ["/tags", "Tags"],
    ["/search", "Search"],
    ["/settings", "Settings"],
    ["/trash", "Trash"],
    ["/capture", "Save to Inbox"],
  ]) {
    await page.goto(path!)
    await expect(page).toHaveTitle(`${title} | RH`)
  }
  expect(testAccount.id).toBeTruthy()
})

test("project titles follow subprojects, optimistic renames and navigation", async ({
  page,
  testAccount,
}) => {
  const created = await page.request.post("/api/v1/projects", {
    data: { name: "Abc" },
  })
  expect(created.ok(), testAccount.email).toBe(true)
  const project = await created.json()
  const childCreated = await page.request.post("/api/v1/projects", {
    data: { name: "Design & research", parentId: project.id },
  })
  expect(childCreated.ok()).toBe(true)
  const child = await childCreated.json()

  await page.goto(`/projects/${child.id}`)
  await expect(page).toHaveTitle("Design & research | RH")
  await page.getByRole("link", { name: "Abc", exact: true }).last().click()
  await expect(page).toHaveTitle("Abc | RH")

  await page.getByRole("button", { name: "Project info", exact: true }).click()
  await page
    .getByRole("button", { name: "Edit project info", exact: true })
    .click()
  const dialog = page.getByRole("dialog", { name: "Edit project", exact: true })
  await dialog.locator("input").fill("Abc renamed")

  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**/api/v1/projects/${project.id}`, async (route) => {
    if (route.request().method() === "PATCH") await gate
    await route.continue()
  })
  const saved = write(page, "PATCH", `/projects/${project.id}`, () =>
    dialog.getByRole("button", { name: "Save", exact: true }).click()
  )
  try {
    await expect(page).toHaveTitle("Abc renamed | RH")
  } finally {
    release()
  }
  await saved
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true })
  ).toHaveCount(0)
  await page.keyboard.press("Escape")
  await page.reload()
  await expect(page).toHaveTitle("Abc renamed | RH")
  await page.getByRole("tab", { name: /^Tasks/ }).click()
  await expect(page).toHaveTitle("Abc renamed | RH")
  await page
    .getByRole("link", { name: "Resources", exact: true })
    .last()
    .click()
  await expect(page).toHaveTitle("Resources | RH")

  await page.goto(`/projects/${randomUUID()}`)
  await expect(page).toHaveTitle("Project | RH")
})
