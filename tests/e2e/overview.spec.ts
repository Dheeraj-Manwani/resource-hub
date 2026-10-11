import { test, expect } from "./fixtures"
import { write } from "./helpers"
import type { OverviewSummary } from "../../lib/overview/model"

const dateAt = (offset: number) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

test("Focus first: descendant context, task completion, doc editing and resource review", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const post = async (path: string, data: Record<string, unknown>) => {
    const response = await page.request.post(`/api/v1${path}`, { data })
    expect(response.ok(), await response.text()).toBe(true)
    return response.json()
  }
  const parent = await post("/projects", { name: "Launch" })
  const child = await post("/projects", {
    name: "Research",
    parentId: parent.id,
  })
  const overdue = await post("/tasks", {
    title: "Finish research",
    projectId: child.id,
    dueDate: dateAt(-1),
    allDay: true,
    priority: "high",
  })
  await post("/tasks", {
    title: "Write outline",
    projectId: parent.id,
    dueDate: dateAt(0),
    allDay: true,
  })
  await post("/tasks", {
    title: "Publish draft",
    projectId: child.id,
    dueDate: dateAt(3),
    allDay: true,
  })
  await post("/tasks", {
    title: "Waiting for approval",
    projectId: child.id,
    status: "blocked",
  })
  const doc = await post("/quick-notes", {
    title: "Launch notes",
    projectId: child.id,
    bodyJson: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Research context survives editing." },
          ],
        },
      ],
    },
    bodyText: "Research context survives editing.",
  })
  const resource = await post("/resources", {
    text: "Saved reference",
    title: "Saved reference",
    projectIds: [parent.id, child.id],
  })
  await post("/resources", {
    text: "Independent reference",
    title: "Independent reference",
  })
  const getOverview = async () =>
    (await (
      await page.request.get("/api/v1/overview")
    ).json()) as OverviewSummary
  const summary = await getOverview()
  expect(summary.tasks).toMatchObject({
    pastDue: 1,
    dueToday: 1,
    todayCount: 2,
    weekCount: 3,
    blockedCount: 1,
  })
  expect(summary.projects.top[0]).toMatchObject({
    id: parent.id,
    subprojectCount: 1,
    taskTotal: 4,
    taskDone: 0,
    resourceCount: 1,
    docCount: 1,
    nextTask: { taskId: overdue.id },
  })
  expect(summary.projectPaths[child.id]).toBe("Launch / Research")
  expect(summary.docs.recent[0]).not.toHaveProperty("bodyJson")

  await page.goto("/overview")
  await expect(
    page.getByRole("heading", { name: "Your day, with a clear next step." })
  ).toBeVisible()
  await expect(page.getByTestId("overview-summary")).toHaveText(
    "1 overdue task · 1 due today · 1 blocked"
  )
  await expect(page.getByRole("tab", { name: /Today/ })).toContainText("2")
  await page.getByRole("tab", { name: /Next 7 days/ }).click()
  await expect(
    page.getByRole("checkbox", { name: "Complete Publish draft", exact: true })
  ).toBeVisible()
  await page.getByRole("tab", { name: /Today/ }).click()
  await page.getByRole("button", { name: /View context/ }).click()
  await expect(
    page.getByRole("button", { name: "Launch notes", exact: true }).first()
  ).toBeVisible()
  await expect(page.getByText(/Independent resource · Saved/)).toBeVisible()
  await page.setViewportSize({ width: 1180, height: 900 })
  await page.screenshot({
    path: "test-results/overview-landscape.png",
    fullPage: true,
  })
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.screenshot({
    path: "test-results/overview-portrait.png",
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  })
  await page.setViewportSize({ width: 1180, height: 900 })

  await write(page, "PATCH", `/tasks/${overdue.id}`, () =>
    page
      .getByRole("checkbox", { name: "Complete Finish research", exact: true })
      .click()
  )
  await expect(page.getByTestId("overview-summary")).toHaveText(
    "0 overdue tasks · 1 due today · 1 blocked"
  )
  await expect(
    page.getByText("1 / 4 tasks done", { exact: true })
  ).toBeVisible()

  await page
    .getByRole("button", { name: "Launch notes", exact: true })
    .first()
    .click()
  const editor = page.getByRole("dialog", {
    name: "Edit text doc",
    exact: true,
  })
  await expect(editor.locator(".tiptap")).toContainText(
    "Research context survives editing."
  )
  await editor
    .getByPlaceholder("Untitled", { exact: true })
    .fill("Updated launch notes")
  await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    editor.getByRole("button", { name: "Save", exact: true }).click()
  )
  await expect(editor).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: /Updated launch notes/ }).last()
  ).toBeVisible()
  const savedDoc = await (
    await page.request.get(`/api/v1/docs/${doc.id}`)
  ).json()
  expect(savedDoc.bodyText).toContain("Research context survives editing.")

  const review = page.locator("#overview-resources")
  await review.getByRole("button", { name: /^Saved reference .*Saved/ }).click()
  await expect(page.getByRole("dialog")).toContainText("Saved reference")
  await page.keyboard.press("Escape")
  const resourceRow = review
    .getByRole("button", { name: /^Saved reference .*Saved/ })
    .locator("..")
  await write(page, "PATCH", `/resources/${resource.id}`, () =>
    resourceRow
      .getByRole("button", { name: "Mark reviewed", exact: true })
      .click()
  )
  await expect(
    review.getByRole("button", { name: /^Saved reference .*Saved/ })
  ).toHaveCount(0)
  expect((await getOverview()).resources.toReviewCount).toBe(1)
  await page.getByRole("link", { name: /Not reviewed yet/ }).click()
  await expect(page).toHaveURL(/\/resources\?reviewed=false$/)
  await expect(
    page.getByRole("button", { name: "Independent reference", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Saved reference", exact: true })
  ).toHaveCount(0)
})

test("Focus first completes only the displayed recurring occurrence", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const response = await page.request.post("/api/v1/tasks", {
    data: {
      title: "Daily reading",
      allDay: true,
      dueDate: dateAt(-10),
      rrule: "FREQ=DAILY",
    },
  })
  expect(response.ok()).toBe(true)
  const master = await response.json()
  await page.goto("/overview")
  await expect(page.getByTestId("overview-summary")).toHaveText(
    "0 overdue tasks · 1 due today · 0 blocked"
  )
  await write(page, "PATCH", `/tasks/${master.id}/occurrences`, () =>
    page
      .getByRole("checkbox", { name: "Complete Daily reading", exact: true })
      .click()
  )
  await expect(
    page.getByRole("checkbox", { name: "Complete Daily reading", exact: true })
  ).toHaveCount(0)
  await expect(page.getByTestId("overview-summary")).toHaveText(
    "0 overdue tasks · 0 due today · 0 blocked"
  )
  const persisted = await (
    await page.request.get(`/api/v1/tasks/${master.id}`)
  ).json()
  expect(persisted.status).toBe("todo")
  expect(persisted.rrule).toBe("FREQ=DAILY")
  const summary: OverviewSummary = await (
    await page.request.get("/api/v1/overview")
  ).json()
  expect(summary.tasks.weekCount).toBe(6)
  expect(summary.tasks.completedToday).toBe(1)
})
