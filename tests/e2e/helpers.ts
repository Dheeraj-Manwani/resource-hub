import type { Page, Response } from "@playwright/test"
import { expect } from "@playwright/test"

export async function write(
  page: Page,
  method: string,
  path: string,
  action: () => Promise<unknown>
): Promise<Response> {
  const [result] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.request().method() === method &&
        new URL(res.url()).pathname === `/api/v1${path}`,
      { timeout: 90_000 }
    ),
    action(),
  ])
  expect(result.ok(), `${method} ${path}: ${result.status()}`).toBe(true)
  return result
}

export async function addMenu(page: Page, label: string) {
  await page
    .locator("header")
    .getByRole("button", { name: "Add", exact: true })
    .click()
  await page.getByRole("menuitem", { name: label, exact: true }).click()
}
