import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../../lib/db/schema"
import {
  addDays,
  defaultConfig,
  flexibleProgress,
  monthBounds,
  progressOn,
  weekDates,
  type HabitBundle,
} from "../../lib/habits/model"
import { test, expect } from "./fixtures"
import { write } from "./helpers"

test("independent habit journey: create, log, correct, undo, edit, pause and archive", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  await page.goto("/habits")
  await expect(
    page.getByRole("heading", { name: "Habits", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Create your first habit" }).click()
  const form = page.getByRole("dialog", { name: "New habit" })
  await form.getByLabel("Habit name").fill("Read for myself")
  await expect(form.getByLabel("Starter template (optional)")).toHaveCount(0)
  await form.getByRole("button", { name: "About habits", exact: true }).click()
  const help = page.getByRole("dialog", { name: "About habits", exact: true })
  await expect(help).toContainText("Record your progress")
  await expect(
    help.getByRole("button", { name: /^Use .* template$/ })
  ).toHaveCount(6)
  await page.keyboard.press("Escape")
  await expect(help).toHaveCount(0)
  await expect(form.getByLabel("Habit name")).toHaveValue("Read for myself")
  await form.getByLabel("Icon", { exact: true }).click()
  await expect(
    page.getByRole("option", { name: "Growth", exact: true })
  ).toBeFocused()
  await page.keyboard.press("r")
  await expect(
    page.getByRole("option", { name: "Reading", exact: true })
  ).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(form.getByLabel("Icon", { exact: true })).toContainText(
    "Reading"
  )
  await form.getByLabel("Colour", { exact: true }).click()
  await page.getByRole("option", { name: "Blue", exact: true }).click()
  await expect(form.getByLabel("Colour", { exact: true })).toContainText("Blue")
  await form.screenshot({
    path: testInfo.outputPath("habit-form-desktop.png"),
    animations: "disabled",
  })
  await form
    .getByLabel("Your reason (optional)")
    .fill("Make space for curiosity")
  await form.getByLabel("Preferred times (optional)").fill("19:00")
  await form.getByLabel("Reminder times (optional)").fill("18:55")
  const response = await write(page, "POST", "/habits", () =>
    form.getByRole("button", { name: "Create habit", exact: true }).click()
  )
  const { habit } = await response.json()
  const today = await page
    .getByLabel("Habit date", { exact: true })
    .inputValue()
  const card = page.getByRole("article", { name: habit.name, exact: true })
  await expect(card).toContainText("0 / 30 minutes")
  await card.getByRole("button", { name: "Log progress" }).click()
  let dialog = page.getByRole("dialog", { name: /Log progress/ })
  await dialog.getByLabel("Amount (minutes)").fill("18")
  await dialog.getByLabel("Note (optional)").fill("First chapter")
  await write(page, "POST", `/habits/${habit.id}/logs`, () =>
    dialog.getByRole("button", { name: "Save progress" }).click()
  )
  await expect(card).toContainText("18 / 30 minutes")
  await card.getByRole("button", { name: "Log progress" }).click()
  dialog = page.getByRole("dialog", { name: /Log progress/ })
  await dialog.getByLabel("Amount (minutes)").fill("12")
  await dialog.getByLabel("Note (optional)").fill("Finished chapter")
  await write(page, "POST", `/habits/${habit.id}/logs`, () =>
    dialog.getByRole("button", { name: "Save progress" }).click()
  )
  await expect(
    page.getByRole("region", { name: "Completed goals" })
  ).toContainText(habit.name)
  await expect(card.getByRole("img")).toHaveAccessibleName(
    "30 of 30, 100% complete"
  )
  await card.getByRole("button", { name: habit.name, exact: true }).click()
  const details = page.getByRole("dialog", { name: new RegExp(habit.name) })
  const first = details
    .locator("div.rounded-lg.border")
    .filter({ hasText: "First chapter" })
  await first.getByRole("button", { name: "Edit entry" }).click()
  const edit = page.getByRole("dialog", { name: /Edit entry/ })
  await edit.getByLabel("Amount (minutes)").fill("10")
  const correction = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      r.url().includes(`/habits/${habit.id}/logs/`)
  )
  await edit.getByRole("button", { name: "Save correction" }).click()
  expect((await correction).ok()).toBe(true)
  await expect(card).toContainText("22 / 30 minutes")
  await card.getByRole("button", { name: habit.name, exact: true }).click()
  const updatedFirst = details
    .locator("div.rounded-lg.border")
    .filter({ hasText: "First chapter" })
  const deletion = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      r.url().includes(`/habits/${habit.id}/logs/`)
  )
  await updatedFirst.getByRole("button", { name: "Delete entry" }).click()
  expect((await deletion).ok()).toBe(true)
  await expect(updatedFirst).toHaveCount(0)
  const restored = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      r.url().includes(`/habits/${habit.id}/logs/`)
  )
  await page
    .getByRole("status")
    .filter({ hasText: "Entry removed" })
    .getByRole("button", { name: "Undo", exact: true })
    .click()
  expect((await restored).ok()).toBe(true)
  await expect(updatedFirst).toBeVisible()
  await details.getByRole("button", { name: "Edit habit", exact: true }).click()
  const editForm = page.getByRole("dialog", { name: "Edit habit", exact: true })
  await editForm.getByLabel("Target minutes").fill("60")
  await write(page, "PATCH", `/habits/${habit.id}`, () =>
    editForm.getByRole("button", { name: "Save habit" }).click()
  )
  await expect(card).toContainText("22 / 30 minutes")
  await card.getByRole("button", { name: habit.name, exact: true }).click()
  await expect(details).toContainText(
    `Updated goal and schedule begin ${addDays(today, 1)}`
  )
  await write(page, "PATCH", `/habits/${habit.id}/status`, () =>
    details.getByRole("button", { name: "Pause", exact: true }).click()
  )
  await expect(card).toHaveCount(0)
  await page.getByRole("tab", { name: "All habits" }).click()
  await page.getByRole("button", { name: /Read for myself.*paused/ }).click()
  await write(page, "PATCH", `/habits/${habit.id}/status`, () =>
    details.getByRole("button", { name: "Restart", exact: true }).click()
  )
  await page.getByRole("button", { name: /Read for myself.*active/ }).click()
  await write(page, "PATCH", `/habits/${habit.id}/status`, () =>
    details.getByRole("button", { name: "Archive", exact: true }).click()
  )
  await page.getByRole("button", { name: /Read for myself.*archived/ }).click()
  await expect(details).toContainText("First chapter")
  await write(page, "PATCH", `/habits/${habit.id}/status`, () =>
    details.getByRole("button", { name: "Restart", exact: true }).click()
  )
  await page.getByRole("tab", { name: "Week", exact: true }).click()
  await expect(
    page.getByRole("article", { name: `${habit.name} week` })
  ).toBeVisible()
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`habits-${viewport.width}.png`),
      fullPage: true,
    })
  }
  await page.reload()
  await page.getByRole("tab", { name: "Today", exact: true }).click()
  await expect(card).toContainText("22 / 30 minutes")
})

