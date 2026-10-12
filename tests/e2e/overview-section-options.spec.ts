import { randomUUID } from "node:crypto"
import { test, expect } from "./fixtures"
import { write } from "./helpers"
import { addDays, defaultConfig } from "../../lib/habits/model"
import {
  createDefaultOverviewConfiguration,
  OVERVIEW_SECTION_REGISTRY,
  type OverviewSectionId,
} from "../../lib/overview/sections"

test("section options preview, cancel, persist, survive hiding, and fit mobile", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const post = async (path: string, data: Record<string, unknown>) => {
    const response = await page.request.post(`/api/v1${path}`, { data })
    expect(response.ok(), await response.text()).toBe(true)
    return response.json()
  }
  const patch = async (path: string, data: Record<string, unknown>) => {
    const response = await page.request.patch(`/api/v1${path}`, { data })
    expect(response.ok(), await response.text()).toBe(true)
    return response.json()
  }
  const { todayDate } = await (
    await page.request.get("/api/v1/overview")
  ).json()
  const project = await post("/projects", { name: "Launch notes" })
  for (let index = 1; index <= 3; index++) {
    await post("/tasks", {
      title: `Today task ${index}`,
      allDay: true,
      dueDate: todayDate,
    })
    await post("/quick-notes", {
      title: `Launch doc ${index}`,
      projectId: project.id,
    })
    const favorite = await post("/resources", {
      text: `Favorite ${index}`,
      title: `Favorite ${index}`,
    })
    await patch(`/resources/${favorite.id}`, { isFavorite: true })
    const done = await post("/tasks", { title: `Completed task ${index}` })
    await patch(`/tasks/${done.id}`, { status: "done" })
    const { habit } = await post("/habits", {
      id: randomUUID(),
      name: `Daily habit ${index}`,
      reason: "Keep a daily rhythm",
      icon: "📖",
      color: "orange",
      config: { ...defaultConfig(todayDate, 1), goalType: "done", target: 1 },
    })
    await post(`/habits/${habit.id}/logs`, {
      id: randomUUID(),
      date: todayDate,
      amount: 1,
      kind: "progress",
      notes: "",
    })
  }
  await post("/tasks", {
    title: "Later task",
    allDay: true,
    dueDate: addDays(todayDate, 2),
  })
  await post("/quick-notes", { title: "Independent doc" })
  const configuration = createDefaultOverviewConfiguration()
  const extras: OverviewSectionId[] = [
    "docs-by-project",
    "favorite-resources",
    "recently-completed-tasks",
    "habit-streaks",
    "weekly-habit-progress",
    "recent-habit-activity",
  ]
  configuration.sections.forEach((section) => {
    if (extras.includes(section.id)) section.enabled = true
  })
  configuration.layout = "ordered"
  await patch("/settings", { overviewConfiguration: configuration })
  await page.goto("/overview")
  const customize = page.getByRole("button", {
    name: "Customize overview",
    exact: true,
  })
  const editor = page.getByRole("region", {
    name: "Customize overview",
    exact: true,
  })
  const taskSection = page.getByRole("region", {
    name: "Task priorities",
    exact: true,
  })
  const taskWrapper = page.locator('[data-overview-section="task-priorities"]')
  const docsSection = page.getByRole("region", {
    name: "Docs by project",
    exact: true,
  })
  const options = async (id: OverviewSectionId) => {
    const row = editor.locator(`[data-section-id="${id}"]`)
    const button = row.getByRole("button", {
      name: `Options for ${OVERVIEW_SECTION_REGISTRY[id].label}`,
      exact: true,
    })
    if ((await button.getAttribute("aria-expanded")) !== "true")
      await button.click()
    return row
  }
  await expect(taskSection.getByRole("checkbox")).toHaveCount(3)
  await customize.click()
  let row = await options("task-priorities")
  await row.getByLabel("Desktop width", { exact: true }).selectOption("full")
  await row.getByLabel("Items shown", { exact: true }).selectOption("1")
  await row
    .getByLabel("Default task view", { exact: true })
    .selectOption("week")
  await expect(taskWrapper).toHaveClass(/lg:col-span-2/)
  await expect(
    taskSection.getByRole("tab", { name: "Next 7 days" })
  ).toHaveAttribute("aria-selected", "true")
  await expect(taskSection.getByRole("checkbox")).toHaveCount(1)
  await expect(
    taskSection.getByRole("link", { name: "View all tasks", exact: true })
  ).toBeVisible()
  await editor.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(taskSection.getByRole("checkbox")).toHaveCount(3)
  await expect(taskWrapper).not.toHaveClass(/lg:col-span-2/)
  await expect(
    taskSection.getByRole("tab", { name: /^Today/ })
  ).toHaveAttribute("aria-selected", "true")

  await customize.click()
  row = await options("task-priorities")
  await row.getByLabel("Desktop width", { exact: true }).selectOption("full")
  await row.getByLabel("Items shown", { exact: true }).selectOption("1")
  await row
    .getByLabel("Default task view", { exact: true })
    .selectOption("week")
  row = await options("docs-by-project")
  await row
    .getByLabel("Default project", { exact: true })
    .selectOption(project.id)
  await row.getByLabel("Docs per project", { exact: true }).selectOption("1")
  await expect(
    docsSection.getByRole("button", { name: /Launch doc/ })
  ).toHaveCount(1)
  await expect(
    docsSection.getByRole("button", { name: /Independent doc/ })
  ).toHaveCount(0)
  await editor
    .getByRole("button", { name: "Hide Docs by project", exact: true })
    .click()
  await editor.getByRole("button", { name: "Add section", exact: true }).click()
  await page
    .getByRole("dialog", { name: "Add section" })
    .getByRole("button", { name: "Docs by project", exact: true })
    .click()
  row = await options("docs-by-project")
  await expect(row.getByLabel("Default project", { exact: true })).toHaveValue(
    project.id
  )
  await expect(row.getByLabel("Docs per project", { exact: true })).toHaveValue(
    "1"
  )
  for (const id of [
    "recent-docs",
    "resources-to-review",
    "favorite-resources",
    "recently-completed-tasks",
    "habit-streaks",
    "weekly-habit-progress",
    "recent-habit-activity",
  ] as const) {
    row = await options(id)
    await row.getByLabel("Items shown", { exact: true }).selectOption("1")
  }
  row = await options("habits-today")
  await row
    .getByLabel("Planned habits shown", { exact: true })
    .selectOption("1")
  await expect(
    page
      .getByRole("region", { name: "Habits today", exact: true })
      .getByRole("button", { name: /^✓ Daily habit/ })
  ).toHaveCount(1)
  await expect(
    page
      .getByRole("region", { name: "Habit streaks", exact: true })
      .getByRole("button", { name: /Daily habit/ })
  ).toHaveCount(1)
  await expect(
    page
      .getByRole("region", { name: "Weekly habit progress", exact: true })
      .getByRole("button", { name: /^Daily habit \d$/, exact: false })
  ).toHaveCount(1)
  await expect(
    page
      .getByRole("region", { name: "Recent habit activity", exact: true })
      .getByRole("button", { name: "View day", exact: true })
  ).toHaveCount(1)
  await expect(
    page
      .getByRole("region", { name: "Recently completed tasks", exact: true })
      .getByRole("button", { name: /^Reopen Completed task/ })
  ).toHaveCount(1)
  await expect(
    page
      .getByRole("region", { name: "Favorite resources", exact: true })
      .getByRole("button", {
        name: /^Favorite \d Independent resource/,
        exact: false,
      })
  ).toHaveCount(1)
  await expect(
    page
      .getByRole("region", { name: "Recently edited docs", exact: true })
      .getByRole("button", { name: /Edited/ })
  ).toHaveCount(1)
  await expect(
    page.getByRole("region", { name: "Habits today", exact: true })
  ).toContainText("3 / 3 goals met")
  await write(page, "PATCH", "/settings", () =>
    editor.getByRole("button", { name: "Save overview", exact: true }).click()
  )
  await expect(editor).toHaveCount(0)
  const saved = (await (await page.request.get("/api/v1/settings")).json())
    .overviewConfiguration
  expect(
    saved.sections.find((s: { id: string }) => s.id === "task-priorities")
      .options
  ).toEqual({ initialHorizon: "week", width: "full", limit: 1 })
  expect(
    saved.sections.find((s: { id: string }) => s.id === "docs-by-project")
      .options
  ).toEqual({ projectId: project.id, limit: 1 })
  await page.reload()
  await expect(taskWrapper).toHaveClass(/lg:col-span-2/)
  await expect(
    taskSection.getByRole("tab", { name: "Next 7 days" })
  ).toHaveAttribute("aria-selected", "true")
  await expect(
    docsSection.getByRole("button", { name: /Launch doc/ })
  ).toHaveCount(1)

  await page.setViewportSize({ width: 390, height: 844 })
  await customize.click()
  row = await options("task-priorities")
  await row.scrollIntoViewIfNeeded()
  await expect(row.getByLabel("Desktop width", { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("options-mobile.png"),
    fullPage: true,
  })
  await editor
    .getByRole("button", { name: "Reset to default", exact: true })
    .click()
  await expect(taskSection.getByRole("checkbox")).toHaveCount(3)
  await expect(docsSection).toHaveCount(0)
  await editor.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(taskSection.getByRole("checkbox")).toHaveCount(1)
  await expect(
    docsSection.getByRole("button", { name: /Launch doc/ })
  ).toHaveCount(1)
  // Removed projects fall back to the all-projects view without making a failing scoped request.
  expect(
    (await page.request.delete(`/api/v1/projects/${project.id}`)).ok()
  ).toBe(true)
  await page.reload()
  await expect(
    docsSection.getByRole("combobox", { name: "Docs project" })
  ).toContainText("Recently edited projects")
  await expect(docsSection.getByRole("alert")).toHaveCount(0)
})

