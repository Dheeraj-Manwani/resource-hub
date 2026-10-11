import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import type { APIRequestContext, Page } from "@playwright/test"
import * as schema from "../../lib/db/schema"
import {
  addDays,
  defaultConfig,
  type Habit,
  type HabitBundle,
  type HabitConfig,
} from "../../lib/habits/model"
import type { HabitReward } from "../../lib/habits/motivation"
import { test, expect } from "./fixtures"
import { write } from "./helpers"
async function create(
  request: APIRequestContext,
  name: string,
  config: Partial<HabitConfig> = {}
) {
  const bundle: HabitBundle = await (await request.get("/api/v1/habits")).json()
  const response = await request.post("/api/v1/habits", {
    data: {
      id: randomUUID(),
      name,
      reason: "",
      icon: "📖",
      color: "orange",
      config: {
        ...defaultConfig(addDays(bundle.today, -35), bundle.weekStart),
        ...config,
      },
    },
  })
  expect(response.ok()).toBe(true)
  return { ...bundle, habit: (await response.json()).habit as Habit }
}
async function record(
  request: APIRequestContext,
  habitId: string,
  date: string,
  amount: number,
  kind = "progress",
  id = randomUUID()
) {
  const response = await request.post(`/api/v1/habits/${habitId}/logs`, {
    data: { id, date, amount, kind, notes: "" },
  })
  expect(response.ok()).toBe(true)
  return await response.json()
}
async function uiRecord(page: Page, habit: Habit, amount: number) {
  const card = page.getByRole("article", { name: habit.name, exact: true })
  await card.getByRole("button", { name: "Log progress", exact: true }).click()
  const dialog = page.getByRole("dialog", {
    name: `Log progress · ${habit.name}`,
    exact: true,
  })
  await dialog.getByLabel("Amount (minutes)").fill(String(amount))
  return await (
    await write(page, "POST", `/habits/${habit.id}/logs`, () =>
      dialog.getByRole("button", { name: "Save progress", exact: true }).click()
    )
  ).json()
}
async function motivation(request: APIRequestContext) {
  const response = await request.get("/api/v1/habits/motivation")
  expect(response.ok()).toBe(true)
  return await response.json()
}

test("saved effort earns a journey; correction and retries never celebrate a milestone twice", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  const { habit, today } = await create(page.request, "Keep curiosity")
  await page.goto("/habits")
  await expect(page.getByLabel("Habit encouragement")).toContainText(
    "Five minutes"
  )
  const first = await uiRecord(page, habit, 18)
  expect(first.completed).toBe(false)
  expect(first.reward.milestones.map((b: { id: string }) => b.id)).toEqual([
    "first-effort",
  ])
  const reward = page.getByRole("status", { name: "Habit reward", exact: true })
  await expect(reward).toContainText("A beginning")
  await expect(page.getByRole("region", { name: "Habit recap" })).toContainText(
    "18 min recorded"
  )
  await page.getByRole("button", { name: "Dismiss habit reward" }).click()
  const complete = await uiRecord(page, habit, 12)
  expect(complete.completed).toBe(true)
  await expect(reward).toContainText("Goal met. A promise kept.")
  await page.getByRole("button", { name: "Dismiss habit reward" }).click()
  const hour = await uiRecord(page, habit, 30)
  expect(hour.completed).toBe(false)
  expect(hour.reward.milestones.map((b: { id: string }) => b.id)).toEqual([
    "time-60",
  ])
  await expect(reward).toContainText("1 hour invested")
  await page.getByRole("button", { name: "Dismiss habit reward" }).click()
  await page.getByRole("tab", { name: "Your work", exact: true }).click()
  const journey = page.locator(`[aria-label="${habit.name} journey"]`)
  await expect(
    journey.getByLabel("Earned milestone: 1 hour invested", { exact: true })
  ).toBeVisible()
  await expect(
    journey.getByRole("progressbar", { name: "5 hours invested progress" })
  ).toHaveAttribute("value", "60")
  const correction = await page.request.patch(
    `/api/v1/habits/${habit.id}/logs/${hour.log.id}`,
    {
      data: {
        amount: 1,
        notes: "Corrected",
        expectedRevision: hour.log.revision,
      },
    }
  )
  expect(correction.ok()).toBe(true)
  await page.reload()
  await page.getByRole("tab", { name: "Your work", exact: true }).click()
  await expect(
    journey.getByLabel("Earned milestone: 1 hour invested", { exact: true })
  ).toHaveCount(0)
  const threshold = await record(page.request, habit.id, today, 29)
  expect(threshold.reward.milestones).toEqual([])
  expect(threshold.completed).toBe(false)
  const id = randomUUID(),
    responses = await Promise.all([
      record(page.request, habit.id, today, 1, "progress", id),
      record(page.request, habit.id, today, 1, "progress", id),
    ])
  expect(responses.filter((r) => r.created)).toHaveLength(1)
  expect(responses.every((r) => !r.reward?.milestones.length)).toBe(true)
  await page.reload()
  await page.getByRole("tab", { name: "Your work", exact: true }).click()
  await expect(reward).toHaveCount(0)
  await expect(
    journey.getByLabel("Earned milestone: 1 hour invested", { exact: true })
  ).toBeVisible()
  await page.setViewportSize({ width: 768, height: 1024 })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("habit-journey-tablet.png"),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("habit-journey-narrow.png"),
    fullPage: true,
  })
})

