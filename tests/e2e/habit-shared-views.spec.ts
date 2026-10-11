import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { and, eq } from "drizzle-orm"
import type { APIRequestContext } from "@playwright/test"
import * as schema from "../../lib/db/schema"
import {
  addDays,
  defaultConfig,
  progressOn,
  type Habit,
  type HabitBundle,
  type HabitConfig,
} from "../../lib/habits/model"
import type { HabitCalendarBlock } from "../../lib/habits/planning"
import { test, expect } from "./fixtures"
import { write } from "./helpers"

async function create(
  request: APIRequestContext,
  name: string,
  patch: Partial<HabitConfig> = {}
) {
  const bundle: HabitBundle = await (await request.get("/api/v1/habits")).json()
  const config = { ...defaultConfig(bundle.today, bundle.weekStart), ...patch }
  const response = await request.post("/api/v1/habits", {
    data: {
      id: randomUUID(),
      name,
      reason: "Room for myself",
      icon: "📖",
      color: "orange",
      config,
    },
  })
  expect(response.ok()).toBe(true)
  const { habit } = (await response.json()) as { habit: Habit }
  return { habit, today: bundle.today, timezone: bundle.timezone }
}
async function calendar(request: APIRequestContext, from: string, to = from) {
  const response = await request.get(
    `/api/v1/habits/calendar?from=${from}&to=${to}`
  )
  expect(response.ok()).toBe(true)
  return (await response.json()) as {
    blocks: HabitCalendarBlock[]
    items: Habit[]
    flexible: unknown[]
  }
}

test("dragging a habit opens a plan review and cancel leaves its original plan intact", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const { habit, today } = await create(page.request, "Drag a habit")
  await page.goto("/calendar")
  const original = page.getByRole("button", {
    name: `Habit Drag a habit, ${today}, planned`,
    exact: true,
  })
  await expect(original).toBeVisible()
  const origin = await original.boundingBox(),
    target = await page
      .locator(`.fc-daygrid-day[data-date="${addDays(today, 1)}"]`)
      .boundingBox()
  expect(origin).toBeTruthy()
  expect(target).toBeTruthy()
  await page.mouse.move(origin!.x + 20, origin!.y + 10)
  await page.mouse.down()
  await page.mouse.move(origin!.x + 25, origin!.y + 15, { steps: 2 })
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 40, {
    steps: 15,
  })
  await page.mouse.up()
  const plan = page.getByRole("dialog", { name: "Change habit plan" })
  await expect(plan).toBeVisible()
  await expect(plan.getByLabel("Planned date")).toHaveValue(addDays(today, 1))
  expect((await calendar(page.request, today)).items[0].plans).toHaveLength(0)
  await plan.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(original).toBeVisible()
  expect(
    (await calendar(page.request, today)).blocks.find(
      (b) => b.habitId === habit.id
    )
  ).toMatchObject({ date: today, amount: 0 })
})

