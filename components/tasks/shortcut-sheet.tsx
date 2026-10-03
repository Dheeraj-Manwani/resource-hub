"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Q"], label: "Quick-add a task" },
  { keys: ["/"], label: "Focus the task search" },
  { keys: ["⌘", "K"], label: "Focus the task search" },
  { keys: ["X"], label: "Toggle done on the focused task" },
  { keys: ["?"], label: "Show this shortcut sheet" },
]

export function ShortcutSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between text-sm">
              <span className="text-text-muted">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-xs"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