test("settings validate section options and retain preferences after invalid updates", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const configuration = createDefaultOverviewConfiguration()
  configuration.sections[2].options = {
    width: "full",
    limit: 1,
    initialHorizon: "week",
  }
  const patch = (overviewConfiguration: unknown) =>
    page.request.patch("/api/v1/settings", { data: { overviewConfiguration } })
  expect((await patch(configuration)).ok()).toBe(true)
  const section = configuration.sections[2]
  for (const options of [
    { limit: 7 },
    { limit: 0 },
    { limit: 1.5 },
    { limit: "1" },
    { projectId: "unassigned" },
    { width: "wide" },
    { unknown: true },
  ])
    expect(
      (
        await patch({ ...configuration, sections: [{ ...section, options }] })
      ).status()
    ).toBe(400)
  expect(
    (
      await patch({
        ...configuration,
        sections: [{ ...configuration.sections[0], options: { limit: 1 } }],
      })
    ).status()
  ).toBe(400)
  expect(
    (
      await patch({
        ...configuration,
        sections: [
          {
            ...configuration.sections[10],
            options: { projectId: "not-a-project" },
          },
        ],
      })
    ).status()
  ).toBe(400)
  expect(
    (await (await page.request.get("/api/v1/settings")).json())
      .overviewConfiguration
  ).toEqual(configuration)
})
