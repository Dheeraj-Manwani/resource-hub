import { expect, test } from "@playwright/test"

// Signed-out checks complement the authenticated CRUD journeys.

test("landing page offers Google sign-in", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Resource Hub" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Continue with Google" })
  ).toBeVisible()
})

test("a failed sign-in shows an explanation", async ({ page }) => {
  await page.goto("/?error=access_denied")
  await expect(
    page.getByRole("alert").filter({ hasText: "cancelled" })
  ).toContainText("Sign-in was cancelled.")
})

test("app pages redirect signed-out visitors to the landing page", async ({
  page,
}) => {
  await page.goto("/resources")
  await expect(page).toHaveURL(/\/\?next=%2Fresources$/)
})

test("API returns 401 without a session", async ({ request }) => {
  const res = await request.get("/api/v1/resources")
  expect(res.status()).toBe(401)
  const progress = await request.get(
    "/api/v1/resources/metadata-status?ids=00000000-0000-4000-8000-000000000001"
  )
  expect(progress.status()).toBe(401)
  const capture = await request.post("/api/v1/capture", {
    data: { url: "https://example.com" },
  })
  expect(capture.status()).toBe(401)
})

test("PWA manifest exposes the share target", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json()
  expect(manifest.share_target.action).toBe("/capture")
})
