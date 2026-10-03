import { expect, test } from "@playwright/test"

// Signed-out smoke checks. The full signed-in suite (add resource → project →
// task → calendar → search → trash) lands in Phase 6.

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
  await expect(page.getByRole("alert")).toContainText("cancelled")
})

test("app pages redirect signed-out visitors to the landing page", async ({
  page,
}) => {
  await page.goto("/library")
  await expect(page).toHaveURL(/\/\?next=%2Flibrary$/)
})

test("API returns 401 without a session", async ({ request }) => {
  const res = await request.get("/api/v1/resources")
  expect(res.status()).toBe(401)
  const capture = await request.post("/api/v1/capture", {
    data: { url: "https://example.com" },
  })
  expect(capture.status()).toBe(401)
})

test("PWA manifest exposes the share target", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json()
  expect(manifest.share_target.action).toBe("/capture")
})
