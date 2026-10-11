import { defineConfig } from "@playwright/test"
import base from "./playwright.habit-timer.config"
export default defineConfig({
  ...base,
  outputDir: "./test-results-habit-views",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-habit-views" }],
  ],
  projects: base.projects?.map((project) => ({
    ...project,
    name: project.name?.replace("habit-", "habit-views-"),
    testMatch: "habit-shared-views.spec.ts",
  })),
})
