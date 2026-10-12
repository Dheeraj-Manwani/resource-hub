import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { and, eq } from "drizzle-orm"
import type { APIRequestContext, Page } from "@playwright/test"
import * as schema from "../../lib/db/schema"
import {
  defaultConfig,
  type Habit,
  type HabitBundle,
} from "../../lib/habits/model"
import type { HabitTimer } from "../../lib/habits/timer"
import { test, expect } from "./fixtures"
import { write } from "./helpers"

async function bundle(request: APIRequestContext): Promise<HabitBundle> {
  return (await request.get("/api/v1/habits")).json()
}
async function active(request: APIRequestContext): Promise<HabitTimer> {
  return (await (await request.get("/api/v1/habits/timer")).json()).session
}
async function settle(page: Page, userId: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          JSON.parse(
            localStorage.getItem(`resource:habit-timer:v1:${id}`) ?? "null"
          )?.commands.length ?? 0,
        userId
      )
    )
    .toBe(0)
}
async function advancePhase(request: APIRequestContext, userId: string) {
  const t = await active(request)
  const client = postgres(process.env.DATABASE_URL!, { max: 1 })
  const db = drizzle(client, { schema, casing: "snake_case" })
  try {
    // Only this disposable account's timer: simulate an elapsed phase, not saved work.
    await db
      .update(schema.habitTimerSessions)
      .set(
        t.pomodoro?.phase === "break"
          ? { pomodoro: { ...t.pomodoro, breakSince: Date.now() - 65000 } }
          : { runningSince: new Date(Date.now() - 65000) }
      )
      .where(
        and(
          eq(schema.habitTimerSessions.id, t.id),
          eq(schema.habitTimerSessions.userId, userId)
        )
      )
  } finally {
    await client.end()
  }
}

