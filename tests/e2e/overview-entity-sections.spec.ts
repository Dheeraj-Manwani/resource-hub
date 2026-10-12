import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../../lib/db/schema"
import { test, expect } from "./fixtures"
import { write } from "./helpers"
import {
  ADDITIONAL_OVERVIEW_SECTION_IDS,
  type OverviewSectionData,
} from "../../lib/overview/section-data"
import {
  createDefaultOverviewConfiguration,
  OVERVIEW_SECTION_REGISTRY,
} from "../../lib/overview/sections"

const dateAt = (offset: number) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

test("new entity sections preserve preferences and refresh after their existing actions", async ({
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
  const parent = await post("/projects", { name: "Launch" })
  const child = await post("/projects", {
    name: "Research",
    parentId: parent.id,
  })
  const archived = await post("/projects", { name: "Archived project" })
  await post("/tasks", {
    title: "Resolve overdue research",
    projectId: child.id,
    allDay: true,
    dueDate: dateAt(-1),
  })
  await post("/tasks", {
    title: "Waiting on approval",
    projectId: child.id,
    status: "blocked",
  })
  await post("/tasks", {
    title: "Archived blocker",
    projectId: archived.id,
    status: "blocked",
  })
  await patch(`/projects/${archived.id}`, { archived: true })
  const done = await post("/tasks", {
    title: "Finished outline",
    projectId: parent.id,
  })
  await patch(`/tasks/${done.id}`, { status: "done" })
  const recurring = await post("/tasks", {
    title: "Daily reading",
    allDay: true,
    dueDate: dateAt(-5),
    rrule: "FREQ=DAILY",
  })
  const detached = await patch(`/tasks/${recurring.id}/occurrences`, {
    occurrenceAt: `${dateAt(0)}T00:00:00.000Z`,
    scope: "this",
    patch: { status: "done" },
  })
  const resource = await post("/resources", {
    text: "Favorite source",
    title: "Favorite source",
  })
  await patch(`/resources/${resource.id}`, {
    isFavorite: true,
    isReviewed: true,
  })
  await post("/resources", {
    text: "Ordinary source",
    title: "Ordinary source",
  })
  const doc = await post("/quick-notes", {
    title: "Research notes",
    projectId: child.id,
    bodyJson: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep the research context." }],
        },
      ],
    },
    bodyText: "Keep the research context.",
  })
  await post("/quick-notes", { title: "Independent notes" })
  const summary = async <K extends keyof OverviewSectionData>(
    section: K,
    projectId?: string
  ): Promise<OverviewSectionData[K]> => {
    const response = await page.request.get(
      `/api/v1/overview/sections?section=${section}${projectId ? `&projectId=${projectId}` : ""}`
    )
    expect(response.ok(), await response.text()).toBe(true)
    return response.json()
  }
  expect(
    (await summary("recently-completed-tasks")).items.map((task) => task.id)
  ).toEqual([detached.id, done.id])
  expect((await summary("projects-needing-attention")).items).toMatchObject([
    { id: parent.id, overdueCount: 1, blockedCount: 1, subprojectCount: 1 },
  ])
  expect(
    (await summary("favorite-resources")).items.map((item) => item.id)
  ).toEqual([resource.id])
  const grouped = await summary("docs-by-project", child.id)
  expect(grouped.groups).toHaveLength(1)
  expect(grouped.groups[0]).toMatchObject({
    projectId: child.id,
    total: 1,
    docs: [{ id: doc.id }],
  })
  expect(grouped.groups[0].docs[0]).not.toHaveProperty("bodyJson")
  expect((await summary("docs-by-project", parent.id)).groups).toEqual([])

  const requests: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/overview/sections?"))
      requests.push(request.url())
  })
  await page.goto("/overview")
  await expect(page.getByTestId("overview-summary")).toBeVisible()
  expect(requests).toEqual([])
  await page
    .getByRole("button", { name: "Customize overview", exact: true })
    .click()
  const editor = page.getByRole("region", {
    name: "Customize overview",
    exact: true,
  })
  for (const section of ADDITIONAL_OVERVIEW_SECTION_IDS.filter(
    (id) => OVERVIEW_SECTION_REGISTRY[id].entity !== "habits"
  )) {
    await editor
      .getByRole("button", { name: "Add section", exact: true })
      .click()
    const picker = page.getByRole("dialog", { name: "Add section" })
    await picker
      .getByRole("button", {
        name: OVERVIEW_SECTION_REGISTRY[section].label,
        exact: true,
      })
      .click()
    await expect(picker).toHaveCount(0)
    await expect(
      page.getByRole("heading", {
        name: OVERVIEW_SECTION_REGISTRY[section].label,
        exact: true,
      })
    ).toBeVisible()
  }
  await write(page, "PATCH", "/settings", () =>
    editor.getByRole("button", { name: "Save overview", exact: true }).click()
  )
  await page.reload()
  const completed = page.getByRole("region", {
    name: "Recently completed tasks",
    exact: true,
  })
  const attention = page.getByRole("region", {
    name: "Projects needing attention",
    exact: true,
  })
  const favorites = page.getByRole("region", {
    name: "Favorite resources",
    exact: true,
  })
  const docs = page.getByRole("region", {
    name: "Docs by project",
    exact: true,
  })
  await expect(completed).toContainText("Repeating occurrence")
  await expect(attention).toContainText(
    "1 overdue task · 1 blocked · 1 sub-project"
  )
  await expect(attention).not.toContainText("Archived project")
  await expect(favorites).toContainText("Favorite source")
  await expect(docs).toContainText("Research notes")
  await docs.getByRole("combobox", { name: "Docs project" }).click()
  await page
    .getByRole("option", { name: "Launch / Research", exact: true })
    .click()
  await expect(docs).not.toContainText("Independent notes")
  await expect(docs).toContainText("Research notes")

  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("overview-new-sections-mobile.png"),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({
    path: testInfo.outputPath("overview-new-sections-desktop.png"),
    fullPage: true,
  })

  await write(page, "PATCH", `/tasks/${done.id}`, () =>
    completed
      .getByRole("button", { name: "Reopen Finished outline", exact: true })
      .click()
  )
  await expect(completed).not.toContainText("Finished outline")
  expect(
    (await summary("recently-completed-tasks")).items.map((task) => task.id)
  ).toEqual([detached.id])
  await favorites.getByRole("button", { name: "Preview", exact: true }).click()
  await expect(page.getByRole("dialog")).toContainText("Favorite source")
  await page.keyboard.press("Escape")
  await docs.getByRole("button", { name: /^Research notes/ }).click()
  const dialog = page.getByRole("dialog", {
    name: "Edit text doc",
    exact: true,
  })
  await expect(dialog.locator(".tiptap")).toContainText(
    "Keep the research context."
  )
  await dialog.getByRole("button", { name: "Edit title", exact: true }).click()
  await dialog
    .getByPlaceholder("Untitled", { exact: true })
    .fill("Updated research notes")
  await write(page, "PATCH", `/quick-notes/${doc.id}`, () =>
    dialog.getByRole("button", { name: "Save", exact: true }).click()
  )
  await expect(dialog).toHaveCount(0)
  await expect(docs).toContainText("Updated research notes")
  await favorites
    .getByRole("link", { name: "All favorites", exact: true })
    .click()
  await expect(page).toHaveURL(/\/resources\?favorite=true$/)
  await expect(
    page.getByRole("button", { name: "Favorite source", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Ordinary source", exact: true })
  ).toHaveCount(0)
  await page.goto("/overview")
  await write(page, "PATCH", `/resources/${resource.id}`, () =>
    favorites
      .getByRole("button", {
        name: "Remove Favorite source from favorites",
        exact: true,
      })
      .click()
  )
  await expect(favorites).toContainText(
    "Star a resource to keep it close at hand."
  )
  expect((await summary("favorite-resources")).items).toEqual([])
})

