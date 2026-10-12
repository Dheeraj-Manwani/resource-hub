import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../../lib/db/schema"
import type { HabitBundle } from "../../lib/habits/model"
import type { HabitTimer } from "../../lib/habits/timer"
import { test, expect } from "./fixtures"
import { write } from "./helpers"

test("hour goals, fractional progress, expanded appearance and timer corrections", async ({
  page,
  testAccount,
}, testInfo) => {
  await page.goto("/habits")
  await page.getByRole("button", { name: "Create your first habit" }).click()
  const form = page.getByRole("dialog", { name: "New habit", exact: true })
  await form.getByLabel("Habit name", { exact: true }).fill("Focused work")
  await form.getByLabel("Target minutes", { exact: true }).fill("240")
  await form.getByLabel("Track", { exact: true }).click()
  await page.getByRole("option", { name: "Hours", exact: true }).click()
  await expect(form.getByLabel("Target hours", { exact: true })).toHaveValue(
    "4"
  )
  await form.getByLabel("Track", { exact: true }).click()
  await page.getByRole("option", { name: "Minutes", exact: true }).click()
  await expect(form.getByLabel("Target minutes", { exact: true })).toHaveValue(
    "240"
  )
  await form.getByLabel("Track", { exact: true }).click()
  await page.getByRole("option", { name: "Hours", exact: true }).click()
  await form.getByLabel("Icon", { exact: true }).click()
  await expect(page.getByRole("option")).toHaveCount(24)
  await page.getByRole("option", { name: "Coding", exact: true }).click()
  await form.getByLabel("Colour", { exact: true }).click()
  await expect(page.getByRole("option")).toHaveCount(12)
  await page.getByRole("option", { name: "Teal", exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await form
    .getByLabel("Target hours", { exact: true })
    .scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath("habit-hours-mobile.png"),
    animations: "disabled",
  })
  const created = await write(page, "POST", "/habits", () =>
    form.getByRole("button", { name: "Create habit", exact: true }).click()
  )
  const { habit } = await created.json()
  expect(habit).toMatchObject({ icon: "💻", color: "teal" })
  expect(habit.versions[0].config).toMatchObject({
    goalType: "hours",
    target: 4,
    unit: "hours",
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  const card = page.getByRole("article", { name: "Focused work", exact: true })
  await expect(card).toContainText("0 / 4 hours")
  for (const amount of ["1.5", "2.5"]) {
    await card
      .getByRole("button", { name: "Log progress", exact: true })
      .click()
    const log = page.getByRole("dialog", { name: /Log progress/ })
    await log.getByLabel("Amount (hours)").fill(amount)
    await write(page, "POST", `/habits/${habit.id}/logs`, () =>
      log.getByRole("button", { name: "Save progress", exact: true }).click()
    )
  }
  await expect(card).toContainText("4 / 4 hours")
  await card.getByRole("button", { name: "Focused work", exact: true }).click()
  const details = page.getByRole("dialog", { name: /Focused work/ })
  const entry = details
    .locator("div.rounded-lg.border")
    .filter({ hasText: "1.5 hours" })
  await entry.getByRole("button", { name: "Edit entry", exact: true }).click()
  const edit = page.getByRole("dialog", { name: /Edit entry/ })
  await expect(edit.getByLabel("Amount (hours)")).toHaveValue("1.5")
  await edit.getByLabel("Amount (hours)").fill("1")
  const before: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  const entryId = before.items[0].logs.find((log) => log.amount === 1.5)!.id
  await write(page, "PATCH", `/habits/${habit.id}/logs/${entryId}`, () =>
    edit.getByRole("button", { name: "Save correction", exact: true }).click()
  )
  await expect(card).toContainText("3.5 / 4 hours")

  const sessionId = randomUUID()
  const started = await page.request.post("/api/v1/habits/timer", {
    data: { id: sessionId, habitId: habit.id, mode: "stopwatch", minutes: 120 },
  })
  expect(started.ok()).toBe(true)
  const client = postgres(process.env.DATABASE_URL!, { max: 1 })
  const db = drizzle(client, { schema, casing: "snake_case" })
  try {
    // Simulate 90 minutes only on this disposable account's timer.
    await db
      .update(schema.habitTimerSessions)
      .set({ runningSince: new Date(Date.now() - 5400000) })
      .where(
        and(
          eq(schema.habitTimerSessions.id, sessionId),
          eq(schema.habitTimerSessions.userId, testAccount.id)
        )
      )
  } finally {
    await client.end()
  }
  const timer: HabitTimer = (
    await (await page.request.get("/api/v1/habits/timer")).json()
  ).session
  const saved = await page.request.patch(`/api/v1/habits/timer/${sessionId}`, {
    data: {
      id: randomUUID(),
      expectedRevision: timer.revision,
      at: Date.now(),
      action: "finish",
      confirmedMs: 5400000,
      notes: "Focused session",
    },
  })
  expect(saved.ok()).toBe(true)
  const after: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  const sessions = after.items[0].logs.filter((log) => log.source === "timer")
  // Work may split across midnight; all pieces still use hours.
  expect(sessions.reduce((sum, log) => sum + log.amount, 0)).toBeCloseTo(1.5, 2)
  expect(sessions.reduce((sum, log) => sum + (log.elapsedMs ?? 0), 0)).toBe(
    5400000
  )
  const sessionEntry = sessions.find((log) => log.kind === "progress")!
  const corrected = await page.request.patch(
    `/api/v1/habits/${habit.id}/logs/${sessionEntry.id}`,
    {
      data: {
        amount: 2,
        notes: "Corrected session",
        expectedRevision: sessionEntry.revision,
      },
    }
  )
  expect(corrected.ok()).toBe(true)
  expect((await corrected.json()).log).toMatchObject({
    amount: 2,
    elapsedMs: 7200000,
  })
  await page.reload()
  await expect(card).toContainText("hours")
})
