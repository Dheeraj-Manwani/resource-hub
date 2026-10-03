import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { CalendarView } from "@/components/calendar/calendar-view"
import { getSettings } from "@/lib/server/dal/settings"
import { requireUser } from "@/lib/server/dal/session"

export const metadata: Metadata = { title: "Calendar" }

export default async function CalendarPage() {
  const user = await requireUser()
  const settings = await getSettings(user.id)
  return (
    <>
      <PageHeader title="Calendar" />
      <Suspense>
        <CalendarView initialSettings={settings} />
      </Suspense>
    </>
  )
}
