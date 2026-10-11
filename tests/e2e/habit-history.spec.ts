import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { and, eq } from "drizzle-orm"
import type { APIRequestContext } from "@playwright/test"
import * as schema from "../../lib/db/schema"
import {
  addDays,
  defaultConfig,
  weekDates,
  type Habit,
  type HabitConfig,
  type HabitBundle,
} from "../../lib/habits/model"
import type { HabitHistory } from "../../lib/habits/history"
import { test, expect } from "./fixtures"

async function create(
  request: APIRequestContext,
  name: string,
  config: Partial<HabitConfig> = {}
) {
  const bundle: HabitBundle = await (
      await request.get("/api/v1/habits")
    ).json(),
    id = randomUUID()
  const result = await request.post("/api/v1/habits", {
    data: {
      id,
      name,
      reason: "Make time for myself",
      icon: "📖",
      color: "orange",
      config: {
        ...defaultConfig(addDays(bundle.today, -35), bundle.weekStart),
        ...config,
      },
    },
  })
  expect(result.ok()).toBe(true)
  return { ...bundle, habit: (await result.json()).habit as Habit }
}
async function record(
  request: APIRequestContext,
  id: string,
  date: string,
  amount: number,
  notes = ""
) {
  const response = await request.post(`/api/v1/habits/${id}/logs`, {
    data: { id: randomUUID(), date, amount, notes, kind: "progress" },
  })
  expect(response.ok()).toBe(true)
  return await response.json()
}
async function history(
  request: APIRequestContext,
  id?: string,
  date?: string,
  view = "quarter"
) {
  const params = new URLSearchParams({ view })
  if (id) params.set("habitId", id)
  if (date) params.set("date", date)
  const response = await request.get(`/api/v1/habits/history?${params}`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as {
    items: HabitHistory[]
    from: string
    to: string
    today: string
  }
}

test("history shows older work, drills into a day and updates every chart after correction, delete and undo", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const { habit, today } = await create(page.request, "Keep reading")
  const partial = addDays(today, -2),
    complete = addDays(today, -1),
    older = addDays(today, -31)
  await record(page.request, habit.id, older, 30, "Earlier chapter")
  await record(page.request, habit.id, partial, 18, "A few good pages")
  await record(page.request, habit.id, complete, 30, "Finished chapter")
  await page.goto("/habits")
  await page.getByRole("tab", { name: "Your work", exact: true }).click()
  const totals = page.locator('section[aria-label="Your work so far"]')
  await expect(totals).toContainText("1.3 hr")
  const section = page.getByRole("region", { name: "Keep reading history" })
  await expect(section).toContainText("2 goals met")
  await expect(section).toContainText("Earlier chapter")
  await section
    .getByRole("button", {
      name: new RegExp(
        `^Keep reading, ${partial}, Saved effort, 18 minutes recorded`
      ),
    })
    .click()
  const details = page.getByRole("dialog", {
    name: "📖 Keep reading",
    exact: true,
  })
  await expect(details).toContainText(`Saved effort · ${partial}`)
  await expect(details).toContainText("A few good pages")
  await expect(details).not.toContainText("Finished chapter")
  await details.getByRole("button", { name: "Edit entry", exact: true }).click()
  const edit = page.getByRole("dialog", {
    name: "Edit entry · Keep reading",
    exact: true,
  })
  await edit.getByLabel("Amount (minutes)").fill("12")
  const correction = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      r.url().includes(`/habits/${habit.id}/logs/`)
  )
  await edit
    .getByRole("button", { name: "Save correction", exact: true })
    .click()
  expect((await correction).ok()).toBe(true)
  await expect(details).toContainText("12 minutes")
  await expect(totals).toContainText("1.2 hr")
  const deletion = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      r.url().includes(`/habits/${habit.id}/logs/`)
  )
  await details
    .getByRole("button", { name: "Delete entry", exact: true })
    .click()
  expect((await deletion).ok()).toBe(true)
  await expect(details).toContainText("No entries on this day")
  await expect(totals).toContainText("1 hr")
  const undo = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      r.url().includes(`/habits/${habit.id}/logs/`)
  )
  await page
    .getByRole("status")
    .filter({ hasText: "Entry removed" })
    .getByRole("button", { name: "Undo", exact: true })
    .click()
  expect((await undo).ok()).toBe(true)
  await expect(details).toContainText("A few good pages")
  await details.getByRole("button", { name: "Close", exact: true }).click()
  await expect(totals).toContainText("1.2 hr")
  await page.getByLabel("History view", { exact: true }).selectOption("month")
  await page.getByLabel("Insights date", { exact: true }).fill(older)
  await expect(page.getByLabel("Selected history range")).toContainText(
    "30 min recorded in this view"
  )
  await expect(section).toContainText("Earlier chapter")
  await expect(totals).toContainText("1.2 hr")
  await page.setViewportSize({ width: 768, height: 1024 })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("habit-history-tablet.png"),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("habit-history-narrow.png"),
    fullPage: true,
  })
  const data = await history(page.request, habit.id)
  expect(data.items[0].summary.minutes).toBe(72)
  expect(data.items[0].days.find((d) => d.date === partial)).toMatchObject({
    amount: 12,
    minutes: 12,
    state: "partial",
  })
})