test("quiet mode persists, reduced motion is respected and a return recognises earlier work", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const { habit, today } = await create(page.request, "Return gently")
  await record(page.request, habit.id, addDays(today, -10), 18)
  await page.addInitScript(() => {
    const state = window as unknown as Window & {
      habitAudioStarts: number
      habitAudioCloses: number
    }
    state.habitAudioStarts = 0
    state.habitAudioCloses = 0
    const NativeAudio = window.AudioContext
    if (NativeAudio)
      Object.defineProperty(window, "AudioContext", {
        value: class extends NativeAudio {
          constructor() {
            super()
            state.habitAudioStarts++
          }
          close() {
            state.habitAudioCloses++
            return super.close()
          }
        },
      })
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/habits")
  await expect(page.getByLabel("Habit encouragement")).toContainText(
    "Welcome back"
  )
  const result = await uiRecord(page, habit, 5)
  expect(result.reward.returning).toBe(true)
  const reward = page.getByRole("status", { name: "Habit reward", exact: true })
  await expect(reward).toContainText("Good to have you back")
  expect(
    await page.evaluate(
      () =>
        (window as unknown as Window & { habitAudioStarts: number })
          .habitAudioStarts
    )
  ).toBe(0)
  expect(await reward.evaluate((e) => getComputedStyle(e).animationName)).toBe(
    "none"
  )
  await page.getByRole("button", { name: "Dismiss habit reward" }).click()
  await page.getByRole("button", { name: "Experience", exact: true }).click()
  const settings = page.getByRole("dialog", {
    name: "Habit experience",
    exact: true,
  })
  await expect(
    settings.getByRole("checkbox", { name: "Celebration sound", exact: true })
  ).not.toBeChecked()
  await write(page, "PATCH", "/habits/preferences", () =>
    settings
      .getByRole("checkbox", { name: "Celebration sound", exact: true })
      .check()
  )
  await settings
    .getByRole("button", { name: "Test sound", exact: true })
    .click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as Window & { habitAudioCloses: number })
            .habitAudioCloses
      )
    )
    .toBe(1)
  await write(page, "PATCH", "/habits/preferences", () =>
    settings.getByRole("checkbox", { name: "Quiet mode", exact: true }).check()
  )
  await settings.getByRole("button", { name: "Close", exact: true }).click()
  await expect(page.getByRole("region", { name: "Habit recap" })).toHaveCount(0)
  const complete = await uiRecord(page, habit, 25)
  expect(complete.completed).toBe(true)
  await expect(reward).toHaveCount(0)
  expect(
    await page.evaluate(
      () =>
        (window as unknown as Window & { habitAudioStarts: number })
          .habitAudioStarts
    )
  ).toBe(1)
  await page.reload()
  await expect(page.getByRole("region", { name: "Habit recap" })).toHaveCount(0)
  await page.getByRole("button", { name: "Experience", exact: true }).click()
  await expect(
    settings.getByRole("checkbox", { name: "Quiet mode", exact: true })
  ).toBeChecked()
  await settings.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByRole("tab", { name: "Your work", exact: true }).click()
  await expect(
    page.getByLabel("Earned milestone: A beginning", { exact: true })
  ).toBeVisible()
  const prefs = await (
    await page.request.get("/api/v1/habits/preferences")
  ).json()
  expect(prefs).toMatchObject({
    quiet: true,
    sound: true,
    celebrations: true,
    recaps: true,
    nudges: true,
  })
  const bundle: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  const entries = bundle.items
    .find((h) => h.id === habit.id)!
    .logs.filter((l) => l.date === today && !l.deleted)
  for (const entry of entries) {
    const deletion = await page.request.patch(
      `/api/v1/habits/${habit.id}/logs/${entry.id}`,
      { data: { deleted: true, expectedRevision: entry.revision } }
    )
    expect(deletion.ok()).toBe(true)
  }
  const returningAgain = await record(page.request, habit.id, today, 5)
  expect(returningAgain.reward.returning).toBe(false)
  expect(returningAgain.reward.milestones).toEqual([])
})

