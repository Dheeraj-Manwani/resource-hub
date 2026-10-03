import { CalendarDaysIcon } from "lucide-react"
import type { Metadata } from "next"

import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Calendar" }

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" />
      <EmptyState
        icon={CalendarDaysIcon}
        title="The calendar arrives in Phase 5"
        description="Month, week, day and agenda views with drag-to-schedule, recurrence and reminders."
      />
    </>
  )
}
