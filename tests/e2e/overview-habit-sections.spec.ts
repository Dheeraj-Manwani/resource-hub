import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import type { APIRequestContext } from "@playwright/test"
import * as schema from "../../lib/db/schema"
import {
  addDays,
  defaultConfig,
  weekday,
  type Habit,
  type HabitBundle,
  type HabitConfig,
} from "../../lib/habits/model"
import { HABIT_OVERVIEW_SECTION_IDS } from "../../lib/overview/habit-sections"
import {
  OVERVIEW_SECTION_REGISTRY,
  createDefaultOverviewConfiguration,
} from "../../lib/overview/sections"
import { test, expect } from "./fixtures"
import { write } from "./helpers"

async function create(
  request: APIRequestContext,
  name: string,
  today: string,
  weekStart: number,
  config: Partial<HabitConfig> = {}
) {
  const response = await request.post("/api/v1/habits", {
    data: {
      id: randomUUID(),
      name,
      reason: "Make time for myself",
      icon: "📖",
      color: "orange",
      config: { ...defaultConfig(addDays(today, -3), weekStart), ...config },
    },
  })
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()).habit as Habit
}
async function record(
  request: APIRequestContext,
  habit: Habit,
  date: string,
  amount: number,
  notes = "",
  kind = "progress"
) {
  const response = await request.post(`/api/v1/habits/${habit.id}/logs`, {
    data: { id: randomUUID(), date, amount, notes, kind },
  })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

test("habit overview sections are opt-in, reorderable and share recording and history actions", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  expect(
    (
      await page.request.patch("/api/v1/settings", {
        data: { timezone: "Asia/Kolkata" },
      })
    ).ok()
  ).toBe(true)
  const bundle: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  const today = bundle.today,
    weekStart = weekday(addDays(today, -3))
  const configuration = createDefaultOverviewConfiguration()
  configuration.sections.forEach((section) => {
    section.enabled = section.id === "habits-today"
  })
  expect(
    (
      await page.request.patch("/api/v1/settings", {
        data: { weekStart, overviewConfiguration: configuration },
      })
    ).ok()
  ).toBe(true)
  const read = await create(page.request, "Read chapters", today, weekStart, {
    goalType: "done",
    target: 1,
  })
  const practice = await create(page.request, "Practice", today, weekStart)
  const paused = await create(page.request, "Paused walks", today, weekStart)
  await record(page.request, read, addDays(today, -3), 1)
  await record(page.request, read, addDays(today, -2), 0, "Rest day", "skip")
  await record(page.request, read, addDays(today, -1), 1)
  await record(
    page.request,
    practice,
    addDays(today, -1),
    10,
    "Morning practice"
  )
  await record(page.request, paused, addDays(today, -1), 5, "Earlier walk")
  expect(
    (
      await page.request.post(`/api/v1/habits/${paused.id}/status`, {
        data: { status: "paused", expectedRevision: paused.revision },
      })
    ).ok()
  ).toBe(true)
  const requests: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/overview/sections?"))
      requests.push(request.url())
  })
  await page.goto("/overview")
  await expect(
    page.getByRole("region", { name: "Habits today", exact: true })
  ).toContainText("Read chapters")
  expect(requests).toEqual([])
  await page
    .getByRole("button", { name: "Customize overview", exact: true })
    .click()
  const editor = page.getByRole("region", {
    name: "Customize overview",
    exact: true,
  })
  for (const id of HABIT_OVERVIEW_SECTION_IDS) {
    await editor
      .getByRole("button", { name: "Add section", exact: true })
      .click()
    const picker = page.getByRole("dialog", { name: "Add section" })
    await picker
      .getByRole("region", { name: "Habits", exact: true })
      .getByRole("button", {
        name: OVERVIEW_SECTION_REGISTRY[id].label,
        exact: true,
      })
      .click()
    await expect(picker).toHaveCount(0)
  }
  await editor
    .getByRole("button", { name: "Move Habit streaks up", exact: true })
    .click()
  await write(page, "PATCH", "/settings", () =>
    editor.getByRole("button", { name: "Save overview", exact: true }).click()
  )
  await page.reload()
  await expect(page.locator("[data-overview-section]").first()).toHaveAttribute(
    "data-overview-section",
    "habit-streaks"
  )
  const streaks = page.getByRole("region", {
    name: "Habit streaks",
    exact: true,
  })
  const weekly = page.getByRole("region", {
    name: "Weekly habit progress",
    exact: true,
  })
  const recent = page.getByRole("region", {
    name: "Recent habit activity",
    exact: true,
  })
  const readingRow = weekly.locator('[aria-label="Read chapters this week"]')
  await expect(streaks).toContainText("2 goal periods")
  await expect(streaks).not.toContainText("Paused walks")
  await expect(readingRow).toContainText("2 / 3 goals met so far")
  await expect(weekly).toContainText("Paused")
  await expect(weekly).toContainText("10 min recorded")
  await expect(recent).toContainText("Morning practice")
  await expect(recent).toContainText("Skipped")
  const futureDay = weekly.getByRole("button", {
    name: new RegExp(`^Read chapters, ${addDays(today, 1)}, Future plan`),
  })
  await futureDay.click()
  const futureDialog = page.getByRole("dialog", {
    name: "📖 Read chapters",
    exact: true,
  })
  await expect(
    futureDialog.getByRole("button", { name: "Mark done", exact: true })
  ).toBeDisabled()
  await page.keyboard.press("Escape")
  await streaks
    .getByRole("button", { name: "Read chapters", exact: true })
    .click()
  const actions = page.getByRole("dialog", {
    name: "📖 Read chapters",
    exact: true,
  })
  await expect(actions).toContainText(today)
  await actions.getByRole("button", { name: "Mark done", exact: true }).click()
  const entry = page.getByRole("dialog", {
    name: "Log progress · Read chapters",
    exact: true,
  })
  await expect(entry.getByLabel("Entry date", { exact: true })).toHaveValue(
    today
  )
  await write(page, "POST", `/habits/${read.id}/logs`, () =>
    entry.getByRole("button", { name: "Save completion", exact: true }).click()
  )
  await expect(entry).toHaveCount(0)
  await expect(streaks).toContainText("3 goal periods")
  await expect(readingRow).toContainText("3 / 3 goals met so far")
  await expect(
    recent.getByRole("button", { name: "Read chapters", exact: true }).first()
  ).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("habit-overview-mobile.png"),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({
    path: testInfo.outputPath("habit-overview-desktop.png"),
    fullPage: true,
  })

  const practiceRow = recent
    .getByText("Morning practice", { exact: true })
    .locator("..")
  await practiceRow
    .getByRole("button", { name: "View day", exact: true })
    .click()
  const day = page.getByRole("dialog", { name: "📖 Practice", exact: true })
  await expect(day).toContainText(addDays(today, -1))
  await expect(day).toContainText("10 min recorded on this day")
  await day
    .getByRole("link", { name: "Open habit history →", exact: true })
    .click()
  await expect(page).toHaveURL(
    new RegExp(`/habits\\?h=${practice.id}&date=${addDays(today, -1)}$`)
  )
  const details = page.getByRole("dialog", { name: "📖 Practice", exact: true })
  await expect(details).toContainText("Morning practice")
  await details.getByRole("button", { name: "Edit entry", exact: true }).click()
  const correction = page.getByRole("dialog", {
    name: "Edit entry · Practice",
    exact: true,
  })
  await correction.getByLabel("Amount (minutes)", { exact: true }).fill("30")
  await write(page, "PATCH", `/habits/${practice.id}/logs/`, () =>
    correction
      .getByRole("button", { name: "Save correction", exact: true })
      .click()
  )
  await page.keyboard.press("Escape")
  await page.goto("/overview")
  await expect(weekly).toContainText("30 min recorded")
  await expect(recent).toContainText("30 minutes logged")
})

