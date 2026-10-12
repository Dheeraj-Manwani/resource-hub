import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { and, eq } from "drizzle-orm"
import * as schema from "../../lib/db/schema"
import {
  defaultConfig,
  progressOn,
  type HabitBundle,
} from "../../lib/habits/model"
import { timerElapsed, type HabitTimer } from "../../lib/habits/timer"
import { test, expect } from "./fixtures"
import { write } from "./helpers"

async function createHabit(
  request: import("@playwright/test").APIRequestContext,
  goalType: "minutes" | "quantity" = "minutes"
) {
  const bundle: HabitBundle = await (await request.get("/api/v1/habits")).json()
  const id = randomUUID()
  const response = await request.post("/api/v1/habits", {
    data: {
      id,
      name: goalType === "minutes" ? "Read with a timer" : "Read pages",
      reason: "Make room for reading",
      icon: "📖",
      color: "orange",
      config: {
        ...defaultConfig(bundle.today, bundle.weekStart),
        goalType,
        target: goalType === "minutes" ? 1 : 10,
        unit: goalType === "minutes" ? "minutes" : "pages",
        defaultDuration: 5,
      },
    },
  })
  expect(response.ok()).toBe(true)
  return { id, today: bundle.today }
}
async function settle(page: import("@playwright/test").Page, userId: string) {
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
test("timer survives navigation, refresh, offline pause/save and a second tab", async ({
  page,
  context,
  testAccount,
}, testInfo) => {
  const { id, today } = await createHabit(page.request)
  await page.goto("/habits")
  const card = page.getByRole("article", {
    name: "Read with a timer",
    exact: true,
  })
  await card.getByRole("button", { name: "Start timer", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Start · Read with a timer" })
  await dialog.getByLabel("Session minutes").fill("5")
  await write(page, "POST", "/habits/timer", () =>
    dialog.getByRole("button", { name: "Start timer", exact: true }).click()
  )
  const dock = page.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  await expect(dock).toBeVisible()
  await expect(card).toContainText("0 / 1 minutes")
  await expect(dock.getByRole("timer")).not.toHaveText("05:00", {
    timeout: 15000,
  })
  const second = await context.newPage()
  await second.goto("/overview")
  const otherDock = second.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  await expect(otherDock).toContainText("Read with a timer")
  await dock.getByRole("button", { name: "Pause", exact: true }).click()
  await settle(page, testAccount.id)
  await expect(
    otherDock.getByRole("button", { name: "Resume", exact: true })
  ).toBeVisible()
  await otherDock.getByRole("button", { name: "Resume", exact: true }).click()
  await settle(second, testAccount.id)
  await page.goto("/docs")
  await expect(dock).toContainText("Read with a timer")
  await page.reload()
  await expect(dock).toContainText("Recovered or synced timer")
  await dock.getByRole("button", { name: "+5 min", exact: true }).click()
  await settle(page, testAccount.id)
  const snapshot = await (await page.request.get("/api/v1/habits/timer")).json()
  expect(snapshot.session.targetMs).toBe(600000)
  await second.close()
  await context.setOffline(true)
  await dock.getByRole("button", { name: "Pause", exact: true }).click()
  await expect(dock).toContainText("Saved on this device")
  const paused = await dock.getByRole("timer").textContent()
  await expect(
    dock.getByRole("button", { name: "Resume", exact: true })
  ).toBeVisible()
  await dock.getByRole("button", { name: "Finish", exact: true }).click()
  await expect(dock.getByLabel("Actual working minutes")).toBeVisible()
  expect(await dock.getByRole("timer").textContent()).toBe(paused)
  await dock
    .getByLabel("Session note (optional)")
    .fill("Offline work stays safe")
  await dock.getByRole("button", { name: "Save session", exact: true }).click()
  await expect(dock).toContainText("Waiting to sync")
  const pending = await page.evaluate(
    (userId) =>
      JSON.parse(localStorage.getItem(`resource:habit-timer:v1:${userId}`)!),
    testAccount.id
  )
  expect(pending.commands.at(-1).action).toBe("finish")
  await context.setOffline(false)
  await expect(dock).toHaveCount(0, { timeout: 30000 })
  const bundle: HabitBundle = await (
    await page.request.get(`/api/v1/habits?date=${today}`)
  ).json()
  const habit = bundle.items.find((h) => h.id === id)!
  const logs = habit.logs.filter((log) => log.source === "timer")
  expect(logs).toHaveLength(1)
  expect(logs[0].notes).toBe("Offline work stays safe")
  expect(logs[0].elapsedMs).toBeGreaterThan(1000)
  expect(progressOn(habit, today)?.amount).toBeGreaterThan(0)
  await page.goto("/habits")
  await card.getByRole("button", { name: "Start timer", exact: true }).click()
  await expect(dialog.getByLabel("Session minutes")).toHaveValue("5")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.setViewportSize({ width: 768, height: 1024 })
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("habit-timer-tablet.png"),
    fullPage: true,
  })
})

test("server enforces one timer, idempotent finish and separate quantity progress", async ({
  page,
  testAccount,
}) => {
  const first = await createHabit(page.request),
    second = await createHabit(page.request, "quantity")
  const bodies = [
    { id: randomUUID(), habitId: first.id, mode: "stopwatch", minutes: 5 },
    { id: randomUUID(), habitId: second.id, mode: "countdown", minutes: 5 },
  ]
  const starts = await Promise.all(
    bodies.map((data) => page.request.post("/api/v1/habits/timer", { data }))
  )
  expect(starts.map((r) => r.status()).sort()).toEqual([201, 409])
  const active: HabitTimer = (
    await (await page.request.get("/api/v1/habits/timer")).json()
  ).session
  const discarded = await page.request.patch(
    `/api/v1/habits/timer/${active.id}`,
    {
      data: {
        id: randomUUID(),
        expectedRevision: active.revision,
        at: Date.now(),
        action: "discard",
      },
    }
  )
  expect(discarded.ok()).toBe(true)
  const startBody = {
    id: randomUUID(),
    habitId: second.id,
    mode: "stopwatch",
    minutes: 5,
  }
  expect(
    (await page.request.post("/api/v1/habits/timer", { data: startBody })).ok()
  ).toBe(true)
  expect(
    (await page.request.post("/api/v1/habits/timer", { data: startBody })).ok()
  ).toBe(true)
  const client = postgres(process.env.DATABASE_URL!, { max: 1 }),
    db = drizzle(client, { schema, casing: "snake_case" })
  const otherId = randomUUID(),
    otherEmail = `playwright-timer-privacy-${randomUUID()}@example.invalid`
  try {
    await db
      .update(schema.habitTimerSessions)
      .set({ runningSince: new Date(Date.now() - 120000) })
      .where(
        and(
          eq(schema.habitTimerSessions.id, startBody.id),
          eq(schema.habitTimerSessions.userId, testAccount.id)
        )
      )
    const session: HabitTimer = (
      await (await page.request.get("/api/v1/habits/timer")).json()
    ).session
    const finish = {
      id: randomUUID(),
      expectedRevision: session.revision,
      at: Date.now(),
      action: "finish",
      confirmedMs: 60000,
      notes: "One minute of real effort",
    }
    const saved = await page.request.patch(
      `/api/v1/habits/timer/${session.id}`,
      { data: finish }
    )
    expect(saved.ok()).toBe(true)
    expect((await saved.json()).saved).toBe(true)
    const repeated = await page.request.patch(
      `/api/v1/habits/timer/${session.id}`,
      { data: finish }
    )
    expect(repeated.ok()).toBe(true)
    expect((await repeated.json()).saved).toBe(false)
    const bundle: HabitBundle = await (
      await page.request.get("/api/v1/habits")
    ).json()
    const quantity = bundle.items.find((h) => h.id === second.id)!
    expect(quantity.logs.filter((log) => log.source === "timer")).toHaveLength(
      1
    )
    expect(quantity.logs[0].elapsedMs).toBe(60000)
    expect(quantity.logs[0].kind).toBe("session")
    expect(progressOn(quantity, bundle.today)?.amount).toBe(0)
    expect(
      (
        await page.request.patch(`/api/v1/habits/timer/${randomUUID()}`, {
          data: finish,
        })
      ).status()
    ).toBe(404)
    const older = { ...finish, id: randomUUID() }
    expect(
      (
        await page.request.patch(`/api/v1/habits/timer/${session.id}`, {
          data: older,
        })
      ).status()
    ).toBe(409)
    expect(timerElapsed(session, Date.now())).toBeGreaterThan(60000)
    await db.insert(schema.user).values({
      id: otherId,
      email: otherEmail,
      name: "Timer privacy fixture",
    })
    await db
      .update(schema.habits)
      .set({ userId: otherId })
      .where(
        and(
          eq(schema.habits.id, second.id),
          eq(schema.habits.userId, testAccount.id)
        )
      )
    await db
      .update(schema.habitTimerSessions)
      .set({
        userId: otherId,
        status: "running",
        runningSince: new Date(),
      })
      .where(
        and(
          eq(schema.habitTimerSessions.id, session.id),
          eq(schema.habitTimerSessions.userId, testAccount.id)
        )
      )
    expect(
      (await (await page.request.get("/api/v1/habits/timer")).json()).session
    ).toBeNull()
    expect(
      (
        await page.request.patch(`/api/v1/habits/timer/${session.id}`, {
          data: older,
        })
      ).status()
    ).toBe(404)
    expect(
      (
        await page.request.post("/api/v1/habits/timer", {
          data: { ...startBody, id: randomUUID() },
        })
      ).status()
    ).toBe(404)
  } finally {
    await db
      .delete(schema.user)
      .where(
        and(eq(schema.user.id, otherId), eq(schema.user.email, otherEmail))
      )
    await client.end()
  }
})

test("a lost finish response and refresh retry without duplicating recorded work", async ({
  page,
  testAccount,
}) => {
  const { id } = await createHabit(page.request)
  const response = await page.request.post("/api/v1/habits/timer", {
    data: { id: randomUUID(), habitId: id, mode: "stopwatch", minutes: 5 },
  })
  const { session }: { session: HabitTimer } = await response.json()
  const client = postgres(process.env.DATABASE_URL!, { max: 1 }),
    db = drizzle(client, { schema, casing: "snake_case" })
  try {
    await db
      .update(schema.habitTimerSessions)
      .set({
        runningSince: new Date(Date.now() - 120000),
      })
      .where(
        and(
          eq(schema.habitTimerSessions.id, session.id),
          eq(schema.habitTimerSessions.userId, testAccount.id)
        )
      )
  } finally {
    await client.end()
  }
  await page.goto("/habits")
  const dock = page.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  await expect(dock).toBeVisible()
  await dock.getByRole("button", { name: "Finish", exact: true }).click()
  await settle(page, testAccount.id)
  await dock.getByLabel("Actual working minutes").fill("1")
  await dock
    .getByLabel("Session note (optional)")
    .fill("Keep my work after a lost response")
  let committed = false
  await page.route(`**/api/v1/habits/timer/${session.id}`, async (route) => {
    if (
      route.request().method() !== "PATCH" ||
      route.request().postDataJSON()?.action !== "finish"
    ) {
      await route.continue()
      return
    }
    if (!committed) {
      const saved = await route.fetch()
      expect(saved.ok()).toBe(true)
      committed = true
    }
    await route.abort("failed")
  })
  await dock.getByRole("button", { name: "Save session", exact: true }).click()
  await expect.poll(() => committed).toBe(true)
  await expect(dock).toContainText("Waiting to sync")
  await page.reload()
  await expect(dock).toContainText("Waiting to sync")
  const draft = await page.evaluate(
    (userId) =>
      JSON.parse(localStorage.getItem(`resource:habit-timer:v1:${userId}`)!),
    testAccount.id
  )
  expect(draft.commands.at(-1).notes).toBe("Keep my work after a lost response")
  await page.unroute(`**/api/v1/habits/timer/${session.id}`)
  await expect(dock).toHaveCount(0, { timeout: 30000 })
  const bundle: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  const logs = bundle.items.find((habit) => habit.id === id)!.logs
  expect(logs).toHaveLength(1)
  expect(logs[0].elapsedMs).toBe(60000)
  expect(logs[0].notes).toBe("Keep my work after a lost response")
})

test("fullscreen timer keeps its controls and reviewed work in the tab", async ({
  page,
  testAccount,
}, testInfo) => {
  const { id } = await createHabit(page.request)
  expect(
    (
      await page.request.post("/api/v1/habits/timer", {
        data: { id: randomUUID(), habitId: id, mode: "countdown", minutes: 5 },
      })
    ).ok()
  ).toBe(true)
  await page.goto("/habits")
  const dock = page.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  await dock
    .getByRole("button", { name: "Fullscreen timer", exact: true })
    .click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.fullscreenElement?.getAttribute("aria-label")
      )
    )
    .toBe("Habit timer")
  await expect
    .poll(() =>
      dock.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return (
          Math.abs(bounds.width - innerWidth) < 1 &&
          Math.abs(bounds.height - innerHeight) < 1
        )
      })
    )
    .toBe(true)
  await expect(
    dock.getByRole("button", { name: "Exit fullscreen timer", exact: true })
  ).toBeVisible()
  await expect(
    dock.getByRole("button", { name: "Pop out timer", exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("habit-timer-fullscreen.png"),
    animations: "disabled",
  })
  await dock.getByRole("button", { name: "Pause", exact: true }).click()
  await settle(page, testAccount.id)
  const paused = await dock.getByRole("timer").textContent()
  await page.keyboard.press("Escape")
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false)
  await expect(dock.getByRole("timer")).toHaveText(paused!)
  await dock
    .getByRole("button", { name: "Fullscreen timer", exact: true })
    .click()
  await dock.getByRole("button", { name: "Finish", exact: true }).click()
  await settle(page, testAccount.id)
  await dock
    .getByLabel("Session note (optional)")
    .fill("Review survives fullscreen changes")
  const amount = await dock.getByLabel("Actual working minutes").inputValue()
  await dock
    .getByRole("button", { name: "Exit fullscreen timer", exact: true })
    .click()
  await expect(dock.getByLabel("Session note (optional)")).toHaveValue(
    "Review survives fullscreen changes"
  )
  await expect(dock.getByLabel("Actual working minutes")).toHaveValue(amount)
  await dock
    .getByRole("button", { name: "Fullscreen timer", exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true)
  await dock
    .getByRole("button", { name: "Discard session", exact: true })
    .click()
  await settle(page, testAccount.id)
  await expect(dock).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false)
  const bundle: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  expect(bundle.items.find((habit) => habit.id === id)!.logs).toHaveLength(0)
})