test("timer rewards require a save; quantity timers and concurrent weekly goals earn once", async ({
  page,
  testAccount,
}) => {
  const { habit, today } = await create(page.request, "Read pages", {
    goalType: "quantity",
    unit: "pages",
    target: 10,
  })
  const start = await page.request.post("/api/v1/habits/timer", {
    data: {
      id: randomUUID(),
      habitId: habit.id,
      mode: "stopwatch",
      minutes: 60,
    },
  })
  expect(start.ok()).toBe(true)
  const { session } = await start.json()
  expect(
    (await motivation(page.request)).items[0].badges.some(
      (b: { earned: boolean }) => b.earned
    )
  ).toBe(false)
  const connection = postgres(process.env.DATABASE_URL!, { max: 1 })
  try {
    const db = drizzle(connection, { schema, casing: "snake_case" })
    await db
      .update(schema.habitTimerSessions)
      .set({ runningSince: new Date(Date.now() - 3602000) })
      .where(
        and(
          eq(schema.habitTimerSessions.id, session.id),
          eq(schema.habitTimerSessions.userId, testAccount.id)
        )
      )
  } finally {
    await connection.end()
  }
  const command = {
    id: randomUUID(),
    action: "finish",
    at: Date.now(),
    expectedRevision: session.revision,
    confirmedMs: 3600000,
    notes: "A quiet hour",
  }
  const finish = await page.request.patch(
    `/api/v1/habits/timer/${session.id}`,
    { data: command }
  )
  expect(finish.ok()).toBe(true)
  const saved = await finish.json()
  expect(saved.completed).toBe(false)
  expect(saved.reward.milestones.map((b: { id: string }) => b.id)).toEqual([
    "first-effort",
    "time-60",
  ])
  const retry = await page.request.patch(`/api/v1/habits/timer/${session.id}`, {
    data: command,
  })
  expect(retry.ok()).toBe(true)
  expect((await retry.json()).saved).toBe(false)
  expect((await motivation(page.request)).items[0].metrics).toMatchObject({
    minutes: 60,
    goals: 0,
  })
  const weekly = await create(page.request, "A weekly promise", {
    goalPeriod: "week",
    target: 30,
  })
  const completions = await Promise.all([
    record(page.request, weekly.habit.id, today, 30),
    record(page.request, weekly.habit.id, today, 30),
  ])
  expect(completions.filter((r) => r.completed)).toHaveLength(1)
  expect(
    completions
      .flatMap((r) => (r.reward as HabitReward).milestones)
      .filter((b) => b.id === "weeks-1")
  ).toHaveLength(1)
  const before = await page.request.get("/api/v1/export")
  expect(before.ok()).toBe(true)
  const exported = await before.json()
  expect(
    exported.habits
      .find((h: Habit) => h.id === habit.id)
      .milestones.map((b: { key: string }) => b.key)
      .sort()
  ).toEqual(["first-effort", "time-60"])
  expect(exported.habitPreferences.sound).toBe(false)
})

test("motivation reads add no records and preferences and journeys are account private", async ({
  page,
  browser,
  baseURL,
  testAccount,
}) => {
  const { habit, today } = await create(page.request, "Private journey")
  const initial = await motivation(page.request)
  expect(initial.items[0].metrics.effortDays).toBe(0)
  await page.request.patch("/api/v1/habits/preferences", {
    data: { quiet: true },
  })
  expect(
    (
      await page.request.patch("/api/v1/habits/preferences", {
        data: { userId: "other", sound: true },
      })
    ).status()
  ).toBe(400)
  expect(
    (
      await page.request.patch("/api/v1/habits/preferences", {
        data: { sound: "yes" },
      })
    ).status()
  ).toBe(400)
  const connection = postgres(process.env.DATABASE_URL!, { max: 1 }),
    db = drizzle(connection, { schema, casing: "snake_case" }),
    foreignId = randomUUID(),
    email = `habit-motivation-${foreignId}@example.invalid`
  try {
    expect(
      await db
        .select()
        .from(schema.habitMilestones)
        .where(eq(schema.habitMilestones.habitId, habit.id))
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.habitOccurrences)
        .where(eq(schema.habitOccurrences.habitId, habit.id))
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.habitLogs)
        .where(eq(schema.habitLogs.habitId, habit.id))
    ).toHaveLength(0)
    await record(page.request, habit.id, today, 18)
    await db
      .insert(schema.user)
      .values({ id: foreignId, name: "Foreign", email })
    await db
      .insert(schema.habitPreferences)
      .values({ userId: foreignId, sound: true })
    await db
      .update(schema.habits)
      .set({ userId: foreignId })
      .where(
        and(
          eq(schema.habits.id, habit.id),
          eq(schema.habits.userId, testAccount.id)
        )
      )
    expect((await motivation(page.request)).items).toEqual([])
    expect(
      (await (await page.request.get("/api/v1/habits/preferences")).json())
        .sound
    ).toBe(false)
    expect(
      (
        await page.request.post(`/api/v1/habits/${habit.id}/logs`, {
          data: {
            id: randomUUID(),
            date: today,
            amount: 5,
            notes: "",
            kind: "progress",
          },
        })
      ).status()
    ).toBe(404)
    const anonymous = await browser.newContext()
    try {
      for (const route of ["motivation", "preferences"])
        expect(
          (
            await anonymous.request.get(`${baseURL}/api/v1/habits/${route}`)
          ).status()
        ).toBe(401)
      expect(
        (
          await anonymous.request.patch(
            `${baseURL}/api/v1/habits/preferences`,
            { data: { quiet: true } }
          )
        ).status()
      ).toBe(401)
    } finally {
      await anonymous.close()
    }
  } finally {
    await db
      .delete(schema.user)
      .where(and(eq(schema.user.id, foreignId), eq(schema.user.email, email)))
    await connection.end()
  }
})
