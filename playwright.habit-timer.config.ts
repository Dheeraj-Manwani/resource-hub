import { existsSync } from "node:fs"
import { defineConfig } from "@playwright/test"
import base from "./playwright.config"
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe"
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
const brave =
  "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
export default defineConfig({
  ...base,
  outputDir: "./test-results-habit-browsers",
  reporter: [
    ["list", { printSteps: true }],
    [
      "html",
      { open: "never", outputFolder: "playwright-report-habit-browsers" },
    ],
  ],
  projects: [
    ...(existsSync(chrome)
      ? [
          {
            name: "habit-chrome",
            testMatch: "habit-timer.spec.ts",
            use: {
              browserName: "chromium" as const,
              channel: "chrome",
              viewport: { width: 1440, height: 900 },
            },
          },
        ]
      : []),
    ...(existsSync(edge)
      ? [
          {
            name: "habit-edge",
            testMatch: "habit-timer.spec.ts",
            use: {
              browserName: "chromium" as const,
              channel: "msedge",
              viewport: { width: 1440, height: 900 },
            },
          },
        ]
      : []),
    ...(existsSync(brave)
      ? [
          {
            name: "habit-brave",
            testMatch: "habit-timer.spec.ts",
            use: {
              browserName: "chromium" as const,
              viewport: { width: 1440, height: 900 },
              launchOptions: { executablePath: brave },
            },
          },
        ]
      : []),
  ],
})