test("habit section reads have empty states, isolated retry, bounded payloads and account scoping", async ({
  page,
  testAccount,
  browser,
  baseURL,
}) => {
  const configuration = createDefaultOverviewConfiguration()
  configuration.layout = "ordered"
  configuration.sections.forEach((section) => {
    section.enabled = (
      HABIT_OVERVIEW_SECTION_IDS as readonly string[]
    ).includes(section.id)
  })
  expect(
    (
      await page.request.patch("/api/v1/settings", {
        data: { overviewConfiguration: configuration },
      })
    ).ok()
  ).toBe(true)
  let fail = true
  await page.route("**/api/v1/overview/sections?*", (route) =>
    fail && route.request().url().includes("recent-habit-activity")
      ? route.fulfill({
          status: 500,
          json: { error: { message: "Unavailable" } },
        })
      : route.continue()
  )
  await page.goto("/overview")
  const recent = page.getByRole("region", {
    name: "Recent habit activity",
    exact: true,
  })
  await expect(
    page.getByRole("region", { name: "Habit streaks", exact: true })
  ).toContainText("Active habits will appear here.")
  await expect(
    page.getByRole("region", { name: "Weekly habit progress", exact: true })
  ).toContainText("Your saved habit progress will appear here")
  await expect(recent.getByRole("alert")).toContainText(
    "Couldn't load recent habit activity."
  )
  fail = false
  await recent.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(recent).toContainText("Log progress or save a timer session")
  const bundle: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  const owned: Habit[] = []
  for (let i = 0; i < 7; i++) {
    const habit = await create(
      page.request,
      `Owned habit ${i}`,
      bundle.today,
      bundle.weekStart
    )
    owned.push(habit)
    await record(page.request, habit, bundle.today, 30)
  }
  const client = postgres(process.env.DATABASE_URL!, { max: 2 })
  const db = drizzle(client, { schema, casing: "snake_case" })
  const foreignId = randomUUID(),
    foreignEmail = `playwright-${foreignId}@example.invalid`,
    foreignHabitId = randomUUID(),
    versionId = randomUUID(),
    occurrenceId = randomUUID()
  try {
    await db
      .insert(schema.user)
      .values({ id: foreignId, name: "Other account", email: foreignEmail })
    await db
      .insert(schema.habits)
      .values({
        id: foreignHabitId,
        userId: foreignId,
        name: "Private habit",
        icon: "📖",
        color: "orange",
      })
    await db
      .insert(schema.habitVersions)
      .values({
        id: versionId,
        habitId: foreignHabitId,
        revision: 1,
        effectiveFrom: bundle.today,
        config: defaultConfig(bundle.today, bundle.weekStart),
      })
    await db
      .insert(schema.habitOccurrences)
      .values({
        id: occurrenceId,
        habitId: foreignHabitId,
        versionId,
        periodStart: bundle.today,
        periodEnd: bundle.today,
      })
    await db
      .insert(schema.habitLogs)
      .values({
        id: randomUUID(),
        habitId: foreignHabitId,
        occurrenceId,
        date: bundle.today,
        amount: 30,
        kind: "progress",
        timezone: bundle.timezone,
        notes: "Private note",
      })
    const [occurrence] = await db
      .select()
      .from(schema.habitOccurrences)
      .where(eq(schema.habitOccurrences.habitId, owned[0].id))
    const timerId = randomUUID(),
      deletedId = randomUUID()
    await db.insert(schema.habitLogs).values([
      {
        id: timerId,
        habitId: owned[0].id,
        occurrenceId: occurrence.id,
        date: bundle.today,
        amount: 0,
        kind: "session",
        source: "timer",
        elapsedMs: 600000,
        timezone: bundle.timezone,
      },
      {
        id: deletedId,
        habitId: owned[0].id,
        occurrenceId: occurrence.id,
        date: bundle.today,
        amount: 99,
        kind: "progress",
        deletedAt: new Date(),
        timezone: bundle.timezone,
      },
    ])
    for (const section of HABIT_OVERVIEW_SECTION_IDS) {
      const response = await page.request.get(
        `/api/v1/overview/sections?section=${section}`
      )
      expect(response.ok(), await response.text()).toBe(true)
      const data = await response.json()
      expect(JSON.stringify(data)).not.toContain("Private")
      expect(data.items).toHaveLength(
        section === "recent-habit-activity" ? 6 : 5
      )
      expect(JSON.stringify(data)).not.toContain(deletedId)
      if (section === "recent-habit-activity")
        expect(
          data.items.find((entry: { id: string }) => entry.id === timerId)
        ).toMatchObject({
          kind: "session",
          source: "timer",
          amount: 0,
          minutes: 10,
        })
      else expect(data.total).toBe(7)
      expect(
        (
          await page.request.get(
            `/api/v1/overview/sections?section=${section}&projectId=unassigned`
          )
        ).status()
      ).toBe(400)
    }
    const unauthenticated = await browser.newContext()
    try {
      expect(
        (
          await unauthenticated.request.get(
            `${baseURL}/api/v1/overview/sections?section=habit-streaks`
          )
        ).status()
      ).toBe(401)
    } finally {
      await unauthenticated.close()
    }
    // Verify the fixtures still belong to the disposable account before it is cleaned up.
    expect(
      (
        await db
          .select()
          .from(schema.habits)
          .where(eq(schema.habits.userId, testAccount.id))
      ).length
    ).toBe(7)
  } finally {
    try {
      await db
        .delete(schema.user)
        .where(
          and(
            eq(schema.user.id, foreignId),
            eq(schema.user.email, foreignEmail)
          )
        )
    } finally {
      await client.end()
    }
  }
})