test("compact PiP countdown uses icon controls and preserves reviewed work", async ({
  page,
  testAccount,
}, testInfo) => {
  // Exercise the PiP portal in a browser popup at its default dimensions, even
  // on platforms where native always-on-top windows are unavailable in CI.
  await page.addInitScript(() => {
    Object.defineProperty(window, "documentPictureInPicture", {
      configurable: true,
      value: {
        requestWindow: async ({
          width,
          height,
        }: {
          width: number
          height: number
        }) => {
          const popup = window.open(
            "about:blank",
            "habit-pip",
            `width=${width},height=${height}`
          )
          if (!popup) throw new Error("Test popup could not open")
          return popup
        },
      },
    })
  })
  const { id } = await createHabit(page.request)
  const sessionId = randomUUID()
  expect(
    (
      await page.request.post("/api/v1/habits/timer", {
        data: { id: sessionId, habitId: id, mode: "countdown", minutes: 5 },
      })
    ).ok()
  ).toBe(true)
  const connection = postgres(process.env.DATABASE_URL!, { max: 1 })
  const database = drizzle(connection, { schema, casing: "snake_case" })
  try {
    await database
      .update(schema.habitTimerSessions)
      .set({ runningSince: new Date(Date.now() - 120000) })
      .where(
        and(
          eq(schema.habitTimerSessions.id, sessionId),
          eq(schema.habitTimerSessions.userId, testAccount.id)
        )
      )
  } finally {
    await connection.end()
  }
  await page.goto("/habits")
  const dock = page.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  const popupReady = page.waitForEvent("popup")
  await dock
    .getByRole("button", { name: "Fullscreen timer", exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true)
  await dock.getByRole("button", { name: "Pop out timer", exact: true }).click()
  const popup = await popupReady
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false)
  await popup.setViewportSize({ width: 280, height: 180 })
  await expect(popup.getByRole("timer")).toBeVisible()
  await expect
    .poll(() =>
      popup.evaluate(() => {
        const panel = document.querySelector('[aria-label="Habit timer"]')!
        const timer = panel.querySelector('[role="timer"]')!
        return {
          fits:
            panel.getBoundingClientRect().bottom <= innerHeight &&
            document.documentElement.scrollWidth <= innerWidth,
          smallDigits: parseFloat(getComputedStyle(timer).fontSize) <= 24,
          iconControls: [...panel.querySelectorAll("button")].every(
            (button) =>
              !!button.getAttribute("aria-label") &&
              !!button.title &&
              !button.textContent?.trim()
          ),
        }
      })
    )
    .toEqual({ fits: true, smallDigits: true, iconControls: true })
  await popup.screenshot({
    path: testInfo.outputPath("habit-pip-compact.png"),
    animations: "disabled",
  })
  await popup.getByRole("button", { name: "Pause", exact: true }).click()
  await settle(page, testAccount.id)
  await expect(
    popup.getByRole("button", { name: "Resume", exact: true })
  ).toBeVisible()
  await popup.getByRole("button", { name: "Resume", exact: true }).click()
  await settle(page, testAccount.id)
  await popup.getByRole("button", { name: "+5 min", exact: true }).click()
  await settle(page, testAccount.id)
  expect(
    (await (await page.request.get("/api/v1/habits/timer")).json()).session
      .targetMs
  ).toBe(600000)
  await popup.getByRole("button", { name: "Discard", exact: true }).click()
  await expect(
    popup.getByText("Discard without saving?", { exact: true })
  ).toBeVisible()
  await popup.getByRole("button", { name: "Keep session", exact: true }).click()
  await popup.getByRole("button", { name: "Finish", exact: true }).click()
  await settle(page, testAccount.id)
  await popup.getByLabel("Actual working minutes").fill("1")
  const note = popup.getByRole("textbox", {
    name: "Session note (optional)",
    exact: true,
  })
  await expect(note).toHaveCount(0)
  const noteToggle = popup.getByRole("button", {
    name: "Session note (optional)",
    exact: true,
  })
  await noteToggle.click()
  await note.fill("Focused chapter")
  await noteToggle.click()
  await noteToggle.click()
  await expect(note).toHaveValue("Focused chapter")
  await noteToggle.click()
  await popup
    .getByRole("button", { name: "Discard session", exact: true })
    .click()
  await popup.getByRole("button", { name: "Keep session", exact: true }).click()
  await expect(popup.getByLabel("Actual working minutes")).toHaveValue("1")
  await popup.screenshot({
    path: testInfo.outputPath("habit-pip-review.png"),
    animations: "disabled",
  })
  await popup.getByRole("button", { name: "Save session", exact: true }).click()
  await settle(page, testAccount.id)
  await expect.poll(() => popup.isClosed()).toBe(true)
  const result: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  expect(result.items.find((habit) => habit.id === id)!.logs).toEqual([
    expect.objectContaining({
      amount: 1,
      elapsedMs: 60000,
      notes: "Focused chapter",
      source: "timer",
    }),
  ])
})

