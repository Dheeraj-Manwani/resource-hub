import { test, expect } from "./fixtures"
import { write } from "./helpers"
import {
  createDefaultOverviewConfiguration,
  OVERVIEW_SECTION_REGISTRY,
  type OverviewConfiguration,
} from "../../lib/overview/sections"

test("overview previews, cancels, reorders, restores and saves account preferences", async ({
  page,
  context,
  browser,
  testAccount,
}) => {
  void testAccount
  await page.request.post("/api/v1/resources", {
    data: { text: "Review me", title: "Review me" },
  })
  await page.goto("/overview")
  const customize = page.getByRole("button", {
    name: "Customize overview",
    exact: true,
  })
  await customize.click()
  const editor = page.getByRole("region", {
    name: "Customize overview",
    exact: true,
  })
  const list = editor.getByRole("list", { name: "Overview section order" })
  await editor
    .getByRole("button", { name: "Hide Habits today", exact: true })
    .click()
  await expect(page.getByRole("heading", { name: /Habits today/ })).toHaveCount(
    0
  )
  expect(
    (await (await page.request.get("/api/v1/settings")).json())
      .overviewConfiguration
  ).toBeNull()
  await editor.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: /Habits today/ })
  ).toBeVisible()

  await customize.click()
  await editor
    .getByRole("button", { name: "Hide Habits today", exact: true })
    .click()
  await editor.getByRole("button", { name: "Add section", exact: true }).click()
  const picker = page.getByRole("dialog", { name: "Add section" })
  await expect(
    picker.getByRole("region", { name: "Habits", exact: true })
  ).toBeVisible()
  await picker
    .getByRole("button", { name: "Habits today", exact: true })
    .click()
  await expect(picker).toHaveCount(0)
  await expect(list.locator("li").last()).toHaveAttribute(
    "data-section-id",
    "habits-today"
  )

  // Keyboard drag moves docs above Needs attention; buttons then move them across regions.
  const handle = editor.getByRole("button", {
    name: "Reorder Continue editing",
    exact: true,
  })
  await handle.scrollIntoViewIfNeeded()
  await handle.focus()
  await expect(handle).toBeFocused()
  await page.keyboard.press("Space")
  await expect(handle).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("ArrowUp")
  await expect(list.locator('[data-section-id="recent-docs"]')).toHaveAttribute(
    "style",
    /translate3d/
  )
  await page.keyboard.press("Space")
  await expect(list.locator("li").nth(3)).toHaveAttribute(
    "data-section-id",
    "recent-docs"
  )
  for (let index = 0; index < 3; index++)
    await editor
      .getByRole("button", { name: "Move Continue editing up", exact: true })
      .click()
  await expect(list.locator("li").first()).toHaveAttribute(
    "data-section-id",
    "recent-docs"
  )

  const preview = page.getByTestId("overview-ordered-sections")
  const expectedOrder = await list
    .locator("li")
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-section-id"))
    )
  const previewOrder = () =>
    preview
      .locator("[data-overview-section]")
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-overview-section"))
      )
  expect(await previewOrder()).toEqual(expectedOrder)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await previewOrder()).toEqual(expectedOrder)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/overview-customize-mobile.png",
    fullPage: true,
  })
  const positions = await preview
    .locator("[data-overview-section]")
    .evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().top)
    )
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
  await write(page, "PATCH", "/settings", () =>
    editor.getByRole("button", { name: "Save overview", exact: true }).click()
  )
  await expect(editor).toHaveCount(0)
  const saved: OverviewConfiguration = (
    await (await page.request.get("/api/v1/settings")).json()
  ).overviewConfiguration
  expect(saved.layout).toBe("ordered")
  expect(
    saved.sections
      .filter((section) => section.enabled)
      .map((section) => section.id)
  ).toEqual(expectedOrder)
  await page.reload()
  await expect(
    preview.locator("[data-overview-section]").first()
  ).toHaveAttribute("data-overview-section", "recent-docs")

  const otherContext = await browser.newContext({
    storageState: await context.storageState(),
  })
  try {
    const otherPage = await otherContext.newPage()
    await otherPage.goto(
      "http://localhost:" + new URL(page.url()).port + "/overview"
    )
    await expect(
      otherPage
        .getByTestId("overview-ordered-sections")
        .locator("[data-overview-section]")
        .first()
    ).toHaveAttribute("data-overview-section", "recent-docs")
  } finally {
    await otherContext.close()
  }
})

test("pointer dragging changes the live section order", async ({
  page,
  testAccount,
}) => {
  void testAccount
  await page.goto("/overview")
  await page
    .getByRole("button", { name: "Customize overview", exact: true })
    .click()
  const editor = page.getByRole("region", {
    name: "Customize overview",
    exact: true,
  })
  const source = editor.getByRole("button", {
    name: "Reorder Habits today",
    exact: true,
  })
  const target = editor.getByRole("button", {
    name: "Reorder Daily brief",
    exact: true,
  })
  await target.scrollIntoViewIfNeeded()
  const from = await source.boundingBox(),
    to = await target.boundingBox()
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
  await expect(editor.getByRole("list").locator("li").first()).toHaveAttribute(
    "data-section-id",
    "habits-today"
  )
  await expect(
    page
      .getByTestId("overview-ordered-sections")
      .locator("[data-overview-section]")
      .first()
  ).toHaveAttribute("data-overview-section", "habits-today")
  await page.screenshot({
    path: "test-results/overview-customize-desktop.png",
    fullPage: true,
  })
})