test("weekly, monthly and flexible goals use real logs; concurrent retries celebrate once", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const request = page.request
  const { today, weekStart }: HabitBundle = await (
    await request.get("/api/v1/habits")
  ).json()
  const config = defaultConfig(monthBounds(today).start, weekStart)
  const create = async (name: string, patch: Partial<typeof config>) => {
    const id = randomUUID()
    const result = await request.post("/api/v1/habits", {
      data: {
        id,
        name,
        reason: "",
        icon: "🌱",
        color: "green",
        config: { ...config, ...patch },
      },
    })
    expect(result.ok()).toBe(true)
    return id
  }
  const add = async (id: string, date: string, amount: number) => {
    const response = await request.post(`/api/v1/habits/${id}/logs`, {
      data: { id: randomUUID(), date, kind: "progress", amount, notes: "" },
    })
    expect(response.ok()).toBe(true)
    return response.json()
  }
  const weekly = await create("Weekly pages", {
    goalType: "quantity",
    unit: "pages",
    target: 10,
    goalPeriod: "week",
    schedule: "weekdays",
    weekdays: [1, 3, 5],
    startDate: weekDates(today, weekStart)[0],
  })
  await add(weekly, weekDates(today, weekStart)[0], 4)
  expect((await add(weekly, today, 6)).completed).toBe(true)
  const monthly = await create("Monthly minutes", {
    goalPeriod: "month",
    schedule: "monthly",
    monthDays: [1, 31],
    missingDate: "last_day",
  })
  await add(monthly, monthBounds(today).start, 18)
  expect((await add(monthly, today, 12)).completed).toBe(true)
  const flexible = await create("Flexible movement", {
    goalType: "done",
    target: 1,
    unit: "times",
    schedule: "flexible",
    weeklyDays: 2,
    startDate: weekDates(today, weekStart)[0],
  })
  const entry = {
    id: randomUUID(),
    date: today,
    kind: "progress",
    amount: 1,
    notes: "",
  }
  const concurrent = await Promise.all([
    request.post(`/api/v1/habits/${flexible}/logs`, { data: entry }),
    request.post(`/api/v1/habits/${flexible}/logs`, { data: entry }),
  ])
  for (const response of concurrent) expect(response.ok()).toBe(true)
  const results = await Promise.all(
    concurrent.map((response) => response.json())
  )
  expect(results.filter((result) => result.created)).toHaveLength(1)
  expect(results.filter((result) => result.completed)).toHaveLength(1)
  expect(
    (
      await request.post(`/api/v1/habits/${flexible}/logs`, {
        data: { ...entry, id: randomUUID() },
      })
    ).status()
  ).toBe(400)
  let bundle: HabitBundle = await (await request.get("/api/v1/habits")).json()
  expect(
    progressOn(
      bundle.items.find((h) => h.id === weekly)!,
      today
    )?.amount
  ).toBe(10)
  expect(
    progressOn(
      bundle.items.find((h) => h.id === monthly)!,
      today
    )?.amount
  ).toBe(30)
  expect(
    flexibleProgress(
      bundle.items.find((h) => h.id === flexible)!,
      today
    )?.days
  ).toBe(1)
  expect(
    (
      await request.patch(`/api/v1/habits/${flexible}/logs/${entry.id}`, {
        data: { deleted: true, expectedRevision: 1 },
      })
    ).ok()
  ).toBe(true)
  expect((await add(flexible, today, 1)).completed).toBe(false)
  bundle = await (await request.get("/api/v1/habits")).json()
  expect(
    flexibleProgress(
      bundle.items.find((h) => h.id === flexible)!,
      today
    )?.days
  ).toBe(1)
})