test("optional sections isolate read failures and can retry", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const configuration = createDefaultOverviewConfiguration()
  configuration.layout = "ordered"
  configuration.sections.forEach((section) => {
    section.enabled =
      section.id === "favorite-resources" ||
      section.id === "recently-completed-tasks"
  })
  const saved = await page.request.patch("/api/v1/settings", {
    data: { overviewConfiguration: configuration },
  })
  expect(saved.ok()).toBe(true)
  let fail = true
  await page.route("**/api/v1/overview/sections?*", (route) => {
    if (fail && route.request().url().includes("favorite-resources"))
      return route.fulfill({
        status: 500,
        json: { error: { message: "Unavailable" } },
      })
    return route.continue()
  })
  await page.goto("/overview")
  const favorites = page.getByRole("region", {
    name: "Favorite resources",
    exact: true,
  })
  await expect(favorites.getByRole("alert")).toContainText(
    "Couldn't load favorite resources."
  )
  await expect(
    page.getByRole("region", { name: "Recently completed tasks", exact: true })
  ).toContainText("Completed tasks will appear here.")
  fail = false
  await favorites.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(favorites.getByRole("alert")).toHaveCount(0)
  await expect(favorites).toContainText(
    "Star a resource to keep it close at hand."
  )
})

test("section endpoints bound results and enforce validation, authentication and account ownership", async ({
  page,
  browser,
  testAccount,
  baseURL,
}) => {
  const client = postgres(process.env.DATABASE_URL!, { max: 2 })
  const db = drizzle(client, { schema, casing: "snake_case" })
  const otherId = randomUUID()
  const otherEmail = `playwright-${otherId}@example.invalid`
  const otherProjectId = randomUUID()
  try {
    await db
      .insert(schema.user)
      .values({ id: otherId, email: otherEmail, name: "Other test user" })
    await db.insert(schema.projects).values({
      id: otherProjectId,
      userId: otherId,
      name: "Private project",
      sortKey: "a0",
    })
    await db.insert(schema.quickNotes).values({
      id: randomUUID(),
      userId: otherId,
      projectId: otherProjectId,
      title: "Private doc",
    })
    await db.insert(schema.tasks).values({
      id: randomUUID(),
      userId: otherId,
      title: "Private task",
      sortKey: "a0",
      status: "done",
      completedAt: new Date(),
    })
    await db.insert(schema.resources).values({
      id: randomUUID(),
      userId: otherId,
      type: "note",
      title: "Private favorite",
      isFavorite: true,
    })
    const projectIds = Array.from({ length: 6 }, () => randomUUID())
    await db.insert(schema.projects).values(
      projectIds.map((id) => ({
        id,
        userId: testAccount.id,
        name: `Project ${id}`,
        sortKey: "a0",
      }))
    )
    await db.insert(schema.quickNotes).values(
      projectIds.flatMap((projectId) =>
        Array.from({ length: 5 }, () => ({
          id: randomUUID(),
          userId: testAccount.id,
          projectId,
          title: "Owned doc",
        }))
      )
    )
    await db.insert(schema.tasks).values(
      projectIds.map((projectId) => ({
        id: randomUUID(),
        userId: testAccount.id,
        projectId,
        title: "Owned blocker",
        sortKey: "a0",
        status: "blocked" as const,
      }))
    )
    await db.insert(schema.tasks).values(
      Array.from({ length: 8 }, () => ({
        id: randomUUID(),
        userId: testAccount.id,
        title: "Owned done",
        sortKey: "a0",
        status: "done" as const,
        completedAt: new Date(),
      }))
    )
    await db.insert(schema.resources).values(
      Array.from({ length: 8 }, () => ({
        id: randomUUID(),
        userId: testAccount.id,
        type: "note" as const,
        title: "Owned favorite",
        isFavorite: true,
      }))
    )
    for (const query of [
      "",
      "?section=unknown",
      "?section=docs-by-project&projectId=bad-id",
      "?section=favorite-resources&projectId=unassigned",
      "?section=docs-by-project&userId=other",
    ]) {
      expect(
        (await page.request.get(`/api/v1/overview/sections${query}`)).status()
      ).toBe(400)
    }
    expect(
      (
        await page.request.get(
          `/api/v1/overview/sections?section=docs-by-project&projectId=${otherProjectId}`
        )
      ).status()
    ).toBe(404)
    const get = async (section: string) => {
      const response = await page.request.get(
        `/api/v1/overview/sections?section=${section}`
      )
      expect(response.ok(), await response.text()).toBe(true)
      const result = await response.json()
      expect(JSON.stringify(result)).not.toContain("Private")
      return result
    }
    expect((await get("recently-completed-tasks")).items).toHaveLength(5)
    expect(await get("favorite-resources")).toMatchObject({
      hasMore: true,
      items: Array(5).fill({ title: "Owned favorite" }),
    })
    expect(await get("projects-needing-attention")).toMatchObject({
      total: 6,
      items: Array(4).fill({ blockedCount: 1 }),
    })
    const docs = await get("docs-by-project")
    expect(docs.groups).toHaveLength(4)
    for (const group of docs.groups) {
      expect(group.total).toBe(5)
      expect(group.docs).toHaveLength(3)
    }
    const unauthenticated = await browser.newContext()
    try {
      expect(
        (
          await unauthenticated.request.get(
            `${baseURL}/api/v1/overview/sections?section=favorite-resources`
          )
        ).status()
      ).toBe(401)
    } finally {
      await unauthenticated.close()
    }
  } finally {
    try {
      await db
        .delete(schema.user)
        .where(
          and(eq(schema.user.id, otherId), eq(schema.user.email, otherEmail))
        )
    } finally {
      await client.end()
    }
  }
})