test("an empty overview stays customizable and reset requires Save", async ({
  page,
  testAccount,
}) => {
  void testAccount
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/overview")
  const customize = page.getByRole("button", {
    name: "Customize overview",
    exact: true,
  })
  await customize.click()
  const editor = page.getByRole("region", {
    name: "Customize overview",
    exact: true,
  })
  for (const section of createDefaultOverviewConfiguration().sections.filter(
    (section) => section.enabled
  ))
    await editor
      .getByRole("button", {
        name: `Hide ${OVERVIEW_SECTION_REGISTRY[section.id].label}`,
        exact: true,
      })
      .click()
  await expect(
    page.getByText(
      "Your overview is empty. Use Customize overview to add sections."
    )
  ).toBeVisible()
  await write(page, "PATCH", "/settings", () =>
    editor.getByRole("button", { name: "Save overview", exact: true }).click()
  )
  await expect(editor).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByText(
      "Your overview is empty. Use Customize overview to add sections."
    )
  ).toBeVisible()
  await customize.click()
  await editor
    .getByRole("button", { name: "Reset to default", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "What needs doing", exact: true })
  ).toBeVisible()
  await editor.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "What needs doing", exact: true })
  ).toHaveCount(0)
  await customize.click()
  await editor.getByRole("button", { name: "Add section", exact: true }).click()
  await page
    .getByRole("dialog", { name: "Add section" })
    .getByRole("button", { name: "Continue editing", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Continue editing", exact: true })
  ).toBeVisible()
  await editor
    .getByRole("button", { name: "Reset to default", exact: true })
    .click()
  await write(page, "PATCH", "/settings", () =>
    editor.getByRole("button", { name: "Save overview", exact: true }).click()
  )
  await page.reload()
  await expect(
    page.getByRole("heading", { name: "What needs doing", exact: true })
  ).toBeVisible()
  expect(
    (await (await page.request.get("/api/v1/settings")).json())
      .overviewConfiguration.layout
  ).toBe("default")
})

test("failed saves keep the draft for retry and hidden-section shortcuts still work", async ({
  page,
  testAccount,
}) => {
  void testAccount
  await page.request.post("/api/v1/resources", {
    data: { text: "Hidden review", title: "Hidden review" },
  })
  await page.goto("/overview")
  await page
    .getByRole("button", { name: "Customize overview", exact: true })
    .click()
  const editor = page.getByRole("region", {
    name: "Customize overview",
    exact: true,
  })
  await editor
    .getByRole("button", { name: "Hide Saved to revisit", exact: true })
    .click()
  await page.route("**/api/v1/settings", async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Could not save test overview" },
        }),
      })
    else await route.continue()
  })
  await editor
    .getByRole("button", { name: "Save overview", exact: true })
    .click()
  await expect(editor.getByRole("alert")).toContainText(
    "Your changes are still here"
  )
  await expect(page.locator("#overview-resources")).toHaveCount(0)
  expect(
    (await (await page.request.get("/api/v1/settings")).json())
      .overviewConfiguration
  ).toBeNull()
  await page.unroute("**/api/v1/settings")
  await write(page, "PATCH", "/settings", () =>
    editor.getByRole("button", { name: "Save overview", exact: true }).click()
  )
  await expect(editor).toHaveCount(0)
  await page.reload()
  await expect(page.locator("#overview-resources")).toHaveCount(0)
  await page
    .getByRole("region", { name: "Daily brief", exact: true })
    .getByRole("button", { name: "Review resources", exact: true })
    .click()
  await expect(page).toHaveURL(/\/resources\?reviewed=false$/)
  await expect(
    page.getByRole("button", { name: "Hidden review", exact: true })
  ).toBeVisible()
})

test("settings reject malformed configurations and changing other settings preserves the overview", async ({
  page,
  testAccount,
}) => {
  void testAccount
  const configuration = createDefaultOverviewConfiguration()
  configuration.layout = "ordered"
  configuration.sections[0].enabled = false
  const patch = (overviewConfiguration: unknown) =>
    page.request.patch("/api/v1/settings", { data: { overviewConfiguration } })
  expect((await patch(configuration)).ok()).toBe(true)
  expect(
    (
      await page.request.patch("/api/v1/settings", {
        data: { libraryView: "list" },
      })
    ).ok()
  ).toBe(true)
  expect(
    (await (await page.request.get("/api/v1/settings")).json())
      .overviewConfiguration
  ).toEqual(configuration)
  for (const invalid of [
    {
      ...configuration,
      sections: [configuration.sections[0], configuration.sections[0]],
    },
    { ...configuration, version: 999 },
    {
      ...configuration,
      sections: [{ ...configuration.sections[0], id: "unregistered" }],
    },
    {
      ...configuration,
      sections: [
        { ...configuration.sections[0], options: { initialHorizon: "week" } },
      ],
    },
  ])
    expect((await patch(invalid)).status()).toBe(400)
  expect(
    (await (await page.request.get("/api/v1/settings")).json())
      .overviewConfiguration
  ).toEqual(configuration)
  expect((await patch(null)).ok()).toBe(true)
  expect(
    (await (await page.request.get("/api/v1/settings")).json())
      .overviewConfiguration
  ).toBeNull()
})