test("monthly scheduling form and backdated progress work on a tablet", async ({
  page,
  testAccount,
}, testInfo) => {
  void testAccount
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/habits")
  await page.getByRole("button", { name: "Create your first habit" }).click()
  const form = page.getByRole("dialog", { name: "New habit" })
  const initial: HabitBundle = await (
    await page.request.get("/api/v1/habits")
  ).json()
  const past = addDays(monthBounds(initial.today).start, -1)
  await form.getByLabel("Habit name").fill("Reading journey")
  await form.getByLabel("Start date", { exact: true }).fill(addDays(past, -30))
  await form.getByLabel("Repeat", { exact: true }).click()
  await page
    .getByRole("option", { name: "Dates each month", exact: true })
    .click()
  await form.getByRole("button", { name: "1", exact: true }).click()
  await form.getByRole("button", { name: "31", exact: true }).click()
  await form.getByLabel("When a month has no chosen date").click()
  await page
    .getByRole("option", { name: "Use the month’s last day", exact: true })
    .click()
  await expect(form).toContainText("Upcoming dates")
  await expect
    .poll(() =>
      form.evaluate((element) => element.scrollWidth <= element.clientWidth)
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("habit-monthly-form-tablet.png"),
  })
  await form.getByLabel("Repeat", { exact: true }).click()
  await page.getByRole("option", { name: "Every day", exact: true }).click()
  const created = await write(page, "POST", "/habits", () =>
    form.getByRole("button", { name: "Create habit", exact: true }).click()
  )
  const { habit } = await created.json()
  expect(
    (
      await page.request.post(`/api/v1/habits/${habit.id}/logs`, {
        data: {
          id: randomUUID(),
          date: past,
          kind: "progress",
          amount: 18,
          notes: "Earlier effort",
        },
      })
    ).ok()
  ).toBe(true)
  const card = page.getByRole("article", { name: habit.name, exact: true })
  await card.getByRole("button", { name: "Log progress" }).click()
  const dialog = page.getByRole("dialog", { name: /Log progress/ })
  await dialog.getByLabel("Entry date").fill(past)
  await expect(dialog).toContainText("18 recorded in this period")
  await dialog.getByLabel("Amount (minutes)").fill("12")
  await write(page, "POST", `/habits/${habit.id}/logs`, () =>
    dialog.getByRole("button", { name: "Save progress" }).click()
  )
  await expect(card).toContainText("0 / 30 minutes")
  await page.getByLabel("Habit date", { exact: true }).fill(past)
  await expect(card).toContainText("30 / 30 minutes")
  await expect(
    page.getByRole("region", { name: "Completed goals" })
  ).toContainText(habit.name)
  await page.screenshot({
    path: testInfo.outputPath("habit-completed-tablet.png"),
    fullPage: true,
  })
})

