import { defineConfig } from "@playwright/test"
import base from "./playwright.habit-timer.config"
export default defineConfig({
  ...base,
  outputDir: "./test-results-habit-motivation",
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "playwright-report-habit-motivation" },
    ],
  ],
  projects: base.projects?.map((project) => ({
    ...project,
    name: project.name?.replace("habit-", "habit-motivation-"),
    testMatch: "habit-motivation.spec.ts",
  })),
})