test("time breakdown counts quantity timers separately and archived effort remains visible", async ({
  page,
  testAccount,
}) => {
  const first = await create(page.request, "Read in minutes"),
    second = await create(page.request, "Read pages", {
      goalType: "quantity",
      unit: "pages",
      target: 10,
    })
  await record(page.request, first.habit.id, first.today, 18)
  await record(
    page.request,
    second.habit.id,
    first.today,
    3,
    "Three pages saved"
  )
  const started = await page.request.post("/api/v1/habits/timer", {
    data: {
      id: randomUUID(),
      habitId: second.habit.id,
      mode: "stopwatch",
      minutes: 5,
    },
  })
  expect(started.ok()).toBe(true)
  const active = (await started.json()).session
  const client = postgres(process.env.DATABASE_URL!, { max: 1 }),
    db = drizzle(client, { schema, casing: "snake_case" })
  try {
    // Simulate two elapsed minutes on this disposable account's real timer.
    await db
      .update(schema.habitTimerSessions)
      .set({ runningSince: new Date(Date.now() - 125000) })
      .where(
        and(
          eq(schema.habitTimerSessions.id, active.id),
          eq(schema.habitTimerSessions.userId, testAccount.id)
        )
      )
  } finally {
    await client.end()
  }
  const saved = await page.request.patch(`/api/v1/habits/timer/${active.id}`, {
    data: {
      id: randomUUID(),
      expectedRevision: active.revision,
      at: Date.now(),
      action: "finish",
      confirmedMs: 120000,
      notes: "Time with pages",
    },
  })
  expect(saved.ok()).toBe(true)
  const detail = await history(page.request, second.habit.id)
  expect(detail.items[0].summary).toMatchObject({
    minutes: 2,
    completedGoals: 0,
    totals: [{ unit: "pages", amount: 3 }],
  })
  expect(detail.items[0].timeWeeks.every((w) => w.target === 0)).toBe(true)
  expect(
    (
      await page.request.patch(`/api/v1/habits/${second.habit.id}/status`, {
        data: { status: "archived", expectedRevision: 1 },
      })
    ).ok()
  ).toBe(true)
  await page.goto("/habits")
  await page.getByRole("tab", { name: "Your work", exact: true }).click()
  const totals = page.getByRole("region", { name: "Your work so far" })
  await expect(totals).toContainText("18 min")
  await expect(
    page.getByRole("region", { name: "Read pages history" })
  ).toHaveCount(0)
  await page.getByLabel("Include archived", { exact: true }).check()
  await expect(totals).toContainText("20 min")
  await expect(
    page.getByRole("region", { name: "Read pages history" })
  ).toContainText("3 pages")
  await expect(
    page.getByRole("region", { name: "Read pages history" })
  ).toContainText("archived")
  const rows = await history(page.request)
  const week = rows.items[0].timeWeeks.at(-1)!.start
  await page
    .getByRole("button", {
      name: new RegExp(`^Time week ${week}: 20 minutes recorded`),
    })
    .click()
  const breakdown = page.getByRole("dialog", { name: /Time saved/ })
  await expect(breakdown).toContainText("Read in minutes")
  await expect(breakdown).toContainText("Read pages")
  await breakdown.getByRole("button", { name: /Read pages/ }).click()
  await expect(page.getByLabel("History habit", { exact: true })).toHaveValue(
    second.habit.id
  )
  await expect(page.getByLabel("History view", { exact: true })).toHaveValue(
    "week"
  )
  await expect(totals).toContainText("2 min")
})