test("calendar, Overview and search open independent habits and record only after explicit save", async ({
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
  const { habit, today } = await create(page.request, "Read calendar", {
    times: ["19:00"],
    target: 30,
    defaultDuration: 15,
  })
  await page.goto("/calendar")
  const block = page.getByRole("button", {
    name: `Habit Read calendar, ${today} 19:00, planned`,
    exact: true,
  })
  await expect(block).toBeVisible()
  await expect(block).toContainText("19:00")
  await expect(block).toContainText("15m planned")
  await block.click()
  const actions = page.getByRole("dialog", {
    name: "📖 Read calendar",
    exact: true,
  })
  await expect(actions).toContainText("15 min planned · 0 min recorded")
  expect(
    (await (await page.request.get("/api/v1/habits/timer")).json()).session
  ).toBeNull()
  expect((await calendar(page.request, today)).items[0].logs).toHaveLength(0)
  await actions
    .getByRole("button", { name: "Start timer", exact: true })
    .click()
  const start = page.getByRole("dialog", { name: "Start · Read calendar" })
  await expect(start.getByLabel("Session minutes")).toHaveValue("15")
  await write(page, "POST", "/habits/timer", () =>
    start.getByRole("button", { name: "Start timer", exact: true }).click()
  )
  const dock = page.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  await expect(dock).toBeVisible()
  expect((await calendar(page.request, today)).items[0].logs).toHaveLength(0)
  await dock.getByRole("button", { name: "Discard", exact: true }).click()
  await dock
    .getByRole("button", { name: "Discard session", exact: true })
    .click()
  await expect(dock).toHaveCount(0)
  await block.click()
  await actions
    .getByRole("button", { name: "Log progress", exact: true })
    .click()
  const log = page.getByRole("dialog", { name: "Log progress · Read calendar" })
  await log.getByLabel("Amount (minutes)").fill("30")
  await log.getByLabel("Note (optional)").fill("Chapter constellation")
  await write(page, "POST", `/habits/${habit.id}/logs`, () =>
    log.getByRole("button", { name: "Save progress", exact: true }).click()
  )
  await expect(
    page.getByRole("button", {
      name: `Habit Read calendar, ${today} 19:00, goal met`,
      exact: true,
    })
  ).toBeVisible()
  const recorded = (await calendar(page.request, today)).items[0]
  expect(
    (
      await page.request.post(`/api/v1/habits/${habit.id}/plans`, {
        data: {
          id: randomUUID(),
          expectedRevision: recorded.revision,
          scope: "extra",
          date: today,
          time: null,
          minutes: 30,
        },
      })
    ).status()
  ).toBe(400)
  await page.getByRole("button", { name: "Habits on", exact: true }).click()
  await expect(
    page.getByRole("button", { name: /^Habit Read calendar,/ })
  ).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole("button", { name: "Habits off", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Habits off", exact: true }).click()
  await expect(
    page.getByRole("button", { name: /^Habit Read calendar,/ }).first()
  ).toBeVisible()
  await page.setViewportSize({ width: 768, height: 1024 })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("calendar-habits-tablet.png"),
    fullPage: true,
  })
  await page.goto("/overview")
  await expect(
    page.getByRole("region", { name: "Habits today" })
  ).toContainText("1 / 1 goals met")
  await page
    .getByRole("region", { name: "Habits today" })
    .getByRole("button", { name: "View work" })
    .click()
  await expect(actions).toContainText("30 min recorded")
  await actions.getByRole("link", { name: /Open habit history/ }).click()
  await expect(
    page.getByRole("dialog", { name: "📖 Read calendar", exact: true })
  ).toContainText("Chapter constellation")
  const search = await (
    await page.request.get("/api/v1/search?q=constellation&type=habit")
  ).json()
  expect(search.habits).toHaveLength(1)
  expect(search.habits[0].url).toBe(`/habits?h=${habit.id}&date=${today}`)
  await page.goto("/search")
  await page.getByPlaceholder("Search everything…").fill("constellation")
  await expect(
    page.getByText(`Read calendar · ${today}`, { exact: true })
  ).toBeVisible()
  const exported = await (await page.request.get("/api/v1/export")).json()
  expect(exported.tasks).toHaveLength(0)
  expect(exported.habits[0].logs).toHaveLength(1)
  expect(progressOn(exported.habits[0], today)?.amount).toBe(30)
})

test("calendar planning supports individual and future moves, flexible days and stale retry protection", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const { habit, today } = await create(page.request, "Plan reading")
  await create(page.request, "Move flexibly", {
    schedule: "flexible",
    weeklyDays: 3,
    defaultDuration: 20,
  })
  await page.goto("/calendar")
  await page
    .getByRole("button", {
      name: `Habit Plan reading, ${today}, planned`,
      exact: true,
    })
    .click()
  await page
    .getByRole("dialog", { name: "📖 Plan reading" })
    .getByRole("button", { name: "Change plan" })
    .click()
  const plan = page.getByRole("dialog", { name: "Change habit plan" })
  await plan.getByLabel("Planned date").fill(addDays(today, 1))
  await plan.getByLabel("Time (leave empty for all day)").fill("10:00")
  await plan.getByLabel("Planned minutes").fill("45")
  await write(page, "POST", `/habits/${habit.id}/plans`, () =>
    plan.getByRole("button", { name: "Save plan", exact: true }).click()
  )
  await expect(
    page.getByRole("button", {
      name: `Habit Plan reading, ${today}, planned`,
      exact: true,
    })
  ).toHaveCount(0)
  let result = await calendar(page.request, today, addDays(today, 4))
  const moved = result.blocks.find(
    (b) => b.habitId === habit.id && b.sourceDate === today
  )!
  expect(moved).toMatchObject({
    date: addDays(today, 1),
    time: "10:00",
    minutes: 45,
    amount: 0,
  })
  const input = {
    id: randomUUID(),
    expectedRevision: result.items.find((h) => h.id === habit.id)!.revision,
    scope: "following",
    versionId: moved.versionId,
    sourceDate: moved.sourceDate,
    sourceSlot: moved.sourceSlot,
    date: addDays(today, 2),
    time: "11:00",
    minutes: 25,
  }
  const saves = await Promise.all(
    [1, 2].map(() =>
      page.request.post(`/api/v1/habits/${habit.id}/plans`, { data: input })
    )
  )
  expect(saves.every((r) => r.ok())).toBe(true)
  expect(
    (await Promise.all(saves.map((r) => r.json()))).map((r) => r.created).sort()
  ).toEqual([false, true])
  expect(
    (
      await page.request.post(`/api/v1/habits/${habit.id}/plans`, {
        data: { ...input, id: randomUUID() },
      })
    ).status()
  ).toBe(409)
  result = await calendar(page.request, today, addDays(today, 4))
  expect(
    result.blocks.find((b) => b.habitId === habit.id && b.sourceDate === today)
  ).toMatchObject({ date: addDays(today, 2), time: "11:00" })
  expect(
    result.blocks.find(
      (b) => b.habitId === habit.id && b.sourceDate === addDays(today, 1)
    )
  ).toMatchObject({ date: addDays(today, 3), time: "11:00", minutes: 25 })
  expect(result.items.every((h) => h.logs.length === 0)).toBe(true)
  await page.reload()
  const flexible = page
    .getByRole("region", { name: "Flexible habit targets" })
    .locator("div.rounded-lg")
    .filter({ hasText: "Move flexibly" })
    .first()
  await flexible.getByRole("button", { name: "Choose a day" }).click()
  const extra = page.getByRole("dialog", { name: "Plan a habit", exact: true })
  await expect(extra.getByLabel("Planned minutes")).toHaveValue("20")
  await extra.getByLabel("Planned date").fill(today)
  await extra.getByRole("button", { name: "Save plan", exact: true }).click()
  await expect(
    page.getByRole("button", {
      name: `Habit Move flexibly, ${today}, planned`,
      exact: true,
    })
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("calendar-habits-narrow.png"),
    fullPage: true,
  })
})