test("pop-out controls share the timer and closing PiP returns it to the app", async ({
  page,
  testAccount,
}, testInfo) => {
  const { id } = await createHabit(page.request)
  await page.goto("/habits")
  await page
    .getByRole("article", { name: "Read with a timer", exact: true })
    .getByRole("button", { name: "Start timer", exact: true })
    .click()
  const startDialog = page.getByRole("dialog", {
    name: "Start · Read with a timer",
  })
  await startDialog.getByLabel("Timer mode").selectOption("pomodoro")
  await startDialog.getByLabel("Work minutes per round").fill("1")
  await startDialog.getByLabel("Break minutes", { exact: true }).fill("1")
  await startDialog.getByLabel("Work rounds").fill("2")
  await startDialog
    .getByRole("button", { name: "Start timer", exact: true })
    .click()
  const dock = page.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  await expect(dock).toBeVisible()
  const current = (
    await (await page.request.get("/api/v1/habits/timer")).json()
  ).session as HabitTimer
  const connection = postgres(process.env.DATABASE_URL!, { max: 1 })
  const database = drizzle(connection, { schema, casing: "snake_case" })
  try {
    await database
      .update(schema.habitTimerSessions)
      .set({ runningSince: new Date(Date.now() - 65000) })
      .where(
        and(
          eq(schema.habitTimerSessions.id, current.id),
          eq(schema.habitTimerSessions.userId, testAccount.id)
        )
      )
  } finally {
    await connection.end()
  }
  await page.reload()
  await expect(dock.getByRole("timer")).toHaveText("00:00")
  const supported = await page.evaluate(
    () =>
      !!(window as Window & { documentPictureInPicture?: unknown })
        .documentPictureInPicture
  )
  testInfo.annotations.push({
    type: "PiP",
    description: supported
      ? "Document PiP API available"
      : "Document PiP API unavailable; tested in-app fallback",
  })
  if (supported) {
    await dock
      .getByRole("button", { name: "Pop out timer", exact: true })
      .click()
    await expect(
      page.getByRole("complementary", { name: "Timer in pop-out" })
    ).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !!(
              window as Window & {
                documentPictureInPicture?: { window: Window }
              }
            ).documentPictureInPicture?.window?.document.querySelector(
              '[aria-label="Habit timer"]'
            )
        )
      )
      .toBe(true)
    await page.evaluate(() => {
      const pip = (
        window as Window & { documentPictureInPicture?: { window: Window } }
      ).documentPictureInPicture!.window
      ;[...pip.document.querySelectorAll("button")]
        .find((button) => button.getAttribute("aria-label") === "Start break")!
        .click()
    })
    await settle(page, testAccount.id)
    expect(
      (await (await page.request.get("/api/v1/habits/timer")).json()).session
        .pomodoro.phase
    ).toBe("break")
    await page.evaluate(() => {
      const pip = (
        window as Window & { documentPictureInPicture?: { window: Window } }
      ).documentPictureInPicture!.window
      const pause = [...pip.document.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-label") === "Pause"
      )!
      pause.click()
    })
    await settle(page, testAccount.id)
    const paused = await (await page.request.get("/api/v1/habits/timer")).json()
    expect(paused.session.status).toBe("paused")
    await page
      .getByRole("button", { name: "Bring timer back", exact: true })
      .click()
    await expect(
      dock.getByRole("button", { name: "Resume", exact: true })
    ).toBeVisible()
    await expect(dock.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "Break remaining"
    )
  } else {
    await expect(
      dock.getByRole("button", { name: "Pop out timer", exact: true })
    ).toBeDisabled()
    await expect(dock).toContainText("Pop-out is unavailable here")
  }
  await page.screenshot({
    path: testInfo.outputPath("habit-timer-desktop.png"),
    fullPage: true,
  })
  await page.setViewportSize({ width: 768, height: 1024 })
  await expect(dock).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("habit-timer-active-tablet.png"),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const bounds = await dock.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true)
  await dock.getByRole("button", { name: "Discard", exact: true }).click()
  await dock
    .getByRole("button", { name: "Discard session", exact: true })
    .click()
  await expect(dock).toHaveCount(0)
  const bundle: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  expect(bundle.items.find((h) => h.id === id)?.logs).toHaveLength(0)
})

