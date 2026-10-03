import type { Metadata } from "next"

import { OverviewView } from "@/components/overview/overview-view"
import { requireUser } from "@/lib/server/dal/session"

export const metadata: Metadata = { title: "Overview" }

export default async function OverviewPage() {
  const user = await requireUser()
  return <OverviewView userName={user.name} />
}