test("starter to calendar Pomodoro, explicit save, correction, archive and export", async ({
  page,
  testAccount,
}, testInfo) => {
  await page.goto("/habits")
  await page.getByRole("button", { name: "Create your first habit" }).click()
  const form = page.getByRole("dialog", { name: "New habit", exact: true })
  await form.getByLabel("Habit name", { exact: true }).fill("Draft habit")
  await form.getByLabel("Your reason (optional)").fill("Draft reason")
  await form.getByLabel("Preferred times (optional)").fill("19:00")
  await form.getByLabel("Reminder times (optional)").fill("18:55")
  await form.getByRole("button", { name: "About habits", exact: true }).click()
  const help = page.getByRole("dialog", { name: "About habits", exact: true })
  await expect(help).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("habit-help-desktop.png"),
    animations: "disabled",
  })
  await help
    .getByRole("button", { name: "Use Movement template", exact: true })
    .click()
  await expect(help).toHaveCount(0)
  await expect(form.getByLabel("Habit name", { exact: true })).toHaveValue(
    "Make time to move"
  )
  await expect(form.getByLabel("Days per week", { exact: true })).toHaveValue(
    "3"
  )
  await expect(form.getByLabel("Goal period", { exact: true })).toBeDisabled()
  await expect(form.getByLabel("Goal period", { exact: true })).toContainText(
    "Daily"
  )
  await expect(form.getByLabel("Preferred times (optional)")).toHaveValue("")
  await expect(form.getByLabel("Reminder times (optional)")).toHaveValue("")
  await expect(form.getByLabel("Your reason (optional)")).toHaveValue("")
  await page.setViewportSize({ width: 390, height: 844 })
  await form.getByRole("button", { name: "About habits", exact: true }).click()
  await expect
    .poll(() =>
      help.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return (
          bounds.left >= 0 &&
          bounds.right <= window.innerWidth &&
          element.scrollWidth <= element.clientWidth
        )
      })
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("habit-help-mobile.png"),
    animations: "disabled",
  })
  await help
    .getByRole("button", { name: "Use Read pages template", exact: true })
    .click()
  await expect(form.getByLabel("Target quantity", { exact: true })).toHaveValue(
    "10"
  )
  await expect(form.getByLabel("Unit", { exact: true })).toHaveValue("pages")
  await form.getByLabel("Habit name", { exact: true }).scrollIntoViewIfNeeded()
  await expect(
    form.getByRole("button", { name: "Create habit", exact: true })
  ).toBeInViewport()
  await page.screenshot({
    path: testInfo.outputPath("habit-form-mobile.png"),
    animations: "disabled",
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await form.getByRole("button", { name: "About habits", exact: true }).click()
  await help
    .getByRole("button", { name: "Use Reading template", exact: true })
    .click()
  await expect(form.getByLabel("Habit name", { exact: true })).toHaveValue(
    "Read a little"
  )
  expect((await bundle(page.request)).items).toHaveLength(0)
  await form.getByLabel("Habit name", { exact: true }).fill("Room to read")
  await form.getByLabel("Target minutes", { exact: true }).fill("2")
  await form.getByLabel("Preferred times (optional)").fill("19:00")
  await form.getByLabel("Default session minutes").fill("1")
  const created = await write(page, "POST", "/habits", () =>
    form.getByRole("button", { name: "Create habit", exact: true }).click()
  )
  const habit: Habit = (await created.json()).habit
  const { today } = await bundle(page.request)
  expect(habit.logs).toHaveLength(0)
  await page.goto("/calendar")
  const block = page.getByRole("button", {
    name: `Habit Room to read, ${today} 19:00, planned`,
    exact: true,
  })
  await block.focus()
  await page.keyboard.press("Enter")
  const actions = page.getByRole("dialog", {
    name: "📖 Room to read",
    exact: true,
  })
  await actions
    .getByRole("button", { name: "Start timer", exact: true })
    .click()
  const start = page.getByRole("dialog", { name: "Start · Room to read" })
  await start.getByLabel("Timer mode").selectOption("pomodoro")
  await start.getByLabel("Work minutes per round").fill("1")
  await start.getByLabel("Break minutes", { exact: true }).fill("1")
  await start.getByLabel("Work rounds").fill("2")
  await write(page, "POST", "/habits/timer", () =>
    start.getByRole("button", { name: "Start timer", exact: true }).click()
  )
  const dock = page.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  await expect(dock).toContainText("Work · Round 1 of 2")
  await advancePhase(page.request, testAccount.id)
  await page.reload()
  await expect(dock.getByRole("timer")).toHaveText("00:00")
  expect((await bundle(page.request)).items[0].logs).toHaveLength(0)
  await dock.getByRole("button", { name: "Start break", exact: true }).click()
  await settle(page, testAccount.id)
  await expect(dock).toContainText("Break · Round 1 of 2")
  await dock.getByRole("button", { name: "Pause", exact: true }).click()
  await settle(page, testAccount.id)
  await dock.getByRole("button", { name: "Resume", exact: true }).click()
  await settle(page, testAccount.id)
  await advancePhase(page.request, testAccount.id)
  await page.reload()
  await expect(dock.getByRole("timer")).toHaveAttribute(
    "aria-label",
    "Break remaining"
  )
  await expect(dock.getByRole("timer")).toHaveText("00:00")
  expect((await bundle(page.request)).items[0].logs).toHaveLength(0)
  await dock
    .getByRole("button", { name: "Start next round", exact: true })
    .click()
  await settle(page, testAccount.id)
  await expect(dock).toContainText("Work · Round 2 of 2")
  await advancePhase(page.request, testAccount.id)
  await page.reload()
  await expect(dock.getByRole("timer")).toHaveText("00:00")
  await expect(
    dock.getByRole("button", { name: "Start break", exact: true })
  ).toHaveCount(0)
  await dock.getByRole("button", { name: "Finish", exact: true }).click()
  await settle(page, testAccount.id)
  await expect(dock.getByLabel("Actual working minutes")).toHaveValue("2")
  expect((await bundle(page.request)).items[0].logs).toHaveLength(0)
  await dock
    .getByLabel("Session note (optional)")
    .fill("Two focused rounds, a break in between")
  await dock.getByRole("button", { name: "Save session", exact: true }).click()
  await expect(dock).toHaveCount(0)
  const saved = (await bundle(page.request)).items[0]
  expect(saved.logs).toHaveLength(1)
  expect(saved.logs[0]).toMatchObject({
    amount: 2,
    elapsedMs: 120000,
    source: "timer",
  })
  await page.goto("/habits")
  await page.getByRole("tab", { name: "Your work", exact: true }).click()
  const history = page.getByRole("region", { name: "Room to read history" })
  await expect(history).toContainText("Two focused rounds")
  const day = history.getByRole("button", {
    name: new RegExp(`^Room to read, ${today}, Goal met`),
  })
  await day.focus()
  await page.keyboard.press("Enter")
  const details = page.getByRole("dialog", {
    name: "📖 Room to read",
    exact: true,
  })
  await details.getByRole("button", { name: "Edit entry", exact: true }).click()
  const edit = page.getByRole("dialog", { name: "Edit entry · Room to read" })
  await edit.getByLabel("Amount (minutes)").fill("1")
  await edit
    .getByRole("button", { name: "Save correction", exact: true })
    .click()
  await expect(details).toContainText("1 minutes")
  await details.getByRole("button", { name: "Archive", exact: true }).click()
  await expect(details).toHaveCount(0)
  await page.getByLabel("Include archived", { exact: true }).check()
  await expect(history).toContainText("archived")
  const csv = await page.request.get("/api/v1/habits/export")
  expect(csv.ok()).toBe(true)
  expect(await csv.text()).toContain("Two focused rounds")
  const json = await (await page.request.get("/api/v1/export")).json()
  expect(json.habits[0].sessions[0].pomodoro).toMatchObject({
    round: 2,
    phase: "work",
  })
  expect(json.habits[0].logs[0].elapsedMs).toBe(60000)
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      )
      .toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`habit-release-${viewport.width}.png`),
      fullPage: true,
    })
  }
})

