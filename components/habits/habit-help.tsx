"use client"

import { useState } from "react"
import { CircleHelpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { habitStarters } from "@/lib/habits/templates"
import { habitColors } from "@/lib/habits/planning"

export function HabitHelp({
  onChooseTemplate,
  disabled,
}: {
  onChooseTemplate?: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="About habits"
            title="About habits"
            className="text-text-muted hover:text-primary"
            disabled={disabled}
          />
        }
      >
        <CircleHelpIcon />
      </DialogTrigger>
      <DialogContent
        overlayProps={{
          forceRender: true,
          className: "z-[60] bg-black/65 supports-backdrop-filter:backdrop-blur-sm",
        }}
        className="z-[61] max-h-[85dvh] overflow-y-auto p-5 ring-foreground/20 shadow-2xl sm:max-w-xl sm:p-6"
      >
        <DialogHeader className="pr-6">
          <DialogTitle className="text-lg">About habits</DialogTitle>
          <DialogDescription>
            Habits are activities you want to repeat. Choose a small goal and a
            schedule, then record your progress over time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [
              "Set a goal",
              "Track minutes, a quantity such as pages, or simply whether you did it.",
            ],
            [
              "Choose a rhythm",
              "Repeat on set days, or choose a number of days each week and decide as you go.",
            ],
            [
              "Record your progress",
              "Log your effort or save a timer session. You can correct entries later.",
            ],
          ].map(([title, description]) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-muted/30 p-3"
            >
              <p className="mb-1 text-sm font-medium">{title}</p>
              <p className="text-xs leading-relaxed text-text-muted">
                {description}
              </p>
            </div>
          ))}
        </div>
        {onChooseTemplate ? (
          <section aria-label="Habit templates" className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Try a template</h3>
              <p className="mt-1 text-xs text-text-muted">
                Choose one to fill your form. It replaces the current fields;
                adjust anything before creating your habit.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {habitStarters.map((starter) => (
                <Button
                  key={starter.id}
                  type="button"
                  variant="outline"
                  aria-label={`Use ${starter.label} template`}
                  className="h-auto min-w-0 justify-start gap-3 rounded-xl px-3 py-3 text-left whitespace-normal hover:border-primary/50"
                  onClick={() => {
                    onChooseTemplate(starter.id)
                    setOpen(false)
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg text-xl"
                    style={{
                      backgroundColor: `${habitColors[starter.color]}20`,
                    }}
                  >
                    {starter.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {starter.label}
                    </span>
                    <span className="mt-0.5 block text-xs font-normal text-text-muted">
                      {starter.description}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </section>
        ) : (
          <p className="text-xs text-text-muted">
            Updating a goal or schedule preserves your earlier records and their
            original goals.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
