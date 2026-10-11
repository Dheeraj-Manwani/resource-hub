import { defineConfig } from "@playwright/test"
import base from "./playwright.habit-timer.config"
export default defineConfig({
  ...base,
  outputDir: "./test-results-habit-history",
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "playwright-report-habit-history" },
    ],
  ],
  projects: base.projects?.map((project) => ({
    ...project,
    name: project.name?.replace("habit-", "habit-history-"),
    testMatch: "habit-history.spec.ts",
  })),
})