test("habit API protects history, prevents duplicate recording and enforces account privacy", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const request = page.request
  const initial = await request.get("/api/v1/habits")
  expect(initial.ok()).toBe(true)
  const bundle: HabitBundle = await initial.json()
  const input = {
    id: randomUUID(),
    name: "API habit",
    reason: "",
    icon: "🌱",
    color: "green",
    config: defaultConfig(bundle.today, bundle.weekStart),
  }
  expect(
    (
      await request.post("/api/v1/habits", {
        data: { ...input, projectId: randomUUID() },
      })
    ).status()
  ).toBe(400)
  expect((await request.post("/api/v1/habits", { data: input })).status()).toBe(
    201
  )
  expect((await request.post("/api/v1/habits", { data: input })).status()).toBe(
    201
  )
  let body: HabitBundle = await (await request.get("/api/v1/habits")).json()
  expect(body.items.filter((h) => h.id === input.id)).toHaveLength(1)
  expect(body.items[0].logs).toHaveLength(0)
  const entry = {
    id: randomUUID(),
    date: bundle.today,
    kind: "progress",
    amount: 18,
    notes: "Saved once",
  }
  const first = await request.post(`/api/v1/habits/${input.id}/logs`, {
    data: entry,
  })
  expect(first.ok()).toBe(true)
  const repeated = await request.post(`/api/v1/habits/${input.id}/logs`, {
    data: entry,
  })
  expect((await repeated.json()).created).toBe(false)
  const future = await request.post(`/api/v1/habits/${input.id}/logs`, {
    data: { ...entry, id: randomUUID(), date: addDays(bundle.today, 1) },
  })
  expect(future.status()).toBe(400)
  const { id, ...fields } = input
  const update = await request.patch(`/api/v1/habits/${id}`, {
    data: {
      ...fields,
      config: { ...fields.config, target: 60 },
      expectedRevision: 1,
    },
  })
  expect(update.ok()).toBe(true)
  expect((await update.json()).effectiveFrom).toBe(addDays(bundle.today, 1))
  expect(
    (
      await request.patch(`/api/v1/habits/${id}`, {
        data: { ...fields, expectedRevision: 1 },
      })
    ).status()
  ).toBe(409)
  body = await (await request.get("/api/v1/habits")).json()
  expect(body.items[0].logs).toHaveLength(1)
  expect(body.items[0].logs[0].amount).toBe(18)
  expect(body.items[0].versions).toHaveLength(2)
  // Editing metadata alone must not append a schedule version (jsonb reorders keys).
  const metadata = await request.patch(`/api/v1/habits/${id}`, {
    data: {
      ...fields,
      name: "Renamed",
      config: { ...fields.config, target: 60 },
      expectedRevision: 2,
    },
  })
  expect(metadata.ok()).toBe(true)
  body = await (await request.get("/api/v1/habits")).json()
  expect(body.items[0].versions).toHaveLength(2)
  const client = postgres(process.env.DATABASE_URL!, { max: 1 })
  const db = drizzle(client, { schema, casing: "snake_case" })
  const otherId = randomUUID(),
    email = `playwright-privacy-${randomUUID()}@example.invalid`
  try {
    await db
      .insert(schema.user)
      .values({ id: otherId, email, name: "Privacy fixture" })
    await db
      .update(schema.habits)
      .set({ userId: otherId })
      .where(
        and(eq(schema.habits.id, id), eq(schema.habits.userId, testAccount.id))
      )
    const otherView: HabitBundle = await (
      await request.get("/api/v1/habits")
    ).json()
    expect(otherView.items).toHaveLength(0)
    expect(
      (
        await request.patch(`/api/v1/habits/${id}`, {
          data: { ...fields, expectedRevision: 3 },
        })
      ).status()
    ).toBe(404)
    expect(
      (
        await request.patch(`/api/v1/habits/${id}/status`, {
          data: { status: "archived", expectedRevision: 3 },
        })
      ).status()
    ).toBe(404)
    expect(
      (
        await request.post(`/api/v1/habits/${id}/logs`, {
          data: { ...entry, id: randomUUID() },
        })
      ).status()
    ).toBe(404)
    expect(
      (
        await request.patch(`/api/v1/habits/${id}/logs/${entry.id}`, {
          data: { deleted: true, expectedRevision: 1 },
        })
      ).status()
    ).toBe(404)
  } finally {
    await db
      .delete(schema.user)
      .where(and(eq(schema.user.id, otherId), eq(schema.user.email, email)))
    await client.end()
  }
})
