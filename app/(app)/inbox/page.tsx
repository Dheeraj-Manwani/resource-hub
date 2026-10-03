import type { Metadata } from "next"

import { LibraryView } from "@/components/resources/library-view"
import { getSettings } from "@/lib/server/dal/settings"
import { requireUser } from "@/lib/server/dal/session"

export const metadata: Metadata = { title: "Inbox" }

const UNSORTED = { unsorted: true }

export default async function InboxPage() {
  const user = await requireUser()
  const settings = await getSettings(user.id)
  return (
    <LibraryView
      title="Inbox"
      description="Saved items that aren't filed into a project yet. (Projects arrive in Phase 3, so everything lands here for now.)"
      initialSettings={settings}
      baseFilters={UNSORTED}
      emptyTitle="Inbox zero"
      emptyDescription="Anything you capture from the bookmarklet, share sheet or add dialog lands here first."
    />
  )
}