test("a competing device keeps unsent work visible until explicit reconciliation", async ({
  page,
  testAccount,
}) => {
  const { id } = await createHabit(page.request)
  await page.request.post("/api/v1/habits/timer", {
    data: { id: randomUUID(), habitId: id, mode: "countdown", minutes: 5 },
  })
  await page.goto("/habits")
  const dock = page.getByRole("complementary", {
    name: "Habit timer",
    exact: true,
  })
  await expect(dock.getByRole("timer")).not.toHaveText("05:00")
  await dock.getByRole("button", { name: "Finish", exact: true }).click()
  await settle(page, testAccount.id)
  const current: HabitTimer = (
    await (await page.request.get("/api/v1/habits/timer")).json()
  ).session
  await page.route(`**/api/v1/habits/timer/${current.id}`, async (route) => {
    if (
      route.request().method() === "PATCH" &&
      route.request().postDataJSON()?.action === "finish"
    )
      await route.abort("failed")
    else await route.continue()
  })
  await dock
    .getByLabel("Session note (optional)")
    .fill("Preserve this unsent note")
  await dock.getByRole("button", { name: "Save session", exact: true }).click()
  await expect(dock).toContainText("Waiting to sync")
  const resumed = await page.request.patch(
    `/api/v1/habits/timer/${current.id}`,
    {
      data: {
        id: randomUUID(),
        expectedRevision: current.revision,
        at: Date.now(),
        action: "resume",
      },
    }
  )
  expect(resumed.ok()).toBe(true)
  const updated: HabitTimer = (await resumed.json()).session
  expect(
    (
      await page.request.patch(`/api/v1/habits/timer/${current.id}`, {
        data: {
          id: randomUUID(),
          expectedRevision: updated.revision,
          at: Date.now(),
          action: "pause",
        },
      })
    ).ok()
  ).toBe(true)
  await page.unroute(`**/api/v1/habits/timer/${current.id}`)
  await expect(dock).toContainText("Preserve this unsent note", {
    timeout: 30000,
  })
  await expect(dock).toContainText("clears these unsent changes")
  const downloadEvent = page.waitForEvent("download")
  await dock
    .getByRole("button", { name: "Save unsent copy", exact: true })
    .click()
  const download = await downloadEvent
  const copy = JSON.parse(await readFile((await download.path())!, "utf8"))
  expect(copy.commands.at(-1).notes).toBe("Preserve this unsent note")
  expect(copy.conflict).toContain("another tab or device")
  await dock
    .getByRole("button", { name: "Use latest timer", exact: true })
    .click()
  await settle(page, testAccount.id)
  await expect(
    dock.getByRole("button", { name: "Resume", exact: true })
  ).toBeVisible()
  const bundle: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  expect(bundle.items.find((habit) => habit.id === id)!.logs).toHaveLength(0)
  await dock.getByRole("button", { name: "Discard", exact: true }).click()
  await dock
    .getByRole("button", { name: "Discard session", exact: true })
    .click()
  await expect(dock).toHaveCount(0)
})