test("reminders persist snooze and dismiss, exports include older history and every endpoint is account scoped", async ({
  page,
  testAccount,
}) => {
  const { habit, today } = await create(page.request, "Gentle reminders", {
    reminders: ["00:00"],
    startDate: "2026-01-01",
  })
  const list = await (await page.request.get("/api/v1/habits/reminders")).json()
  const reminder = list.items.find((r: { date: string }) => r.date === today)
  expect(reminder).toBeTruthy()
  await page.goto("/overview")
  await page.getByRole("button", { name: /\d+ reminders/ }).click()
  const row = page.getByLabel("Habit reminder Gentle reminders", {
    exact: true,
  })
  await expect(row).toBeVisible()
  await write(page, "POST", `/habits/${habit.id}/reminders`, () =>
    row.getByRole("button", { name: "Snooze 10 minutes" }).click()
  )
  await page.reload()
  expect(
    (
      await (await page.request.get("/api/v1/habits/reminders")).json()
    ).items.some((r: { date: string }) => r.date === today)
  ).toBe(false)
  const data = {
    id: randomUUID(),
    versionId: reminder.versionId,
    date: reminder.date,
    time: reminder.time,
    action: "dismiss",
  }
  expect(
    (
      await page.request.post(`/api/v1/habits/${habit.id}/reminders`, { data })
    ).ok()
  ).toBe(true)
  expect(
    (
      await page.request.post(`/api/v1/habits/${habit.id}/reminders`, { data })
    ).ok()
  ).toBe(true)
  const before = await calendar(page.request, today)
  expect(before.items[0].logs).toHaveLength(0)
  const record = await page.request.post(`/api/v1/habits/${habit.id}/logs`, {
    data: {
      id: randomUUID(),
      date: "2026-01-02",
      kind: "progress",
      amount: 18,
      notes: '=SUM(A1), "old work"\nsecond line',
    },
  })
  expect(record.ok()).toBe(true)
  const csv = await page.request.get("/api/v1/habits/export")
  expect(csv.headers()["content-disposition"]).toContain("attachment")
  expect(await csv.text()).toContain("2026-01-02")
  expect(await csv.text()).toContain("'=SUM(A1)")
  const json = await (await page.request.get("/api/v1/export")).json()
  expect(json.habits[0].logs).toHaveLength(1)
  expect(
    json.habits[0].reminders.find((r: { date: string }) => r.date === today)
      .dismissedAt
  ).toBeTruthy()
  expect(json.habits[0].occurrences).toHaveLength(1)
  expect(json.tasks).toHaveLength(0)
  const client = postgres(process.env.DATABASE_URL!, { max: 1 }),
    db = drizzle(client, { schema, casing: "snake_case" }),
    foreignId = randomUUID(),
    foreignEmail = `habit-views-${foreignId}@example.invalid`
  try {
    await db.insert(schema.user).values({
      id: foreignId,
      name: "Foreign habit test",
      email: foreignEmail,
    })
    await db
      .update(schema.habits)
      .set({ userId: foreignId })
      .where(
        and(
          eq(schema.habits.id, habit.id),
          eq(schema.habits.userId, testAccount.id)
        )
      )
    expect((await calendar(page.request, today)).items).toHaveLength(0)
    expect(
      (
        await (
          await page.request.get("/api/v1/search?q=Gentle&type=habit")
        ).json()
      ).habits
    ).toHaveLength(0)
    expect(
      (await (await page.request.get("/api/v1/export")).json()).habits
    ).toHaveLength(0)
    expect(
      await (await page.request.get("/api/v1/habits/export")).text()
    ).not.toContain("Gentle")
    expect(
      (await (await page.request.get("/api/v1/habits/reminders")).json()).items
    ).toHaveLength(0)
    expect(
      (
        await page.request.post(`/api/v1/habits/${habit.id}/reminders`, {
          data: { ...data, id: randomUUID() },
        })
      ).status()
    ).toBe(404)
    expect(
      (
        await page.request.post(`/api/v1/habits/${habit.id}/plans`, {
          data: {
            id: randomUUID(),
            expectedRevision: 1,
            scope: "extra",
            date: today,
            time: null,
            minutes: 30,
          },
        })
      ).status()
    ).toBe(404)
  } finally {
    await db
      .delete(schema.user)
      .where(
        and(eq(schema.user.id, foreignId), eq(schema.user.email, foreignEmail))
      )
    await client.end()
  }
})
