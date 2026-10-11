import { defineConfig } from "@playwright/test"
import base from "./playwright.habit-timer.config"
export default defineConfig({
  ...base,
  outputDir: "./test-results-habit-release",
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "playwright-report-habit-release" },
    ],
  ],
  projects: base.projects?.map((project) => ({
    ...project,
    name: project.name?.replace("habit-", "habit-release-"),
    testMatch: "habit-release.spec.ts",
  })),
})
