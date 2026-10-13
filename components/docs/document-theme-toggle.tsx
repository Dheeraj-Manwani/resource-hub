"use client"

import { MoonIcon, SunIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export type DocumentTheme = "dark" | "light"

export function useDocumentTheme(kind: "text" | "spreadsheet") {
  const key = `resource-hub:document-theme:${kind}`
  const [theme, setTheme] = useState<DocumentTheme>(() => {
    try {
      return localStorage.getItem(key) === "light" ? "light" : "dark"
    } catch {
      return "dark"
    }
  })
  function changeTheme(value: DocumentTheme) {
    setTheme(value)
    try {
      localStorage.setItem(key, value)
    } catch {
      /* The current editor still switches when browser storage is unavailable. */
    }
  }
  return { theme, changeTheme }
}

export function DocumentThemeToggle({
  theme,
  onChange,
}: {
  theme: DocumentTheme
  onChange: (theme: DocumentTheme) => void
}) {
  const label =
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={() => onChange(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