test("break recovery, offline transition, concurrent retries and quantity time stay independent", async ({
  page,
  context,
  testAccount,
}) => {
  const b = await bundle(page.request),
    id = randomUUID()
  expect(
    (
      await page.request.post("/api/v1/habits", {
        data: {
          id,
          name: "Practice pages",
          reason: "",
          icon: "📖",
          color: "blue",
          config: {
            ...defaultConfig(b.today, b.weekStart),
            goalType: "quantity",
            target: 10,
            unit: "pages",
          },
        },
      })
    ).ok()
  ).toBe(true)
  const input = {
    id: randomUUID(),
    habitId: id,
    mode: "pomodoro",
    minutes: 1,
    breakMinutes: 1,
    rounds: 2,
  }
  expect(
    (
      await page.request.post("/api/v1/habits/timer", {
        data: { ...input, rounds: 13 },
      })
    ).status()
  ).toBe(400)
  expect(
    (await page.request.post("/api/v1/habits/timer", { data: input })).ok()
  ).toBe(true)
  await advancePhase(page.request, testAccount.id)
  const t = await active(page.request)
  const command = {
    id: randomUUID(),
    expectedRevision: t.revision,
    at: Date.now(),
    action: "next_phase",
  }
  const transitions = await Promise.all([
    page.request.patch(`/api/v1/habits/timer/${t.id}`, { data: command }),
    page.request.patch(`/api/v1/habits/timer/${t.id}`, { data: command }),
  ])
  expect(transitions.every((r) => r.ok())).toBe(true)
  expect((await active(page.request)).pomodoro?.phase).toBe("break")
  await page.goto("/habits")
  const dock = page.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  await expect(dock).toContainText("Break · Round 1 of 2")
  await context.setOffline(true)
  await dock
    .getByRole("button", { name: "Skip break · start next round", exact: true })
    .click()
  await expect(dock).toContainText("Work · Round 2 of 2")
  await expect(dock).toContainText("Saved on this device")
  await context.setOffline(false)
  await settle(page, testAccount.id)
  await page.reload()
  await expect(dock).toContainText("Work · Round 2 of 2")
  await advancePhase(page.request, testAccount.id)
  const current = await active(page.request)
  const finish = {
    id: randomUUID(),
    expectedRevision: current.revision,
    at: Date.now(),
    action: "finish",
    confirmedMs: 120000,
    notes: "Time only",
  }
  const response = await page.request.patch(`/api/v1/habits/timer/${t.id}`, {
    data: finish,
  })
  expect(response.ok()).toBe(true)
  expect((await response.json()).completed).toBe(false)
  const retry = await page.request.patch(`/api/v1/habits/timer/${t.id}`, {
    data: finish,
  })
  expect((await retry.json()).saved).toBe(false)
  const saved = (await bundle(page.request)).items[0]
  expect(saved.logs).toHaveLength(1)
  expect(saved.logs[0]).toMatchObject({
    amount: 0,
    elapsedMs: 120000,
    kind: "session",
  })
})

