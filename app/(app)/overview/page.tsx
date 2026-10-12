import type { Metadata } from "next"

import { OverviewView } from "@/components/overview/overview-view"
import { requireUser } from "@/lib/server/dal/session"
import { getSettings } from "@/lib/server/dal/settings"

export const metadata: Metadata = { title: "Overview" }

export default async function OverviewPage() {
  const user = await requireUser()
  const settings = await getSettings(user.id)
  return <OverviewView userName={user.name} initialSettings={settings} />
}