test("weekly and flexible history counts saved goals once and honours account week boundaries", async ({
  page,
  testAccount,
}) => {
  void testAccount
  expect(
    (
      await page.request.patch("/api/v1/settings", {
        data: { weekStart: 0, timezone: "America/New_York" },
      })
    ).ok()
  ).toBe(true)
  const initial: HabitBundle = await (
      await page.request.get("/api/v1/habits")
    ).json(),
    previousWeek = weekDates(addDays(initial.today, -7), 0)
  const weekly = await create(page.request, "Weekly reading", {
      goalPeriod: "week",
      target: 60,
      startDate: previousWeek[0],
    }),
    flexible = await create(page.request, "Flexible reading", {
      schedule: "flexible",
      weeklyDays: 2,
      startDate: previousWeek[0],
    })
  await record(page.request, weekly.habit.id, previousWeek[0], 30)
  await record(page.request, weekly.habit.id, previousWeek[2], 30)
  await record(page.request, flexible.habit.id, previousWeek[1], 18)
  await record(page.request, flexible.habit.id, previousWeek[1], 12)
  await record(page.request, flexible.habit.id, previousWeek[3], 30)
  const before = await (await page.request.get("/api/v1/export")).json()
  const week = await history(
    page.request,
    weekly.habit.id,
    previousWeek[0],
    "week"
  )
  expect(week.from).toBe(previousWeek[0])
  expect(week.to).toBe(previousWeek[6])
  expect(week.items[0].summary).toMatchObject({
    completedGoals: 1,
    completedDays: 0,
    currentStreak: 1,
    eligible: 1,
    completed: 1,
  })
  expect(week.items[0].timeWeeks[0]).toMatchObject({ minutes: 60, target: 60 })
  expect(week.items[0].days.filter((d) => d.state === "complete")).toHaveLength(
    0
  )
  const flex = await history(
    page.request,
    flexible.habit.id,
    previousWeek[0],
    "week"
  )
  expect(flex.items[0].summary).toMatchObject({
    completedDays: 2,
    completedGoals: 2,
    weeklyTargetsMet: 1,
    currentStreak: 1,
  })
  expect(flex.items[0].periods[0]).toMatchObject({
    amount: 2,
    target: 2,
    type: "flexible",
    complete: true,
  })
  expect(flex.items[0].timeWeeks[0]).toMatchObject({ minutes: 60, target: 60 })
  expect(
    (
      await page.request.get(
        `/api/v1/habits/history?date=${addDays(initial.today, 1)}`
      )
    ).status()
  ).toBe(400)
  const after = await (await page.request.get("/api/v1/export")).json()
  expect(
    after.habits.map((h: { logs: unknown[]; occurrences: unknown[] }) => [
      h.logs.length,
      h.occurrences.length,
    ])
  ).toEqual(
    before.habits.map((h: { logs: unknown[]; occurrences: unknown[] }) => [
      h.logs.length,
      h.occurrences.length,
    ])
  )
})

test("habit history is private to its account and rejects foreign selections", async ({
  page,
  testAccount,
  browser,
  baseURL,
}) => {
  const { habit, today } = await create(page.request, "Private history")
  await record(page.request, habit.id, today, 18, "Private note")
  const anonymous = await browser.newContext()
  try {
    expect(
      (await anonymous.request.get(`${baseURL}/api/v1/habits/history`)).status()
    ).toBe(401)
  } finally {
    await anonymous.close()
  }
  const client = postgres(process.env.DATABASE_URL!, { max: 1 }),
    db = drizzle(client, { schema, casing: "snake_case" }),
    foreignId = randomUUID(),
    email = `habit-history-${foreignId}@example.invalid`
  try {
    await db
      .insert(schema.user)
      .values({ id: foreignId, email, name: "History privacy fixture" })
    await db
      .update(schema.habits)
      .set({ userId: foreignId })
      .where(
        and(
          eq(schema.habits.id, habit.id),
          eq(schema.habits.userId, testAccount.id)
        )
      )
    const own = await history(page.request)
    expect(own.items).toHaveLength(0)
    const foreign = await page.request.get(
      `/api/v1/habits/history?habitId=${habit.id}`
    )
    expect(foreign.status()).toBe(404)
    expect(await foreign.text()).not.toContain("Private note")
  } finally {
    await db
      .delete(schema.user)
      .where(and(eq(schema.user.id, foreignId), eq(schema.user.email, email)))
    await client.end()
  }
})