test("loading, retry, keyboard dialog access and timer fallback fit tablet layouts", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  await page.addInitScript(() =>
    Object.defineProperty(window, "documentPictureInPicture", {
      value: undefined,
      configurable: true,
    })
  )
  let release: () => void = () => {},
    broken = true
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/api\/v1\/habits(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.continue()
    await held
    if (broken)
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary failure" }),
      })
    return route.continue()
  })
  await page.goto("/habits")
  await expect(
    page.getByRole("status").filter({ hasText: "Loading habits" })
  ).toBeVisible()
  release()
  await expect(
    page.getByRole("alert").filter({ hasText: "Couldn't load habits" })
  ).toBeVisible({ timeout: 30000 })
  broken = false
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  const create = page.getByRole("button", { name: "Create your first habit" })
  await expect(create).toBeVisible()
  await create.focus()
  await page.keyboard.press("Enter")
  const form = page.getByRole("dialog", { name: "New habit", exact: true })
  await expect(form.getByLabel("Habit name", { exact: true })).toBeFocused()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab")
    expect(
      await form.evaluate((node) => node.contains(document.activeElement))
    ).toBe(true)
  }
  await form.getByRole("button", { name: "About habits", exact: true }).click()
  await page
    .getByRole("dialog", { name: "About habits", exact: true })
    .getByRole("button", { name: "Use Daily reflection template", exact: true })
    .click()
  await form.getByRole("button", { name: "Create habit", exact: true }).click()
  await expect(form).toHaveCount(0)
  const card = page.getByRole("article", {
    name: "Reflect on my day",
    exact: true,
  })
  await card.getByRole("button", { name: "Start timer", exact: true }).click()
  const start = page.getByRole("dialog", { name: "Start · Reflect on my day" })
  await start.getByLabel("Timer mode").selectOption("pomodoro")
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      )
      .toBe(true)
    await expect(
      start.getByRole("button", { name: "Start timer", exact: true })
    ).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`habit-start-${viewport.width}.png`),
    })
  }
  await start.getByRole("button", { name: "Start timer", exact: true }).click()
  const dock = page.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  await expect(
    dock.getByRole("button", { name: "Pop out timer", exact: true })
  ).toBeDisabled()
  await expect(dock).toContainText("Pop-out is unavailable here")
  await dock.getByRole("button", { name: "Discard", exact: true }).click()
  await dock
    .getByRole("button", { name: "Discard session", exact: true })
    .click()
  await expect(dock).toHaveCount(0)
  expect((await bundle(page.request)).items[0].logs).toHaveLength(0)
})
