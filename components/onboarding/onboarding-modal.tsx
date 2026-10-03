"use client"

import {
  BookmarkPlusIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { useShell } from "@/components/shell/shell-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSettings, useUpdateSettings } from "@/hooks/queries/settings"
import { cn } from "@/lib/utils"

type Step = {
  icon: LucideIcon
  title: string
  description: string
}

const STEPS: Step[] = [
  {
    icon: BookmarkPlusIcon,
    title: "Save anything",
    description:
      "Paste a YouTube, Instagram, X, GitHub or Pinterest link, any URL, a quick note, or drop a file. It shows up rendered and playable, not just a bookmark.",
  },
  {
    icon: FolderKanbanIcon,
    title: "Organize it",
    description:
      "Group related resources into projects, and turn anything into a task with a due date, priority and checklist — right from the same card.",
  },
  {
    icon: LayoutDashboardIcon,
    title: "Stay on top of it",
    description:
      "Overview is your home base: what's due today, what you just saved, and what's moving. The Calendar keeps your schedule in view.",
  },
]

export function OnboardingModal() {
  const { onboardingOpen, openOnboarding, closeOnboarding } = useShell()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const [step, setStep] = useState(0)

  // Auto-open exactly once for a new user, as soon as we know they haven't seen it.
  useEffect(() => {
    if (settings && !settings.hasSeenOnboarding) openOnboarding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.hasSeenOnboarding])

  function handleOpenChange(open: boolean) {
    if (!open) {
      setStep(0)
      closeOnboarding()
      if (settings && !settings.hasSeenOnboarding) {
        updateSettings.mutate({ hasSeenOnboarding: true })
      }
    }
  }

  const last = step === STEPS.length - 1
  const current = STEPS[step]!
  const Icon = current.icon

  return (
    <Dialog open={onboardingOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <div className="flex flex-col items-center px-2 pt-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Icon className="size-6" />
          </div>
          <DialogTitle className="mt-4 text-lg">{current.title}</DialogTitle>
          <DialogDescription className="mt-1.5 text-balance">
            {current.description}
          </DialogDescription>

          <div className="mt-6 flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-5 bg-brand" : "w-1.5 bg-border-strong"
                )}
              />
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Skip
          </Button>
          <Button onClick={() => (last ? handleOpenChange(false) : setStep((s) => s + 1))}>
            {last ? "Get started" : "Next"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
